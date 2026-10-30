"""E84 touchscreen room-node integration.

The E84 is a room node that speaks the camera topic family
(``WheelSense/camera/<node_id>/...``) plus one extra inbound topic, ``event``:

  node → server   event        ``fall_detected`` | ``alert_ack`` | ``home_command``
  server → node   control      ``alert`` (active|none), ``home_state``
  server → node   assignment   retained ``room_name`` / ``room_id`` / ``occupancy``

The web platform stays the source of truth: falls become ``Alert`` rows,
acknowledgement on the screen resolves them through ``alert_service``, and home
commands run the same smart-device control path as the REST endpoint — then the
resulting ``home_state`` is pushed back to every screen bound to the room.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.activity import Alert
from app.models.base import utcnow
from app.models.core import Device, DeviceCommandDispatch, Room, SmartDevice
from app.models.patients import Patient, PatientDeviceAssignment
from app.models.telemetry import RoomPrediction
from app.services.device_management import mqtt_camera_control_device_id
from app.services.mqtt_publish import mqtt_publish_json

logger = logging.getLogger("wheelsense.room_node")

NODE_SCREEN_TYPES = {"light", "switch", "fan", "climate"}
NODE_SCREEN_DEVICE_LIMIT = 4
NODE_ALERT_TYPES = {"fall"}  # alert_types that drive the node's full-screen alert
FALL_EVENT_COOLDOWN_SECONDS = 10.0

# Monotonic clock of last accepted fall_detected per node device_id.
_fall_event_mono: dict[str, float] = {}


# ---------------------------------------------------------------------------
# Node capability / room binding
# ---------------------------------------------------------------------------


def _reported_status_payload(device: Device) -> dict[str, Any]:
    """Raw status dict last reported by the node (nested in camera_status)."""
    cfg = device.config if isinstance(device.config, dict) else {}
    snap = cfg.get("camera_status")
    if not isinstance(snap, dict):
        return {}
    normalized = snap.get("payload")
    if not isinstance(normalized, dict):
        return {}
    raw = normalized.get("payload")
    return raw if isinstance(raw, dict) else normalized


def payload_marks_room_screen(data: dict[str, Any]) -> bool:
    """Registration/status payload features that identify an E84-class node."""
    return (
        data.get("protocolVersion") == 1
        or isinstance(data.get("capabilities"), (list, dict))
        or isinstance(data.get("room"), dict)
    )


def mark_room_screen_node(device: Device) -> None:
    cfg = dict(device.config or {})
    cfg["e84_room_node"] = True
    device.config = cfg  # type: ignore[assignment]


def is_room_screen_node(device: Device) -> bool:
    cfg = device.config if isinstance(device.config, dict) else {}
    if cfg.get("e84_room_node") is True:
        return True
    return payload_marks_room_screen(_reported_status_payload(device))


async def resolve_node_room(session: AsyncSession, device: Device) -> Room | None:
    """Room a screen node serves: canonical rooms.node_device_id binding first,
    then the device-level config binding (room_id / room_key / room_name) used
    when the room's camera node is a different device (e.g. TsimCam)."""
    q = await session.execute(
        select(Room).where(
            Room.workspace_id == device.workspace_id,
            Room.node_device_id == device.device_id,
        )
    )
    room = q.scalars().first()
    if room is not None:
        return room

    cfg = device.config if isinstance(device.config, dict) else {}
    raw_room_id = cfg.get("room_id")
    try:
        room_id = int(raw_room_id) if raw_room_id is not None else None
    except (TypeError, ValueError):
        room_id = None
    if room_id is not None:
        room = await session.get(Room, room_id)
        if room is not None and room.workspace_id == device.workspace_id:
            return room

    room_name = str(cfg.get("room_name") or "").strip()
    if not room_name:
        room_key = str(cfg.get("room_key") or "").strip().lower()
        if room_key:
            from app.hardware_bridge import PHYSICAL_ROOM_META

            meta = PHYSICAL_ROOM_META.get(room_key)
            room_name = str(meta["facility_room_name"]) if meta else ""
    if room_name:
        q = await session.execute(
            select(Room).where(
                Room.workspace_id == device.workspace_id,
                Room.name == room_name,
            )
        )
        return q.scalars().first()
    return None


async def room_screen_nodes(session: AsyncSession, ws_id: int, room: Room) -> list[Device]:
    """E84-capable nodes bound to the room (canonical node_device_id or config)."""
    q = await session.execute(
        select(Device).where(
            Device.workspace_id == ws_id,
            Device.hardware_type == "node",
        )
    )
    out: list[Device] = []
    for dev in q.scalars().all():
        cfg = dev.config if isinstance(dev.config, dict) else {}
        bound = bool(room.node_device_id) and dev.device_id == room.node_device_id
        if not bound:
            try:
                bound = cfg.get("room_id") is not None and int(cfg.get("room_id")) == room.id
            except (TypeError, ValueError):
                bound = False
        if not bound:
            bound = str(cfg.get("room_name") or "").strip() == room.name
        if bound and is_room_screen_node(dev):
            out.append(dev)
    return out


# ---------------------------------------------------------------------------
# Outbound payloads (server → node)
# ---------------------------------------------------------------------------


async def push_node_control(session: AsyncSession, device: Device, payload: dict[str, Any]) -> str:
    """Publish a control command to a node on WheelSense/camera/<id>/control
    (QoS 1) and record a dispatch row so node acks resolve via apply_command_ack."""
    command_id = str(uuid.uuid4())
    mqtt_id = mqtt_camera_control_device_id(device)
    topic = f"WheelSense/camera/{mqtt_id}/control"
    body = {**payload, "command_id": command_id}
    session.add(
        DeviceCommandDispatch(
            id=command_id,
            workspace_id=device.workspace_id,
            device_id=device.device_id,
            topic=topic,
            payload=body,
            status="sent",
            dispatched_at=utcnow(),
        )
    )
    try:
        await mqtt_publish_json(topic, body)
    except Exception:
        logger.exception("Room-node control publish failed for %s", device.device_id)
    return command_id


async def room_occupancy(session: AsyncSession, ws_id: int, room: Room) -> int | None:
    """Count of older adults currently tracked in the room.

    Patients count toward the room when their latest per-device room prediction
    targets it; patients rostered to the room count only when no newer
    prediction places them elsewhere (mirrors FloorplanPresenceService).
    """
    latest_ts = (
        select(
            RoomPrediction.device_id,
            func.max(RoomPrediction.timestamp).label("ts"),
        )
        .where(RoomPrediction.workspace_id == ws_id)
        .group_by(RoomPrediction.device_id)
        .subquery()
    )
    q_latest = await session.execute(
        select(RoomPrediction).join(
            latest_ts,
            and_(
                RoomPrediction.device_id == latest_ts.c.device_id,
                RoomPrediction.timestamp == latest_ts.c.ts,
            ),
        )
    )
    predictions = list(q_latest.scalars().all())

    device_ids = [p.device_id for p in predictions]
    patient_by_device: dict[str, int] = {}
    if device_ids:
        q_assign = await session.execute(
            select(PatientDeviceAssignment).where(
                PatientDeviceAssignment.workspace_id == ws_id,
                PatientDeviceAssignment.device_id.in_(device_ids),
                PatientDeviceAssignment.is_active.is_(True),
            )
        )
        for a in q_assign.scalars().all():
            patient_by_device.setdefault(a.device_id, a.patient_id)

    latest_room_by_patient: dict[int, int | None] = {}
    for pred in sorted(predictions, key=lambda p: p.timestamp):
        patient_id = patient_by_device.get(pred.device_id)
        if patient_id is not None:
            latest_room_by_patient[patient_id] = pred.predicted_room_id

    occupants: set[int] = {
        pid for pid, rid in latest_room_by_patient.items() if rid == room.id
    }

    q_roster = await session.execute(
        select(Patient).where(
            Patient.workspace_id == ws_id,
            Patient.room_id == room.id,
            Patient.is_active.is_(True),
        )
    )
    for patient in q_roster.scalars().all():
        if latest_room_by_patient.get(patient.id, room.id) == room.id:
            occupants.add(patient.id)

    return len(occupants)


async def publish_assignment(session: AsyncSession, device: Device, room: Room) -> None:
    """Retained room assignment for the node (shown in its header/settings)."""
    payload: dict[str, Any] = {"room_name": room.name, "room_id": room.id}
    try:
        q = await session.execute(
            select(Patient)
            .where(
                Patient.workspace_id == device.workspace_id,
                Patient.room_id == room.id,
                Patient.is_active.is_(True),
            )
            .order_by(Patient.id)
        )
        roster = q.scalars().all()
        if len(roster) == 1:
            payload["patient_name"] = f"{roster[0].first_name} {roster[0].last_name}".strip()
        else:
            payload["patient_name"] = ""
    except Exception:
        logger.exception("patient_name lookup failed for room %s", room.id)
        payload["patient_name"] = ""
    try:
        occupancy: int | None = None
        # Camera-backed rooms show the live detected people count (0 when the
        # room reports empty); other rooms keep prediction/roster occupancy.
        from app.hardware_bridge import (
            facility_room_name_to_physical_key,
            hardware_bridge,
        )

        live_key = facility_room_name_to_physical_key(room.name)
        if live_key is not None:
            occupancy = hardware_bridge.live_room_occupancy.get(live_key, 0)
        if occupancy is None:
            occupancy = await room_occupancy(session, device.workspace_id, room)
    except Exception:
        logger.exception("occupancy lookup failed for room %s", room.id)
        occupancy = None
    if occupancy is not None:
        payload["occupancy"] = occupancy
    mqtt_id = mqtt_camera_control_device_id(device)
    await mqtt_publish_json(
        f"WheelSense/camera/{mqtt_id}/assignment", payload, retain=True
    )


def _node_device_type(sd: SmartDevice) -> str:
    dtype = (sd.device_type or "").strip().lower()
    return dtype if dtype in NODE_SCREEN_TYPES else "switch"


async def build_home_state(session: AsyncSession, ws_id: int, room: Room) -> dict[str, Any]:
    """``control home_state`` payload: up to 4 of the room's smart devices."""
    q = await session.execute(
        select(SmartDevice)
        .where(
            SmartDevice.workspace_id == ws_id,
            SmartDevice.room_id == room.id,
            SmartDevice.is_active.is_(True),
        )
        .order_by(SmartDevice.id)
        .limit(NODE_SCREEN_DEVICE_LIMIT)
    )
    devices: list[dict[str, Any]] = []
    for sd in q.scalars().all():
        entry: dict[str, Any] = {
            "id": sd.id,
            "name": sd.name,
            "type": _node_device_type(sd),
            "state": (sd.state or "off").strip().lower() or "off",
        }
        if sd.device_type == "climate":
            cfg = sd.config if isinstance(sd.config, dict) else {}
            temp = cfg.get("temperature", cfg.get("target_temperature"))
            if temp is not None:
                entry["temperature"] = temp
        devices.append(entry)
    return {"command": "home_state", "devices": devices}


def _alert_control_payload(alert: Alert | None) -> dict[str, Any]:
    if alert is None:
        return {"command": "alert", "status": "none"}
    return {
        "command": "alert",
        "alert_id": alert.id,
        "status": "active",
        "type": alert.alert_type,
    }


async def current_room_fall_alert(
    session: AsyncSession, ws_id: int, room_id: int
) -> Alert | None:
    """Newest unresolved room-scoped alert that drives the node's alert screen."""
    q = await session.execute(
        select(Alert)
        .where(
            Alert.workspace_id == ws_id,
            Alert.alert_type.in_(NODE_ALERT_TYPES),
            Alert.status.in_(("active", "acknowledged")),
        )
        .order_by(Alert.id.desc())
        .limit(25)
    )
    for alert in q.scalars().all():
        data = alert.data if isinstance(alert.data, dict) else {}
        if data.get("room_id") == room_id:
            return alert
    return None


async def push_home_state_to_device(
    session: AsyncSession, device: Device, room: Room
) -> None:
    await push_node_control(session, device, await build_home_state(session, device.workspace_id, room))


async def push_alert_state_to_device(
    session: AsyncSession, device: Device, alert: Alert | None
) -> None:
    await push_node_control(session, device, _alert_control_payload(alert))


# ---------------------------------------------------------------------------
# Fire-and-forget room-scoped pushes (open their own session; never raise)
# ---------------------------------------------------------------------------


async def _resolve_alert_room(session: AsyncSession, alert: Alert) -> Room | None:
    data = alert.data if isinstance(alert.data, dict) else {}
    raw_room_id = data.get("room_id")
    try:
        room_id = int(raw_room_id) if raw_room_id is not None else None
    except (TypeError, ValueError):
        room_id = None
    if room_id is not None:
        room = await session.get(Room, room_id)
        if room is not None and room.workspace_id == alert.workspace_id:
            return room

    if alert.patient_id is None:
        return None
    patient = await session.get(Patient, alert.patient_id)
    if patient is None:
        return None

    # Prefer the patient's live tracked room over the roster room — the person
    # may have fallen somewhere other than their assigned room.
    q_assign = await session.execute(
        select(PatientDeviceAssignment.device_id).where(
            PatientDeviceAssignment.workspace_id == alert.workspace_id,
            PatientDeviceAssignment.patient_id == patient.id,
            PatientDeviceAssignment.is_active.is_(True),
        )
    )
    device_ids = [row[0] for row in q_assign.all()]
    if device_ids:
        q_pred = await session.execute(
            select(RoomPrediction)
            .where(
                RoomPrediction.workspace_id == alert.workspace_id,
                RoomPrediction.device_id.in_(device_ids),
            )
            .order_by(RoomPrediction.timestamp.desc())
            .limit(1)
        )
        pred = q_pred.scalars().first()
        if pred is not None and pred.predicted_room_id is not None:
            room = await session.get(Room, pred.predicted_room_id)
            if room is not None:
                return room
    if patient.room_id is not None:
        room = await session.get(Room, patient.room_id)
        if room is not None:
            return room
    return None


async def push_alert_to_room_screens_for_alert(ws_id: int, alert_id: int) -> None:
    """Push ``control alert active`` to the screens of the alert's room."""
    try:
        async with AsyncSessionLocal() as session:
            alert = await session.get(Alert, alert_id)
            if alert is None or alert.workspace_id != ws_id:
                return
            if alert.alert_type not in NODE_ALERT_TYPES:
                return
            room = await _resolve_alert_room(session, alert)
            if room is None:
                return
            nodes = await room_screen_nodes(session, ws_id, room)
            if not nodes:
                return
            for node in nodes:
                await push_alert_state_to_device(session, node, alert)
            await session.commit()
    except Exception:
        logger.exception("push_alert_to_room_screens failed for alert %s", alert_id)


async def push_alert_cleared_to_room_screens_for_alert(ws_id: int, alert_id: int) -> None:
    """Push ``control alert status:none`` to the screens of the alert's room."""
    try:
        async with AsyncSessionLocal() as session:
            alert = await session.get(Alert, alert_id)
            if alert is None or alert.workspace_id != ws_id:
                return
            if alert.alert_type not in NODE_ALERT_TYPES:
                return
            room = await _resolve_alert_room(session, alert)
            if room is None:
                return
            nodes = await room_screen_nodes(session, ws_id, room)
            for node in nodes:
                await push_alert_state_to_device(session, node, None)
            await session.commit()
    except Exception:
        logger.exception("push_alert_cleared_to_room_screens failed for alert %s", alert_id)


async def push_home_state_to_room(ws_id: int, room_id: int) -> None:
    """Push ``control home_state`` to every screen bound to the room."""
    try:
        async with AsyncSessionLocal() as session:
            room = await session.get(Room, room_id)
            if room is None or room.workspace_id != ws_id:
                return
            nodes = await room_screen_nodes(session, ws_id, room)
            if not nodes:
                return
            for node in nodes:
                await push_home_state_to_device(session, node, room)
            await session.commit()
    except Exception:
        logger.exception("push_home_state_to_room failed for room %s", room_id)


def push_alert_to_room_screens_background(ws_id: int, alert_id: int) -> None:
    asyncio.get_running_loop().create_task(
        push_alert_to_room_screens_for_alert(ws_id, alert_id)
    )


def push_alert_cleared_to_room_screens_background(ws_id: int, alert_id: int) -> None:
    asyncio.get_running_loop().create_task(
        push_alert_cleared_to_room_screens_for_alert(ws_id, alert_id)
    )


def push_home_state_to_room_background(ws_id: int, room_id: int) -> None:
    asyncio.get_running_loop().create_task(push_home_state_to_room(ws_id, room_id))


# ---------------------------------------------------------------------------
# Registration resync (control is not retained — resend after each registration)
# ---------------------------------------------------------------------------


async def resync_room_node(ws_id: int, device_id: str) -> None:
    """Re-push assignment (retained), current alert and home_state to a node."""
    try:
        async with AsyncSessionLocal() as session:
            q = await session.execute(
                select(Device).where(
                    Device.workspace_id == ws_id,
                    Device.device_id == device_id,
                )
            )
            device = q.scalars().first()
            if device is None:
                return
            room = await resolve_node_room(session, device)
            if room is None:
                logger.info(
                    "Room-node resync skipped for %s: no room binding", device_id
                )
                return
            await publish_assignment(session, device, room)
            alert = await current_room_fall_alert(session, ws_id, room.id)
            await push_alert_state_to_device(session, device, alert)
            await push_home_state_to_device(session, device, room)
            await session.commit()
            logger.info(
                "Room-node %s resynced: room=%s alert=%s",
                device_id,
                room.name,
                alert.id if alert else "none",
            )
    except Exception:
        logger.exception("resync_room_node failed for %s", device_id)


def resync_room_node_background(ws_id: int, device_id: str) -> None:
    asyncio.get_running_loop().create_task(resync_room_node(ws_id, device_id))


# ---------------------------------------------------------------------------
# Inbound events (node → server, WheelSense/camera/<id>/event)
# ---------------------------------------------------------------------------


async def _find_alert_by_event_id(
    session: AsyncSession, ws_id: int, event_id: str, room_id: int | None = None
) -> Alert | None:
    q = await session.execute(
        select(Alert)
        .where(
            Alert.workspace_id == ws_id,
            Alert.alert_type.in_(NODE_ALERT_TYPES),
        )
        .order_by(Alert.id.desc())
        .limit(50)
    )
    for alert in q.scalars().all():
        data = alert.data if isinstance(alert.data, dict) else {}
        if data.get("event_id") != event_id:
            continue
        if room_id is not None and data.get("room_id") != room_id:
            continue
        return alert
    return None


async def _patient_in_room(session: AsyncSession, ws_id: int, room: Room) -> int | None:
    """A patient tracked to the room (latest prediction), else roster patient."""
    q_assign = await session.execute(
        select(PatientDeviceAssignment).where(
            PatientDeviceAssignment.workspace_id == ws_id,
            PatientDeviceAssignment.is_active.is_(True),
        )
    )
    assignments = list(q_assign.scalars().all())
    if assignments:
        q_pred = await session.execute(
            select(RoomPrediction)
            .where(
                RoomPrediction.workspace_id == ws_id,
                RoomPrediction.device_id.in_([a.device_id for a in assignments]),
                RoomPrediction.predicted_room_id == room.id,
            )
            .order_by(RoomPrediction.timestamp.desc())
            .limit(1)
        )
        pred = q_pred.scalars().first()
        if pred is not None:
            for a in assignments:
                if a.device_id == pred.device_id:
                    return a.patient_id
    q_roster = await session.execute(
        select(Patient.id)
        .where(
            Patient.workspace_id == ws_id,
            Patient.room_id == room.id,
            Patient.is_active.is_(True),
        )
        .order_by(Patient.id)
        .limit(1)
    )
    return q_roster.scalar_one_or_none()


async def _event_fall_detected(
    session: AsyncSession, device: Device, room: Room | None, data: dict[str, Any]
) -> None:
    if room is None:
        logger.warning(
            "Room-node fall_detected dropped for %s: no room binding", device.device_id
        )
        return
    ws_id = device.workspace_id
    event_id = str(data.get("event_id") or "").strip()

    # Duplicate delivery (QoS1 / offline-queue replay) → re-confirm, don't recreate.
    if event_id:
        existing = await _find_alert_by_event_id(session, ws_id, event_id, room.id)
        if existing is not None:
            await push_alert_state_to_device(session, device, existing)
            await session.commit()
            return

    now = time.monotonic()
    if now - _fall_event_mono.get(device.device_id, 0.0) < FALL_EVENT_COOLDOWN_SECONDS:
        return
    _fall_event_mono[device.device_id] = now

    patient_id = await _patient_in_room(session, ws_id, room)
    source = str(data.get("source") or "edge_ai").strip() or "edge_ai"
    confidence = data.get("sitting_confidence_pct")
    alert = Alert(
        workspace_id=ws_id,
        patient_id=patient_id,
        device_id=device.device_id,
        timestamp=utcnow(),
        alert_type="fall",
        severity="critical",
        title=f"Fall Detected in {room.name}",
        description=(
            f"Room node {device.device_id} reported a fall in {room.name}"
            + (f" (sitting confidence {confidence}%)." if confidence is not None else ".")
        ),
        data={
            "room_id": room.id,
            "room_name": room.name,
            "event_id": event_id,
            "source": f"e84_{source}",
            "sitting_confidence_pct": confidence,
        },
        status="active",
    )
    session.add(alert)
    await session.flush()
    # Protocol contract: every screen in the room gets `control alert` with the
    # real alert_id — independent of the REST fan-out flag.
    for node in await room_screen_nodes(session, ws_id, room):
        await push_alert_state_to_device(session, node, alert)
    await session.commit()
    logger.warning(
        "E84 room-node FALL ALERT %s created in %s (source=%s)",
        alert.id,
        room.name,
        source,
    )
    # Standard fan-out (WheelSense/alerts/*) + room-screen alert push.
    from app.services.mqtt_publish import publish_alert_to_mqtt_background

    publish_alert_to_mqtt_background(alert)


async def _event_alert_ack(
    session: AsyncSession, device: Device, room: Room | None, data: dict[str, Any]
) -> None:
    if room is None:
        logger.warning(
            "Room-node alert_ack dropped for %s: no room binding", device.device_id
        )
        return
    ws_id = device.workspace_id
    alert: Alert | None = None

    raw_alert_id = data.get("alert_id")
    try:
        alert_id = int(raw_alert_id) if raw_alert_id is not None else 0
    except (TypeError, ValueError):
        alert_id = 0
    if alert_id:
        cand = await session.get(Alert, alert_id)
        if cand is not None and cand.workspace_id == ws_id:
            cand_room = (cand.data if isinstance(cand.data, dict) else {}).get("room_id")
            if cand_room is None or cand_room == room.id:
                alert = cand

    if alert is None:
        fall_event_id = str(data.get("fall_event_id") or "").strip()
        if fall_event_id:
            alert = await _find_alert_by_event_id(session, ws_id, fall_event_id, room.id)
    if alert is None:
        alert = await current_room_fall_alert(session, ws_id, room.id)

    if alert is not None and alert.status in ("active", "acknowledged"):
        from app.services.activity import alert_service

        await alert_service.resolve(
            session,
            ws_id=ws_id,
            alert_id=alert.id,
            resolution_note=f"Assistance completed at room node {device.device_id}",
        )
        logger.info(
            "Alert %s resolved by room node %s", alert.id, device.device_id
        )
    # Idempotent clear — covers the already-resolved and not-found cases too.
    for node in await room_screen_nodes(session, ws_id, room):
        await push_alert_state_to_device(session, node, None)
    await session.commit()


async def _event_home_command(
    session: AsyncSession, device: Device, room: Room | None, data: dict[str, Any]
) -> None:
    if room is None:
        logger.warning(
            "Room-node home_command dropped for %s: no room binding", device.device_id
        )
        return
    ws_id = device.workspace_id

    raw_sd_id = data.get("smart_device_id")
    try:
        smart_device_id = int(raw_sd_id)
    except (TypeError, ValueError):
        smart_device_id = None
    sd = await session.get(SmartDevice, smart_device_id) if smart_device_id else None

    if sd is None or sd.workspace_id != ws_id or sd.room_id != room.id:
        logger.warning(
            "Room-node home_command rejected: smart_device_id=%s not in room %s (node %s)",
            raw_sd_id,
            room.id,
            device.device_id,
        )
    else:
        from app.services.homeassistant import (
            SmartDeviceControlError,
            apply_smart_device_control,
        )
        from app.services import device_activity as device_activity_service

        action = str(data.get("action") or "").strip()
        parameters = data.get("parameters") if isinstance(data.get("parameters"), dict) else {}
        try:
            await apply_smart_device_control(
                session, sd, action=action, parameters=parameters
            )
            await device_activity_service.log_event(
                session,
                ws_id,
                "smart_controlled",
                f"Smart device “{sd.name}” controlled from room node {device.device_id}",
                smart_device_id=sd.id,
                details={"action": action, "parameters": parameters, "source": "e84_node"},
            )
        except SmartDeviceControlError as exc:
            logger.warning(
                "Room-node home_command failed for device %s: %s", sd.id, exc.detail
            )
        except Exception:
            logger.exception("Room-node home_command failed for device %s", sd.id)

    # Always answer with the confirmed state — the node reverts to it on timeout.
    for node in await room_screen_nodes(session, ws_id, room):
        await push_home_state_to_device(session, node, room)
    await session.commit()


async def handle_room_node_event(
    session: AsyncSession, device: Device, data: dict[str, Any]
) -> None:
    """Route one ``event`` message from a room screen node."""
    mark_room_screen_node(device)
    room = await resolve_node_room(session, device)
    event_type = str(data.get("type") or "").strip()
    if event_type == "fall_detected":
        await _event_fall_detected(session, device, room, data)
    elif event_type == "alert_ack":
        await _event_alert_ack(session, device, room, data)
    elif event_type == "home_command":
        await _event_home_command(session, device, room, data)
    else:
        logger.debug(
            "Unhandled room-node event type %r from %s", event_type, device.device_id
        )
