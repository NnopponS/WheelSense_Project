from __future__ import annotations

"""Floorplan endpoints for uploads, layouts, presence, and room capture."""

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    ROLE_ALL_AUTHENTICATED,
    ROLE_CLINICAL_STAFF,
    RequireRole,
    assert_patient_record_access_db,
    get_current_user_workspace,
    get_db,
    get_visible_patient_ids,
)
from app.models.core import Device, Room as CoreRoom, Workspace
from app.models.facility import Facility, Floor
from app.models.users import User
from app.schemas.floorplans import (
    FloorplanAssetOut,
    FloorplanLayoutOut,
    FloorplanLayoutPayload,
    FloorplanPresenceOut,
    RoomCaptureOut,
)
from app.services import device_management as dm
from app.services.floorplans import (
    FloorplanLayoutService,
    floorplan_presence_service,
    floorplan_service,
)

router = APIRouter()

ROLE_FLOORPLAN_MANAGERS = ["admin", "head_nurse", "supervisor"]


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
        file_url=f"/api/floorplans/{asset.id}/file",
        created_at=asset.created_at,
    )


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


@router.get("", response_model=list[FloorplanAssetOut])
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


@router.post("/upload", response_model=FloorplanAssetOut, status_code=201)
async def upload_floorplan(
    name: str = Form(...),
    file: UploadFile = File(...),
    facility_id: Optional[int] = Form(default=None),
    floor_id: Optional[int] = Form(default=None),
    width: Optional[int] = Form(default=None),
    height: Optional[int] = Form(default=None),
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_FLOORPLAN_MANAGERS)),
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


@router.get("/{asset_id}/file")
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


@router.get("/layout", response_model=FloorplanLayoutOut)
async def get_floorplan_layout(
    facility_id: int = Query(..., ge=1),
    floor_id: int = Query(..., ge=1),
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_CLINICAL_STAFF)),
):
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


@router.get("/presence", response_model=FloorplanPresenceOut)
async def get_floorplan_presence(
    facility_id: int = Query(..., ge=1),
    floor_id: int = Query(..., ge=1),
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_ALL_AUTHENTICATED)),
):
    await _assert_facility_floor(db, ws.id, facility_id, floor_id)
    visible_patient_ids = await get_visible_patient_ids(db, ws.id, current_user)
    return await floorplan_presence_service.build_presence(
        db,
        ws_id=ws.id,
        facility_id=facility_id,
        floor_id=floor_id,
        visible_patient_ids=visible_patient_ids,
        filter_to_visible_rooms=current_user.role == "patient",
    )


@router.post("/rooms/{room_id}/capture", response_model=RoomCaptureOut)
async def capture_room_snapshot(
    room_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_CLINICAL_STAFF)),
):
    room = await db.get(CoreRoom, room_id)
    if not room or room.workspace_id != ws.id:
        raise HTTPException(status_code=404, detail="Room not found")
    if not room.node_device_id:
        raise HTTPException(status_code=400, detail="Room has no mapped node device")
    result = await dm.camera_check_snapshot(db, ws.id, room.node_device_id)
    
    # Save captured image to simulation/Node-capture directory
    import asyncio
    import shutil
    from app.services.camera import camera_service
    from sqlalchemy import select
    
    # Wait a moment for the capture to complete
    await asyncio.sleep(2)
    
    # Get the latest photo for this device
    query = select(camera_service.model).where(
        camera_service.model.workspace_id == ws.id,
        camera_service.model.device_id == room.node_device_id
    ).order_by(camera_service.model.timestamp.desc()).limit(1)
    
    photo_result = await db.execute(query)
    photo = photo_result.scalars().first()
    
    if photo and photo.filepath and Path(photo.filepath).exists():
        # Create simulation/Node-capture directory if it doesn't exist
        sim_dir = Path(__file__).parent.parent.parent.parent.parent / "simulation" / "Node-capture"
        sim_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate filename based on room name (e.g., Room-401.png, Room402.png)
        room_name_clean = room.name.replace(" ", "").replace("/", "-")
        filename = f"Room{room_name_clean}.png"
        dest_path = sim_dir / filename
        
        # Copy the captured image to simulation directory
        shutil.copy2(photo.filepath, dest_path)
    
    return RoomCaptureOut(
        room_id=room.id,
        node_device_id=room.node_device_id,
        command_id=result.get("command_id"),
        topic=result.get("topic"),
        message=f"Capture requested for {room.name}",
    )


@router.put("/layout", response_model=FloorplanLayoutOut)
async def save_floorplan_layout(
    payload: FloorplanLayoutPayload,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_FLOORPLAN_MANAGERS)),
):
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
