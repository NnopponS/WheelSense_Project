from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, Any

from app.api.dependencies import get_current_user_workspace, get_db
from app.models.core import Device, Workspace
from app.schemas.core import DeviceCreate, CameraCommand
import app.config as config
import json
import aiomqtt

router = APIRouter()
settings = config.settings

@router.get("")
async def list_devices(
    device_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
):
    query = select(Device).where(Device.workspace_id == ws.id).order_by(desc(Device.last_seen))
    if device_type:
        query = query.where(Device.device_type == device_type)
    result = await db.execute(query)
    devices = result.scalars().all()
    return [
        {
            "id": d.id,
            "device_id": d.device_id,
            "device_type": d.device_type,
            "ip_address": d.ip_address,
            "firmware": d.firmware,
            "last_seen": d.last_seen.isoformat() if d.last_seen else None,
            "config": d.config,
        }
        for d in devices
    ]

@router.post("")
async def create_device(
    body: DeviceCreate, 
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
):
    existing = await db.execute(
        select(Device).where(
            and_(Device.device_id == body.device_id, Device.workspace_id == ws.id)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, f"Device '{body.device_id}' is already registered")

    dev = Device(workspace_id=ws.id, device_id=body.device_id, device_type=body.device_type)
    db.add(dev)
    await db.commit()
    await db.refresh(dev)
    return {"id": dev.id, "device_id": dev.device_id}

@router.post("/cameras/{device_id}/command")
async def send_camera_command(
    device_id: str,
    body: CameraCommand,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
):
    result = await db.execute(
        select(Device).where(
            Device.workspace_id == ws.id,
            Device.device_id == device_id,
        )
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(404, "Camera device not found in current workspace")

    payload: dict[str, Any] = {"command": body.command}
    if body.command == "start_stream":
        payload["interval_ms"] = body.interval_ms
    if body.command == "set_resolution":
        payload["resolution"] = body.resolution

    topic = f"WheelSense/camera/{device_id}/control"
    try:
        async with aiomqtt.Client(
            hostname=settings.mqtt_broker,
            port=settings.mqtt_port,
            username=settings.mqtt_user or None,
            password=settings.mqtt_password or None,
        ) as client:
            await client.publish(topic, json.dumps(payload))
    except Exception as e:
        raise HTTPException(502, f"Failed to send MQTT command: {e}")

    return {"message": f"Command '{body.command}' sent to {device_id}", "topic": topic}
