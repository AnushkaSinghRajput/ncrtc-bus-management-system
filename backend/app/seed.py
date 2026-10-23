"""Seed demo data for NCRTC BMS. Passwords are DEMO ONLY."""

from __future__ import annotations

import math
import random
from datetime import date, datetime, timedelta, time, timezone

from faker import Faker
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.entities import (
    Depot,
    Duty,
    DutyStatus,
    GpsPing,
    Incident,
    IncidentEvent,
    IncidentSeverity,
    IncidentStatus,
    IncidentType,
    Notice,
    NoticeRead,
    Route,
    RouteStop,
    Stop,
    User,
    UserRole,
    Vehicle,
    VehicleStatus,
)

fake = Faker("en_IN")
Faker.seed(42)
random.seed(42)

DEMO_PASSWORD = "password"

# Rough NCR depot centres
DEPOT_DEFS = [
    ("NOIDA37", "Noida Sector 37 Depot", 28.5672, 77.3260),
    ("ANANDV", "Anand Vihar Depot", 28.6465, 77.3160),
    ("GHAZI", "Ghaziabad Depot", 28.6692, 77.4538),
    ("SAHIBA", "Sahibabad Depot", 28.6710, 77.3640),
    ("DUHAI", "Duhai Depot", 28.7285, 77.4850),
]

STOP_DEFS = [
    ("Noida Sec-18 Metro", 28.5703, 77.3219),
    ("Noida Sec-37", 28.5672, 77.3260),
    ("Botanical Garden", 28.5640, 77.3345),
    ("Anand Vihar ISBT", 28.6469, 77.3152),
    ("Karkardooma", 28.6492, 77.3045),
    ("Vaishali Metro", 28.6500, 77.3395),
    ("Ghaziabad RRTS", 28.6695, 77.4530),
    ("Sahibabad RRTS", 28.6715, 77.3645),
    ("Indirapuram", 28.6415, 77.3700),
    ("Dilshad Garden", 28.6759, 77.3215),
    ("Meerut South", 28.9180, 77.6510),
    ("Modinagar", 28.8320, 77.5800),
    ("Muradnagar", 28.7800, 77.5000),
    ("Duhai RRTS", 28.7285, 77.4850),
    ("Guldhar", 28.7050, 77.4700),
    ("New Ashok Nagar", 28.5890, 77.3010),
    ("Mayur Vihar Phase-1", 28.6040, 77.2890),
    ("Laxmi Nagar", 28.6305, 77.2775),
    ("Connaught Place", 28.6315, 77.2167),
    ("Kashmere Gate", 28.6675, 77.2280),
    ("Sarita Vihar", 28.5285, 77.2880),
    ("Okhla", 28.5460, 77.2750),
    ("Rajiv Chowk", 28.6328, 77.2197),
    ("Yamuna Bank", 28.6235, 77.2680),
    ("Noida City Centre", 28.5747, 77.3561),
]


def _square_polygon(lat: float, lng: float, delta: float = 0.008) -> dict:
    return {
        "type": "Polygon",
        "coordinates": [
            [
                [lng - delta, lat - delta],
                [lng + delta, lat - delta],
                [lng + delta, lat + delta],
                [lng - delta, lat + delta],
                [lng - delta, lat - delta],
            ]
        ],
    }


def _interp(points: list[tuple[float, float]], n: int) -> list[tuple[float, float]]:
    if len(points) < 2:
        return points
    out: list[tuple[float, float]] = []
    segs = len(points) - 1
    for i in range(n):
        t = i / max(n - 1, 1) * segs
        idx = min(int(t), segs - 1)
        frac = t - idx
        lat = points[idx][0] + (points[idx + 1][0] - points[idx][0]) * frac
        lng = points[idx][1] + (points[idx + 1][1] - points[idx][1]) * frac
        # tiny jitter so trails look natural
        lat += math.sin(i * 0.7) * 0.00015
        lng += math.cos(i * 0.5) * 0.00015
        out.append((lat, lng))
    return out


def seed_if_empty(db: Session) -> bool:
    if db.query(User).first():
        return False
    run_seed(db)
    return True


def run_seed(db: Session) -> None:
    print("Seeding NCRTC BMS demo data...")
    # Hash once — all demo users share the same demo password
    demo_hash = hash_password(DEMO_PASSWORD)

    depots: list[Depot] = []
    for code, name, lat, lng in DEPOT_DEFS:
        d = Depot(
            code=code,
            name=name,
            location_lat=lat,
            location_lng=lng,
            polygon_geojson=_square_polygon(lat, lng),
        )
        db.add(d)
        depots.append(d)
    db.flush()

    stops: list[Stop] = []
    for name, lat, lng in STOP_DEFS:
        s = Stop(name=name, lat=lat, lng=lng)
        db.add(s)
        stops.append(s)
    db.flush()

    # Users — labelled demo credentials
    users: list[User] = []

    def add_user(username: str, full_name: str, role: UserRole, depot: Depot | None, phone: str | None = None):
        u = User(
            username=username,
            password_hash=demo_hash,
            full_name=full_name,
            role=role,
            depot_id=depot.id if depot else None,
            phone=phone or fake.phone_number(),
        )
        db.add(u)
        users.append(u)
        return u

    admin = add_user("admin", "System Admin", UserRole.admin, None)
    add_user("control1", "Control Room Operator 1", UserRole.control_room_operator, None)
    add_user("control2", "Control Room Operator 2", UserRole.control_room_operator, None)

    managers: list[User] = []
    for i, depot in enumerate(depots, start=1):
        managers.append(add_user(f"manager{i}", f"{depot.name} Manager", UserRole.depot_manager, depot))

    drivers: list[User] = []
    conductors: list[User] = []
    driver_idx = 1
    conductor_idx = 1
    # ~80 users total: 1 admin + 2 control + 5 managers + ~50 drivers + ~22 conductors
    per_depot_drivers = [10, 10, 10, 10, 10]
    per_depot_conductors = [5, 5, 4, 4, 4]
    for depot, nd, nc in zip(depots, per_depot_drivers, per_depot_conductors):
        for _ in range(nd):
            drivers.append(
                add_user(
                    f"driver{driver_idx}",
                    fake.name(),
                    UserRole.driver,
                    depot,
                )
            )
            driver_idx += 1
        for _ in range(nc):
            conductors.append(
                add_user(
                    f"conductor{conductor_idx}",
                    fake.name(),
                    UserRole.conductor,
                    depot,
                )
            )
            conductor_idx += 1
    db.flush()

    # ~50 vehicles
    vehicles: list[Vehicle] = []
    states = ["DL", "UP", "HR"]
    for i in range(50):
        depot = depots[i % len(depots)]
        st = states[i % len(states)]
        reg = f"{st}-1C-{1000 + i:04d}"
        status = VehicleStatus.active if i % 9 else VehicleStatus.idle
        if i % 17 == 0:
            status = VehicleStatus.maintenance
        v = Vehicle(reg_no=reg, depot_id=depot.id, status=status)
        db.add(v)
        vehicles.append(v)
    db.flush()

    # 12 routes
    route_blueprints = [
        ("F01", "Noida Sec-18 ↔ Botanical Garden", 0, [0, 1, 2, 24]),
        ("F02", "Anand Vihar ↔ Vaishali Feeder", 1, [3, 4, 5, 8]),
        ("F03", "Ghaziabad RRTS Loop", 2, [6, 14, 7, 8]),
        ("F04", "Sahibabad ↔ Indirapuram", 3, [7, 8, 5, 3]),
        ("F05", "Duhai ↔ Muradnagar", 4, [13, 12, 14, 6]),
        ("F06", "Anand Vihar ↔ Mayur Vihar", 1, [3, 15, 16, 17]),
        ("F07", "Noida City Centre Feeder", 0, [24, 1, 0, 15]),
        ("F08", "Ghaziabad ↔ Dilshad Garden", 2, [6, 9, 3, 4]),
        ("F09", "Modinagar ↔ Meerut South", 4, [11, 10, 13]),
        ("F10", "Kashmere Gate Link", 1, [19, 17, 3, 16]),
        ("F11", "Okhla ↔ Sarita Vihar", 0, [21, 20, 15]),
        ("F12", "CP Express Feeder", 1, [18, 22, 17, 23]),
    ]
    routes: list[Route] = []
    for code, name, depot_idx, stop_idxs in route_blueprints:
        r = Route(code=code, name=name, depot_id=depots[depot_idx].id)
        db.add(r)
        db.flush()
        for seq, si in enumerate(stop_idxs):
            db.add(
                RouteStop(
                    route_id=r.id,
                    stop_id=stops[si].id,
                    sequence=seq + 1,
                    planned_offset_min=seq * 8,
                )
            )
        routes.append(r)
    db.flush()

    # One week of duties (yesterday, today, tomorrow + rest of week)
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    duties: list[Duty] = []
    for day_offset in range(7):
        d = week_start + timedelta(days=day_offset)
        for depot in depots:
            depot_vehicles = [v for v in vehicles if v.depot_id == depot.id and v.status == VehicleStatus.active]
            depot_drivers = [u for u in drivers if u.depot_id == depot.id]
            depot_routes = [r for r in routes if r.depot_id == depot.id]
            depot_conductors = [u for u in conductors if u.depot_id == depot.id]
            if not depot_vehicles or not depot_drivers or not depot_routes:
                continue
            slots = min(6, len(depot_vehicles), len(depot_drivers))
            for i in range(slots):
                start_h = 6 + (i % 4) * 3
                status = DutyStatus.published
                if d > today + timedelta(days=1):
                    status = DutyStatus.draft if i % 3 == 0 else DutyStatus.published
                if d == today and i == 0:
                    status = DutyStatus.acknowledged
                duty = Duty(
                    date=d,
                    vehicle_id=depot_vehicles[i].id,
                    driver_id=depot_drivers[i].id,
                    conductor_id=depot_conductors[i % len(depot_conductors)].id if depot_conductors else None,
                    route_id=depot_routes[i % len(depot_routes)].id,
                    depot_id=depot.id,
                    start_time=time(start_h, 0),
                    end_time=time(min(start_h + 8, 22), 0),
                    status=status,
                    ack_at=datetime.now(timezone.utc) - timedelta(hours=2) if status == DutyStatus.acknowledged else None,
                )
                db.add(duty)
                duties.append(duty)
    db.flush()

    # GPS history for yesterday — 12 vehicles with full trails
    yesterday = today - timedelta(days=1)
    history_vehicles = [v for v in vehicles if v.status == VehicleStatus.active][:12]
    for vi, vehicle in enumerate(history_vehicles):
        route = routes[vi % len(routes)]
        rs = db.query(RouteStop).filter(RouteStop.route_id == route.id).order_by(RouteStop.sequence).all()
        pts = [(db.get(Stop, r.stop_id).lat, db.get(Stop, r.stop_id).lng) for r in rs]  # type: ignore[union-attr]
        trail = _interp(pts, 40)
        base = datetime.combine(yesterday, time(7 + vi % 3, 0), tzinfo=timezone.utc)
        for i, (lat, lng) in enumerate(trail):
            db.add(
                GpsPing(
                    vehicle_id=vehicle.id,
                    ts=base + timedelta(minutes=i * 3),
                    lat=lat,
                    lng=lng,
                    speed_kmh=20 + (i % 15),
                    ignition_on=True,
                )
            )

    # Live GPS for active vehicles today (current positions along routes)
    live_vehicles = [v for v in vehicles if v.status == VehicleStatus.active][:30]
    for vi, vehicle in enumerate(live_vehicles):
        route = routes[vi % len(routes)]
        rs = db.query(RouteStop).filter(RouteStop.route_id == route.id).order_by(RouteStop.sequence).all()
        pts = [(db.get(Stop, r.stop_id).lat, db.get(Stop, r.stop_id).lng) for r in rs]  # type: ignore[union-attr]
        trail = _interp(pts, 25)
        # store progress index in a deterministic place — last few pings + "current"
        progress = vi % max(len(trail) - 1, 1)
        for j in range(max(0, progress - 5), progress + 1):
            lat, lng = trail[j]
            db.add(
                GpsPing(
                    vehicle_id=vehicle.id,
                    ts=datetime.now(timezone.utc) - timedelta(minutes=(progress - j) * 2),
                    lat=lat,
                    lng=lng,
                    speed_kmh=18 + (j % 12),
                    ignition_on=True,
                )
            )

    # Incidents
    incident_specs = [
        (IncidentType.breakdown, IncidentSeverity.P1, IncidentStatus.open, "Engine overheating near Botanical Garden"),
        (IncidentType.accident, IncidentSeverity.P1, IncidentStatus.in_progress, "Minor collision at Anand Vihar bay"),
        (IncidentType.complaint, IncidentSeverity.P2, IncidentStatus.acknowledged, "Passenger complaint: AC not working"),
        (IncidentType.breakdown, IncidentSeverity.P2, IncidentStatus.resolved, "Flat tyre replaced at Sahibabad"),
        (IncidentType.other, IncidentSeverity.P3, IncidentStatus.open, "Fare device offline"),
        (IncidentType.complaint, IncidentSeverity.P3, IncidentStatus.closed, "Late departure complaint resolved"),
    ]
    for i, (itype, sev, status, desc) in enumerate(incident_specs):
        v = vehicles[i * 3]
        raiser = drivers[i]
        manager = managers[v.depot_id - 1]
        inc = Incident(
            type=itype,
            severity=sev,
            status=status,
            raised_by=raiser.id,
            assigned_to=manager.id if status != IncidentStatus.open else None,
            vehicle_id=v.id,
            depot_id=v.depot_id,
            description=desc,
            created_at=datetime.now(timezone.utc) - timedelta(hours=6 - i),
            resolved_at=datetime.now(timezone.utc) - timedelta(hours=1) if status in (IncidentStatus.resolved, IncidentStatus.closed) else None,
        )
        db.add(inc)
        db.flush()
        db.add(
            IncidentEvent(
                incident_id=inc.id,
                actor_id=raiser.id,
                from_status=None,
                to_status=IncidentStatus.open,
                note="Incident raised",
                ts=inc.created_at,
            )
        )
        if status != IncidentStatus.open:
            db.add(
                IncidentEvent(
                    incident_id=inc.id,
                    actor_id=manager.id,
                    from_status=IncidentStatus.open,
                    to_status=status if status != IncidentStatus.in_progress else IncidentStatus.acknowledged,
                    note="Taken up by depot",
                )
            )
        if status == IncidentStatus.in_progress:
            db.add(
                IncidentEvent(
                    incident_id=inc.id,
                    actor_id=manager.id,
                    from_status=IncidentStatus.acknowledged,
                    to_status=IncidentStatus.in_progress,
                    note="Crew dispatched",
                )
            )

    # Notices
    n1 = Notice(
        title="Safety briefing — monsoon protocol",
        body="All drivers must complete the monsoon safety checklist before departure. Maintain reduced speed on waterlogged stretches near Yamuna Bank.",
        audience_json={"type": "all_drivers"},
        publish_at=datetime.now(timezone.utc) - timedelta(days=1),
        created_by=admin.id,
        ack_required=True,
    )
    n2 = Notice(
        title="Roster freeze for Holi week",
        body="Depot managers: publish duties for Holi week by Friday 1700 hrs. Leave requests close Thursday.",
        audience_json={"type": "role", "role": "depot_manager"},
        publish_at=datetime.now(timezone.utc) - timedelta(hours=12),
        created_by=admin.id,
        ack_required=False,
    )
    n3 = Notice(
        title="Noida Sec-37 bay resurfacing",
        body="Bay 3–5 closed for resurfacing 0600–1000 tomorrow. Use overflow bay near Sec-18.",
        audience_json={"type": "depot", "depot_id": depots[0].id},
        publish_at=datetime.now(timezone.utc) - timedelta(hours=3),
        created_by=admin.id,
        ack_required=False,
    )
    db.add_all([n1, n2, n3])
    db.flush()
    # Some drivers have read n1
    for d in drivers[:8]:
        db.add(NoticeRead(notice_id=n1.id, user_id=d.id, acknowledged=True))
    for d in drivers[8:12]:
        db.add(NoticeRead(notice_id=n1.id, user_id=d.id, acknowledged=False))

    db.commit()
    print(
        f"Seeded: {len(depots)} depots, {len(vehicles)} vehicles, {len(users)} users, "
        f"{len(routes)} routes, {len(duties)} duties. Demo password for all: '{DEMO_PASSWORD}'"
    )
    print("Demo logins: admin / password, manager1 / password, driver1 / password, control1 / password")
