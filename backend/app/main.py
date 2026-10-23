import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import auth, avls, depots, duties, incidents, notices, routes, users, vehicles
from app.core.config import get_settings
from app.database import Base, SessionLocal, engine, ensure_postgis
from app.seed import seed_if_empty

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ncrtc")


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    # Create tables (Alembic also used; this ensures fresh compose works)
    with engine.begin() as conn:
        conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS postgis")
    Base.metadata.create_all(bind=engine)
    if settings.seed_on_startup:
        db = SessionLocal()
        try:
            ensure_postgis(db)
            seeded = seed_if_empty(db)
            if seeded:
                logger.info("Database seeded with demo data")
            else:
                logger.info("Database already has data; skip seed")
        finally:
            db.close()
    yield


app = FastAPI(
    title="NCRTC Bus Management System API",
    description=(
        "Capstone MVP for NCRTC feeder-bus operations: AVLS, Scheduling, IMS, CMS. "
        "Live GPS positions are **simulated** by a background tick script — not real devices."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list + ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(depots.router)
app.include_router(vehicles.router)
app.include_router(users.router)
app.include_router(routes.router)
app.include_router(duties.router)
app.include_router(avls.router)
app.include_router(incidents.router)
app.include_router(notices.router)

Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")


@app.get("/health")
def health():
    return {"status": "ok", "service": "ncrtc-bms", "gps": "simulated"}
