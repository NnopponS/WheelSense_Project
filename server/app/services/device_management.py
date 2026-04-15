from __future__ import annotations

import os
from typing import Any

from sqlalchemy import and_, delete, desc, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

"""Device registry detail, MQTT command dispatch, and workspace-safe updates."""

import json
import logging
import re
import uuid

import aiomqtt
from fastapi import HTTPException

import app.config as config
from app.models.base import utcnow
from app.models.activity import Alert
from app.models.caregivers import CareGiver, CareGiverDeviceAssignment
from app.models.core import Device, DeviceActivityEvent, DeviceCommandDispatch, Room, Workspace
from app.models.patients import Patient, PatientDeviceAssignment
from app.models.telemetry import (
    IMUTelemetry,
    LocalizationCalibrationSample,
    LocalizationCalibrationSession,
    MobileDeviceTelemetry,
    MotionTrainingData,
    NodeStatusTelemetry,
    PhotoRecord,
    RoomPrediction,
    RSSIReading,
)
from app.models.vitals import VitalReading
from app.schemas.devices import (
    HARDWARE_TYPES,
    DeviceCommandRequest,
    DeviceCreate,
    MobileTelemetryIngest,
    DevicePatch,
)
from app.services.node_device_alias import resolve_registry_node_device

logger = logging.getLogger("wheelsense.devices")
settings = config.settings

# Never expose or allow PATCH merge for per-device WiFi/MQTT provisioning (use firmware/ops tooling).
NON_PUBLIC_DEVICE_CONFIG_KEYS = frozenset(
    {
        "wifi_ssid",
        "wifi_password",
        "mqtt_broker",
        "mqtt_user",
        "mqtt_password",
        "wifi_scan_results",
    }
)

def _public_config(cfg: dict[str, Any]) -> dict[str, Any]:
    """Return a frontend-safe config copy (no credentials or network provisioning)."""
    return {
        k: v
        for k, v in cfg.items()
        if k not in NON_PUBLIC_DEVICE_CONFIG_KEYS
    }


# T-SIMCam (Node_Tsimcam) applies `node_id` from WheelSense/config/{deviceId} JSON payloads.
_WSN_BLE_LABEL_RE = re.compile(r"\b(WSN_\d+)\b", re.IGNORECASE)


def extract_ble_node_label_from_display_name(display_name: str | None) -> str | None:
    """Return canonical WSN_nnn token from a registry display name, if present."""
    if not display_name:
        return None
    m = _WSN_BLE_LABEL_RE.search(display_name.strip())
    if not m:
        return None
    return m.group(1).upper()

def _normalize_hardware_type(device_type: str, hardware_type: str | None) -> str:
    if hardware_type:
        if hardware_type not in HARDWARE_TYPES:
            raise HTTPException(
                400,
                f"Invalid hardware_type; allowed: {sorted(HARDWARE_TYPES)}",
            )
        return hardware_type
    if device_type == "camera":
        return "node"
    if device_type in HARDWARE_TYPES:
        return device_type
    return "wheelchair"

def _legacy_device_type_for_storage(hardware_type: str) -> str:
    """Keep MQTT/camera paths working: nodes still use device_type 'camera' in DB when applicable."""
    if hardware_type == "node":
        return "camera"
    return hardware_type


def _normalize_hardware_type_mqtt(device_type: str | None, hardware_type: str | None) -> str:
    """Telemetry-safe hardware normalization; invalid or missing values default to wheelchair."""
    ht = (hardware_type or "").strip().lower() or None
    if ht and ht in HARDWARE_TYPES:
        return ht
    dt = (device_type or "").strip().lower()
    if dt == "camera":
        return "node"
    if dt in HARDWARE_TYPES:
        return dt
    return "wheelchair"


def _is_valid_mqtt_device_id(device_id: str) -> bool:
    s = device_id.strip()
    if len(s) < 1 or len(s) > 32:
        return False
    if s.lower() == "unknown":
        return False
    return True


async def get_registered_device_for_ingest(session: AsyncSession, device_id: str) -> Device | None:
    """Resolve a device row by hardware device_id (MQTT). Multiple workspaces with same id is an error."""
    result = await session.execute(select(Device).where(Device.device_id == device_id))
    devices = list(result.scalars().all())
    if len(devices) > 1:
        raise RuntimeError(
            f"Device ID '{device_id}' exists in multiple workspaces. MQTT device resolution is ambiguous."
        )
    return devices[0] if devices else None


async def resolve_mqtt_auto_register_workspace_id(session: AsyncSession) -> int | None:
    if not settings.mqtt_auto_register_devices:
        return None
    wid = settings.mqtt_auto_register_workspace_id
    if wid is not None:
        r = await session.execute(select(Workspace.id).where(Workspace.id == wid))
        if r.scalar_one_or_none() is None:
            logger.error("MQTT_AUTO_REGISTER_WORKSPACE_ID=%s does not exist", wid)
            return None
        return wid
    r = await session.execute(select(Workspace.id))
    ids = [row[0] for row in r.all()]
    if len(ids) == 0:
        logger.warning("MQTT auto-register skipped: no workspaces in database")
        return None
    if len(ids) > 1:
        logger.warning(
            "MQTT auto-register skipped: %d workspaces; set MQTT_AUTO_REGISTER_WORKSPACE_ID",
            len(ids),
        )
        return None
    return ids[0]


async def ensure_wheelchair_device_from_telemetry(
    session: AsyncSession,
    device_id: str,
    payload: dict,
) -> Device | None:
    """Create a registry row on first WheelSense/data telemetry when enabled. Caller commits."""
    if not settings.mqtt_auto_register_devices:
        return None
    if not _is_valid_mqtt_device_id(device_id):
        logger.warning("MQTT auto-register skipped: invalid device_id %r", device_id)
        return None

    existing = await get_registered_device_for_ingest(session, device_id)
    if existing is not None:
        return existing

    ws_id = await resolve_mqtt_auto_register_workspace_id(session)
    if ws_id is None:
        return None

    hw = _normalize_hardware_type_mqtt(
        payload.get("device_type"),
        payload.get("hardware_type"),
    )
    legacy_type = _legacy_device_type_for_storage(hw)
    firmware = str(payload.get("firmware") or "")[:16]
    display_name = device_id.strip()

    dev = Device(
        workspace_id=ws_id,
        device_id=device_id.strip(),
        device_type=legacy_type,
        hardware_type=hw,
        display_name=display_name,
        firmware=firmware or "",
    )
    try:
        async with session.begin_nested():
            session.add(dev)
            await session.flush()
    except IntegrityError:
        logger.debug("MQTT auto-register race for device_id=%s, reloading", device_id)

    resolved = await get_registered_device_for_ingest(session, device_id)
    if resolved is not None:
        logger.info(
            "MQTT auto-registered device %s in workspace_id=%s (hardware_type=%s)",
            device_id.strip(),
            resolved.workspace_id,
            hw,
        )
    return resolved


async def ensure_camera_device_from_mqtt_registration(
    session: AsyncSession,
    device_id: str,
    data: dict[str, Any],
) -> Device | None:
    """Create a CAM_* node row on first MQTT registration/status when auto-register resolves a workspace."""
    if not settings.mqtt_auto_register_devices:
        return None
    if not _is_valid_mqtt_device_id(device_id):
        return None
    did = str(device_id).strip()
    if not did.upper().startswith("CAM_"):
        return None
    existing = await get_registered_device_for_ingest(session, did)
    if existing is not None:
        return existing
    ws_id = await resolve_mqtt_auto_register_workspace_id(session)
    if ws_id is None:
        logger.warning("Camera auto-register skipped for %s: workspace could not be resolved", did)
        return None
    disp = str(data.get("node_id", "") or "").strip() or did
    cfg: dict[str, Any] = {}
    nid = str(data.get("node_id", "") or "").strip()
    if nid:
        cfg["node_id"] = nid
    ble_raw = data.get("ble_mac") or data.get("ble_mac_address")
    if ble_raw:
        cfg["ble_mac"] = str(ble_raw).strip()
    now = utcnow()
    dev = Device(
        workspace_id=ws_id,
        device_id=did,
        device_type="camera",
        hardware_type="node",
        display_name=disp[:128],
        firmware=str(data.get("firmware", "") or "")[:16],
        ip_address=str(data.get("ip_address", "") or "")[:45],
        last_seen=now,
        config=cfg,
    )
    try:
        async with session.begin_nested():
            session.add(dev)
            await session.flush()
    except IntegrityError:
        logger.debug("Camera MQTT auto-register race for device_id=%s, reloading", did)
    resolved = await get_registered_device_for_ingest(session, did)
    if resolved is not None:
        logger.info(
            "MQTT auto-registered camera %s in workspace_id=%s",
            did,
            resolved.workspace_id,
        )
    return resolved


def _normalize_ble_mac_hex(mac: str | None) -> str | None:
    if not mac:
        return None
    s = "".join(c for c in str(mac).strip() if c.isalnum())
    if len(s) != 12:
        return None
    return s.lower()


def _infer_normalized_ble_mac_for_stub(device_id: str, cfg: dict[str, Any]) -> str | None:
    """Prefer config ble_mac; else parse 12 hex nibbles from id BLE_<MAC> (wheelchair RSSI stubs)."""
    bm = _normalize_ble_mac_hex(str(cfg.get("ble_mac", "") or "").strip())
    if bm:
        return bm
    did = str(device_id).strip().upper()
    if not did.startswith("BLE_"):
        return None
    return _normalize_ble_mac_hex(did[4:])


def _ble_node_device_id_from_rssi(node: str, mac: str | None) -> str | None:
    """Stable registry id for a BLE beacon node reported by the wheelchair gateway."""
    nk = (node or "").strip()
    if len(nk) < 4 or not nk.upper().startswith("WSN_"):
        return None
    mac_hex = _normalize_ble_mac_hex(mac)
    if mac_hex:
        return f"BLE_{mac_hex.upper()}"
    tail = "".join(c for c in nk if c.isalnum())
    if not tail:
        return None
    return f"BLE_{tail.upper()}"[:32]


async def ensure_ble_node_devices_from_wheelchair_rssi(
    session: AsyncSession,
    workspace_id: int,
    rssi_list: list,
) -> None:
    """Create or touch node (camera) registry rows when the M5 gateway reports WSN_* beacons in telemetry."""
    if not settings.mqtt_auto_register_ble_nodes:
        return
    seen: set[str] = set()
    for raw in rssi_list:
        if not isinstance(raw, dict):
            continue
        node_key = str(raw.get("node", "")).strip()
        mac = raw.get("mac")
        mac_s = str(mac).strip() if mac is not None else ""
        dev_id = _ble_node_device_id_from_rssi(node_key, mac_s or None)
        if not dev_id or not _is_valid_mqtt_device_id(dev_id):
            continue
        if dev_id in seen:
            continue
        seen.add(dev_id)

        result = await session.execute(
            select(Device).where(
                and_(Device.workspace_id == workspace_id, Device.device_id == dev_id)
            )
        )
        existing = result.scalar_one_or_none()
        now = utcnow()
        cfg_patch = {
            "ble_node_id": node_key,
            "ble_mac": mac_s,
            "discovered_via": "wheelchair_rssi",
        }
        if existing is not None:
            existing.last_seen = now  # type: ignore[assignment]
            prev = dict(existing.config or {})
            for k, v in cfg_patch.items():
                prev[k] = v
            existing.config = prev  # type: ignore[assignment]
            continue

        mac_hex = _normalize_ble_mac_hex(mac_s)
        if mac_hex and await _canonical_non_ble_node_claims_mac(session, workspace_id, mac_hex):
            continue

        legacy = _legacy_device_type_for_storage("node")
        dev = Device(
            workspace_id=workspace_id,
            device_id=dev_id,
            device_type=legacy,
            hardware_type="node",
            display_name=node_key.strip()[:128],
            firmware="",
            last_seen=now,
            config=cfg_patch,
        )
        try:
            async with session.begin_nested():
                session.add(dev)
                await session.flush()
        except IntegrityError:
            logger.debug("BLE node auto-register race for device_id=%s", dev_id)
        else:
            logger.info(
                "MQTT auto-registered BLE node %s in workspace_id=%s (from wheelchair rssi)",
                dev_id,
                workspace_id,
            )

    macs_seen: set[str] = set()
    for raw in rssi_list:
        if not isinstance(raw, dict):
            continue
        mac = raw.get("mac")
        mac_s = str(mac).strip() if mac is not None else ""
        mh = _normalize_ble_mac_hex(mac_s)
        if mh:
            macs_seen.add(mh)
    for mh in macs_seen:
        await prune_ble_stub_if_canonical_node_claims_mac(session, workspace_id, mh)


def mqtt_camera_control_device_id(dev: Device) -> str:
    """MQTT topic id for WheelSense/camera/.../control (may differ from registry id when config overrides)."""
    cfg = dict(dev.config or {})
    mid = cfg.get("mqtt_device_id")
    if isinstance(mid, str):
        s = mid.strip()
        if s and _is_valid_mqtt_device_id(s):
            return s
    return dev.device_id


async def _move_room_node_device_references(
    session: AsyncSession,
    ws_id: int,
    old_device_id: str,
    new_device_id: str,
) -> None:
    if old_device_id == new_device_id:
        return
    q = select(Room).where(Room.workspace_id == ws_id, Room.node_device_id == old_device_id)
    for room in (await session.execute(q)).scalars().all():
        room.node_device_id = new_device_id  # type: ignore[assignment]


def _config_ble_mac_norms(cfg: dict[str, Any]) -> set[str]:
    """Normalized 12-hex BLE addresses stored on canonical (non–BLE_*) node rows."""
    out: set[str] = set()
    for key in ("ble_mac", "ble_mac_reported"):
        raw = cfg.get(key)
        if raw is None:
            continue
        bm = _normalize_ble_mac_hex(str(raw).strip())
        if bm:
            out.add(bm)
    return out


async def _canonical_non_ble_node_claims_mac(
    session: AsyncSession,
    workspace_id: int,
    mac_hex: str,
) -> bool:
    """True if a non–BLE_* node (e.g. CAM_*) already claims this radio MAC in config."""
    res = await session.execute(
        select(Device).where(
            Device.workspace_id == workspace_id,
            Device.hardware_type == "node",
        )
    )
    for row in res.scalars().all():
        if str(row.device_id).startswith("BLE_"):
            continue
        cfg = dict(row.config or {})
        if mac_hex in _config_ble_mac_norms(cfg):
            return True
    return False


async def prune_ble_stub_if_canonical_node_claims_mac(
    session: AsyncSession,
    workspace_id: int,
    mac_hex: str,
) -> None:
    """Drop BLE_<MAC> stub when a CAM_* (or merged) row already claims the same MAC (fixes duplicate fleet cards)."""
    if not mac_hex:
        return
    if not await _canonical_non_ble_node_claims_mac(session, workspace_id, mac_hex):
        return
    stub_id = f"BLE_{mac_hex.upper()}"
    res = await session.execute(
        select(Device).where(
            and_(
                Device.workspace_id == workspace_id,
                Device.device_id == stub_id,
            )
        )
    )
    row = res.scalar_one_or_none()
    if row is None:
        return
    if not str(row.device_id).startswith("BLE_"):
        return
    await session.delete(row)
    logger.info(
        "Removed redundant BLE stub %s; canonical node already claims ble_mac (workspace_id=%s)",
        stub_id,
        workspace_id,
    )


async def remove_ble_stubs_superseded_by_camera_payload(
    session: AsyncSession,
    workspace_id: int,
    canonical_device_id: str,
    data: dict[str, Any],
) -> None:
    """Remove BLE_* registry rows when the same radio MAC is the given camera (CAM_*)."""
    ble_raw = data.get("ble_mac") or data.get("ble_mac_address")
    n_in = _normalize_ble_mac_hex(str(ble_raw).strip() if ble_raw else "")
    if not n_in:
        return
    res = await session.execute(
        select(Device).where(
            Device.workspace_id == workspace_id,
            Device.hardware_type == "node",
        )
    )
    for row in list(res.scalars().all()):
        did = str(row.device_id)
        if not did.startswith("BLE_"):
            continue
        if did == canonical_device_id:
            continue
        cfg = dict(row.config or {})
        bm = _infer_normalized_ble_mac_for_stub(did, cfg)
        if bm != n_in:
            continue
        await session.delete(row)
        logger.info(
            "Removed duplicate BLE stub %s; canonical node is %s (workspace_id=%s)",
            did,
            canonical_device_id,
            workspace_id,
        )


async def try_merge_ble_row_for_camera_registration(
    session: AsyncSession,
    cam_device_id: str,
    data: dict[str, Any],
) -> Device | None:
    """Rename BLE_<MAC> stub to the camera's device_id when ble_mac matches (same physical board)."""
    if not settings.mqtt_merge_ble_camera_by_mac:
        return None
    if not _is_valid_mqtt_device_id(cam_device_id):
        return None
    ble_mac_in = data.get("ble_mac") or data.get("ble_mac_address")
    n_in = _normalize_ble_mac_hex(str(ble_mac_in).strip() if ble_mac_in else "")
    if not n_in:
        return None
    if await get_registered_device_for_ingest(session, cam_device_id) is not None:
        return None

    res = await session.execute(select(Device).where(Device.hardware_type == "node"))
    candidates: list[Device] = []
    for row in res.scalars().all():
        if not str(row.device_id).startswith("BLE_"):
            continue
        cfg = dict(row.config or {})
        bm = _infer_normalized_ble_mac_for_stub(str(row.device_id), cfg)
        if bm != n_in:
            continue
        candidates.append(row)

    if not candidates:
        return None
    if len(candidates) > 1:
        ws_ids = sorted({int(c.workspace_id) for c in candidates})
        logger.warning(
            "Skip BLE->camera merge for %s: ble_mac=%s matches multiple BLE stubs across workspaces=%s",
            cam_device_id,
            n_in,
            ws_ids,
        )
        return None

    row = candidates[0]
    cfg = dict(row.config or {})
    old_id = row.device_id
    try:
        row.device_id = cam_device_id  # type: ignore[assignment]
        row.device_type = "camera"  # type: ignore[assignment]
        row.hardware_type = "node"  # type: ignore[assignment]
        row.ip_address = str(data.get("ip_address", "") or "")[:45]  # type: ignore[assignment]
        row.firmware = str(data.get("firmware", "") or "")[:16]  # type: ignore[assignment]
        row.last_seen = utcnow()  # type: ignore[assignment]
        disp = str(data.get("node_id", "") or "").strip() or row.display_name or cam_device_id
        row.display_name = disp[:128]
        ncfg = dict(cfg)
        ncfg["node_id"] = str(data.get("node_id", ncfg.get("node_id", "")))
        ncfg["ble_mac_reported"] = str(ble_mac_in).strip()
        ncfg["merged_from_ble_stub"] = True
        row.config = ncfg  # type: ignore[assignment]
        await _move_room_node_device_references(session, row.workspace_id, old_id, cam_device_id)
        await session.flush()
    except IntegrityError:
        # Another writer may have created/renamed cam_device_id concurrently.
        # Recover by using the canonical row and migrating room references.
        logger.info(
            "BLE->camera merge race for %s (from %s); reloading canonical row",
            cam_device_id,
            old_id,
        )
        existing = await get_registered_device_for_ingest(session, cam_device_id)
        if existing is None:
            return None
        await _move_room_node_device_references(session, existing.workspace_id, old_id, cam_device_id)
        await session.flush()
        return existing
    logger.info(
        "Merged BLE discovery device %s -> %s (workspace_id=%s)",
        old_id,
        cam_device_id,
        row.workspace_id,
    )
    return row


async def create_device(
    session: AsyncSession, ws_id: int, body: DeviceCreate
) -> Device:
    hw = _normalize_hardware_type(body.device_type, body.hardware_type)
    legacy_type = _legacy_device_type_for_storage(hw)
    result = await session.execute(
        select(Device).where(
            and_(Device.device_id == body.device_id, Device.workspace_id == ws_id)
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(409, f"Device '{body.device_id}' is already registered")

    dev = Device(
        workspace_id=ws_id,
        device_id=body.device_id,
        device_type=legacy_type,
        hardware_type=hw,
        display_name=(body.display_name or "").strip(),
    )
    session.add(dev)
    await session.commit()
    await session.refresh(dev)
    return dev

async def get_device(session: AsyncSession, ws_id: int, device_id: str) -> Device:
    result = await session.execute(
        select(Device).where(
            Device.workspace_id == ws_id,
            Device.device_id == device_id,
        )
    )
    dev = result.scalar_one_or_none()
    if not dev:
        raise HTTPException(404, "Device not found in current workspace")
    return dev


async def delete_registry_device(session: AsyncSession, ws_id: int, device_id: str) -> None:
    """Remove a registry device and workspace-scoped rows that reference its device_id.

    Also clears :class:`DeviceActivityEvent` rows and unlinks :class:`Room` rows where
    ``node_device_id`` matches this device exactly **or** via the same alias rules as
    presence (e.g. room stores ``WSN_*``, registry id is ``CAM_*``).
    """
    await get_device(session, ws_id, device_id)

    photo_paths = (
        await session.execute(
            select(PhotoRecord.filepath).where(
                PhotoRecord.workspace_id == ws_id,
                PhotoRecord.device_id == device_id,
            )
        )
    ).all()
    for row in photo_paths:
        path = row[0]
        if not path:
            continue
        try:
            if os.path.isfile(path):
                os.remove(path)
        except OSError as exc:
            logger.warning("Could not remove photo file %s: %s", path, exc)

    await session.execute(
        delete(LocalizationCalibrationSession).where(
            LocalizationCalibrationSession.workspace_id == ws_id,
            LocalizationCalibrationSession.device_id == device_id,
        )
    )
    await session.execute(
        delete(LocalizationCalibrationSample).where(
            LocalizationCalibrationSample.workspace_id == ws_id,
            LocalizationCalibrationSample.device_id == device_id,
        )
    )

    for model in (
        IMUTelemetry,
        RSSIReading,
        RoomPrediction,
        MotionTrainingData,
        PhotoRecord,
        NodeStatusTelemetry,
        MobileDeviceTelemetry,
        VitalReading,
    ):
        await session.execute(
            delete(model).where(
                model.workspace_id == ws_id,
                model.device_id == device_id,
            )
        )

    await session.execute(
        delete(Alert).where(Alert.workspace_id == ws_id, Alert.device_id == device_id)
    )
    await session.execute(
        delete(DeviceCommandDispatch).where(
            DeviceCommandDispatch.workspace_id == ws_id,
            DeviceCommandDispatch.device_id == device_id,
        )
    )
    await session.execute(
        delete(PatientDeviceAssignment).where(
            PatientDeviceAssignment.workspace_id == ws_id,
            PatientDeviceAssignment.device_id == device_id,
        )
    )
    await session.execute(
        delete(CareGiverDeviceAssignment).where(
            CareGiverDeviceAssignment.workspace_id == ws_id,
            CareGiverDeviceAssignment.device_id == device_id,
        )
    )

    await session.execute(
        delete(DeviceActivityEvent).where(
            DeviceActivityEvent.workspace_id == ws_id,
            DeviceActivityEvent.registry_device_id == device_id,
        )
    )

    node_candidates = list(
        (
            await session.execute(
                select(Device)
                .where(
                    Device.workspace_id == ws_id,
                    Device.hardware_type == "node",
                )
                .order_by(Device.id)
            )
        )
        .scalars()
        .all()
    )
    rooms_with_node = list(
        (
            await session.execute(
                select(Room).where(
                    Room.workspace_id == ws_id,
                    Room.node_device_id.isnot(None),
                )
            )
        )
        .scalars()
        .all()
    )
    for room in rooms_with_node:
        raw = room.node_device_id
        if not raw:
            continue
        if raw == device_id:
            await session.execute(update(Room).where(Room.id == room.id).values(node_device_id=None))
            continue
        resolved = resolve_registry_node_device(raw, node_candidates)
        if resolved is not None and resolved.device_id == device_id:
            await session.execute(update(Room).where(Room.id == room.id).values(node_device_id=None))

    await session.execute(
        delete(Device).where(Device.workspace_id == ws_id, Device.device_id == device_id)
    )
    await session.commit()


async def patch_device(
    session: AsyncSession, ws_id: int, device_id: str, body: DevicePatch
) -> Device:
    dev = await get_device(session, ws_id, device_id)
    if body.display_name is not None:
        dev.display_name = body.display_name.strip()
    if body.config is not None:
        merged = dict(dev.config or {})
        for k, v in body.config.items():
            if k in NON_PUBLIC_DEVICE_CONFIG_KEYS:
                continue
            if v is None:
                merged.pop(k, None)
            else:
                merged[k] = v
        dev.config = merged
    if body.display_name is not None and dev.hardware_type == "node":
        wsn = extract_ble_node_label_from_display_name(dev.display_name)
        if wsn:
            merged = dict(dev.config or {})
            merged["ble_node_id"] = wsn
            dev.config = merged
    await session.commit()
    await session.refresh(dev)
    if body.display_name is not None and dev.hardware_type == "node":
        wsn = extract_ble_node_label_from_display_name(dev.display_name)
        if wsn:
            topic = f"WheelSense/config/{mqtt_camera_control_device_id(dev)}"
            try:
                await publish_mqtt(topic, {"node_id": wsn, "sync_only": False})
            except Exception as e:
                logger.warning(
                    "MQTT config push failed (device_id=%s topic=%s): %s",
                    device_id,
                    topic,
                    e,
                )
    return dev

async def assign_patient_from_device(
    session: AsyncSession,
    ws_id: int,
    device_id: str,
    patient_id: int | None,
    device_role: str,
) -> PatientDeviceAssignment | None:
    """Assign/unassign patient for a device from device-side workflow."""
    await get_device(session, ws_id, device_id)
    if patient_id is None:
        q = select(PatientDeviceAssignment).where(
            PatientDeviceAssignment.workspace_id == ws_id,
            PatientDeviceAssignment.device_id == device_id,
            PatientDeviceAssignment.is_active.is_(True),
        )
        rows = list((await session.execute(q)).scalars().all())
        for row in rows:
            row.is_active = False
            row.unassigned_at = utcnow()
            session.add(row)
        await session.commit()
        return None

    from app.schemas.patients import DeviceAssignmentCreate
    from app.services.patient import patient_service

    return await patient_service.assign_device(
        session,
        ws_id=ws_id,
        patient_id=patient_id,
        obj_in=DeviceAssignmentCreate(device_id=device_id, device_role=device_role),
    )

async def _latest_imu(session: AsyncSession, ws_id: int, device_id: str) -> IMUTelemetry | None:
    q = (
        select(IMUTelemetry)
        .where(
            IMUTelemetry.workspace_id == ws_id,
            IMUTelemetry.device_id == device_id,
        )
        .order_by(desc(IMUTelemetry.timestamp))
        .limit(1)
    )
    return (await session.execute(q)).scalar_one_or_none()

async def _latest_prediction(
    session: AsyncSession, ws_id: int, device_id: str
) -> RoomPrediction | None:
    q = (
        select(RoomPrediction)
        .where(
            RoomPrediction.workspace_id == ws_id,
            RoomPrediction.device_id == device_id,
        )
        .order_by(desc(RoomPrediction.timestamp))
        .limit(1)
    )
    return (await session.execute(q)).scalar_one_or_none()

async def _latest_photo(session: AsyncSession, ws_id: int, device_id: str) -> PhotoRecord | None:
    """Most recent photo whose file still exists (avoids 404 on /cameras/photos/{id}/content)."""
    q = (
        select(PhotoRecord)
        .where(
            PhotoRecord.workspace_id == ws_id,
            PhotoRecord.device_id == device_id,
        )
        .order_by(desc(PhotoRecord.timestamp))
        .limit(30)
    )
    rows = (await session.execute(q)).scalars().all()
    for rec in rows:
        fp = (rec.filepath or "").strip()
        if fp and os.path.exists(fp):
            return rec
    return None


async def _latest_node_status(
    session: AsyncSession, ws_id: int, device_id: str
) -> NodeStatusTelemetry | None:
    q = (
        select(NodeStatusTelemetry)
        .where(
            NodeStatusTelemetry.workspace_id == ws_id,
            NodeStatusTelemetry.device_id == device_id,
        )
        .order_by(desc(NodeStatusTelemetry.timestamp))
        .limit(1)
    )
    return (await session.execute(q)).scalar_one_or_none()


async def _latest_mobile_telemetry(
    session: AsyncSession, ws_id: int, device_id: str
) -> MobileDeviceTelemetry | None:
    q = (
        select(MobileDeviceTelemetry)
        .where(
            MobileDeviceTelemetry.workspace_id == ws_id,
            MobileDeviceTelemetry.device_id == device_id,
        )
        .order_by(desc(MobileDeviceTelemetry.timestamp))
        .limit(1)
    )
    return (await session.execute(q)).scalar_one_or_none()

async def _room_for_node(session: AsyncSession, ws_id: int, device_id: str) -> Room | None:
    direct = (
        await session.execute(
            select(Room).where(
                Room.workspace_id == ws_id,
                Room.node_device_id == device_id,
            )
        )
    ).scalar_one_or_none()
    if direct is not None:
        return direct

    nodes = list(
        (
            await session.execute(
                select(Device)
                .where(
                    Device.workspace_id == ws_id,
                    or_(
                        Device.hardware_type == "node",
                        Device.hardware_type == "camera",
                    ),
                )
                .order_by(Device.id)
            )
        )
        .scalars()
        .all()
    )
    if not nodes:
        return None

    rooms = list(
        (
            await session.execute(
                select(Room).where(
                    Room.workspace_id == ws_id,
                    Room.node_device_id.isnot(None),
                )
            )
        )
        .scalars()
        .all()
    )
    for room in rooms:
        raw = room.node_device_id
        if not raw or not str(raw).strip():
            continue
        resolved = resolve_registry_node_device(raw, nodes)
        if resolved is not None and resolved.device_id == device_id:
            return room
    return None

async def _active_patient_assignment(
    session: AsyncSession, ws_id: int, device_id: str
) -> tuple[PatientDeviceAssignment | None, Patient | None]:
    q = (
        select(PatientDeviceAssignment)
        .where(
            PatientDeviceAssignment.workspace_id == ws_id,
            PatientDeviceAssignment.device_id == device_id,
            PatientDeviceAssignment.is_active.is_(True),
        )
        .order_by(desc(PatientDeviceAssignment.assigned_at), desc(PatientDeviceAssignment.id))
        .limit(1)
    )
    assign = (await session.execute(q)).scalar_one_or_none()
    if not assign:
        return None, None
    p = await session.get(Patient, assign.patient_id)
    return assign, p

async def _active_caregiver_assignment(
    session: AsyncSession, ws_id: int, device_id: str
) -> tuple[CareGiverDeviceAssignment | None, CareGiver | None]:
    q = (
        select(CareGiverDeviceAssignment)
        .where(
            CareGiverDeviceAssignment.workspace_id == ws_id,
            CareGiverDeviceAssignment.device_id == device_id,
            CareGiverDeviceAssignment.is_active.is_(True),
        )
        .order_by(desc(CareGiverDeviceAssignment.assigned_at), desc(CareGiverDeviceAssignment.id))
        .limit(1)
    )
    assign = (await session.execute(q)).scalar_one_or_none()
    if not assign:
        return None, None
    cg = await session.get(CareGiver, assign.caregiver_id)
    return assign, cg

def device_summary_dict(dev: Device) -> dict[str, Any]:
    cfg = dev.config or {}
    public_cfg = _public_config(cfg)
    return {
        "id": dev.id,
        "device_id": dev.device_id,
        "device_type": dev.device_type,
        "hardware_type": dev.hardware_type,
        "display_name": dev.display_name,
        "ip_address": dev.ip_address,
        "firmware": dev.firmware,
        "last_seen": dev.last_seen.isoformat() if dev.last_seen else None,
        "config": public_cfg,
    }

async def build_device_detail(session: AsyncSession, ws_id: int, device_id: str) -> dict[str, Any]:
    dev = await get_device(session, ws_id, device_id)
    imu = await _latest_imu(session, ws_id, device_id)
    pred = await _latest_prediction(session, ws_id, device_id)
    photo = await _latest_photo(session, ws_id, device_id)
    node_status = await _latest_node_status(session, ws_id, device_id)
    mobile_status = await _latest_mobile_telemetry(session, ws_id, device_id)
    room = await _room_for_node(session, ws_id, device_id)
    pa, patient = await _active_patient_assignment(session, ws_id, device_id)
    ca, caregiver = await _active_caregiver_assignment(session, ws_id, device_id)
    vr = (
        await session.execute(
            select(VitalReading)
            .where(
                VitalReading.workspace_id == ws_id,
                VitalReading.device_id == device_id,
            )
            .order_by(desc(VitalReading.timestamp))
            .limit(1)
        )
    ).scalar_one_or_none()

    wheelchair_metrics = None
    if imu is not None:
        wheelchair_metrics = {
            "timestamp": imu.timestamp.isoformat() if imu.timestamp else None,
            "battery_pct": imu.battery_pct,
            "battery_v": imu.battery_v,
            "charging": imu.charging,
            "velocity_ms": imu.velocity_ms,
            "distance_m": imu.distance_m,
            "ax": imu.ax,
            "ay": imu.ay,
            "az": imu.az,
            "gx": imu.gx,
            "gy": imu.gy,
            "gz": imu.gz,
            "accel_ms2": imu.accel_ms2,
            "direction": imu.direction,
        }

    cfg = dev.config or {}
    camera_meta = cfg.get("camera_status") if isinstance(cfg.get("camera_status"), dict) else {}
    node_payload = node_status.payload if node_status and isinstance(node_status.payload, dict) else {}
    node_payload = node_payload or (
        camera_meta.get("payload") if isinstance(camera_meta.get("payload"), dict) else {}
    )
    node_metrics = None
    if dev.hardware_type == "node" or node_status or node_payload or photo:
        node_metrics = {
            "timestamp": (
                node_status.timestamp.isoformat()
                if node_status and node_status.timestamp
                else camera_meta.get("updated_at")
            ),
            "status": (node_status.status if node_status else None) or node_payload.get("status"),
            "battery_pct": node_status.battery_pct if node_status else node_payload.get("battery_pct"),
            "battery_v": node_status.battery_v if node_status else node_payload.get("battery_v"),
            "charging": node_status.charging if node_status else node_payload.get("charging"),
            "stream_enabled": (
                node_status.stream_enabled if node_status else node_payload.get("stream_enabled")
            ),
            "frames_captured": (
                node_status.frames_captured if node_status else node_payload.get("frames_captured")
            ),
            "snapshots_captured": (
                node_status.snapshots_captured if node_status else node_payload.get("snapshots_captured")
            ),
            "last_snapshot_id": (
                node_status.last_snapshot_id if node_status else node_payload.get("last_snapshot_id")
            ),
            "heap": node_status.heap if node_status else node_payload.get("heap"),
            "ip_address": (node_status.ip_address if node_status else None)
            or node_payload.get("ip_address")
            or dev.ip_address,
        }
        if photo:
            node_metrics["latest_photo_id"] = photo.id
            node_metrics["latest_photo_at"] = photo.timestamp.isoformat() if photo.timestamp else None

    mobile_metrics = None
    if mobile_status is not None:
        mobile_metrics = {
            "timestamp": mobile_status.timestamp.isoformat() if mobile_status.timestamp else None,
            "battery_pct": mobile_status.battery_pct,
            "battery_v": mobile_status.battery_v,
            "charging": mobile_status.charging,
            "steps": mobile_status.steps,
            "polar_connected": mobile_status.polar_connected,
            "linked_person_type": mobile_status.linked_person_type,
            "linked_person_id": mobile_status.linked_person_id,
            "rssi_vector": mobile_status.rssi_vector or {},
        }

    polar_metrics = (
        {
            "timestamp": vr.timestamp.isoformat() if vr and vr.timestamp else None,
            "heart_rate_bpm": vr.heart_rate_bpm if vr else None,
            "rr_interval_ms": vr.rr_interval_ms if vr else None,
            "spo2": vr.spo2 if vr else None,
            "sensor_battery": vr.sensor_battery if vr else None,
            "source": vr.source if vr else None,
            "ppg": (mobile_status.extra or {}).get("ppg")
            if mobile_status and isinstance(mobile_status.extra, dict)
            else None,
        }
        if vr
        else None
    )

    location = None
    if room:
        location = {
            "room_id": room.id,
            "room_name": room.name,
            "floor_id": room.floor_id,
            "node_device_id": room.node_device_id,
        }
    if pred:
        location = location or {}
        location["predicted_room_id"] = pred.predicted_room_id
        location["predicted_room_name"] = pred.predicted_room_name
        location["prediction_confidence"] = pred.confidence
        location["prediction_at"] = pred.timestamp.isoformat() if pred.timestamp else None

    patient_link = None
    if pa and patient:
        patient_link = {
            "patient_id": patient.id,
            "patient_name": f"{patient.first_name} {patient.last_name}".strip(),
            "device_role": pa.device_role,
            "assigned_at": pa.assigned_at.isoformat() if pa.assigned_at else None,
        }

    caregiver_link = None
    if ca and caregiver:
        caregiver_link = {
            "caregiver_id": caregiver.id,
            "caregiver_name": f"{caregiver.first_name} {caregiver.last_name}".strip(),
            "device_role": ca.device_role,
            "assigned_at": ca.assigned_at.isoformat() if ca.assigned_at else None,
        }

    latest_photo = None
    if photo:
        latest_photo = {
            "id": photo.id,
            "photo_id": photo.photo_id,
            "timestamp": photo.timestamp.isoformat() if photo.timestamp else None,
            "url": f"/api/cameras/photos/{photo.id}/content",
        }

    realtime = (
        wheelchair_metrics
        or node_metrics
        or polar_metrics
        or mobile_metrics
        or {}
    )

    out = {
        **device_summary_dict(dev),
        "realtime": realtime,
        "wheelchair_metrics": wheelchair_metrics,
        "node_metrics": node_metrics,
        "polar_metrics": polar_metrics,
        "mobile_metrics": mobile_metrics,
        "location": location,
        "patient": patient_link,
        "caregiver": caregiver_link,
        "latest_photo": latest_photo,
        "camera_status": camera_meta,
        "polar_vitals": polar_metrics,  # compatibility
    }
    return out


async def ingest_mobile_telemetry(
    session: AsyncSession,
    ws_id: int,
    body: MobileTelemetryIngest,
) -> dict[str, Any]:
    dev = await get_device(session, ws_id, body.device_id)
    if dev.hardware_type != "mobile_phone":
        raise HTTPException(400, "Mobile ingest is only supported for mobile_phone hardware_type")

    linked_person_type: str | None = None
    linked_person_id: int | None = None
    patient_id_for_vitals: int | None = None

    if body.linked_person is not None:
        linked_person_type = body.linked_person.type
        linked_person_id = body.linked_person.id
        if body.linked_person.type == "patient":
            await assign_patient_from_device(
                session,
                ws_id,
                body.device_id,
                patient_id=body.linked_person.id,
                device_role="mobile",
            )
            patient_id_for_vitals = body.linked_person.id
        else:
            await assign_caregiver_device(
                session,
                ws_id,
                caregiver_id=body.linked_person.id,
                device_id=body.device_id,
                device_role="mobile_phone",
            )

    if patient_id_for_vitals is None:
        active_pa, _ = await _active_patient_assignment(session, ws_id, body.device_id)
        if active_pa is not None:
            patient_id_for_vitals = active_pa.patient_id

    ts = body.timestamp or utcnow()
    rssi_vector = {obs.node_id: obs.rssi for obs in body.rssi_observations}

    mobile_row = MobileDeviceTelemetry(
        workspace_id=ws_id,
        device_id=body.device_id,
        timestamp=ts,
        battery_pct=body.battery_pct,
        battery_v=body.battery_v,
        charging=body.charging,
        steps=body.steps,
        polar_connected=body.polar_connected,
        linked_person_type=linked_person_type,
        linked_person_id=linked_person_id,
        rssi_vector=rssi_vector,
        source="mobile_rest",
        extra={"ppg": body.ppg} if body.ppg is not None else {},
    )
    session.add(mobile_row)

    for obs in body.rssi_observations:
        session.add(
            RSSIReading(
                workspace_id=ws_id,
                device_id=body.device_id,
                timestamp=ts,
                node_id=obs.node_id,
                rssi=obs.rssi,
                mac=obs.mac or "",
            )
        )

    has_polar_vitals = any(
        value is not None
        for value in (
            body.polar_heart_rate_bpm,
            body.polar_rr_interval_ms,
            body.polar_spo2,
        )
    )
    if patient_id_for_vitals is not None and has_polar_vitals:
        session.add(
            VitalReading(
                workspace_id=ws_id,
                patient_id=patient_id_for_vitals,
                device_id=body.device_id,
                timestamp=ts,
                heart_rate_bpm=body.polar_heart_rate_bpm,
                rr_interval_ms=body.polar_rr_interval_ms,
                spo2=body.polar_spo2,
                sensor_battery=body.polar_sensor_battery,
                source="polar_sdk",
            )
        )

    cfg = dict(dev.config or {})
    cfg["mobile_status"] = {
        "timestamp": ts.isoformat(),
        "battery_pct": body.battery_pct,
        "battery_v": body.battery_v,
        "charging": body.charging,
        "steps": body.steps,
        "polar_connected": body.polar_connected,
        "linked_person_type": linked_person_type,
        "linked_person_id": linked_person_id,
    }
    dev.config = cfg
    dev.last_seen = ts
    session.add(dev)

    await session.commit()
    return {
        "status": "ok",
        "device_id": body.device_id,
        "timestamp": ts,
        "linked_person_type": linked_person_type,
        "linked_person_id": linked_person_id,
        "stored_rssi_samples": len(body.rssi_observations),
    }

async def publish_mqtt(topic: str, payload: dict[str, Any]) -> None:
    connect_kwargs: dict[str, Any] = {
        "hostname": settings.mqtt_broker,
        "port": settings.mqtt_port,
        "username": settings.mqtt_user or None,
        "password": settings.mqtt_password or None,
    }
    if getattr(settings, "mqtt_tls", False):
        import ssl

        connect_kwargs["tls_params"] = aiomqtt.TLSParameters(
            ca_certs=None,
            cert_reqs=ssl.CERT_NONE,
        )
    async with aiomqtt.Client(**connect_kwargs) as client:
        await client.publish(topic, json.dumps(payload))

async def dispatch_command(
    session: AsyncSession,
    ws_id: int,
    device_id: str,
    body: DeviceCommandRequest,
) -> DeviceCommandDispatch:
    dev = await get_device(session, ws_id, device_id)
    if body.channel == "camera":
        if dev.hardware_type != "node":
            raise HTTPException(400, "camera channel is only for node hardware_type")
        mqtt_id = mqtt_camera_control_device_id(dev)
        topic = f"WheelSense/camera/{mqtt_id}/control"
    else:
        topic = f"WheelSense/{device_id}/control"

    cmd_id = str(uuid.uuid4())
    payload = {**body.payload, "command_id": cmd_id}
    row = DeviceCommandDispatch(
        id=cmd_id,
        workspace_id=ws_id,
        device_id=device_id,
        topic=topic,
        payload=payload,
        status="sent",
        dispatched_at=utcnow(),
    )
    session.add(row)
    await session.commit()
    try:
        await publish_mqtt(topic, payload)
    except Exception as e:
        logger.warning("MQTT publish failed: %s", e)
        row.status = "failed"
        row.error_message = str(e)[:512]
        await session.commit()
        raise HTTPException(502, f"Failed to send MQTT command: {e}") from e

    await session.refresh(row)
    return row

async def camera_check_snapshot(
    session: AsyncSession,
    ws_id: int,
    device_id: str,
) -> dict[str, Any]:
    """Trigger capture on node; client polls detail for new latest_photo."""
    dev = await get_device(session, ws_id, device_id)
    if dev.hardware_type != "node":
        raise HTTPException(400, "Camera check is only for node devices")
    body = DeviceCommandRequest(channel="camera", payload={"command": "capture_frame"})
    row = await dispatch_command(session, ws_id, device_id, body)
    return {
        "command_id": row.id,
        "topic": row.topic,
        "status": row.status,
        "message": "Capture requested; refresh device detail for latest photo",
        "dispatched_at": row.dispatched_at.isoformat() if row.dispatched_at else None,
    }

async def assign_caregiver_device(
    session: AsyncSession,
    ws_id: int,
    caregiver_id: int,
    device_id: str,
    device_role: str,
) -> CareGiverDeviceAssignment:
    cg = await session.get(CareGiver, caregiver_id)
    if not cg or cg.workspace_id != ws_id:
        raise HTTPException(404, "Caregiver not found in current workspace")
    await get_device(session, ws_id, device_id)

    stmt = select(CareGiverDeviceAssignment).where(
        CareGiverDeviceAssignment.workspace_id == ws_id,
        CareGiverDeviceAssignment.is_active.is_(True),
    )
    existing = await session.execute(stmt)
    for assignment in existing.scalars().all():
        if not (
            assignment.device_id == device_id
            or (
                assignment.caregiver_id == caregiver_id
                and assignment.device_role == device_role
            )
        ):
            continue
        assignment.is_active = False
        assignment.unassigned_at = utcnow()
        session.add(assignment)

    new_a = CareGiverDeviceAssignment(
        workspace_id=ws_id,
        caregiver_id=caregiver_id,
        device_id=device_id,
        device_role=device_role,
        is_active=True,
    )
    session.add(new_a)
    await session.commit()
    await session.refresh(new_a)
    return new_a

async def list_caregiver_device_assignments(
    session: AsyncSession, ws_id: int, caregiver_id: int
) -> list[CareGiverDeviceAssignment]:
    cg = await session.get(CareGiver, caregiver_id)
    if not cg or cg.workspace_id != ws_id:
        raise HTTPException(404, "Caregiver not found in current workspace")
    q = select(CareGiverDeviceAssignment).where(
        CareGiverDeviceAssignment.caregiver_id == caregiver_id
    )
    return list((await session.execute(q)).scalars().all())

async def apply_command_ack(session: AsyncSession, command_id: str, ack_payload: dict[str, Any]) -> bool:
    """Mark dispatch row acked if UUID matches and workspace consistent."""
    result = await session.execute(
        select(DeviceCommandDispatch).where(DeviceCommandDispatch.id == command_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        return False
    row.status = "acked"
    row.ack_at = utcnow()
    row.ack_payload = ack_payload
    await session.commit()
    return True
