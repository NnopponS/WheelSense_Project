from __future__ import annotations

from typing import List

from typing import Optional

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import ActivityTimeline, Alert
from app.schemas.activity import TimelineEventCreate, AlertCreate
from app.services.base import CRUDBase

def utcnow():
    return datetime.now(timezone.utc)

class ActivityTimelineService(CRUDBase[ActivityTimeline, TimelineEventCreate, TimelineEventCreate]):
    async def get_timeline_by_patient(
        self, session: AsyncSession, ws_id: int, patient_id: int, limit: int = 100
    ) -> List[ActivityTimeline]:
        query = (
            select(self.model)
            .filter(
                self.model.workspace_id == ws_id,
                self.model.patient_id == patient_id
            )
            .order_by(self.model.timestamp.desc())
            .limit(limit)
        )
        result = await session.execute(query)
        return list(result.scalars().all())

class AlertService(CRUDBase[Alert, AlertCreate, AlertCreate]):
    async def get_active_alerts(
        self, session: AsyncSession, ws_id: int, patient_id: Optional[int] = None
    ) -> List[Alert]:
        filters = [self.model.workspace_id == ws_id, self.model.status == "active"]
        if patient_id is not None:
            filters.append(self.model.patient_id == patient_id)

        query = select(self.model).filter(*filters).order_by(self.model.timestamp.desc())
        result = await session.execute(query)
        return list(result.scalars().all())

    async def acknowledge(
        self, session: AsyncSession, ws_id: int, alert_id: int, caregiver_id: int | None
    ) -> Optional[Alert]:
        alert = await self.get(session, ws_id=ws_id, id=alert_id)
        if alert and alert.status == "active":
            alert.status = "acknowledged"
            alert.acknowledged_by = caregiver_id
            alert.acknowledged_at = utcnow()
            session.add(alert)
            await session.commit()
            await session.refresh(alert)
        return alert

    async def resolve(
        self, session: AsyncSession, ws_id: int, alert_id: int, resolution_note: str = ""
    ) -> Optional[Alert]:
        alert = await self.get(session, ws_id=ws_id, id=alert_id)
        if alert and alert.status in ["active", "acknowledged"]:
            alert.status = "resolved"
            alert.resolved_at = utcnow()
            alert.resolution_note = resolution_note
            session.add(alert)
            await session.commit()
            await session.refresh(alert)
        return alert

activity_service = ActivityTimelineService(ActivityTimeline)
alert_service = AlertService(Alert)
