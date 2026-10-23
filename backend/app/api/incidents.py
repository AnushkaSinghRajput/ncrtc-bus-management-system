from datetime import datetime, timezone
from pathlib import Path
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session, joinedload

from app.core.config import get_settings
from app.core.deps import depot_filter_ids, get_current_user, require_roles
from app.database import get_db
from app.models.entities import (
    Duty,
    DutyStatus,
    GpsPing,
    Incident,
    IncidentEvent,
    IncidentSeverity,
    IncidentStatus,
    IncidentType,
    User,
    UserRole,
    Vehicle,
)
from app.schemas.common import IncidentCreate, IncidentOut, IncidentStatusChange
from datetime import date

router = APIRouter(prefix="/api/incidents", tags=["ims"])

ALLOWED_TRANSITIONS: dict[IncidentStatus, set[IncidentStatus]] = {
    IncidentStatus.open: {IncidentStatus.acknowledged, IncidentStatus.closed},
    IncidentStatus.acknowledged: {IncidentStatus.in_progress, IncidentStatus.closed},
    IncidentStatus.in_progress: {IncidentStatus.resolved, IncidentStatus.closed},
    IncidentStatus.resolved: {IncidentStatus.closed},
    IncidentStatus.closed: set(),
}


def _load(db: Session, incident_id: int) -> Incident | None:
    return (
        db.query(Incident)
        .options(
            joinedload(Incident.events).joinedload(IncidentEvent.actor),
            joinedload(Incident.raiser),
            joinedload(Incident.assignee),
            joinedload(Incident.vehicle),
        )
        .filter(Incident.id == incident_id)
        .first()
    )


@router.get("", response_model=list[IncidentOut])
def list_incidents(
    status: IncidentStatus | None = Query(None),
    severity: IncidentSeverity | None = Query(None),
    depot_id: int | None = Query(None),
    mine_only: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Incident]:
    q = db.query(Incident).options(
        joinedload(Incident.raiser),
        joinedload(Incident.assignee),
        joinedload(Incident.vehicle),
        joinedload(Incident.events),
    )
    scoped = depot_filter_ids(user)
    if scoped is not None:
        q = q.filter(Incident.depot_id == scoped)
    elif depot_id is not None:
        q = q.filter(Incident.depot_id == depot_id)
    if status:
        q = q.filter(Incident.status == status)
    if severity:
        q = q.filter(Incident.severity == severity)
    if mine_only:
        q = q.filter((Incident.raised_by == user.id) | (Incident.assigned_to == user.id))
    return q.order_by(Incident.created_at.desc()).limit(200).all()


@router.get("/{incident_id}", response_model=IncidentOut)
def get_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Incident:
    incident = _load(db, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    scoped = depot_filter_ids(user)
    if scoped is not None and incident.depot_id != scoped:
        raise HTTPException(status_code=403, detail="Depot isolation")
    return incident


@router.post("", response_model=IncidentOut, status_code=201)
async def create_incident(
    type: IncidentType = Form(...),
    severity: IncidentSeverity = Form(...),
    description: str = Form(...),
    vehicle_id: int | None = Form(None),
    depot_id: int | None = Form(None),
    location_lat: float | None = Form(None),
    location_lng: float | None = Form(None),
    photo: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Incident:
    if len(description.strip()) < 5:
        raise HTTPException(status_code=400, detail="Description too short")
    photo_path = None
    if photo and photo.filename:
        settings = get_settings()
        Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
        ext = Path(photo.filename).suffix or ".jpg"
        name = f"{uuid.uuid4().hex}{ext}"
        dest = Path(settings.upload_dir) / name
        dest.write_bytes(await photo.read())
        photo_path = name

    resolved_depot = depot_id or user.depot_id
    if vehicle_id:
        vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
        if vehicle:
            resolved_depot = vehicle.depot_id

    incident = Incident(
        type=type,
        severity=severity,
        status=IncidentStatus.open,
        raised_by=user.id,
        vehicle_id=vehicle_id,
        depot_id=resolved_depot,
        description=description.strip(),
        photo_path=photo_path,
        location_lat=location_lat,
        location_lng=location_lng,
    )
    db.add(incident)
    db.flush()
    db.add(
        IncidentEvent(
            incident_id=incident.id,
            actor_id=user.id,
            from_status=None,
            to_status=IncidentStatus.open,
            note="Incident raised",
        )
    )
    db.commit()
    return _load(db, incident.id)  # type: ignore[return-value]


@router.post("/json", response_model=IncidentOut, status_code=201)
def create_incident_json(
    body: IncidentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Incident:
    resolved_depot = body.depot_id or user.depot_id
    if body.vehicle_id:
        vehicle = db.query(Vehicle).filter(Vehicle.id == body.vehicle_id).first()
        if vehicle:
            resolved_depot = vehicle.depot_id
    incident = Incident(
        type=body.type,
        severity=body.severity,
        status=IncidentStatus.open,
        raised_by=user.id,
        vehicle_id=body.vehicle_id,
        depot_id=resolved_depot,
        description=body.description.strip(),
        location_lat=body.location_lat,
        location_lng=body.location_lng,
    )
    db.add(incident)
    db.flush()
    db.add(
        IncidentEvent(
            incident_id=incident.id,
            actor_id=user.id,
            from_status=None,
            to_status=IncidentStatus.open,
            note="Incident raised",
        )
    )
    db.commit()
    return _load(db, incident.id)  # type: ignore[return-value]


@router.post("/panic", response_model=IncidentOut, status_code=201)
def panic_button(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.driver, UserRole.conductor)),
) -> Incident:
    today = date.today()
    duty = (
        db.query(Duty)
        .filter(
            Duty.date == today,
            Duty.status.in_([DutyStatus.published, DutyStatus.acknowledged]),
            (Duty.driver_id == user.id) | (Duty.conductor_id == user.id),
        )
        .first()
    )
    vehicle_id = duty.vehicle_id if duty else None
    last_ping = (
        db.query(GpsPing).filter(GpsPing.vehicle_id == vehicle_id).order_by(GpsPing.ts.desc()).first()
        if vehicle_id
        else None
    )
    incident = Incident(
        type=IncidentType.other,
        severity=IncidentSeverity.P1,
        status=IncidentStatus.open,
        raised_by=user.id,
        vehicle_id=vehicle_id,
        depot_id=user.depot_id,
        description=f"PANIC alert from {user.full_name} ({user.username})",
        location_lat=last_ping.lat if last_ping else None,
        location_lng=last_ping.lng if last_ping else None,
    )
    db.add(incident)
    db.flush()
    db.add(
        IncidentEvent(
            incident_id=incident.id,
            actor_id=user.id,
            from_status=None,
            to_status=IncidentStatus.open,
            note="Panic button pressed",
        )
    )
    db.commit()
    return _load(db, incident.id)  # type: ignore[return-value]


@router.post("/{incident_id}/transition", response_model=IncidentOut)
def transition(
    incident_id: int,
    body: IncidentStatusChange,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles(
            UserRole.admin,
            UserRole.depot_manager,
            UserRole.control_room_operator,
        )
    ),
) -> Incident:
    incident = _load(db, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    scoped = depot_filter_ids(user)
    if scoped is not None and incident.depot_id != scoped:
        raise HTTPException(status_code=403, detail="Depot isolation")
    if body.to_status not in ALLOWED_TRANSITIONS.get(incident.status, set()):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transition from {incident.status.value} to {body.to_status.value}",
        )
    from_status = incident.status
    incident.status = body.to_status
    if body.assigned_to is not None:
        incident.assigned_to = body.assigned_to
    if body.to_status == IncidentStatus.resolved:
        incident.resolved_at = datetime.now(timezone.utc)
    db.add(
        IncidentEvent(
            incident_id=incident.id,
            actor_id=user.id,
            from_status=from_status,
            to_status=body.to_status,
            note=body.note,
        )
    )
    db.commit()
    return _load(db, incident_id)  # type: ignore[return-value]
