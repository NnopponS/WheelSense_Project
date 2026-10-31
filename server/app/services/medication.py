from __future__ import annotations

"""Business logic for prescriptions and pharmacy orders."""

from datetime import datetime, timezone
from typing import Optional
import secrets

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.medication import PharmacyOrder, Prescription
from app.schemas.medication import (
    PharmacyOrderCreate,
    PharmacyOrderUpdate,
    PrescriptionCreate,
    PrescriptionUpdate,
)
from app.services.base import CRUDBase


class PrescriptionService(CRUDBase[Prescription, PrescriptionCreate, PrescriptionUpdate]):
    async def list_for_patient(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        patient_id: Optional[int] = None,
        status: Optional[str] = None,
        visible_patient_ids: set[int] | None = None,
        limit: int = 100,
    ) -> list[Prescription]:
        stmt = select(Prescription).where(Prescription.workspace_id == ws_id)
        if visible_patient_ids is not None:
            if not visible_patient_ids:
                return []
            stmt = stmt.where(Prescription.patient_id.in_(visible_patient_ids))
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
        visible_patient_ids: set[int] | None = None,
        limit: int = 100,
    ) -> list[PharmacyOrder]:
        stmt = select(PharmacyOrder).where(PharmacyOrder.workspace_id == ws_id)
        if visible_patient_ids is not None:
            if not visible_patient_ids:
                return []
            stmt = stmt.where(PharmacyOrder.patient_id.in_(visible_patient_ids))
        if patient_id is not None:
            stmt = stmt.where(PharmacyOrder.patient_id == patient_id)
        if prescription_id is not None:
            stmt = stmt.where(PharmacyOrder.prescription_id == prescription_id)
        if status:
            stmt = stmt.where(PharmacyOrder.status == status)
        stmt = stmt.order_by(PharmacyOrder.requested_at.desc()).limit(limit)
        result = await session.execute(stmt)
        return list(result.scalars().all())

    async def create_patient_request(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        patient_id: int,
        prescription_id: int,
        pharmacy_name: str,
        quantity: int,
        notes: str,
    ) -> PharmacyOrder:
        prescription = await prescription_service.get(session, ws_id=ws_id, id=prescription_id)
        if not prescription or prescription.patient_id != patient_id:
            raise ValueError("Prescription not found for this patient")
        if prescription.status != "active":
            raise ValueError("Prescription is not active")

        now = datetime.now(timezone.utc)
        order_number = f"REQ-{patient_id}-{prescription_id}-{now.strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(3)}"
        payload = PharmacyOrderCreate(
            prescription_id=prescription_id,
            patient_id=patient_id,
            order_number=order_number,
            pharmacy_name=pharmacy_name,
            quantity=quantity,
            refills_remaining=0,
            status="pending",
            notes=notes,
        )
        return await self.create(session, ws_id=ws_id, obj_in=payload)


prescription_service = PrescriptionService(Prescription)
pharmacy_order_service = PharmacyOrderService(PharmacyOrder)
