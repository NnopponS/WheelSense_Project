from __future__ import annotations

"""CareGiver domain models: staff profiles, zone assignments, and shifts."""

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Time,
    text,
)
from sqlalchemy.orm import relationship

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
    role = Column(String(16), nullable=False)  # admin | head_nurse | supervisor | observer
    employee_code = Column(String(32), nullable=False, default="")
    department = Column(String(64), nullable=False, default="")
    employment_type = Column(String(32), nullable=False, default="")
    specialty = Column(String(64), nullable=False, default="")
    license_number = Column(String(64), nullable=False, default="")
    phone = Column(String(20), default="")
    email = Column(String(128), default="")
    emergency_contact_name = Column(String(128), nullable=False, default="")
    emergency_contact_phone = Column(String(32), nullable=False, default="")
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

class CareGiverPatientAccess(Base):
    """Explicit caregiver-to-patient visibility assignment."""

    __tablename__ = "caregiver_patient_access"
    __table_args__ = (
        Index(
            "uq_caregiver_patient_access_active",
            "workspace_id",
            "caregiver_id",
            "patient_id",
            unique=True,
            postgresql_where=text("is_active = true"),
            sqlite_where=text("is_active = 1"),
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(
        Integer,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    caregiver_id = Column(
        Integer,
        ForeignKey("caregivers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    patient_id = Column(
        Integer,
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    assigned_by_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

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

class CareGiverDeviceAssignment(Base):
    """Caregiver ↔ Device binding (e.g. mobile handset, Polar gateway)."""

    __tablename__ = "caregiver_device_assignments"
    __table_args__ = (
        Index(
            "uq_caregiver_device_assignments_active_device",
            "workspace_id",
            "device_id",
            unique=True,
            postgresql_where=text("is_active = true"),
            sqlite_where=text("is_active = 1"),
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(
        Integer,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    caregiver_id = Column(
        Integer,
        ForeignKey("caregivers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    device_id = Column(String(32), nullable=False, index=True)
    device_role = Column(String(32), nullable=False)  # mobile_phone | polar_gateway | observer_device
    assigned_at = Column(DateTime(timezone=True), default=utcnow)
    unassigned_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True)

    caregiver = relationship("CareGiver", backref="device_assignments")

