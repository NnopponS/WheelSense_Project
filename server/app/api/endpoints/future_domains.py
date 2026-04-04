"""Future-domain endpoints for floorplans, specialists, prescriptions, and pharmacy."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    RequireRole,
    ROLE_ALL_AUTHENTICATED,
    ROLE_CLINICAL_STAFF,
    assert_patient_record_access,
    get_current_active_user,
    get_current_user_workspace,
    get_db,
)
from app.models.core import Device, Workspace
from app.models.facility import Facility, Floor
from app.models.users import User
from app.schemas.future_domains import (
    FloorplanAssetOut,
    FloorplanLayoutOut,
    FloorplanLayoutPayload,
    PharmacyOrderCreate,
    PharmacyOrderOut,
    PharmacyOrderUpdate,
    PrescriptionCreate,
    PrescriptionOut,
    PrescriptionUpdate,
    SpecialistCreate,
    SpecialistOut,
    SpecialistUpdate,
)
from app.services.future_domains import (
    FloorplanLayoutService,
    floorplan_service,
    pharmacy_order_service,
    prescription_service,
    specialist_service,
)

router = APIRouter()

ROLE_FUTURE_MANAGERS = ["admin", "head_nurse", "supervisor"]


def _to_floorplan_out(asset) -> FloorplanAssetOut:
    return FloorplanAssetOut(
        id=asset.id,
        workspace_id=asset.workspace_id,
        facility_id=asset.facility_id,
        floor_id=asset.floor_id,
        name=asset.name,
        mime_type=asset.mime_type,
        size_bytes=asset.size_bytes,
        width=asset.width,
        height=asset.height,
        metadata=asset.extra or {},
        file_url=f"/api/future/floorplans/{asset.id}/file",
        created_at=asset.created_at,
    )


@router.get("/floorplans", response_model=list[FloorplanAssetOut])
async def list_floorplans(
    floor_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_CLINICAL_STAFF)),
):
    assets = await floorplan_service.get_multi(db, ws_id=ws.id, limit=200)
    if floor_id is not None:
        assets = [asset for asset in assets if asset.floor_id == floor_id]
    return [_to_floorplan_out(asset) for asset in assets]


@router.post("/floorplans/upload", response_model=FloorplanAssetOut, status_code=201)
async def upload_floorplan(
    name: str = Form(...),
    file: UploadFile = File(...),
    facility_id: Optional[int] = Form(default=None),
    floor_id: Optional[int] = Form(default=None),
    width: Optional[int] = Form(default=None),
    height: Optional[int] = Form(default=None),
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_FUTURE_MANAGERS)),
):
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(payload) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Floorplan file exceeds 20MB limit")
    asset = await floorplan_service.create_asset(
        db,
        ws_id=ws.id,
        name=name,
        mime_type=file.content_type or "application/octet-stream",
        payload=payload,
        facility_id=facility_id,
        floor_id=floor_id,
        width=width,
        height=height,
        uploaded_by_user_id=current_user.id,
    )
    return _to_floorplan_out(asset)


@router.get("/floorplans/{asset_id}/file")
async def get_floorplan_file(
    asset_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_CLINICAL_STAFF)),
):
    asset = await floorplan_service.get(db, ws_id=ws.id, id=asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Floorplan not found")
    path = Path(asset.storage_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Floorplan file missing from storage")
    return FileResponse(path=path, media_type=asset.mime_type, filename=path.name)


async def _assert_facility_floor(
    db: AsyncSession,
    ws_id: int,
    facility_id: int,
    floor_id: int,
) -> None:
    fac = await db.get(Facility, facility_id)
    if not fac or fac.workspace_id != ws_id:
        raise HTTPException(status_code=404, detail="Facility not found")
    fl = await db.get(Floor, floor_id)
    if not fl or fl.workspace_id != ws_id or fl.facility_id != facility_id:
        raise HTTPException(status_code=404, detail="Floor not found for this facility")


@router.get("/floorplans/layout", response_model=FloorplanLayoutOut)
async def get_floorplan_layout(
    facility_id: int = Query(..., ge=1),
    floor_id: int = Query(..., ge=1),
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_CLINICAL_STAFF)),
):
    """Load interactive floorplan JSON (rooms, node mapping) for a facility floor."""
    await _assert_facility_floor(db, ws.id, facility_id, floor_id)
    row = await FloorplanLayoutService.get_for_scope(db, ws.id, facility_id, floor_id)
    if not row:
        return FloorplanLayoutOut(
            facility_id=facility_id,
            floor_id=floor_id,
            layout_json={"version": 1, "rooms": []},
            updated_at=None,
        )
    return FloorplanLayoutOut(
        facility_id=facility_id,
        floor_id=floor_id,
        layout_json=row.layout_json,
        updated_at=row.updated_at,
    )


@router.put("/floorplans/layout", response_model=FloorplanLayoutOut)
async def save_floorplan_layout(
    payload: FloorplanLayoutPayload,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_FUTURE_MANAGERS)),
):
    """Save builder layout: rooms with percent geometry and optional device (node) per room."""
    await _assert_facility_floor(db, ws.id, payload.facility_id, payload.floor_id)

    seen_devices: set[int] = set()
    for room in payload.rooms:
        if room.device_id is None:
            continue
        if room.device_id in seen_devices:
            raise HTTPException(
                status_code=400,
                detail="Each device can be assigned to at most one room",
            )
        seen_devices.add(room.device_id)
        dev = await db.get(Device, room.device_id)
        if not dev or dev.workspace_id != ws.id:
            raise HTTPException(status_code=400, detail="Invalid device_id for this workspace")

    layout_dict = {
        "version": payload.version,
        "rooms": [r.model_dump() for r in payload.rooms],
    }
    row = await FloorplanLayoutService.upsert(
        db,
        ws.id,
        payload.facility_id,
        payload.floor_id,
        layout_dict,
    )
    return FloorplanLayoutOut(
        facility_id=payload.facility_id,
        floor_id=payload.floor_id,
        layout_json=row.layout_json,
        updated_at=row.updated_at,
    )


@router.get("/specialists", response_model=list[SpecialistOut])
async def list_specialists(
    specialty: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_CLINICAL_STAFF)),
):
    specialists = await specialist_service.get_multi(db, ws_id=ws.id, limit=200)
    if specialty:
        normalized = specialty.lower()
        specialists = [item for item in specialists if item.specialty.lower() == normalized]
    return specialists


@router.post("/specialists", response_model=SpecialistOut, status_code=201)
async def create_specialist(
    payload: SpecialistCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_FUTURE_MANAGERS)),
):
    return await specialist_service.create(db, ws_id=ws.id, obj_in=payload)


@router.patch("/specialists/{specialist_id}", response_model=SpecialistOut)
async def update_specialist(
    specialist_id: int,
    payload: SpecialistUpdate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_FUTURE_MANAGERS)),
):
    current = await specialist_service.get(db, ws_id=ws.id, id=specialist_id)
    if not current:
        raise HTTPException(status_code=404, detail="Specialist not found")
    return await specialist_service.update(db, ws_id=ws.id, db_obj=current, obj_in=payload)


@router.get("/prescriptions", response_model=list[PrescriptionOut])
async def list_prescriptions(
    patient_id: Optional[int] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_ALL_AUTHENTICATED)),
):
    if patient_id is not None:
        assert_patient_record_access(current_user, patient_id)
    else:
        patient_id = current_user.patient_id if current_user.role == "patient" else None
    return await prescription_service.list_for_patient(
        db, ws_id=ws.id, patient_id=patient_id, status=status, limit=200
    )


@router.post("/prescriptions", response_model=PrescriptionOut, status_code=201)
async def create_prescription(
    payload: PrescriptionCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_FUTURE_MANAGERS)),
):
    if payload.patient_id is not None:
        assert_patient_record_access(current_user, payload.patient_id)
    data = payload.model_copy(
        update={"patient_id": payload.patient_id, "specialist_id": payload.specialist_id}
    )
    created = await prescription_service.create(db, ws_id=ws.id, obj_in=data)
    created.prescribed_by_user_id = current_user.id
    db.add(created)
    await db.commit()
    await db.refresh(created)
    return created


@router.patch("/prescriptions/{prescription_id}", response_model=PrescriptionOut)
async def update_prescription(
    prescription_id: int,
    payload: PrescriptionUpdate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_FUTURE_MANAGERS)),
):
    current = await prescription_service.get(db, ws_id=ws.id, id=prescription_id)
    if not current:
        raise HTTPException(status_code=404, detail="Prescription not found")
    return await prescription_service.update(db, ws_id=ws.id, db_obj=current, obj_in=payload)


@router.get("/pharmacy/orders", response_model=list[PharmacyOrderOut])
async def list_pharmacy_orders(
    patient_id: Optional[int] = None,
    prescription_id: Optional[int] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(get_current_active_user),
):
    if current_user.role == "patient":
        patient_id = current_user.patient_id
    elif patient_id is not None:
        assert_patient_record_access(current_user, patient_id)
    return await pharmacy_order_service.list_orders(
        db,
        ws_id=ws.id,
        patient_id=patient_id,
        prescription_id=prescription_id,
        status=status,
        limit=200,
    )


@router.post("/pharmacy/orders", response_model=PharmacyOrderOut, status_code=201)
async def create_pharmacy_order(
    payload: PharmacyOrderCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_FUTURE_MANAGERS)),
):
    return await pharmacy_order_service.create(db, ws_id=ws.id, obj_in=payload)


@router.patch("/pharmacy/orders/{order_id}", response_model=PharmacyOrderOut)
async def update_pharmacy_order(
    order_id: int,
    payload: PharmacyOrderUpdate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_FUTURE_MANAGERS)),
):
    current = await pharmacy_order_service.get(db, ws_id=ws.id, id=order_id)
    if not current:
        raise HTTPException(status_code=404, detail="Pharmacy order not found")
    return await pharmacy_order_service.update(db, ws_id=ws.id, db_obj=current, obj_in=payload)
