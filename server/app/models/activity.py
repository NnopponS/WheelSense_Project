"""Activity timeline and alert models.

ActivityTimeline stores auto-generated events (room transitions, fall)
and manual entries by caregivers. Alert manages actionable notifications.
"""

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    JSON,
)
from sqlalchemy.dialects.postgresql import JSONB

from .base import Base, utcnow


class ActivityTimeline(Base):
    """Event log per patient — auto-generated and manual entries."""

    __tablename__ = "activity_timeline"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(
        Integer,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    patient_id = Column(
        Integer,
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    timestamp = Column(DateTime(timezone=True), default=utcnow, index=True)

    event_type = Column(String(32), nullable=False)
    # Types: room_enter | room_exit | fall_detected | alert
    #        | observation | medication | meal | mode_switch
    #        | activity_start | activity_end

    room_id = Column(Integer, ForeignKey("rooms.id"), nullable=True)
    room_name = Column(String(64), default="")

    description = Column(Text, default="")
    data = Column(
        JSON().with_variant(JSONB, "postgresql"), default=dict
    )  # event-specific data
    source = Column(String(16), default="auto")  # auto | caregiver | system
    caregiver_id = Column(Integer, ForeignKey("caregivers.id"), nullable=True)


class Alert(Base):
    """Actionable alerts — fall, abnormal HR, device offline, etc."""

    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(
        Integer,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    patient_id = Column(
        Integer,
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    device_id = Column(String(32), nullable=True)
    timestamp = Column(DateTime(timezone=True), default=utcnow, index=True)

    alert_type = Column(String(32), nullable=False)
    # Types: fall | abnormal_hr | low_battery | device_offline
    #        | zone_violation | missed_medication | no_movement

    severity = Column(String(8), default="warning")  # info | warning | critical
    title = Column(String(128), nullable=False)
    description = Column(Text, default="")
    data = Column(
        JSON().with_variant(JSONB, "postgresql"), default=dict
    )

    # Resolution
    status = Column(
        String(16), default="active"
    )  # active | acknowledged | resolved
    acknowledged_by = Column(Integer, ForeignKey("caregivers.id"), nullable=True)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolution_note = Column(Text, default="")
