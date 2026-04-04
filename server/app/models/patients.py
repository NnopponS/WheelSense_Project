"""Patient domain models: Patient profiles, device assignments, and contacts."""

from sqlalchemy import (
    Column,
    Integer,
    Index,
    String,
    Text,
    Float,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    JSON,
    text,
)
from sqlalchemy import orm
from sqlalchemy.dialects.postgresql import JSONB

from .base import Base, utcnow


class Patient(Base):
    """Nursing home resident profile."""

    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(
        Integer,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    first_name = Column(String(64), nullable=False)
    last_name = Column(String(64), nullable=False)
    nickname = Column(String(32), default="")
    date_of_birth = Column(Date, nullable=True)
    gender = Column(String(10), default="")  # male | female | other
    height_cm = Column(Float, nullable=True)
    weight_kg = Column(Float, nullable=True)
    blood_type = Column(String(4), default="")  # A+, B-, O+, AB+, etc.
    photo_url = Column(String(256), default="")

    # Medical
    medical_conditions = Column(
        JSON().with_variant(JSONB, "postgresql"), default=list
    )  # ["diabetes", "hypertension"]
    allergies = Column(
        JSON().with_variant(JSONB, "postgresql"), default=list
    )  # ["penicillin"]
    medications = Column(
        JSON().with_variant(JSONB, "postgresql"), default=list
    )  # [{name, dosage, frequency}]

    # Care level
    care_level = Column(String(16), default="normal")  # normal | special | critical
    mobility_type = Column(
        String(16), default="wheelchair"
    )  # wheelchair | walker | independent
    current_mode = Column(
        String(16), default="wheelchair"
    )  # wheelchair | walking (active mode)
    notes = Column(Text, default="")

    # Admin
    admitted_at = Column(DateTime(timezone=True), default=utcnow)
    discharged_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True)
    room_id = Column(Integer, ForeignKey("rooms.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    
    contacts = orm.relationship("PatientContact", back_populates="patient", cascade="all, delete-orphan")


class PatientDeviceAssignment(Base):
    """Patient ↔ Device binding (wheelchair sensor, Polar HR, mobile)."""

    __tablename__ = "patient_device_assignments"
    __table_args__ = (
        Index(
            "uq_patient_device_assignments_active_device",
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
    patient_id = Column(
        Integer,
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    device_id = Column(
        String(32), nullable=False, index=True
    )  # matches devices.device_id
    device_role = Column(
        String(32), nullable=False
    )  # wheelchair_sensor | polar_hr | mobile
    assigned_at = Column(DateTime(timezone=True), default=utcnow)
    unassigned_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True)
    
    patient = orm.relationship("Patient", backref="assignments")


class PatientContact(Base):
    """Emergency contacts, doctors, family for a patient."""

    __tablename__ = "patient_contacts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(
        Integer,
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    contact_type = Column(
        String(16), nullable=False
    )  # family | doctor | nurse | emergency
    name = Column(String(128), nullable=False)
    relationship = Column(String(32), default="")  # son, attending_doctor, etc.
    phone = Column(String(20), default="")
    email = Column(String(128), default="")
    is_primary = Column(Boolean, default=False)
    notes = Column(Text, default="")
    
    patient = orm.relationship("Patient", back_populates="contacts")
