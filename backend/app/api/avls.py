from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.core.deps import depot_filter_ids, get_current_user
from app.database import get_db
from app.models.entities import Duty, DutyStatus, GpsPing, Route, User, Vehicle
from app.schemas.common import GeofenceAlertOut, GpsPingOut, LiveVehicleOut

router = APIRouter(prefix="/api/avls", tags=["avls"])


@router.get("/live", response_model=list[LiveVehicleOut])
def live_vehicles(
    depot_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[LiveVehicleOut]:
    """Latest GPS ping per active vehicle. Polled every ~5s by the map (data is simulated)."""
    scoped = depot_filter_ids(user)
    if scoped is not None:
        depot_id = scoped

    latest_sub = (
        db.query(GpsPing.vehicle_id, func.max(GpsPing.ts).label("max_ts"))
        .group_by(GpsPing.vehicle_id)
        .subquery()
    )
    rows = (
        db.query(GpsPing, Vehicle)
        .join(Vehicle, Vehicle.id == GpsPing.vehicle_id)
        .join(
            latest_sub,
            (GpsPing.vehicle_id == latest_sub.c.vehicle_id) & (GpsPing.ts == latest_sub.c.max_ts),
        )
    )
    if depot_id is not None:
        rows = rows.filter(Vehicle.depot_id == depot_id)

    today = date.today()
    result: list[LiveVehicleOut] = []
    for ping, vehicle in rows.all():
        duty = (
            db.query(Duty)
            .filter(
                Duty.vehicle_id == vehicle.id,
                Duty.date == today,
                Duty.status.in_(
                    [DutyStatus.published, DutyStatus.acknowledged, DutyStatus.completed]
                ),
            )
            .first()
        )
        driver_name = None
        route_code = None
        route_name = None
        if duty:
            driver = db.query(User).filter(User.id == duty.driver_id).first()
            route = db.query(Route).filter(Route.id == duty.route_id).first()
            driver_name = driver.full_name if driver else None
            route_code = route.code if route else None
            route_name = route.name if route else None
        result.append(
            LiveVehicleOut(
                vehicle_id=vehicle.id,
                reg_no=vehicle.reg_no,
                depot_id=vehicle.depot_id,
                status=vehicle.status,
                lat=ping.lat,
                lng=ping.lng,
                speed_kmh=ping.speed_kmh,
                ts=ping.ts,
                driver_name=driver_name,
                route_code=route_code,
                route_name=route_name,
            )
        )
    return result


GEOFENCE_SQL = text(
    """
    WITH latest AS (
        SELECT DISTINCT ON (vehicle_id) vehicle_id, lat, lng, ts
        FROM gps_ping
        WHERE ts >= :since
        ORDER BY vehicle_id, ts DESC
    )
    SELECT v.id AS vehicle_id, v.reg_no, v.depot_id, d.name AS depot_name,
           l.lat, l.lng, l.ts,
           ST_Distance(
               ST_SetSRID(ST_MakePoint(d.location_lng, d.location_lat), 4326)::geography,
               ST_SetSRID(ST_MakePoint(l.lng, l.lat), 4326)::geography
           ) AS distance_m
    FROM latest l
    JOIN vehicle v ON v.id = l.vehicle_id
    JOIN depot d ON d.id = v.depot_id
    WHERE NOT ST_Contains(
              ST_SetSRID(ST_GeomFromGeoJSON(d.polygon_geojson::text), 4326),
              ST_SetSRID(ST_MakePoint(l.lng, l.lat), 4326)
          )
      AND NOT EXISTS (
          SELECT 1 FROM duty du
          WHERE du.vehicle_id = v.id AND du.date = :today
            AND du.status IN ('published', 'acknowledged')
      )
      AND (CAST(:depot_id AS INTEGER) IS NULL OR v.depot_id = CAST(:depot_id AS INTEGER))
    ORDER BY distance_m DESC
    """
)


@router.get("/geofence-alerts", response_model=list[GeofenceAlertOut])
def geofence_alerts(
    depot_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[GeofenceAlertOut]:
    """Buses with no published duty today whose latest ping (last 10 min) is outside their depot polygon."""
    scoped = depot_filter_ids(user)
    if scoped is not None:
        depot_id = scoped
    rows = db.execute(
        GEOFENCE_SQL,
        {
            "since": datetime.now(timezone.utc) - timedelta(minutes=10),
            "today": date.today(),
            "depot_id": depot_id,
        },
    ).mappings()
    return [GeofenceAlertOut(**r) for r in rows]


@router.get("/vehicles/{vehicle_id}/trail", response_model=list[GpsPingOut])
def vehicle_trail(
    vehicle_id: int,
    minutes: int = Query(30, ge=1, le=1440),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[GpsPing]:
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    scoped = depot_filter_ids(user)
    if scoped is not None and vehicle.depot_id != scoped:
        raise HTTPException(status_code=403, detail="Depot isolation")
    since = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    return (
        db.query(GpsPing)
        .filter(GpsPing.vehicle_id == vehicle_id, GpsPing.ts >= since)
        .order_by(GpsPing.ts.asc())
        .all()
    )


@router.get("/history", response_model=list[GpsPingOut])
def history(
    vehicle_id: int = Query(...),
    day: date = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[GpsPing]:
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    scoped = depot_filter_ids(user)
    if scoped is not None and vehicle.depot_id != scoped:
        raise HTTPException(status_code=403, detail="Depot isolation")
    start = datetime.combine(day, datetime.min.time()).replace(tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    return (
        db.query(GpsPing)
        .filter(GpsPing.vehicle_id == vehicle_id, GpsPing.ts >= start, GpsPing.ts < end)
        .order_by(GpsPing.ts.asc())
        .all()
    )
