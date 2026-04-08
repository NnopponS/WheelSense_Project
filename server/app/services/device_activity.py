from __future__ import annotations

from typing import Any
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

"""Append and list workspace device activity events (best-effort logging)."""

import logging

from app.models.base import utcnow
from app.models.core import DeviceActivityEvent

logger = logging.getLogger("wheelsense.device_activity")

async def log_event(
    session: AsyncSession,
    workspace_id: int,
    event_type: str,
    summary: str,
    *,
    registry_device_id: str | None = None,
    smart_device_id: int | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    """Best-effort insert; failures are logged and do not raise."""
    try:
        row = DeviceActivityEvent(
            workspace_id=workspace_id,
            occurred_at=utcnow(),
            event_type=event_type[:32],
            summary=(summary or "")[:255],
            registry_device_id=registry_device_id[:32] if registry_device_id else None,
            smart_device_id=smart_device_id,
            details=details or {},
        )
        session.add(row)
        await session.commit()
    except Exception:
        logger.exception(
            "device_activity log failed type=%s ws=%s", event_type, workspace_id
        )
        try:
            await session.rollback()
        except Exception:
            pass

async def list_recent(
    session: AsyncSession, workspace_id: int, limit: int = 30
) -> list[DeviceActivityEvent]:
    lim = min(max(limit, 1), 100)
    q = (
        select(DeviceActivityEvent)
        .where(DeviceActivityEvent.workspace_id == workspace_id)
        .order_by(desc(DeviceActivityEvent.occurred_at))
        .limit(lim)
    )
    result = await session.execute(q)
    return list(result.scalars().all())

