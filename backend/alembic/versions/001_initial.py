"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-10-23
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.create_table(
        "depot",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(32), nullable=False, unique=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("location_lat", sa.Float(), nullable=False),
        sa.Column("location_lng", sa.Float(), nullable=False),
        sa.Column("polygon_geojson", sa.JSON(), nullable=False),
    )
    op.create_table(
        "stop",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lng", sa.Float(), nullable=False),
    )
    op.create_table(
        "user",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(64), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(128), nullable=False),
        sa.Column("role", sa.Enum("driver", "conductor", "depot_manager", "control_room_operator", "admin", name="user_role"), nullable=False),
        sa.Column("depot_id", sa.Integer(), sa.ForeignKey("depot.id"), nullable=True),
        sa.Column("phone", sa.String(32), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true")),
    )
    op.create_index("ix_user_username", "user", ["username"])
    op.create_index("ix_user_depot_id", "user", ["depot_id"])
    op.create_table(
        "vehicle",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("reg_no", sa.String(32), nullable=False, unique=True),
        sa.Column("depot_id", sa.Integer(), sa.ForeignKey("depot.id"), nullable=False),
        sa.Column("status", sa.Enum("active", "maintenance", "idle", "out_of_service", name="vehicle_status"), nullable=False),
    )
    op.create_index("ix_vehicle_depot_id", "vehicle", ["depot_id"])
    op.create_table(
        "route",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(32), nullable=False, unique=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("depot_id", sa.Integer(), sa.ForeignKey("depot.id"), nullable=False),
    )
    op.create_index("ix_route_depot_id", "route", ["depot_id"])
    op.create_table(
        "route_stop",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("route_id", sa.Integer(), sa.ForeignKey("route.id", ondelete="CASCADE"), nullable=False),
        sa.Column("stop_id", sa.Integer(), sa.ForeignKey("stop.id"), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("planned_offset_min", sa.Integer(), nullable=False),
        sa.UniqueConstraint("route_id", "sequence", name="uq_route_seq"),
    )
    op.create_table(
        "duty",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("vehicle_id", sa.Integer(), sa.ForeignKey("vehicle.id"), nullable=False),
        sa.Column("driver_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("conductor_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=True),
        sa.Column("route_id", sa.Integer(), sa.ForeignKey("route.id"), nullable=False),
        sa.Column("depot_id", sa.Integer(), sa.ForeignKey("depot.id"), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("status", sa.Enum("draft", "published", "acknowledged", "completed", "cancelled", name="duty_status"), nullable=False),
        sa.Column("ack_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_duty_date", "duty", ["date"])
    op.create_index("ix_duty_date_depot", "duty", ["date", "depot_id"])
    op.create_table(
        "gps_ping",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("vehicle_id", sa.Integer(), sa.ForeignKey("vehicle.id"), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lng", sa.Float(), nullable=False),
        sa.Column("speed_kmh", sa.Float()),
        sa.Column("ignition_on", sa.Boolean()),
    )
    op.create_index("ix_gps_vehicle_ts", "gps_ping", ["vehicle_id", "ts"])
    op.create_table(
        "incident",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("type", sa.Enum("breakdown", "accident", "complaint", "other", name="incident_type"), nullable=False),
        sa.Column("severity", sa.Enum("P1", "P2", "P3", name="incident_severity"), nullable=False),
        sa.Column("status", sa.Enum("open", "acknowledged", "in_progress", "resolved", "closed", name="incident_status"), nullable=False),
        sa.Column("raised_by", sa.Integer(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("assigned_to", sa.Integer(), sa.ForeignKey("user.id"), nullable=True),
        sa.Column("vehicle_id", sa.Integer(), sa.ForeignKey("vehicle.id"), nullable=True),
        sa.Column("depot_id", sa.Integer(), sa.ForeignKey("depot.id"), nullable=True),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("photo_path", sa.String(255), nullable=True),
        sa.Column("location_lat", sa.Float(), nullable=True),
        sa.Column("location_lng", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_incident_status_depot", "incident", ["status", "depot_id"])
    op.create_table(
        "incident_event",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("incident_id", sa.Integer(), sa.ForeignKey("incident.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("actor_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("from_status", sa.Enum("open", "acknowledged", "in_progress", "resolved", "closed", name="incident_status", create_type=False), nullable=True),
        sa.Column("to_status", sa.Enum("open", "acknowledged", "in_progress", "resolved", "closed", name="incident_status", create_type=False), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
    )
    op.create_table(
        "notice",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("audience_json", sa.JSON(), nullable=False),
        sa.Column("publish_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("ack_required", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_table(
        "notice_read",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("notice_id", sa.Integer(), sa.ForeignKey("notice.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("acknowledged", sa.Boolean(), server_default=sa.text("false")),
        sa.UniqueConstraint("notice_id", "user_id", name="uq_notice_user"),
    )


def downgrade() -> None:
    for t in [
        "notice_read",
        "notice",
        "incident_event",
        "incident",
        "gps_ping",
        "duty",
        "route_stop",
        "route",
        "vehicle",
        "user",
        "stop",
        "depot",
    ]:
        op.drop_table(t)
    for e in [
        "user_role",
        "vehicle_status",
        "duty_status",
        "incident_type",
        "incident_severity",
        "incident_status",
    ]:
        op.execute(f"DROP TYPE IF EXISTS {e}")
