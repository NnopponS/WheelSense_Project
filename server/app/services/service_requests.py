from __future__ import annotations

"""Business logic for patient service requests."""

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.service_requests import ServiceRequest
from app.models.users import User
from app.schemas.service_requests import ServiceRequestCreateIn, ServiceRequestPatchIn


def _is_admin(user: User) -> bool:
    return user.role == "admin"


def _is_patient(user: User) -> bool:
    return user.role == "patient"


def _is_head_nurse(user: User) -> bool:
    return user.role == "head_nurse"


def _is_floor_staff(user: User) -> bool:
    return user.role in ("observer", "supervisor")


async def _visible_patient_ids(session: AsyncSession, ws_id: int, user: User) -> set[int] | None:
    """Lazy import avoids circular import: dependencies -> services/__init__ -> service_requests."""
    from app.api.dependencies import get_visible_patient_ids

    return await get_visible_patient_ids(session, ws_id, user)


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
        elif _is_admin(user) or _is_head_nurse(user):
            stmt = select(ServiceRequest).where(ServiceRequest.workspace_id == ws_id)
            if status:
                stmt = stmt.where(ServiceRequest.status == status)
            if service_type:
                stmt = stmt.where(ServiceRequest.service_type == service_type)
        elif _is_floor_staff(user):
            visible = await _visible_patient_ids(session, ws_id, user)
            if not visible:
                return []
            stmt = select(ServiceRequest).where(
                ServiceRequest.workspace_id == ws_id,
                ServiceRequest.patient_id.in_(visible),
            )
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

        title_val = (payload.title or "").strip() or None

        row = ServiceRequest(
            workspace_id=ws_id,
            patient_id=patient_id,
            requested_by_user_id=user.id,
            service_type=payload.service_type,
            title=title_val,
            note=note,
            status="open",
            resolution_note=None,
            resolved_by_user_id=None,
            resolved_at=None,
            claimed_by_user_id=None,
            claimed_at=None,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return row

    @staticmethod
    async def claim_request(
        session: AsyncSession,
        ws_id: int,
        user: User,
        request_id: int,
    ) -> ServiceRequest:
        if not _is_floor_staff(user):
            raise HTTPException(status_code=403, detail="Only floor staff may claim service requests")

        visible = await _visible_patient_ids(session, ws_id, user)
        if not visible:
            raise HTTPException(status_code=403, detail="No linked patients for this account")

        now = datetime.now(timezone.utc)
        result = await session.execute(
            update(ServiceRequest)
            .where(
                ServiceRequest.id == request_id,
                ServiceRequest.workspace_id == ws_id,
                ServiceRequest.status == "open",
                ServiceRequest.claimed_by_user_id.is_(None),
                ServiceRequest.patient_id.in_(visible),
            )
            .values(
                claimed_by_user_id=user.id,
                claimed_at=now,
                status="in_progress",
            )
        )
        if result.rowcount == 0:
            await session.rollback()
            raise HTTPException(
                status_code=409,
                detail="Request is no longer open, already claimed, or outside your patient access",
            )
        await session.commit()

        row = (
            await session.execute(
                select(ServiceRequest).where(
                    ServiceRequest.workspace_id == ws_id,
                    ServiceRequest.id == request_id,
                )
            )
        ).scalar_one()
        return row

    @staticmethod
    async def patch_request(
        session: AsyncSession,
        ws_id: int,
        user: User,
        request_id: int,
        payload: ServiceRequestPatchIn,
    ) -> ServiceRequest:
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

        if _is_floor_staff(user):
            visible = await _visible_patient_ids(session, ws_id, user)
            if not visible or row.patient_id is None or row.patient_id not in visible:
                raise HTTPException(status_code=403, detail="Cannot update this service request")
            if row.claimed_by_user_id != user.id:
                raise HTTPException(
                    status_code=403,
                    detail="Only the staff member who claimed this request may update it",
                )
        elif _is_admin(user) or _is_head_nurse(user):
            pass
        else:
            raise HTTPException(status_code=403, detail="Operation not permitted")

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

        if changes and (_is_admin(user) or _is_head_nurse(user)):
            row.resolved_by_user_id = user.id
        elif changes and _is_floor_staff(user):
            row.resolved_by_user_id = user.id

        session.add(row)
        await session.commit()
        await session.refresh(row)
        return row


service_request_service = ServiceRequestService()
