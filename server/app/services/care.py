from __future__ import annotations

"""Business logic for specialist syncing."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.care import Specialist
from app.models.caregivers import CareGiver
from app.schemas.care import SpecialistCreate, SpecialistUpdate
from app.services.base import CRUDBase

CAREGIVER_SPECIALIST_NOTE_PREFIX = "synced_from_caregiver:"


def _caregiver_specialist_note(caregiver_id: int) -> str:
    return f"{CAREGIVER_SPECIALIST_NOTE_PREFIX}{caregiver_id}"


class SpecialistService(CRUDBase[Specialist, SpecialistCreate, SpecialistUpdate]):
    async def list_from_caregivers(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        limit: int = 200,
    ) -> list[Specialist]:
        caregivers = list(
            (
                await session.execute(
                    select(CareGiver)
                    .where(
                        CareGiver.workspace_id == ws_id,
                        CareGiver.role == "supervisor",
                    )
                    .order_by(CareGiver.id)
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )
        if not caregivers:
            return []

        notes = [_caregiver_specialist_note(caregiver.id) for caregiver in caregivers]
        existing = list(
            (
                await session.execute(
                    select(Specialist).where(
                        Specialist.workspace_id == ws_id,
                        Specialist.notes.in_(notes),
                    )
                )
            )
            .scalars()
            .all()
        )
        by_note = {specialist.notes: specialist for specialist in existing}
        synced: list[Specialist] = []
        changed = False

        for caregiver in caregivers:
            note = _caregiver_specialist_note(caregiver.id)
            row = by_note.get(note)
            if row is None:
                row = Specialist(workspace_id=ws_id, notes=note)
                session.add(row)
                changed = True

            values = {
                "first_name": caregiver.first_name,
                "last_name": caregiver.last_name,
                "specialty": caregiver.specialty or caregiver.role,
                "license_number": caregiver.license_number or caregiver.employee_code or None,
                "phone": caregiver.phone or None,
                "email": caregiver.email or None,
                "is_active": bool(caregiver.is_active),
            }
            for field, value in values.items():
                if getattr(row, field) != value:
                    setattr(row, field, value)
                    changed = True
            synced.append(row)

        if changed:
            await session.commit()
            for row in synced:
                await session.refresh(row)

        return synced


specialist_service = SpecialistService(Specialist)
