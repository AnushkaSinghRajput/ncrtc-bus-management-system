#!/bin/sh
set -e
echo "Waiting for database..."
python - <<'PY'
import time
from sqlalchemy import create_engine, text
from app.core.config import get_settings
url = get_settings().database_url
for i in range(60):
    try:
        eng = create_engine(url)
        with eng.connect() as c:
            c.execute(text("SELECT 1"))
        print("DB ready")
        break
    except Exception as e:
        print(f"DB not ready ({e}); retry {i+1}")
        time.sleep(2)
else:
    raise SystemExit("Database never became ready")
PY
alembic upgrade head || true
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
