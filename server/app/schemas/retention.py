"""Pydantic schemas for Data Retention (Phase 6)."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class RetentionConfig(BaseModel):
    """Current retention policy configuration."""

    retention_enabled: bool = True
    retention_imu_days: int = 7
    retention_rssi_days: int = 7
    retention_predictions_days: int = 30
    retention_interval_hours: int = 6


class TableStats(BaseModel):
    """Row count stats for a single table."""

    table_name: str
    row_count: int
    oldest_record: Optional[datetime] = None
    newest_record: Optional[datetime] = None


class RetentionStats(BaseModel):
    """Aggregated stats across all retention-managed tables."""

    tables: list[TableStats] = Field(default_factory=list)
    total_rows: int = 0


class RetentionResult(BaseModel):
    """Result of a single table cleanup."""

    table_name: str
    deleted_count: int
    retention_days: int


class RetentionReport(BaseModel):
    """Full cleanup report."""

    results: list[RetentionResult] = Field(default_factory=list)
    total_deleted: int = 0
    duration_seconds: float = 0.0
    triggered_by: str = "manual"  # "manual" | "scheduler"
