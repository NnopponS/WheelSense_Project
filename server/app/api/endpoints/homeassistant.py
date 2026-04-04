from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List

from app.api.dependencies import RequireRole, get_current_user_workspace, get_db
from app.models.core import SmartDevice, Workspace
from app.schemas.homeassistant import (
    SmartDeviceResponse,
    SmartDeviceCreate,
    HADeviceControl,
    HAResponse
)
from app.services.homeassistant import ha_service

router = APIRouter()

@router.get("/devices", response_model=List[SmartDeviceResponse])
async def list_smart_devices(
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _=Depends(RequireRole(["admin", "supervisor", "observer", "patient"]))
):
    """
    List all smart devices linked to this workspace.
    In a real scenario with auth, we filter by the current user's workspace_id.
    """
    stmt = select(SmartDevice).where(SmartDevice.workspace_id == ws.id)
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
    return new_device

@router.post("/devices/{device_id}/control", response_model=HAResponse)
async def control_smart_device(
    device_id: int,
    control: HADeviceControl,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _=Depends(RequireRole(["admin", "supervisor", "patient"]))
):
    """
    Control a smart device (requires HA API setup).
    Observer role cannot control devices.
    """
    stmt = select(SmartDevice).where(
        SmartDevice.id == device_id,
        SmartDevice.workspace_id == ws.id,
    )
    result = await db.execute(stmt)
    device = result.scalar_one_or_none()

    if not device:
        raise HTTPException(status_code=404, detail="Smart device not found")
        
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
    _=Depends(RequireRole(["admin", "supervisor", "observer", "patient"]))
):
    """
    Query the direct status from HomeAssistant.
    Anyone can view state.
    """
    stmt = select(SmartDevice).where(
        SmartDevice.id == device_id,
        SmartDevice.workspace_id == ws.id,
    )
    result = await db.execute(stmt)
    device = result.scalar_one_or_none()

    if not device:
        raise HTTPException(status_code=404, detail="Smart device not found")

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
