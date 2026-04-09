from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import APIRouter, Depends, HTTPException

from sqlalchemy.future import select

from app.api.dependencies import RequireRole, get_current_user_workspace, get_db
from app.models.core import Room, SmartDevice, Workspace
from app.models.patients import Patient
from app.models.users import User
from app.services import device_activity as device_activity_service
from app.schemas.homeassistant import (
    SmartDeviceResponse,
    SmartDeviceCreate,
    SmartDeviceUpdate,
    HADeviceControl,
    HAResponse,
)
from app.services.homeassistant import ha_service

router = APIRouter()

async def _patient_room_id(db: AsyncSession, ws_id: int, current_user: User) -> int:
    patient_id = getattr(current_user, "patient_id", None)
    if patient_id is None:
        raise HTTPException(status_code=403, detail="Patient account is not linked to a patient record")
    patient = await db.get(Patient, patient_id)
    if not patient or patient.workspace_id != ws_id:
        raise HTTPException(status_code=403, detail="Patient account is not linked to this workspace")
    if patient.room_id is None:
        raise HTTPException(status_code=404, detail="Patient is not assigned to a room")
    return patient.room_id

async def _patient_room_id_or_none(db: AsyncSession, ws_id: int, current_user: User) -> int | None:
    patient_id = getattr(current_user, "patient_id", None)
    if patient_id is None:
        raise HTTPException(status_code=403, detail="Patient account is not linked to a patient record")
    patient = await db.get(Patient, patient_id)
    if not patient or patient.workspace_id != ws_id:
        raise HTTPException(status_code=403, detail="Patient account is not linked to this workspace")
    return patient.room_id

async def _get_smart_device_for_user(
    db: AsyncSession,
    ws_id: int,
    device_id: int,
    current_user: User,
) -> SmartDevice:
    stmt = select(SmartDevice).where(
        SmartDevice.id == device_id,
        SmartDevice.workspace_id == ws_id,
    )
    result = await db.execute(stmt)
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Smart device not found")
    if current_user.role == "patient":
        room_id = await _patient_room_id(db, ws_id, current_user)
        if device.room_id != room_id:
            raise HTTPException(status_code=404, detail="Smart device not found")
    return device

@router.get("/devices", response_model=list[SmartDeviceResponse])
async def list_smart_devices(
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(["admin", "head_nurse", "supervisor", "observer", "patient"]))
):
    """
    List all smart devices linked to this workspace.
    In a real scenario with auth, we filter by the current user's workspace_id.
    """
    stmt = select(SmartDevice).where(SmartDevice.workspace_id == ws.id)
    if current_user.role == "patient":
        room_id = await _patient_room_id_or_none(db, ws.id, current_user)
        if room_id is None:
            return []
        stmt = stmt.where(SmartDevice.room_id == room_id, SmartDevice.is_active.is_(True))
    result = await db.execute(stmt)
    return result.scalars().all()

@router.post("/devices", response_model=SmartDeviceResponse)
async def add_smart_device(
    device_in: SmartDeviceCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _=Depends(RequireRole(["admin"]))
):
    """Admin only: Add a new smart device mapping from HomeAssistant."""
    new_device = SmartDevice(
        workspace_id=ws.id,
        name=device_in.name,
        ha_entity_id=device_in.ha_entity_id,
        device_type=device_in.device_type,
        room_id=device_in.room_id,
        is_active=device_in.is_active,
        config=device_in.config
    )
    db.add(new_device)
    await db.commit()
    await db.refresh(new_device)
    await device_activity_service.log_event(
        db,
        ws.id,
        "smart_created",
        f"Smart device “{new_device.name}” linked ({new_device.ha_entity_id})",
        smart_device_id=new_device.id,
        details={
            "ha_entity_id": new_device.ha_entity_id,
            "device_type": new_device.device_type,
            "room_id": new_device.room_id,
        },
    )
    return new_device

@router.patch("/devices/{device_id}", response_model=SmartDeviceResponse)
async def update_smart_device(
    device_id: int,
    body: SmartDeviceUpdate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _=Depends(RequireRole(["admin"])),
):
    stmt = select(SmartDevice).where(
        SmartDevice.id == device_id,
        SmartDevice.workspace_id == ws.id,
    )
    result = await db.execute(stmt)
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Smart device not found")

    patch = body.model_dump(exclude_unset=True)
    if "room_id" in patch and patch["room_id"] is not None:
        room = await db.get(Room, patch["room_id"])
        if not room or room.workspace_id != ws.id:
            raise HTTPException(status_code=400, detail="Invalid room_id")

    for key, value in patch.items():
        setattr(device, key, value)
    db.add(device)
    await db.commit()
    await db.refresh(device)
    await device_activity_service.log_event(
        db,
        ws.id,
        "smart_updated",
        f"Smart device “{device.name}” updated",
        smart_device_id=device.id,
        details=patch,
    )
    return device

@router.delete("/devices/{device_id}", status_code=204)
async def delete_smart_device(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _=Depends(RequireRole(["admin"])),
):
    stmt = select(SmartDevice).where(
        SmartDevice.id == device_id,
        SmartDevice.workspace_id == ws.id,
    )
    result = await db.execute(stmt)
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Smart device not found")
    snap = {
        "name": device.name,
        "ha_entity_id": device.ha_entity_id,
        "device_type": device.device_type,
    }
    await db.delete(device)
    await db.commit()
    await device_activity_service.log_event(
        db,
        ws.id,
        "smart_deleted",
        f"Smart device “{snap['name']}” removed from workspace",
        smart_device_id=device_id,
        details=snap,
    )

@router.post("/devices/{device_id}/control", response_model=HAResponse)
async def control_smart_device(
    device_id: int,
    control: HADeviceControl,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(["admin", "head_nurse", "supervisor", "observer", "patient"]))
):
    """
    Control a smart device (requires HA API setup).
    Staff roles and patients can control devices within their allowed scope.
    """
    device = await _get_smart_device_for_user(db, ws.id, device_id, current_user)

    if not device.is_active:
        raise HTTPException(status_code=400, detail="Smart device is marked inactive")

    # Send command to Home Assistant
    success = await ha_service.call_service(
        action=control.action,
        entity_id=device.ha_entity_id,
        service_data=control.parameters
    )

    if not success:
        # It could fail because HA is offline, or no token configured
        raise HTTPException(
            status_code=502,
            detail=f"Failed to communicate with HomeAssistant for {device.ha_entity_id}. Check HA token."
        )

    # Note: In a real system, we might want to refresh the state from HA next.
    return HAResponse(
        status="success",
        message=f"Command '{control.action}' sent to {device.name}",
        data={"entity_id": device.ha_entity_id}
    )

@router.get("/devices/{device_id}/state", response_model=HAResponse)
async def get_device_state(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(["admin", "head_nurse", "supervisor", "observer", "patient"]))
):
    """
    Query the direct status from HomeAssistant.
    Anyone can view state.
    """
    device = await _get_smart_device_for_user(db, ws.id, device_id, current_user)

    ha_state = await ha_service.get_state(device.ha_entity_id)
    if ha_state is None:
        return HAResponse(
            status="error",
            message=f"Could not reach HomeAssistant or {device.ha_entity_id} not found."
        )

    # You can update the local cache state here
    device.state = ha_state.get("state", "unknown")
    await db.commit()

    return HAResponse(
        status="success",
        message="State fetched",
        data=ha_state
    )

