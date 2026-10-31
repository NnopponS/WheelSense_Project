from __future__ import annotations

"""Vital signs and health observation models.

VitalReading stores continuous data from Polar Verity Sense (via BLE or SDK).
HealthObservation stores manual entries by caregivers.
"""

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    SmallInteger,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB

from .base import Base, utcnow

class VitalReading(Base):
    """Continuous vital signs from Polar Verity Sense."""

    __tablename__ = "vital_readings"

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
    device_id = Column(String(32), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), default=utcnow, index=True)

    # Heart rate
    heart_rate_bpm = Column(SmallInteger, nullable=True)
    rr_interval_ms = Column(Float, nullable=True)  # R-R interval

    # Future: from Polar SDK via mobile app
    spo2 = Column(SmallInteger, nullable=True)  # Blood oxygen %

    # Battery of the wearable
    sensor_battery = Column(SmallInteger, nullable=True)

    source = Column(String(16), default="ble")  # ble | polar_sdk | manual

class HealthObservation(Base):
    """Manual health observations recorded by caregivers."""

    __tablename__ = "health_observations"

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
    caregiver_id = Column(
        Integer, ForeignKey("caregivers.id"), nullable=True, index=True
    )
    timestamp = Column(DateTime(timezone=True), default=utcnow, index=True)

    # Observation categories
    observation_type = Column(
        String(32), nullable=False
    )  # daily_check | meal | medication | incident | note

    # Manual vitals (taken by caregiver)
    blood_pressure_sys = Column(SmallInteger, nullable=True)
    blood_pressure_dia = Column(SmallInteger, nullable=True)
    temperature_c = Column(Float, nullable=True)
    weight_kg = Column(Float, nullable=True)
    pain_level = Column(SmallInteger, nullable=True)  # 0-10 scale

    # Free-form
    description = Column(Text, default="")
    data = Column(
        JSON().with_variant(JSONB, "postgresql"), default=dict
    )  # Flexible extra data

    # Meal tracking
    meal_type = Column(
        String(16), nullable=True
    )  # breakfast | lunch | dinner | snack
    meal_portion = Column(
        String(16), nullable=True
    )  # full | half | quarter | refused
    water_ml = Column(Integer, nullable=True)

