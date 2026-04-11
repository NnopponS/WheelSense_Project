from __future__ import annotations

"""Business logic for patient service requests."""

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.service_requests import ServiceRequest
from app.models.users import User
from app.schemas.service_requests import ServiceRequestCreateIn, ServiceRequestPatchIn


def _is_admin(user: User) -> bool:
    return user.role == "admin"


def _is_patient(user: User) -> bool:
    return user.role == "patient"


class ServiceRequestService:
    @staticmethod
    async def list_requests(
        session: AsyncSession,
        ws_id: int,
        user: User,
        *,
        status: str | None = None,
        service_type: str | None = None,
        limit: int = 100,
    ) -> list[ServiceRequest]:
        if _is_patient(user):
            patient_id = getattr(user, "patient_id", None)
            if patient_id is None:
                return []
            stmt = select(ServiceRequest).where(
                ServiceRequest.workspace_id == ws_id,
                ServiceRequest.patient_id == patient_id,
            )
        elif _is_admin(user):
            stmt = select(ServiceRequest).where(ServiceRequest.workspace_id == ws_id)
            if status:
                stmt = stmt.where(ServiceRequest.status == status)
            if service_type:
                stmt = stmt.where(ServiceRequest.service_type == service_type)
        else:
            raise HTTPException(status_code=403, detail="Operation not permitted")

        stmt = stmt.order_by(ServiceRequest.created_at.desc()).limit(limit)
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def create_request(
        session: AsyncSession,
        ws_id: int,
        user: User,
        payload: ServiceRequestCreateIn,
    ) -> ServiceRequest:
        if not _is_patient(user):
            raise HTTPException(status_code=403, detail="Only patient accounts can create service requests")

        patient_id = getattr(user, "patient_id", None)
        if patient_id is None:
            raise HTTPException(status_code=403, detail="Patient account is not linked to a patient record")

        note = payload.note.strip()
        if not note:
            raise HTTPException(status_code=400, detail="Request note is required")

        row = ServiceRequest(
            workspace_id=ws_id,
            patient_id=patient_id,
            requested_by_user_id=user.id,
            service_type=payload.service_type,
            note=note,
            status="open",
            resolution_note=None,
            resolved_by_user_id=None,
            resolved_at=None,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return row

    @staticmethod
    async def patch_request(
        session: AsyncSession,
        ws_id: int,
        user: User,
        request_id: int,
        payload: ServiceRequestPatchIn,
    ) -> ServiceRequest:
        if not _is_admin(user):
            raise HTTPException(status_code=403, detail="Only admin users can update service requests")

        row = (
            await session.execute(
                select(ServiceRequest).where(
                    ServiceRequest.workspace_id == ws_id,
                    ServiceRequest.id == request_id,
                )
            )
        ).scalar_one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail="Service request not found")

        changes = payload.model_dump(exclude_unset=True)
        status = changes.get("status")
        resolution_note = changes.get("resolution_note")

        if status is not None:
            row.status = status
            if status in {"fulfilled", "cancelled"}:
                row.resolved_at = datetime.now(timezone.utc)
            else:
                row.resolved_at = None
        if "resolution_note" in changes:
            row.resolution_note = (
                resolution_note.strip()
                if isinstance(resolution_note, str) and resolution_note.strip()
                else None
            )

        if changes:
            row.resolved_by_user_id = user.id

        session.add(row)
        await session.commit()
        await session.refresh(row)
        return row


service_request_service = ServiceRequestService()
