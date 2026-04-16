from __future__ import annotations

"""Patient service request endpoints."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import RequireRole, ROLE_ALL_AUTHENTICATED, get_current_user_workspace, get_db
from app.models.core import Workspace
from app.models.users import User
from app.schemas.service_requests import ServiceRequestCreateIn, ServiceRequestOut, ServiceRequestPatchIn
from app.services.service_requests import service_request_service

router = APIRouter()

_SERVICE_TYPE_PATTERN = r"^(food|transport|housekeeping|support)$"
_STATUS_PATTERN = r"^(open|in_progress|fulfilled|cancelled)$"


@router.get("/requests", response_model=list[ServiceRequestOut])
async def list_service_requests(
    status: str | None = Query(default=None, pattern=_STATUS_PATTERN),
    service_type: str | None = Query(default=None, pattern=_SERVICE_TYPE_PATTERN),
    limit: int = Query(default=200, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_ALL_AUTHENTICATED)),
):
    return await service_request_service.list_requests(
        db,
        ws.id,
        current_user,
        status=status,
        service_type=service_type,
        limit=limit,
    )


@router.post("/requests", response_model=ServiceRequestOut, status_code=201)
async def create_service_request(
    payload: ServiceRequestCreateIn,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(["patient"])),
):
    return await service_request_service.create_request(db, ws.id, current_user, payload)


@router.post("/requests/{request_id}/claim", response_model=ServiceRequestOut)
async def claim_service_request(
    request_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(["observer", "supervisor"])),
):
    return await service_request_service.claim_request(db, ws.id, current_user, request_id)


@router.patch("/requests/{request_id}", response_model=ServiceRequestOut)
async def update_service_request(
    request_id: int,
    payload: ServiceRequestPatchIn,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(["admin", "head_nurse", "observer", "supervisor"])),
):
    return await service_request_service.patch_request(db, ws.id, current_user, request_id, payload)
