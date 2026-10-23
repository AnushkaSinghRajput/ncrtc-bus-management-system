# NCRTC Bus Management System

Student/capstone MVP for the NCRTC RRTS **feeder-bus** network: live fleet view (AVLS), weekly duties (Scheduling), incident triage (IMS), and driver notices (CMS).

> **Assumption (be honest in demos):** Live GPS is **simulated**. The `gps_tick` service inserts pings every few seconds; the map polls `/api/avls/live` every 5s. Seeded dummy depots/vehicles/users/routes power the demo — not hardware GPS or production ingest.

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | React + Vite + TypeScript + Tailwind + Leaflet/OSM |
| Backend | Python FastAPI + SQLAlchemy + Alembic |
| DB | PostgreSQL 16 + PostGIS |
| Auth | JWT + bcrypt |
| Driver app | Responsive PWA route at `/driver` |
| Runtime | Docker Compose |

## Quick start

```bash
git clone <this-repo>
cd ncrtc-bus-management-system   # or /agent/ncrtc-bms on the Cloud VM
cp .env.example .env
docker compose up --build
```

Open:

| URL | What |
| --- | --- |
| http://localhost:5173 | Web app (admin / control room / manager) |
| http://localhost:5173/driver | Driver PWA (after login as driver) |
| http://localhost:8000/docs | OpenAPI docs |
| http://localhost:8000/health | Health (`gps: simulated`) |

Seed runs automatically on first backend start when the DB is empty (`SEED_ON_STARTUP=true`).

### Host networking note (some Linux VMs)

If the backend stays on “Waiting for database…” while `db` is healthy, bridge netfilter may block container↔container traffic:

```bash
sudo sysctl -w net.bridge.bridge-nf-call-iptables=0
docker compose restart backend gps_tick
```

## Environment variables

Copy from [`.env.example`](./.env.example). **Never commit `.env` or real secrets.**

| Variable | Purpose | Default (demo) |
| --- | --- | --- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | DB credentials | `ncrtc` / `ncrtc_demo_password` / `ncrtc_bms` |
| `DATABASE_URL` | SQLAlchemy URL | `postgresql+psycopg://…@db:5432/ncrtc_bms` |
| `JWT_SECRET` | JWT signing key | change in real deploys |
| `JWT_ALGORITHM` | JWT alg | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Session length | `480` |
| `CORS_ORIGINS` | Allowed browser origins | `http://localhost:5173,…` |
| `VITE_API_URL` | Frontend → API base (build-time) | `http://localhost:8000` |
| `SEED_ON_STARTUP` | Auto-seed empty DB | `true` |
| `GPS_TICK_INTERVAL_SECONDS` | Simulated ping interval | `7` |

## Demo credentials (DEMO ONLY)

All seeded users share password: **`password`**

| Username | Role | Typical demo use |
| --- | --- | --- |
| `admin` | admin | Create routes, publish notices, full access |
| `manager1` | depot_manager | Noida Sec-37 roster + depot incidents |
| `manager2`…`manager5` | depot_manager | Other depots |
| `control1` / `control2` | control_room_operator | Live map + triage |
| `driver1`… | driver | Driver PWA |
| `conductor1`… | conductor | Driver PWA |

Seed size: **5 depots**, **~50 vehicles**, **~80 users**, **12 routes**, one week of duties, yesterday GPS history, sample incidents & notices.

## How to test

```bash
# With stack running:
docker compose exec backend pytest -q

# Frontend unit tests:
cd frontend && npm install && npm test
```

## Demo flow (PRD)

1. `docker compose up --build` — seed runs.  
2. Login `admin` → Scheduling → create a route (pick stops) → Notices → publish.  
3. Login `manager1` → roster → **Publish week** (or Publish on a draft cell).  
4. Login `driver1` (narrow window) → `/driver` → acknowledge duty → open notice → ack if required → **PANIC**.  
5. Login `control1` → Live Map (markers move) → click a bus → Incidents → ack/assign the P1.  
6. History → vehicle + yesterday → path on map.  
7. http://localhost:8000/docs  

## Repo layout

```
backend/     FastAPI, Alembic, seed, gps_tick, tests
frontend/    React admin shell + /driver PWA
docker-compose.yml
ARCHITECTURE.md
media/ncrtc-bms/   screenshots
```

## Screenshots

![Login](media/ncrtc-bms/01-login.png)

![Admin dashboard](media/ncrtc-bms/02-admin-dashboard.png)

![Scheduling](media/ncrtc-bms/03-scheduling.png)

![Live map](media/ncrtc-bms/04-live-map.png)

![Incidents](media/ncrtc-bms/05-incidents.png)

![Driver PWA](media/ncrtc-bms/06-driver-pwa.png)

## Limitations (known)

- GPS is simulated (tick script), not device ingest / WebSocket.  
- Stretch items not built: geofence breach banners, SLA timers, trip replay scrubber.  
- Incident photos stored on a local Docker volume (`uploads/`), not object storage.  
- Executive read-only role from the PRD narrative is not a sixth role; use admin/control for reports.

## License

Academic / demo use. NCRTC branding for project context only.
