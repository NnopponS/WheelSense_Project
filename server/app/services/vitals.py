from __future__ import annotations

from typing import List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.vitals import VitalReading, HealthObservation
from app.schemas.vitals import VitalReadingCreate, HealthObservationCreate
from app.services.base import CRUDBase

class VitalReadingService(CRUDBase[VitalReading, VitalReadingCreate, VitalReadingCreate]):
    async def get_recent_by_patient(
        self, session: AsyncSession, ws_id: int, patient_id: int, limit: int = 100
    ) -> List[VitalReading]:
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

class HealthObservationService(CRUDBase[HealthObservation, HealthObservationCreate, HealthObservationCreate]):
    async def get_recent_by_patient(
        self, session: AsyncSession, ws_id: int, patient_id: int, limit: int = 100
    ) -> List[HealthObservation]:
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

vital_reading_service = VitalReadingService(VitalReading)
health_observation_service = HealthObservationService(HealthObservation)
