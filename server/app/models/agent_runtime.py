from __future__ import annotations

"""Persistence models for the ADR 0015 five-layer agent runtime."""

from sqlalchemy import Column, DateTime, Index, Integer, JSON, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import JSONB

from .base import Base, utcnow


class PipelineEventRecord(Base):
    __tablename__ = "pipeline_events"
    __table_args__ = (
        Index("ix_pipeline_events_correlation_id", "correlation_id"),
        Index("ix_pipeline_events_workspace_layer", "workspace_id", "layer", "created_at"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    correlation_id = Column(String(64), nullable=False)
    workspace_id = Column(Integer, nullable=True)
    user_id = Column(Integer, nullable=True)
    layer = Column(SmallInteger, nullable=False)
    phase = Column(String(16), nullable=False)
    outcome = Column(String(16), nullable=False, default="pending")
    latency_ms = Column(Integer, nullable=True)
    payload = Column(JSON().with_variant(JSONB, "postgresql"), nullable=True, default=dict)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)


class BehavioralState(Base):
    __tablename__ = "behavioral_states"
    __table_args__ = (
        Index("ix_behavioral_states_workspace_user", "workspace_id", "user_id"),
        Index("ix_behavioral_states_workspace_user_version", "workspace_id", "user_id", "version", unique=True),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    version = Column(Integer, nullable=False, default=1)
    state_snapshot = Column(JSON().with_variant(JSONB, "postgresql"), nullable=False, default=dict)
    computed_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)
