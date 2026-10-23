from __future__ import annotations

import enum
from datetime import date, datetime, time

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserRole(str, enum.Enum):
    driver = "driver"
    conductor = "conductor"
    depot_manager = "depot_manager"
    control_room_operator = "control_room_operator"
    admin = "admin"


class VehicleStatus(str, enum.Enum):
    active = "active"
    maintenance = "maintenance"
    idle = "idle"
    out_of_service = "out_of_service"


class DutyStatus(str, enum.Enum):
    draft = "draft"
    published = "published"
    acknowledged = "acknowledged"
    completed = "completed"
    cancelled = "cancelled"


class IncidentType(str, enum.Enum):
    breakdown = "breakdown"
    accident = "accident"
    complaint = "complaint"
    other = "other"


class IncidentSeverity(str, enum.Enum):
    P1 = "P1"
    P2 = "P2"
    P3 = "P3"


class IncidentStatus(str, enum.Enum):
    open = "open"
    acknowledged = "acknowledged"
    in_progress = "in_progress"
    resolved = "resolved"
    closed = "closed"


class Depot(Base):
    __tablename__ = "depot"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    location_lat: Mapped[float] = mapped_column(Float, nullable=False)
    location_lng: Mapped[float] = mapped_column(Float, nullable=False)
    polygon_geojson: Mapped[dict] = mapped_column(JSON, nullable=False)

    vehicles: Mapped[list[Vehicle]] = relationship(back_populates="depot")
    users: Mapped[list[User]] = relationship(back_populates="depot")
    routes: Mapped[list[Route]] = relationship(back_populates="depot")


class Vehicle(Base):
    __tablename__ = "vehicle"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reg_no: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    depot_id: Mapped[int] = mapped_column(ForeignKey("depot.id"), nullable=False, index=True)
    status: Mapped[VehicleStatus] = mapped_column(
        Enum(VehicleStatus, name="vehicle_status"), default=VehicleStatus.active
    )

    depot: Mapped[Depot] = relationship(back_populates="vehicles")
    duties: Mapped[list[Duty]] = relationship(back_populates="vehicle")
    gps_pings: Mapped[list[GpsPing]] = relationship(back_populates="vehicle")


class User(Base):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(128), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="user_role"), nullable=False)
    depot_id: Mapped[int | None] = mapped_column(ForeignKey("depot.id"), nullable=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    depot: Mapped[Depot | None] = relationship(back_populates="users")


class Stop(Base):
    __tablename__ = "stop"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)


class Route(Base):
    __tablename__ = "route"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    depot_id: Mapped[int] = mapped_column(ForeignKey("depot.id"), nullable=False, index=True)

    depot: Mapped[Depot] = relationship(back_populates="routes")
    stops: Mapped[list[RouteStop]] = relationship(
        back_populates="route", cascade="all, delete-orphan", order_by="RouteStop.sequence"
    )


class RouteStop(Base):
    __tablename__ = "route_stop"
    __table_args__ = (UniqueConstraint("route_id", "sequence", name="uq_route_seq"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    route_id: Mapped[int] = mapped_column(ForeignKey("route.id", ondelete="CASCADE"), nullable=False)
    stop_id: Mapped[int] = mapped_column(ForeignKey("stop.id"), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    planned_offset_min: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    route: Mapped[Route] = relationship(back_populates="stops")
    stop: Mapped[Stop] = relationship()


class Duty(Base):
    __tablename__ = "duty"
    __table_args__ = (Index("ix_duty_date_depot", "date", "depot_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicle.id"), nullable=False)
    driver_id: Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=False)
    conductor_id: Mapped[int | None] = mapped_column(ForeignKey("user.id"), nullable=True)
    route_id: Mapped[int] = mapped_column(ForeignKey("route.id"), nullable=False)
    depot_id: Mapped[int] = mapped_column(ForeignKey("depot.id"), nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    status: Mapped[DutyStatus] = mapped_column(
        Enum(DutyStatus, name="duty_status"), default=DutyStatus.draft
    )
    ack_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    vehicle: Mapped[Vehicle] = relationship(back_populates="duties")
    driver: Mapped[User] = relationship(foreign_keys=[driver_id])
    conductor: Mapped[User | None] = relationship(foreign_keys=[conductor_id])
    route: Mapped[Route] = relationship()
    depot: Mapped[Depot] = relationship()


class GpsPing(Base):
    __tablename__ = "gps_ping"
    __table_args__ = (Index("ix_gps_vehicle_ts", "vehicle_id", "ts"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicle.id"), nullable=False)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    speed_kmh: Mapped[float] = mapped_column(Float, default=0.0)
    ignition_on: Mapped[bool] = mapped_column(Boolean, default=True)

    vehicle: Mapped[Vehicle] = relationship(back_populates="gps_pings")


class Incident(Base):
    __tablename__ = "incident"
    __table_args__ = (Index("ix_incident_status_depot", "status", "depot_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    type: Mapped[IncidentType] = mapped_column(Enum(IncidentType, name="incident_type"), nullable=False)
    severity: Mapped[IncidentSeverity] = mapped_column(
        Enum(IncidentSeverity, name="incident_severity"), nullable=False
    )
    status: Mapped[IncidentStatus] = mapped_column(
        Enum(IncidentStatus, name="incident_status"), default=IncidentStatus.open
    )
    raised_by: Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=False)
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("user.id"), nullable=True)
    vehicle_id: Mapped[int | None] = mapped_column(ForeignKey("vehicle.id"), nullable=True)
    depot_id: Mapped[int | None] = mapped_column(ForeignKey("depot.id"), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    photo_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    location_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    raiser: Mapped[User] = relationship(foreign_keys=[raised_by])
    assignee: Mapped[User | None] = relationship(foreign_keys=[assigned_to])
    vehicle: Mapped[Vehicle | None] = relationship()
    depot: Mapped[Depot | None] = relationship()
    events: Mapped[list[IncidentEvent]] = relationship(
        back_populates="incident", cascade="all, delete-orphan", order_by="IncidentEvent.ts"
    )


class IncidentEvent(Base):
    __tablename__ = "incident_event"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    incident_id: Mapped[int] = mapped_column(ForeignKey("incident.id", ondelete="CASCADE"), nullable=False)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    actor_id: Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=False)
    from_status: Mapped[IncidentStatus | None] = mapped_column(
        Enum(IncidentStatus, name="incident_status", create_constraint=False), nullable=True
    )
    to_status: Mapped[IncidentStatus] = mapped_column(
        Enum(IncidentStatus, name="incident_status", create_constraint=False), nullable=False
    )
    note: Mapped[str] = mapped_column(Text, nullable=False)

    incident: Mapped[Incident] = relationship(back_populates="events")
    actor: Mapped[User] = relationship()


class Notice(Base):
    __tablename__ = "notice"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    audience_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    publish_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=False)
    ack_required: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    creator: Mapped[User] = relationship()
    reads: Mapped[list[NoticeRead]] = relationship(back_populates="notice", cascade="all, delete-orphan")


class NoticeRead(Base):
    __tablename__ = "notice_read"
    __table_args__ = (UniqueConstraint("notice_id", "user_id", name="uq_notice_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    notice_id: Mapped[int] = mapped_column(ForeignKey("notice.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=False)
    read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)

    notice: Mapped[Notice] = relationship(back_populates="reads")
    user: Mapped[User] = relationship()
