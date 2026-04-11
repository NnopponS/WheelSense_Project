from __future__ import annotations

"""Care-facing models for specialist sync and demo actor placement."""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, Index

from .base import Base, utcnow


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


class DemoActorPosition(Base):
    """Manual room presence for demo-controlled staff and other actors."""

    __tablename__ = "demo_actor_positions"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id",
            "actor_type",
            "actor_id",
            name="uq_demo_actor_positions_actor",
        ),
        Index(
            "ix_demo_actor_positions_room",
            "workspace_id",
            "room_id",
            "actor_type",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_type = Column(String(16), nullable=False, index=True)
    actor_id = Column(Integer, nullable=False, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    source = Column(String(32), default="manual", nullable=False)
    note = Column(Text, default="")
    updated_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
