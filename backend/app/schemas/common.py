from datetime import date, datetime, time
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.entities import (
    DutyStatus,
    IncidentSeverity,
    IncidentStatus,
    IncidentType,
    UserRole,
    VehicleStatus,
)


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(ORMModel):
    id: int
    username: str
    full_name: str
    role: UserRole
    depot_id: int | None
    phone: str | None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class DepotOut(ORMModel):
    id: int
    code: str
    name: str
    location_lat: float
    location_lng: float
    polygon_geojson: dict[str, Any]


class VehicleOut(ORMModel):
    id: int
    reg_no: str
    depot_id: int
    status: VehicleStatus


class StopOut(ORMModel):
    id: int
    name: str
    lat: float
    lng: float


class RouteStopIn(BaseModel):
    stop_id: int
    sequence: int
    planned_offset_min: int = 0


class RouteStopOut(ORMModel):
    id: int
    stop_id: int
    sequence: int
    planned_offset_min: int
    stop: StopOut | None = None


class RouteCreate(BaseModel):
    code: str = Field(min_length=2, max_length=32)
    name: str = Field(min_length=2, max_length=128)
    depot_id: int
    stops: list[RouteStopIn] = Field(min_length=2)


class RouteUpdate(BaseModel):
    name: str | None = None
    depot_id: int | None = None
    stops: list[RouteStopIn] | None = None


class RouteOut(ORMModel):
    id: int
    code: str
    name: str
    depot_id: int
    stops: list[RouteStopOut] = []


class DutyCreate(BaseModel):
    date: date
    vehicle_id: int
    driver_id: int
    conductor_id: int | None = None
    route_id: int
    start_time: time
    end_time: time


class DutyOut(ORMModel):
    id: int
    date: date
    vehicle_id: int
    driver_id: int
    conductor_id: int | None
    route_id: int
    depot_id: int
    start_time: time
    end_time: time
    status: DutyStatus
    ack_at: datetime | None
    vehicle: VehicleOut | None = None
    driver: UserOut | None = None
    route: RouteOut | None = None


class GpsPingOut(ORMModel):
    id: int
    vehicle_id: int
    ts: datetime
    lat: float
    lng: float
    speed_kmh: float
    ignition_on: bool


class LiveVehicleOut(BaseModel):
    vehicle_id: int
    reg_no: str
    depot_id: int
    status: VehicleStatus
    lat: float
    lng: float
    speed_kmh: float
    ts: datetime
    driver_name: str | None = None
    route_code: str | None = None
    route_name: str | None = None


class IncidentCreate(BaseModel):
    type: IncidentType
    severity: IncidentSeverity
    description: str = Field(min_length=5)
    vehicle_id: int | None = None
    depot_id: int | None = None
    location_lat: float | None = None
    location_lng: float | None = None


class IncidentStatusChange(BaseModel):
    to_status: IncidentStatus
    note: str = Field(min_length=2)
    assigned_to: int | None = None


class IncidentEventOut(ORMModel):
    id: int
    ts: datetime
    actor_id: int
    from_status: IncidentStatus | None
    to_status: IncidentStatus
    note: str
    actor: UserOut | None = None


class IncidentOut(ORMModel):
    id: int
    type: IncidentType
    severity: IncidentSeverity
    status: IncidentStatus
    raised_by: int
    assigned_to: int | None
    vehicle_id: int | None
    depot_id: int | None
    description: str
    photo_path: str | None
    location_lat: float | None
    location_lng: float | None
    created_at: datetime
    resolved_at: datetime | None
    events: list[IncidentEventOut] = []
    raiser: UserOut | None = None
    assignee: UserOut | None = None
    vehicle: VehicleOut | None = None


class NoticeCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    body: str = Field(min_length=2)
    audience: dict[str, Any]
    publish_at: datetime | None = None
    ack_required: bool = False


class NoticeOut(ORMModel):
    id: int
    title: str
    body: str
    audience_json: dict[str, Any]
    publish_at: datetime
    created_by: int
    ack_required: bool
    created_at: datetime
    read: bool = False
    acknowledged: bool = False


class NoticeReadOut(ORMModel):
    user_id: int
    username: str
    full_name: str
    read_at: datetime
    acknowledged: bool


class MessageOut(BaseModel):
    message: str
