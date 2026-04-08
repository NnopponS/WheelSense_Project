from __future__ import annotations

from typing import Any, Optional
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import APIRouter, Depends

from app.api.dependencies import (
    ROLE_PATIENT_MANAGERS,
    RequireRole,
    get_current_user_workspace,
    get_db,
)
from app.models.core import Device, DeviceCommandDispatch, Workspace
from app.schemas.device_activity import DeviceActivityEventOut
from app.schemas.devices import (
    CameraCommand,
    DeviceCommandOut,
    DeviceCommandRequest,
    DeviceCreate,
    DevicePatientAssign,
    DevicePatch,
)
from app.services import device_activity as device_activity_service
from app.services import device_management as dm
from app.services.device_management import NON_PUBLIC_DEVICE_CONFIG_KEYS

router = APIRouter()

ROLE_DEVICE_MANAGERS = ["admin", "head_nurse"]
ROLE_DEVICE_COMMANDERS = ["admin", "head_nurse", "supervisor"]

def _sanitize_activity_details(payload: dict[str, Any]) -> dict[str, Any]:
    """Remove secrets and network-provisioning keys before persisting activity log details."""
    details = dict(payload)
    cfg = details.get("config")
    if isinstance(cfg, dict):
        safe_cfg = dict(cfg)
        for k in NON_PUBLIC_DEVICE_CONFIG_KEYS:
            safe_cfg.pop(k, None)
        details["config"] = safe_cfg
    return details

@router.get("/activity", response_model=list[DeviceActivityEventOut])
async def list_device_activity(
    limit: int = 30,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: object = Depends(RequireRole(["admin", "head_nurse", "supervisor"])),
):
    rows = await device_activity_service.list_recent(db, ws.id, limit=limit)
    return rows

@router.get("")
async def list_devices(
    device_type: Optional[str] = None,
    hardware_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
):
    query = select(Device).where(Device.workspace_id == ws.id).order_by(desc(Device.last_seen))
    if device_type:
        query = query.where(Device.device_type == device_type)
    if hardware_type:
        query = query.where(Device.hardware_type == hardware_type)
    result = await db.execute(query)
    devices = result.scalars().all()
    return [dm.device_summary_dict(d) for d in devices]

@router.get("/{device_id}/commands")
async def list_device_commands(
    device_id: str,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
):
    await dm.get_device(db, ws.id, device_id)
    lim = min(max(limit, 1), 100)
    q = (
        select(DeviceCommandDispatch)
        .where(
            DeviceCommandDispatch.workspace_id == ws.id,
            DeviceCommandDispatch.device_id == device_id,
        )
        .order_by(desc(DeviceCommandDispatch.dispatched_at))
        .limit(lim)
    )
    rows = list((await db.execute(q)).scalars().all())
    return [
        {
            "command_id": r.id,
            "topic": r.topic,
            "payload": r.payload,
            "status": r.status,
            "error_message": r.error_message or None,
            "dispatched_at": r.dispatched_at.isoformat() if r.dispatched_at else None,
            "ack_at": r.ack_at.isoformat() if r.ack_at else None,
            "ack_payload": r.ack_payload,
        }
        for r in rows
    ]

@router.get("/{device_id}")
async def get_device_detail(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
):
    return await dm.build_device_detail(db, ws.id, device_id)

@router.post("/{device_id}/patient")
async def assign_patient_from_device(
    device_id: str,
    body: DevicePatientAssign,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: object = Depends(RequireRole(ROLE_PATIENT_MANAGERS)),
):
    row = await dm.assign_patient_from_device(
        db,
        ws.id,
        device_id,
        patient_id=body.patient_id,
        device_role=body.device_role,
    )
    if row is None:
        await device_activity_service.log_event(
            db,
            ws.id,
            "device_paired",
            f"Device {device_id} unlinked from patient",
            registry_device_id=device_id,
            details={"patient_id": None, "device_role": body.device_role},
        )
        return {"status": "ok", "patient_id": None}
    await device_activity_service.log_event(
        db,
        ws.id,
        "device_paired",
        f"Device {device_id} paired to patient {row.patient_id} ({row.device_role})",
        registry_device_id=device_id,
        details={"patient_id": row.patient_id, "device_role": row.device_role},
    )
    return {
        "status": "ok",
        "patient_id": row.patient_id,
        "device_role": row.device_role,
        "assigned_at": row.assigned_at.isoformat() if row.assigned_at else None,
    }

@router.post("")
async def create_device(
    body: DeviceCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: object = Depends(RequireRole(ROLE_DEVICE_MANAGERS)),
):
    dev = await dm.create_device(db, ws.id, body)
    await device_activity_service.log_event(
        db,
        ws.id,
        "registry_created",
        f"Device {dev.device_id} added to workspace ({dev.hardware_type})",
        registry_device_id=dev.device_id,
        details={"hardware_type": dev.hardware_type, "display_name": dev.display_name},
    )
    return {"id": dev.id, "device_id": dev.device_id, "hardware_type": dev.hardware_type}

@router.patch("/{device_id}")
async def patch_device(
    device_id: str,
    body: DevicePatch,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: object = Depends(RequireRole(ROLE_DEVICE_MANAGERS)),
):
    dev = await dm.patch_device(db, ws.id, device_id, body)
    await device_activity_service.log_event(
        db,
        ws.id,
        "registry_updated",
        f"Device {device_id} settings updated",
        registry_device_id=device_id,
        details=_sanitize_activity_details(body.model_dump(exclude_unset=True)),
    )
    return dm.device_summary_dict(dev)

@router.post("/{device_id}/commands", response_model=DeviceCommandOut)
async def send_device_command(
    device_id: str,
    body: DeviceCommandRequest,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: object = Depends(RequireRole(ROLE_DEVICE_COMMANDERS)),
):
    row = await dm.dispatch_command(db, ws.id, device_id, body)
    await device_activity_service.log_event(
        db,
        ws.id,
        "command_dispatched",
        f"Command sent to {device_id} ({body.channel})",
        registry_device_id=device_id,
        details={"command_id": row.id, "topic": row.topic, "status": row.status},
    )
    return DeviceCommandOut(
        command_id=row.id,
        topic=row.topic,
        status=row.status,
        dispatched_at=row.dispatched_at,
    )

@router.post("/{device_id}/camera/check")
async def camera_check(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: object = Depends(RequireRole(ROLE_DEVICE_COMMANDERS)),
):
    result = await dm.camera_check_snapshot(db, ws.id, device_id)
    await device_activity_service.log_event(
        db,
        ws.id,
        "command_dispatched",
        f"Camera capture requested for {device_id}",
        registry_device_id=device_id,
        details={"command_id": result.get("command_id"), "topic": result.get("topic")},
    )
    return result

@router.post("/cameras/{device_id}/command")
async def send_camera_command(
    device_id: str,
    body: CameraCommand,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: object = Depends(RequireRole(ROLE_DEVICE_COMMANDERS)),
):
    payload: dict[str, Any] = {"command": body.command}
    if body.command == "start_stream":
        payload["interval_ms"] = body.interval_ms
    if body.command == "set_resolution":
        payload["resolution"] = body.resolution
    req = DeviceCommandRequest(channel="camera", payload=payload)
    row = await dm.dispatch_command(db, ws.id, device_id, req)
    await device_activity_service.log_event(
        db,
        ws.id,
        "command_dispatched",
        f"Camera command {body.command} sent to {device_id}",
        registry_device_id=device_id,
        details={"command_id": row.id, "topic": row.topic},
    )
    return {
        "message": f"Command '{body.command}' sent to {device_id}",
        "topic": row.topic,
        "command_id": row.id,
    }
