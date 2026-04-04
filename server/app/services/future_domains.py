"""Service-layer helpers for floorplans, specialists, prescriptions, and pharmacy."""

from __future__ import annotations

import secrets
from pathlib import Path
from typing import Optional

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.future_domains import (
    FloorplanAsset,
    FloorplanLayout,
    PharmacyOrder,
    Prescription,
    Specialist,
)
from app.schemas.future_domains import (
    PharmacyOrderCreate,
    PharmacyOrderUpdate,
    PrescriptionCreate,
    PrescriptionUpdate,
    SpecialistCreate,
    SpecialistUpdate,
)
from app.services.base import CRUDBase


class SpecialistService(CRUDBase[Specialist, SpecialistCreate, SpecialistUpdate]):
    pass


class PrescriptionService(CRUDBase[Prescription, PrescriptionCreate, PrescriptionUpdate]):
    async def list_for_patient(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        patient_id: Optional[int] = None,
        status: Optional[str] = None,
        limit: int = 100,
    ) -> list[Prescription]:
        stmt = select(Prescription).where(Prescription.workspace_id == ws_id)
        if patient_id is not None:
            stmt = stmt.where(Prescription.patient_id == patient_id)
        if status:
            stmt = stmt.where(Prescription.status == status)
        stmt = stmt.order_by(Prescription.created_at.desc()).limit(limit)
        result = await session.execute(stmt)
        return list(result.scalars().all())


class PharmacyOrderService(CRUDBase[PharmacyOrder, PharmacyOrderCreate, PharmacyOrderUpdate]):
    async def list_orders(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        patient_id: Optional[int] = None,
        prescription_id: Optional[int] = None,
        status: Optional[str] = None,
        limit: int = 100,
    ) -> list[PharmacyOrder]:
        stmt = select(PharmacyOrder).where(PharmacyOrder.workspace_id == ws_id)
        if patient_id is not None:
            stmt = stmt.where(PharmacyOrder.patient_id == patient_id)
        if prescription_id is not None:
            stmt = stmt.where(PharmacyOrder.prescription_id == prescription_id)
        if status:
            stmt = stmt.where(PharmacyOrder.status == status)
        stmt = stmt.order_by(PharmacyOrder.requested_at.desc()).limit(limit)
        result = await session.execute(stmt)
        return list(result.scalars().all())


class _FloorplanCreate(BaseModel):
    pass


class _FloorplanUpdate(BaseModel):
    pass


class FloorplanService(CRUDBase[FloorplanAsset, _FloorplanCreate, _FloorplanUpdate]):
    @staticmethod
    def build_storage_root() -> Path:
        root = Path(settings.floorplan_storage_dir).resolve()
        root.mkdir(parents=True, exist_ok=True)
        return root

    async def create_asset(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        name: str,
        mime_type: str,
        payload: bytes,
        facility_id: Optional[int],
        floor_id: Optional[int],
        width: Optional[int],
        height: Optional[int],
        uploaded_by_user_id: int,
    ) -> FloorplanAsset:
        storage_root = self.build_storage_root()
        suffix = ".bin"
        if "/" in mime_type:
            guessed = mime_type.split("/")[-1].strip()
            if guessed:
                suffix = f".{guessed}"
        filename = f"{ws_id}_{secrets.token_hex(10)}{suffix}"
        target = storage_root / filename
        target.write_bytes(payload)

        db_obj = FloorplanAsset(
            workspace_id=ws_id,
            facility_id=facility_id,
            floor_id=floor_id,
            name=name,
            mime_type=mime_type,
            size_bytes=len(payload),
            storage_path=str(target),
            width=width,
            height=height,
            extra={},
            uploaded_by_user_id=uploaded_by_user_id,
        )
        session.add(db_obj)
        await session.commit()
        await session.refresh(db_obj)
        return db_obj


class FloorplanLayoutService:
    """Persist interactive floorplan JSON per facility floor."""

    @staticmethod
    async def get_for_scope(
        session: AsyncSession,
        ws_id: int,
        facility_id: int,
        floor_id: int,
    ) -> FloorplanLayout | None:
        stmt = select(FloorplanLayout).where(
            FloorplanLayout.workspace_id == ws_id,
            FloorplanLayout.facility_id == facility_id,
            FloorplanLayout.floor_id == floor_id,
        )
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def upsert(
        session: AsyncSession,
        ws_id: int,
        facility_id: int,
        floor_id: int,
        layout_dict: dict,
    ) -> FloorplanLayout:
        existing = await FloorplanLayoutService.get_for_scope(
            session, ws_id, facility_id, floor_id
        )
        if existing:
            existing.layout_json = layout_dict
            session.add(existing)
            await session.commit()
            await session.refresh(existing)
            return existing
        row = FloorplanLayout(
            workspace_id=ws_id,
            facility_id=facility_id,
            floor_id=floor_id,
            layout_json=layout_dict,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return row


specialist_service = SpecialistService(Specialist)
prescription_service = PrescriptionService(Prescription)
pharmacy_order_service = PharmacyOrderService(PharmacyOrder)
floorplan_service = FloorplanService(FloorplanAsset)
