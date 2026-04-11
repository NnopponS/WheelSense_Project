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


@router.get("/requests", response_model=list[ServiceRequestOut])
async def list_service_requests(
    status: str | None = Query(default=None, pattern="^(open|in_progress|fulfilled|cancelled)$"),
    service_type: str | None = Query(default=None, pattern="^(food|transport|housekeeping)$"),
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


@router.patch("/requests/{request_id}", response_model=ServiceRequestOut)
async def update_service_request(
    request_id: int,
    payload: ServiceRequestPatchIn,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(["admin"])),
):
    return await service_request_service.patch_request(db, ws.id, current_user, request_id, payload)
