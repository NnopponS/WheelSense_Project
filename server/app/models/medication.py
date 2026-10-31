from __future__ import annotations

"""Medication domain models for prescriptions and pharmacy orders."""

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint

from .base import Base, utcnow


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
    status = Column(String(16), default="active", index=True)
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
    status = Column(String(16), default="pending", index=True)
    requested_at = Column(DateTime(timezone=True), default=utcnow, index=True)
    fulfilled_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, default="")
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
