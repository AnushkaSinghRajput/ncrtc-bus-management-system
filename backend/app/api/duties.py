from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.core.deps import depot_filter_ids, get_current_user, require_roles
from app.database import get_db
from app.models.entities import Duty, DutyStatus, Route, User, UserRole, Vehicle
from app.schemas.common import DutyCreate, DutyOut, MessageOut
from datetime import datetime, timezone

router = APIRouter(prefix="/api/duties", tags=["scheduling"])


def _load_duty(db: Session, duty_id: int) -> Duty | None:
    return (
        db.query(Duty)
        .options(
            joinedload(Duty.vehicle),
            joinedload(Duty.driver),
            joinedload(Duty.route).joinedload(Route.stops),
        )
        .filter(Duty.id == duty_id)
        .first()
    )


@router.get("", response_model=list[DutyOut])
def list_duties(
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    depot_id: int | None = Query(None),
    driver_id: int | None = Query(None),
    status: DutyStatus | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Duty]:
    q = db.query(Duty).options(
        joinedload(Duty.vehicle),
        joinedload(Duty.driver),
        joinedload(Duty.route),
    )
    scoped = depot_filter_ids(user)
    if scoped is not None:
        q = q.filter(Duty.depot_id == scoped)
    elif depot_id is not None:
        q = q.filter(Duty.depot_id == depot_id)
    if user.role == UserRole.driver:
        q = q.filter(Duty.driver_id == user.id, Duty.status != DutyStatus.draft)
    if from_date:
        q = q.filter(Duty.date >= from_date)
    if to_date:
        q = q.filter(Duty.date <= to_date)
    if driver_id:
        q = q.filter(Duty.driver_id == driver_id)
    if status:
        q = q.filter(Duty.status == status)
    return q.order_by(Duty.date, Duty.start_time).all()


@router.get("/today", response_model=DutyOut | None)
def today_duty(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.driver, UserRole.conductor)),
) -> Duty | None:
    today = date.today()
    q = (
        db.query(Duty)
        .options(joinedload(Duty.vehicle), joinedload(Duty.driver), joinedload(Duty.route))
        .filter(Duty.date == today, Duty.status.in_([DutyStatus.published, DutyStatus.acknowledged]))
    )
    if user.role == UserRole.driver:
        q = q.filter(Duty.driver_id == user.id)
    else:
        q = q.filter(Duty.conductor_id == user.id)
    return q.first()


@router.post("", response_model=DutyOut, status_code=201)
def create_duty(
    body: DutyCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin, UserRole.depot_manager)),
) -> Duty:
    vehicle = db.query(Vehicle).filter(Vehicle.id == body.vehicle_id).first()
    route = db.query(Route).filter(Route.id == body.route_id).first()
    driver = db.query(User).filter(User.id == body.driver_id, User.role == UserRole.driver).first()
    if not vehicle or not route or not driver:
        raise HTTPException(status_code=400, detail="Invalid vehicle, route, or driver")
    scoped = depot_filter_ids(user)
    if scoped is not None and vehicle.depot_id != scoped:
        raise HTTPException(status_code=403, detail="Depot isolation")
    conflict = (
        db.query(Duty)
        .filter(
            Duty.driver_id == body.driver_id,
            Duty.date == body.date,
            Duty.status != DutyStatus.cancelled,
        )
        .first()
    )
    if conflict:
        raise HTTPException(status_code=400, detail="Driver already assigned that day")
    duty = Duty(
        date=body.date,
        vehicle_id=body.vehicle_id,
        driver_id=body.driver_id,
        conductor_id=body.conductor_id,
        route_id=body.route_id,
        depot_id=vehicle.depot_id,
        start_time=body.start_time,
        end_time=body.end_time,
        status=DutyStatus.draft,
    )
    db.add(duty)
    db.commit()
    return _load_duty(db, duty.id)  # type: ignore[return-value]


@router.post("/{duty_id}/publish", response_model=DutyOut)
def publish_duty(
    duty_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin, UserRole.depot_manager)),
) -> Duty:
    duty = _load_duty(db, duty_id)
    if not duty:
        raise HTTPException(status_code=404, detail="Duty not found")
    scoped = depot_filter_ids(user)
    if scoped is not None and duty.depot_id != scoped:
        raise HTTPException(status_code=403, detail="Depot isolation")
    if duty.status not in (DutyStatus.draft, DutyStatus.published):
        raise HTTPException(status_code=400, detail="Cannot publish this duty")
    duty.status = DutyStatus.published
    db.commit()
    return _load_duty(db, duty_id)  # type: ignore[return-value]


@router.post("/publish-week", response_model=MessageOut)
def publish_week(
    from_date: date = Query(...),
    to_date: date = Query(...),
    depot_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin, UserRole.depot_manager)),
) -> MessageOut:
    q = db.query(Duty).filter(
        Duty.date >= from_date,
        Duty.date <= to_date,
        Duty.status == DutyStatus.draft,
    )
    scoped = depot_filter_ids(user)
    if scoped is not None:
        q = q.filter(Duty.depot_id == scoped)
    elif depot_id is not None:
        q = q.filter(Duty.depot_id == depot_id)
    duties = q.all()
    for d in duties:
        d.status = DutyStatus.published
    db.commit()
    return MessageOut(message=f"Published {len(duties)} duties")


@router.post("/copy-week", response_model=MessageOut)
def copy_week(
    from_week_start: date = Query(..., description="Monday of the source week"),
    to_week_start: date = Query(..., description="Monday of the target week"),
    depot_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.admin, UserRole.depot_manager)),
) -> MessageOut:
    """Copy a week's roster into another week as drafts, skipping drivers already rostered on a target day."""
    if from_week_start == to_week_start:
        raise HTTPException(status_code=400, detail="Source and target weeks are the same")
    shift = to_week_start - from_week_start
    q = db.query(Duty).filter(
        Duty.date >= from_week_start,
        Duty.date < from_week_start + timedelta(days=7),
        Duty.status != DutyStatus.cancelled,
    )
    scoped = depot_filter_ids(user)
    if scoped is not None:
        q = q.filter(Duty.depot_id == scoped)
    elif depot_id is not None:
        q = q.filter(Duty.depot_id == depot_id)

    taken = {
        (driver_id, day)
        for driver_id, day in db.query(Duty.driver_id, Duty.date).filter(
            Duty.date >= to_week_start,
            Duty.date < to_week_start + timedelta(days=7),
            Duty.status != DutyStatus.cancelled,
        )
    }
    created = skipped = 0
    for src in q.all():
        target_day = src.date + shift
        if (src.driver_id, target_day) in taken:
            skipped += 1
            continue
        db.add(
            Duty(
                date=target_day,
                vehicle_id=src.vehicle_id,
                driver_id=src.driver_id,
                conductor_id=src.conductor_id,
                route_id=src.route_id,
                depot_id=src.depot_id,
                start_time=src.start_time,
                end_time=src.end_time,
                status=DutyStatus.draft,
            )
        )
        taken.add((src.driver_id, target_day))
        created += 1
    db.commit()
    return MessageOut(message=f"Copied {created} duties as drafts ({skipped} skipped: driver already rostered)")


@router.post("/{duty_id}/acknowledge", response_model=DutyOut)
def acknowledge_duty(
    duty_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.driver)),
) -> Duty:
    duty = _load_duty(db, duty_id)
    if not duty or duty.driver_id != user.id:
        raise HTTPException(status_code=404, detail="Duty not found")
    if duty.status != DutyStatus.published:
        raise HTTPException(status_code=400, detail="Duty is not published")
    duty.status = DutyStatus.acknowledged
    duty.ack_at = datetime.now(timezone.utc)
    db.commit()
    return _load_duty(db, duty_id)  # type: ignore[return-value]
