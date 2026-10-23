# NCRTC BMS — Architecture

## 1. Purpose and assumptions

This system helps NCRTC feeder-bus operations **see buses**, **assign duties**, **track incidents**, and **push notices**. It is a single-app MVP for a final-year capstone.

**Assumptions**

- Dummy/seeded operational data is sufficient for demos.  
- Live map animation comes from a DB tick script, not GPS hardware.  
- One backend, one database, one frontend bundle — no microservices.  
- Security is “school-project solid”: bcrypt + JWT + RBAC + depot isolation; secrets via `.env`.

## 2. Context diagram

```
┌────────────────────┐     HTTPS/JSON      ┌────────────────────┐
│ React admin / map  │◄──────────────────►│                    │
└────────────────────┘                    │     FastAPI        │
┌────────────────────┐                    │  auth + 4 modules  │
│ Driver PWA /driver │◄──────────────────►│                    │
└────────────────────┘                    └─────────┬──────────┘
                                                    │ SQL
                                          ┌─────────▼──────────┐
                                          │ PostgreSQL+PostGIS │
                                          └─────────▲──────────┘
                                                    │ inserts
                                          ┌─────────┴──────────┐
                                          │ gps_tick (sim)     │
                                          └────────────────────┘
```

Compose services: `db`, `backend`, `gps_tick`, `frontend` (nginx).

## 3. Roles and security

| Role | Scope | Primary UI |
| --- | --- | --- |
| `driver` / `conductor` | Own depot; own duties | `/driver` |
| `depot_manager` | Own depot only | Scheduling, map, IMS, CMS read |
| `control_room_operator` | All depots | Live map, IMS triage |
| `admin` | All depots | Routes, notices, users/vehicles |

- Passwords hashed with **bcrypt**; sessions are **JWTs** (OAuth2 password flow at `/api/auth/login`).  
- Every API route (except login/health/docs/uploads) requires a valid token.  
- Depot-scoped roles get `depot_id` filters in list/detail handlers.  
- Drivers only receive duties that are `published` or `acknowledged` (not `draft`).

## 4. Data model

Core tables (PRD §6):

`depot`, `vehicle`, `user`, `stop`, `route`, `route_stop`, `duty`, `gps_ping`, `incident`, `incident_event`, `notice`, `notice_read`.

Important indexes:

- `gps_ping (vehicle_id, ts)` — live trail / history  
- `duty (date, depot_id)` — roster  
- `incident (status, depot_id)` — queue  

Depot polygons are GeoJSON (PostGIS enabled for future geofence queries).

Schema changes: Alembic (`backend/alembic/versions/001_initial.py`). Backend also calls `create_all` on startup so a fresh compose is resilient; seed runs if no users exist.

## 5. Module design

### AVLS

- `GET /api/avls/live` — latest ping per vehicle (+ today’s duty driver/route).  
- `GET /api/avls/vehicles/{id}/trail` — last N minutes polyline.  
- `GET /api/avls/history` — pings for a vehicle+day.  
- `GET /api/avls/geofence-alerts` — buses with **no published duty today** whose latest ping (last 10 min) is outside their depot polygon. Uses PostGIS `ST_Contains` on `depot.polygon_geojson` and `ST_Distance` (geography) for distance from depot; depot-scoped for managers.  
- Frontend Leaflet map polls live + geofence every **5s**; markers are coloured by motion state (moving / stopped / no signal > 2 min), depot polygons are drawn, and the map only re-fits on depot change.  
- History page replays a day: full trail + travelled portion, scrubber, play/pause at 1×/5×/20×, distance (haversine), time on road, average/top speed. Deep-linkable with `?vehicle=&day=`.  
- `scripts/gps_tick.py` advances active vehicles along route stops.

### Scheduling

- CRUD routes with ordered stops.  
- Duties: assign (draft) → publish (single or week) → driver acknowledge.  
- Conflict check: one driver cannot get two duties on the same day.  
- `POST /api/duties/copy-week?from_week_start=&to_week_start=` copies a roster into another week as drafts, skipping drivers already rostered on the target day.  
- Roster grid is drivers × week days (local calendar dates) with week navigation, status-coloured cells, sticky header/driver column, and click-to-assign on empty cells.

### IMS

- Raise via multipart form (optional photo) or JSON.  
- Panic endpoint creates **P1** with today’s vehicle and that bus’s **last GPS position** as the incident location.  
- State machine: `open → acknowledged → in_progress → resolved → closed` (each change needs a note + `incident_event` row). The UI only offers transitions the backend allows.  
- SLA targets (frontend, `lib/sla.ts`): P1 ack 15m / resolve 4h, P2 1h / 24h, P3 4h / 72h, measured from `created_at`. Live countdown chips, breach counter and “breached only” filter.  
- Filters: status, severity, depot, mine-only.

### CMS

- Notices with `audience_json` (`all`, `all_drivers`, `role`, `depot`).  
- Open → mark read; optional **acknowledgement required**.  
- `GET /api/notices/{id}/audience` resolves every active targeted user with read/ack state and totals, so managers see who **hasn’t** read a notice (depot-scoped for managers). `GET /api/notices/{id}/receipts` still lists reads only.

### Administration

- `POST /api/users`, `PATCH /api/users/{id}` (admin): create accounts, change role/depot, deactivate. A depot is required for depot-scoped roles; admins cannot deactivate or demote themselves; inactive users are rejected at login and on every request.  
- `PATCH /api/vehicles/{id}`: status changes by admins or the owning depot manager; only admins move buses between depots.

## 6. API surface

Auto-documented at `/docs` (OpenAPI). Prefix `/api/…` for modules; `/health` for liveness; `/uploads/…` for incident photos.

## 7. Frontend structure

- Vite + React Router.  
- `AuthProvider` stores JWT in `localStorage`.  
- Role-gated routes; NCR-themed navy/teal/gold UI.  
- Shared primitives in `components/ui.tsx` (status-aware `Badge`, `PageHeader`, `StatCard`, `SectionTitle`, `Notice`, inline SVG `Icon`); inputs and buttons share a 40px height so form rows align. Desktop nav appears at `xl`, with a collapsible menu below.  
- Pure helpers with unit tests: `lib/dates.ts`, `lib/geo.ts` (haversine, path length), `lib/sla.ts`.  
- Driver experience is the same SPA at `/driver` with manifest + minimal service worker.

## 8. Trade-offs

| Choice | Why | Cost |
| --- | --- | --- |
| Polling 5s | Simple, demo-proof | More HTTP than WebSocket |
| Tick script → DB | Honest simulation | Not production ingest |
| Monolith FastAPI | Matches PRD / team size | Less independent scaling |
| Local upload volume | Zero cloud deps | Not durable multi-node storage |
| `create_all` + Alembic | Fresh compose always boots | Dual migration paths to mind in CI |

## 9. What we’d improve next

1. WebSocket fan-out for live markers.  
2. Persist SLA targets server-side and escalate breaches (notification to control room).  
3. Geofence alerts as stored events with acknowledgement, not only a live query.  
4. Alembic-only migrations in CI; object storage for photos.  
5. Production GPS: device → queue → processor → `gps_ping` (show as a slide; not built here).

Built since the MVP: PostGIS geofence breach detection, IMS SLA timers, history replay scrubber, copy-last-week rostering, audience read receipts, and admin fleet/user management.

## 10. Honesty for evaluators

We seeded data and animated the live map with a tick script. The tables and APIs are shaped so a real ingest pipeline could replace the simulator without rewriting the UI modules.
