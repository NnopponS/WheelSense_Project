from __future__ import annotations
from sqlalchemy import select

"""Background retention worker (Phase 6).

Uses APScheduler to periodically clean up old telemetry data
across all workspaces.

Lifecycle managed via FastAPI's lifespan in main.py.
"""

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.config import settings
from app.db.session import AsyncSessionLocal
from app.models.core import Workspace
from app.services.retention import RetentionService

logger = logging.getLogger("wheelsense.retention_worker")

_scheduler: AsyncIOScheduler | None = None

async def _run_retention_cycle() -> None:
    """Execute retention cleanup for ALL workspaces."""
    if not settings.retention_enabled:
        logger.debug("Retention disabled, skipping cycle")
        return

    logger.info("Retention cycle starting")
    total_deleted = 0

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Workspace))
        workspaces = result.scalars().all()

        for ws in workspaces:
            try:
                report = await RetentionService.run_full_cleanup(
                    session,
                    ws_id=ws.id,  # type: ignore[arg-type]
                    imu_days=settings.retention_imu_days,
                    rssi_days=settings.retention_rssi_days,
                    predictions_days=settings.retention_predictions_days,
                    triggered_by="scheduler",
                )
                total_deleted += report.total_deleted
            except Exception:
                logger.exception("Retention failed for workspace %d", ws.id)  # type: ignore[arg-type]

    logger.info("Retention cycle complete: %d rows deleted across %d workspaces",
                total_deleted, len(workspaces))

def start_retention_scheduler() -> AsyncIOScheduler:
    """Create and start the APScheduler for retention."""
    global _scheduler

    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        _run_retention_cycle,
        trigger="interval",
        hours=settings.retention_interval_hours,
        id="retention_cycle",
        name="Data Retention Cleanup",
        replace_existing=True,
    )
    scheduler.start()
    _scheduler = scheduler

    logger.info(
        "Retention scheduler started (every %dh, imu=%dd, rssi=%dd, pred=%dd)",
        settings.retention_interval_hours,
        settings.retention_imu_days,
        settings.retention_rssi_days,
        settings.retention_predictions_days,
    )
    return scheduler

def stop_retention_scheduler() -> None:
    """Gracefully shut down the scheduler."""
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("Retention scheduler stopped")

