from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import depot_filter_ids, get_current_user, require_roles
from app.database import get_db
from app.models.entities import User, UserRole, Vehicle, VehicleStatus
from app.schemas.common import VehicleOut
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/vehicles", tags=["vehicles"])


class VehicleCreate(BaseModel):
    reg_no: str = Field(min_length=4, max_length=32)
    depot_id: int
    status: VehicleStatus = VehicleStatus.active


@router.get("", response_model=list[VehicleOut])
def list_vehicles(
    depot_id: int | None = Query(None),
    q: str | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Vehicle]:
    query = db.query(Vehicle)
    scoped = depot_filter_ids(user)
    if scoped is not None:
        query = query.filter(Vehicle.depot_id == scoped)
    elif depot_id is not None:
        query = query.filter(Vehicle.depot_id == depot_id)
    if q:
        query = query.filter(Vehicle.reg_no.ilike(f"%{q}%"))
    return query.order_by(Vehicle.reg_no).all()


@router.post("", response_model=VehicleOut, status_code=201)
def create_vehicle(
    body: VehicleCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.admin)),
) -> Vehicle:
    if db.query(Vehicle).filter(Vehicle.reg_no == body.reg_no).first():
        raise HTTPException(status_code=400, detail="Registration already exists")
    vehicle = Vehicle(reg_no=body.reg_no.upper(), depot_id=body.depot_id, status=body.status)
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return vehicle
