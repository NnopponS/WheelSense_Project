from __future__ import annotations

"""Background patient health AI snapshot worker."""

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import AsyncSessionLocal
from app.models.core import Workspace
from app.models.patients import Patient
from app.models.users import User
from app.services.health_analysis import patient_health_analysis_service


logger = logging.getLogger("wheelsense.health_analysis_worker")

_scheduler: AsyncIOScheduler | None = None


async def _snapshot_actor(session: AsyncSession, workspace_id: int) -> User | None:
    for role in ("admin", "head_caregiver"):
        result = await session.execute(
            select(User)
            .where(
                User.workspace_id == workspace_id,
                User.role == role,
                User.is_active.is_(True),
            )
            .order_by(User.id.asc())
            .limit(1)
        )
        user = result.scalar_one_or_none()
        if user:
            return user
    result = await session.execute(
        select(User)
        .where(
            User.workspace_id == workspace_id,
            User.is_active.is_(True),
        )
        .order_by(User.id.asc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _run_health_analysis_snapshot_cycle() -> None:
    if not settings.health_analysis_snapshot_scheduler_enabled:
        logger.debug("Health analysis snapshot scheduler disabled, skipping cycle")
        return

    logger.info("Health analysis snapshot cycle starting")
    refreshed = 0
    failed = 0

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Patient, Workspace)
            .join(Workspace, Workspace.id == Patient.workspace_id)
            .where(Patient.is_active.is_(True))
            .order_by(Patient.workspace_id.asc(), Patient.id.asc())
        )
        rows = list(result.all())

        actor_by_workspace: dict[int, User | None] = {}
        for patient, workspace in rows:
            try:
                actor = actor_by_workspace.get(workspace.id)
                if workspace.id not in actor_by_workspace:
                    actor = await _snapshot_actor(session, workspace.id)
                    actor_by_workspace[workspace.id] = actor
                await patient_health_analysis_service.refresh_snapshot(
                    session,
                    workspace=workspace,
                    patient=patient,
                    actor=actor,
                    window_hours=24,
                    triggered_by="scheduler",
                )
                refreshed += 1
            except Exception:
                failed += 1
                logger.exception(
                    "Health analysis snapshot refresh failed for workspace=%s patient=%s",
                    workspace.id,
                    patient.id,
                )

    logger.info(
        "Health analysis snapshot cycle complete: refreshed=%d failed=%d",
        refreshed,
        failed,
    )


def start_health_analysis_snapshot_scheduler() -> AsyncIOScheduler:
    global _scheduler

    scheduler = AsyncIOScheduler()
    interval_hours = max(1, settings.health_analysis_snapshot_interval_hours)
    scheduler.add_job(
        _run_health_analysis_snapshot_cycle,
        trigger="interval",
        hours=interval_hours,
        id="health_analysis_snapshot_cycle",
        name="Patient Health AI Snapshot Refresh",
        replace_existing=True,
    )
    scheduler.start()
    _scheduler = scheduler
    logger.info("Health analysis snapshot scheduler started (every %dh)", interval_hours)
    return scheduler


def stop_health_analysis_snapshot_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("Health analysis snapshot scheduler stopped")
