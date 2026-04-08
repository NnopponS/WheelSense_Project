from __future__ import annotations
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, JSON

"""Facility hierarchy: Facility (Building) → Floor → Room.

Each Room maps 1:1 to a T-SIMCam Node. Floors store approximate
room positions for future map visualization.
"""

from sqlalchemy.dialects.postgresql import JSONB

from .base import Base, utcnow

class Facility(Base):
    """Building / อาคาร."""

    __tablename__ = "facilities"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(
        Integer,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(128), nullable=False)
    address = Column(Text, default="")
    description = Column(Text, default="")
    config = Column(JSON().with_variant(JSONB, "postgresql"), default=dict)
    created_at = Column(DateTime(timezone=True), default=utcnow)

class Floor(Base):
    """Floor / ชั้น within a Facility."""

    __tablename__ = "floors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(
        Integer,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    facility_id = Column(
        Integer,
        ForeignKey("facilities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    floor_number = Column(Integer, nullable=False)
    name = Column(String(64), default="")
    map_data = Column(JSON().with_variant(JSONB, "postgresql"), default=dict)
    created_at = Column(DateTime(timezone=True), default=utcnow)

