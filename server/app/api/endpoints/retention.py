"""Retention API endpoints (Phase 6).

Provides stats, config view, and manual cleanup trigger.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user_workspace, get_db
from app.config import settings
from app.models.core import Workspace
from app.schemas.retention import RetentionConfig, RetentionReport, RetentionStats
from app.services.retention import RetentionService

router = APIRouter()


@router.get("/config", response_model=RetentionConfig)
async def get_retention_config():
    """Return the current retention policy settings."""
    return RetentionConfig(
        retention_enabled=settings.retention_enabled,
        retention_imu_days=settings.retention_imu_days,
        retention_rssi_days=settings.retention_rssi_days,
        retention_predictions_days=settings.retention_predictions_days,
        retention_interval_hours=settings.retention_interval_hours,
    )


@router.get("/stats", response_model=RetentionStats)
async def get_retention_stats(
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
):
    """Return row counts and age ranges for retained tables."""
    return await RetentionService.get_retention_stats(db, ws_id=ws.id)


@router.post("/run", response_model=RetentionReport)
async def run_retention_cleanup(
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
):
    """Trigger an immediate retention cleanup for the active workspace."""
    return await RetentionService.run_full_cleanup(
        db,
        ws_id=ws.id,
        imu_days=settings.retention_imu_days,
        rssi_days=settings.retention_rssi_days,
        predictions_days=settings.retention_predictions_days,
        triggered_by="manual",
    )
