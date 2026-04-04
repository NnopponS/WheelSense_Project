"""CareGiver domain models: staff profiles, zone assignments, and shifts."""

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    Date,
    Time,
    DateTime,
    ForeignKey,
)

from .base import Base, utcnow


class CareGiver(Base):
    """Nursing home staff member (Observer or Supervisor role)."""

    __tablename__ = "caregivers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(
        Integer,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    first_name = Column(String(64), nullable=False)
    last_name = Column(String(64), nullable=False)
    role = Column(String(16), nullable=False)  # observer | supervisor
    phone = Column(String(20), default="")
    email = Column(String(128), default="")
    photo_url = Column(String(256), default="")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class CareGiverZone(Base):
    """Which rooms/zones a caregiver covers."""

    __tablename__ = "caregiver_zones"

    id = Column(Integer, primary_key=True, autoincrement=True)
    caregiver_id = Column(
        Integer,
        ForeignKey("caregivers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    room_id = Column(
        Integer, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=True
    )
    zone_name = Column(String(64), default="")  # "Zone A", "East Wing"
    is_active = Column(Boolean, default=True)


class CareGiverShift(Base):
    """Shift schedule for caregivers."""

    __tablename__ = "caregiver_shifts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    caregiver_id = Column(
        Integer,
        ForeignKey("caregivers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    shift_date = Column(Date, nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    shift_type = Column(String(16), default="regular")  # regular | overtime | on_call
    notes = Column(Text, default="")
