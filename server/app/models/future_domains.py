from __future__ import annotations

"""Future-facing domain models: floorplans, specialists, prescriptions, pharmacy."""

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB

from .base import Base, utcnow

class FloorplanAsset(Base):
    __tablename__ = "floorplan_assets"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="SET NULL"), nullable=True, index=True)
    floor_id = Column(Integer, ForeignKey("floors.id", ondelete="SET NULL"), nullable=True, index=True)
    name = Column(String(128), nullable=False)
    mime_type = Column(String(128), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    storage_path = Column(String(512), nullable=False)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    extra = Column("metadata", JSON().with_variant(JSONB, "postgresql"), default=dict)
    uploaded_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

class FloorplanLayout(Base):
    """Interactive floorplan builder state (rooms, positions, node mapping) per facility floor."""

    __tablename__ = "floorplan_layouts"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id",
            "facility_id",
            "floor_id",
            name="uq_floorplan_layout_scope",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False)
    floor_id = Column(Integer, ForeignKey("floors.id", ondelete="CASCADE"), nullable=False)
    layout_json = Column(JSON().with_variant(JSONB, "postgresql"), nullable=False, default=dict)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

class Specialist(Base):
    __tablename__ = "specialists"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    first_name = Column(String(64), nullable=False)
    last_name = Column(String(64), nullable=False)
    specialty = Column(String(64), nullable=False, index=True)
    license_number = Column(String(64), nullable=True, index=True)
    phone = Column(String(32), nullable=True)
    email = Column(String(128), nullable=True)
    notes = Column(Text, default="")
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

class Prescription(Base):
    __tablename__ = "prescriptions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="SET NULL"), nullable=True, index=True)
    specialist_id = Column(Integer, ForeignKey("specialists.id", ondelete="SET NULL"), nullable=True, index=True)
    prescribed_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    medication_name = Column(String(128), nullable=False)
    dosage = Column(String(64), nullable=False)
    frequency = Column(String(64), nullable=False)
    route = Column(String(32), default="oral")
    instructions = Column(Text, default="")
    status = Column(String(16), default="active", index=True)  # active | paused | completed | cancelled
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

class PharmacyOrder(Base):
    __tablename__ = "pharmacy_orders"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id",
            "order_number",
            name="uq_pharmacy_orders_workspace_order_number",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    prescription_id = Column(Integer, ForeignKey("prescriptions.id", ondelete="SET NULL"), nullable=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="SET NULL"), nullable=True, index=True)
    order_number = Column(String(64), nullable=False, index=True)
    pharmacy_name = Column(String(128), nullable=False)
    quantity = Column(Integer, default=0)
    refills_remaining = Column(Integer, default=0)
    status = Column(String(16), default="pending", index=True)  # pending | verified | dispensed | cancelled
    requested_at = Column(DateTime(timezone=True), default=utcnow, index=True)
    fulfilled_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, default="")
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

