"""Facility and Floor CRUD endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.api.dependencies import (
    RequireRole,
    get_current_user_workspace,
    get_db,
    ROLE_PATIENT_MANAGERS,
    ROLE_SUPERVISOR_READ,
)
from app.models.core import Workspace
from app.models.users import User
from app.models.facility import Facility, Floor
from app.schemas.facility import (
    FacilityCreate,
    FacilityOut,
    FloorCreate,
    FloorOut,
)
from app.services.base import CRUDBase

_UpdatePlaceholder = type("_UpdatePlaceholder", (BaseModel,), {})

facility_service = CRUDBase[Facility, FacilityCreate, _UpdatePlaceholder](Facility)
floor_service = CRUDBase[Floor, FloorCreate, _UpdatePlaceholder](Floor)

router = APIRouter()


# ── Facility CRUD ────────────────────────────────────────────────────────────


@router.get("", response_model=list[FacilityOut])
async def list_facilities(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_SUPERVISOR_READ)),
):
    return await facility_service.get_multi(db, ws_id=ws.id, skip=skip, limit=limit)


@router.post("", response_model=FacilityOut, status_code=201)
async def create_facility(
    data: FacilityCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_PATIENT_MANAGERS)),
):
    return await facility_service.create(db, ws_id=ws.id, obj_in=data)


@router.get("/{facility_id}", response_model=FacilityOut)
async def get_facility(
    facility_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_SUPERVISOR_READ)),
):
    fac = await facility_service.get(db, ws_id=ws.id, id=facility_id)
    if not fac:
        raise HTTPException(404, "Facility not found")
    return fac


@router.delete("/{facility_id}", status_code=204)
async def delete_facility(
    facility_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_PATIENT_MANAGERS)),
):
    deleted = await facility_service.delete(db, ws_id=ws.id, id=facility_id)
    if not deleted:
        raise HTTPException(404, "Facility not found")


# ── Floor CRUD ───────────────────────────────────────────────────────────────


@router.get("/{facility_id}/floors", response_model=list[FloorOut])
async def list_floors(
    facility_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_SUPERVISOR_READ)),
):
    all_floors = await floor_service.get_multi(db, ws_id=ws.id)
    return [f for f in all_floors if f.facility_id == facility_id]


@router.post("/{facility_id}/floors", response_model=FloorOut, status_code=201)
async def create_floor(
    facility_id: int,
    data: FloorCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_PATIENT_MANAGERS)),
):
    # Verify facility exists and belongs to workspace
    fac = await facility_service.get(db, ws_id=ws.id, id=facility_id)
    if not fac:
        raise HTTPException(404, "Facility not found")
    # Override facility_id from path
    floor_data = data.model_copy(update={"facility_id": facility_id})
    return await floor_service.create(db, ws_id=ws.id, obj_in=floor_data)
