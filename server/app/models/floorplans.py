from __future__ import annotations

"""Floorplan domain models for uploaded assets and saved layouts."""

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint
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
    """Interactive floorplan builder state per facility floor."""

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
