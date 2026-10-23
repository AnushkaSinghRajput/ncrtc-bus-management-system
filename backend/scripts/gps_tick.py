#!/usr/bin/env python3
"""
Background GPS tick — SIMULATED DATA ONLY.

Every few seconds, advances each active vehicle along its route and inserts a new gps_ping.
The control-room map polls /api/avls/live every 5s to pick these up.

In production this would be a device ingest pipeline; here it is honest simulation for demos.
"""

from __future__ import annotations

import math
import os
import random
import sys
import time
from datetime import date, datetime, timezone

from sqlalchemy import create_engine, func
from sqlalchemy.orm import Session, sessionmaker

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.config import get_settings  # noqa: E402
from app.models.entities import Duty, DutyStatus, GpsPing, RouteStop, Stop, Vehicle, VehicleStatus  # noqa: E402


def route_points(db: Session, route_id: int) -> list[tuple[float, float]]:
    rows = (
        db.query(RouteStop, Stop)
        .join(Stop, Stop.id == RouteStop.stop_id)
        .filter(RouteStop.route_id == route_id)
        .order_by(RouteStop.sequence)
        .all()
    )
    return [(s.lat, s.lng) for _, s in rows]


def advance(lat: float, lng: float, target_lat: float, target_lng: float, step: float = 0.0015):
    dlat = target_lat - lat
    dlng = target_lng - lng
    dist = math.hypot(dlat, dlng) or 1e-9
    if dist < step:
        return target_lat, target_lng, True
    return lat + dlat / dist * step, lng + dlng / dist * step, False


def tick_once(db: Session) -> int:
    today = date.today()
    vehicles = db.query(Vehicle).filter(Vehicle.status == VehicleStatus.active).all()
    count = 0
    for vehicle in vehicles:
        duty = (
            db.query(Duty)
            .filter(
                Duty.vehicle_id == vehicle.id,
                Duty.date == today,
                Duty.status.in_([DutyStatus.published, DutyStatus.acknowledged]),
            )
            .first()
        )
        if not duty:
            # still animate a subset without duty so the map isn't empty
            if vehicle.id % 3 != 0:
                continue
            # wander near last ping
            last = (
                db.query(GpsPing)
                .filter(GpsPing.vehicle_id == vehicle.id)
                .order_by(GpsPing.ts.desc())
                .first()
            )
            if not last:
                continue
            lat = last.lat + random.uniform(-0.0008, 0.0008)
            lng = last.lng + random.uniform(-0.0008, 0.0008)
            db.add(
                GpsPing(
                    vehicle_id=vehicle.id,
                    ts=datetime.now(timezone.utc),
                    lat=lat,
                    lng=lng,
                    speed_kmh=round(random.uniform(5, 25), 1),
                    ignition_on=True,
                )
            )
            count += 1
            continue

        pts = route_points(db, duty.route_id)
        if len(pts) < 2:
            continue
        last = (
            db.query(GpsPing)
            .filter(GpsPing.vehicle_id == vehicle.id)
            .order_by(GpsPing.ts.desc())
            .first()
        )
        # pick next target stop by nearest ahead
        if last:
            nearest_i = min(range(len(pts)), key=lambda i: math.hypot(pts[i][0] - last.lat, pts[i][1] - last.lng))
            target_i = (nearest_i + 1) % len(pts)
            lat, lng, _ = advance(last.lat, last.lng, pts[target_i][0], pts[target_i][1])
        else:
            lat, lng = pts[0]
        db.add(
            GpsPing(
                vehicle_id=vehicle.id,
                ts=datetime.now(timezone.utc),
                lat=lat,
                lng=lng,
                speed_kmh=round(random.uniform(15, 40), 1),
                ignition_on=True,
            )
        )
        count += 1
    db.commit()
    return count


def main() -> None:
    settings = get_settings()
    interval = int(os.getenv("GPS_TICK_INTERVAL_SECONDS", settings.gps_tick_interval_seconds))
    engine = create_engine(settings.database_url, pool_pre_ping=True)
    SessionLocal = sessionmaker(bind=engine)
    print(f"[gps_tick] SIMULATED GPS — interval={interval}s database={settings.database_url.split('@')[-1]}")
    # wait for DB / seed
    for attempt in range(60):
        try:
            with SessionLocal() as db:
                n = db.query(func.count(Vehicle.id)).scalar()
                if n and n > 0:
                    break
        except Exception as exc:  # noqa: BLE001
            print(f"[gps_tick] waiting for DB... ({exc})")
        time.sleep(2)
    while True:
        try:
            with SessionLocal() as db:
                n = tick_once(db)
                print(f"[gps_tick] inserted {n} pings @ {datetime.now(timezone.utc).isoformat()}")
        except Exception as exc:  # noqa: BLE001
            print(f"[gps_tick] error: {exc}")
        time.sleep(interval)


if __name__ == "__main__":
    main()
