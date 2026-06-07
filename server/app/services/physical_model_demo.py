from __future__ import annotations

import time
from dataclasses import dataclass

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.care import DemoActorPosition
from app.models.core import Room, SmartDevice
from app.models.patients import Patient
from app.schemas.demo_control import (
    DemoAlertResponse,
    DemoActorOut,
    PhysicalModelDeviceControlIn,
    PhysicalModelDeviceControlOut,
    PhysicalModelDeviceSummaryOut,
    PhysicalModelLocationEventIn,
    PhysicalModelLocationEventOut,
    PhysicalModelRoomOut,
    PhysicalModelScheduleReminderIn,
    PhysicalModelScheduleReminderOut,
    PhysicalModelWorkflowReminderOut,
    PhysicalModelYoloFallEventIn,
    PhysicalModelYoloFallEventOut,
)
from app.schemas.workflow import CareDirectiveCreate, CareScheduleCreate, RoleMessageCreate
from app.services.demo_control import demo_control_service
from app.services.workflow import care_directive_service, role_message_service, schedule_service, utcnow


@dataclass(frozen=True)
class PhysicalRoomAlias:
    alias: str
    physical_zone: str
    room_names: tuple[str, ...]


PHYSICAL_MODEL_ROOM_ALIASES: tuple[PhysicalRoomAlias, ...] = (
    PhysicalRoomAlias("Bedroom", "bedroom", ("Room 401",)),
    PhysicalRoomAlias("Living Room", "living_room", ("Room 402",)),
    PhysicalRoomAlias("Bathroom", "bathroom", ("Bathroom",)),
    PhysicalRoomAlias("Kitchen / Dining", "kitchen", ("Dining Room",)),
)

DEVICE_ON_STATES = {"on", "heat", "cool", "fan_only", "dry", "auto"}
DEVICE_OFF_STATES = {"off", "unknown", "unavailable", "none", ""}
PHYSICAL_BOARD_ROOM_TOPICS = {
    "bedroom": "bedroom",
    "living_room": "livingroom",
    "bathroom": "bathroom",
    "kitchen": "kitchen",
}
YOLO_FALL_COOLDOWN_SECONDS = 30.0
_yolo_fall_cooldown: dict[str, float] = {}


def _norm(value: str | None) -> str:
    normalized = (value or "").strip().lower().replace("_", " ").replace("-", " ")
    if normalized == "livingroom":
        return "living room"
    return normalized


def _room_alias_for_name(room_name: str) -> PhysicalRoomAlias | None:
    normalized = _norm(room_name)
    for alias in PHYSICAL_MODEL_ROOM_ALIASES:
        if normalized == _norm(alias.alias):
            return alias
        if normalized == _norm(alias.physical_zone):
            return alias
        if any(normalized == _norm(name) for name in alias.room_names):
            return alias
    return None


def _room_out(room: Room, alias: PhysicalRoomAlias) -> PhysicalModelRoomOut:
    return PhysicalModelRoomOut(
        alias=alias.alias,
        physical_zone=alias.physical_zone,
        room_id=room.id,
        room_name=room.name,
    )


async def _resolve_room(
    session: AsyncSession,
    ws_id: int,
    *,
    room_alias: str | None = None,
    mapped_room_id: int | None = None,
) -> tuple[Room, PhysicalRoomAlias]:
    rooms = list(
        (
            await session.execute(
                select(Room).where(Room.workspace_id == ws_id).order_by(Room.id.asc())
            )
        )
        .scalars()
        .all()
    )
    if mapped_room_id is not None:
        for room in rooms:
            if room.id == mapped_room_id:
                alias = _room_alias_for_name(room_alias or "") or _room_alias_for_name(room.name)
                if alias is None:
                    alias = PhysicalRoomAlias(room.name, "custom", (room.name,))
                return room, alias
        raise ValueError("Mapped room not found in current workspace")

    alias = _room_alias_for_name(room_alias or "")
    if alias is None:
        raise ValueError("Unknown physical model room alias")
    accepted_names = {_norm(alias.alias), _norm(alias.physical_zone), *{_norm(name) for name in alias.room_names}}
    for room in rooms:
        if _norm(room.name) in accepted_names:
            return room, alias
    raise ValueError(f"Room for physical model alias '{alias.alias}' not found")


async def list_physical_rooms(session: AsyncSession, ws_id: int) -> list[PhysicalModelRoomOut]:
    out: list[PhysicalModelRoomOut] = []
    for alias in PHYSICAL_MODEL_ROOM_ALIASES:
        try:
            room, resolved_alias = await _resolve_room(session, ws_id, room_alias=alias.alias)
        except ValueError:
            continue
        out.append(_room_out(room, resolved_alias))
    return out


async def _current_actor_room_id(session: AsyncSession, ws_id: int, actor_type: str, actor_id: int) -> int | None:
    if actor_type == "patient":
        patient = await session.get(Patient, actor_id)
        if patient is None or patient.workspace_id != ws_id:
            raise ValueError("Patient not found in current workspace")
        return patient.room_id

    position = (
        await session.execute(
            select(DemoActorPosition).where(
                DemoActorPosition.workspace_id == ws_id,
                DemoActorPosition.actor_id == actor_id,
                or_(
                    DemoActorPosition.actor_type == "staff",
                    DemoActorPosition.actor_type == "user",
                ),
            )
        )
    ).scalar_one_or_none()
    return position.room_id if position else None


async def _room_name(session: AsyncSession, ws_id: int, room_id: int | None) -> str | None:
    if room_id is None:
        return None
    room = await session.get(Room, room_id)
    if room is None or room.workspace_id != ws_id:
        return None
    alias = _room_alias_for_name(room.name)
    return alias.alias if alias else room.name


def _patient_display_name(patient: Patient) -> str:
    return patient.nickname or f"{patient.first_name} {patient.last_name}".strip() or f"Patient #{patient.id}"


def _patient_actor(patient: Patient, room: Room | None) -> DemoActorOut:
    return DemoActorOut(
        actor_type="patient",
        actor_id=patient.id,
        display_name=_patient_display_name(patient),
        role="patient",
        room_id=patient.room_id,
        room_name=room.name if room else None,
        source="room_assignment",
        updated_at=patient.updated_at,
    )


def _patient_name_variants(patient: Patient) -> set[str]:
    return {
        _norm(patient.first_name),
        _norm(patient.last_name),
        _norm(patient.nickname),
        _norm(f"{patient.first_name} {patient.last_name}".strip()),
    }


async def _resolve_yolo_patient(
    session: AsyncSession,
    ws_id: int,
    *,
    patient_id: int | None,
    patient_name: str,
) -> Patient:
    if patient_id is not None:
        patient = await session.get(Patient, patient_id)
        if patient is None or patient.workspace_id != ws_id or not patient.is_active:
            raise ValueError("YOLO fall patient not found in current workspace")
        return patient

    target = _norm(patient_name)
    patients = list(
        (
            await session.execute(
                select(Patient)
                .where(Patient.workspace_id == ws_id, Patient.is_active.is_(True))
                .order_by(Patient.id.asc())
            )
        )
        .scalars()
        .all()
    )
    for patient in patients:
        if target in _patient_name_variants(patient):
            return patient
    for patient in patients:
        haystack = " ".join(_patient_name_variants(patient))
        if target and target in haystack:
            return patient
    raise ValueError(f"Patient '{patient_name}' not found in current workspace")


def _yolo_cooldown_key(ws_id: int, patient_id: int, physical_zone: str) -> str:
    return f"{ws_id}:{patient_id}:{physical_zone}"


def _yolo_cooldown_reason(key: str, *, force: bool) -> str | None:
    if force:
        return None
    last = _yolo_fall_cooldown.get(key)
    if last is None:
        return None
    remaining = YOLO_FALL_COOLDOWN_SECONDS - (time.monotonic() - last)
    if remaining <= 0:
        return None
    return f"YOLO fall event ignored during cooldown ({remaining:.0f}s remaining)"


def _device_summary(device: SmartDevice) -> PhysicalModelDeviceSummaryOut:
    return PhysicalModelDeviceSummaryOut(
        id=device.id,
        name=device.name,
        device_type=device.device_type,
        state=device.state or "unknown",
        room_id=device.room_id,
    )


def _looks_on(device: SmartDevice) -> bool:
    state = _norm(device.state)
    if state in DEVICE_ON_STATES:
        return True
    if state in DEVICE_OFF_STATES:
        return False
    return False


def _physical_board_appliance(device: SmartDevice) -> str:
    label = _norm(f"{device.device_type} {device.name} {device.ha_entity_id}")
    if "climate" in label or "aircon" in label or "air con" in label or " ac" in f" {label} ":
        return "AC"
    if "fan" in label:
        return "fan"
    if "tv" in label or "television" in label:
        return "tv"
    if "alarm" in label or "siren" in label:
        return "alarm"
    return "light"


async def _resolve_physical_device_room(
    session: AsyncSession,
    ws_id: int,
    payload: PhysicalModelDeviceControlIn,
) -> tuple[SmartDevice, Room, PhysicalRoomAlias]:
    device = await session.get(SmartDevice, payload.device_id)
    if device is None or device.workspace_id != ws_id:
        raise ValueError("Smart device not found in current workspace")
    if not device.is_active:
        raise ValueError("Smart device is marked inactive")
    if device.room_id is None:
        raise ValueError("Smart device is not linked to a room")

    if payload.room_alias or payload.mapped_room_id is not None:
        room, alias = await _resolve_room(
            session,
            ws_id,
            room_alias=payload.room_alias,
            mapped_room_id=payload.mapped_room_id,
        )
        if device.room_id != room.id:
            raise ValueError("Smart device is not linked to the requested physical model room")
        return device, room, alias

    room = await session.get(Room, device.room_id)
    if room is None or room.workspace_id != ws_id:
        raise ValueError("Smart device room not found in current workspace")
    alias = _room_alias_for_name(room.name)
    if alias is None:
        raise ValueError("Smart device room is not mapped to the physical model")
    return device, room, alias


async def build_physical_model_device_control(
    session: AsyncSession,
    ws_id: int,
    *,
    payload: PhysicalModelDeviceControlIn,
) -> PhysicalModelDeviceControlOut:
    device, room, alias = await _resolve_physical_device_room(session, ws_id, payload)
    board_room = PHYSICAL_BOARD_ROOM_TOPICS.get(alias.physical_zone)
    if board_room is None:
        raise ValueError("Physical model room is not supported by the board controller")
    state = payload.action in {"turn_on", "on"}
    command: dict[str, object] = {
        "type": "control",
        "room": board_room,
        "appliance": _physical_board_appliance(device),
        "state": state,
        "timestamp": utcnow().isoformat(),
    }
    if payload.value is not None:
        command["value"] = payload.value
    return PhysicalModelDeviceControlOut(
        topic=f"WheelSense/{board_room}/control",
        payload=command,
        mapped_room=_room_out(room, alias),
        device=_device_summary(device),
    )


async def _devices_requiring_reminder(
    session: AsyncSession,
    ws_id: int,
    room_id: int | None,
    *,
    force: bool,
) -> list[SmartDevice]:
    if room_id is None:
        return []
    devices = list(
        (
            await session.execute(
                select(SmartDevice)
                .where(
                    SmartDevice.workspace_id == ws_id,
                    SmartDevice.room_id == room_id,
                    SmartDevice.is_active.is_(True),
                )
                .order_by(SmartDevice.id.asc())
            )
        )
        .scalars()
        .all()
    )
    if force:
        return devices
    return [device for device in devices if _looks_on(device)]


async def _create_reminder(
    session: AsyncSession,
    ws_id: int,
    *,
    actor_user_id: int,
    title: str,
    body: str,
    patient_id: int | None = None,
    target_role: str = "head_nurse",
    schedule: bool = False,
) -> PhysicalModelWorkflowReminderOut:
    schedule_id: int | None = None
    workflow_item_type: str | None = None
    workflow_item_id: int | None = None
    if schedule:
        schedule_row = await schedule_service.create_schedule(
            session,
            ws_id=ws_id,
            actor_user_id=actor_user_id,
            obj_in=CareScheduleCreate(
                patient_id=patient_id,
                title=title,
                schedule_type="demo_reminder",
                starts_at=utcnow(),
                assigned_role=target_role,
                notes=body,
            ),
        )
        schedule_id = schedule_row.id
        workflow_item_type = "schedule"
        workflow_item_id = schedule_row.id

    directive = await care_directive_service.create_directive(
        session,
        ws_id=ws_id,
        actor_user_id=actor_user_id,
        obj_in=CareDirectiveCreate(
            patient_id=patient_id,
            target_role=target_role,
            title=title,
            directive_text=body,
        ),
    )
    if workflow_item_type is None:
        workflow_item_type = "directive"
        workflow_item_id = directive.id

    message = await role_message_service.send_message(
        session,
        ws_id=ws_id,
        sender_user_id=actor_user_id,
        obj_in=RoleMessageCreate(
            recipient_role=target_role,
            patient_id=patient_id,
            workflow_item_type=workflow_item_type,
            workflow_item_id=workflow_item_id,
            subject=title,
            body=body,
        ),
    )
    return PhysicalModelWorkflowReminderOut(
        message_id=message.id,
        directive_id=directive.id,
        schedule_id=schedule_id,
        title=title,
    )


async def apply_location_event(
    session: AsyncSession,
    ws_id: int,
    *,
    actor_user_id: int,
    event: PhysicalModelLocationEventIn,
) -> PhysicalModelLocationEventOut:
    room, alias = await _resolve_room(
        session,
        ws_id,
        room_alias=event.room_alias,
        mapped_room_id=event.mapped_room_id,
    )
    previous_room_id = await _current_actor_room_id(session, ws_id, event.actor_type, event.actor_id)
    previous_room_name = await _room_name(session, ws_id, previous_room_id)
    actor = await demo_control_service.move_actor(
        session,
        ws_id,
        actor_type=event.actor_type,
        actor_id=event.actor_id,
        room_id=room.id,
        updated_by_user_id=actor_user_id,
        note=f"{event.source} physical model event ({event.confidence:.0%})",
    )

    reminder_devices: list[SmartDevice] = []
    reminders: list[PhysicalModelWorkflowReminderOut] = []
    if previous_room_id is not None and previous_room_id != room.id:
        reminder_devices = await _devices_requiring_reminder(
            session,
            ws_id,
            previous_room_id,
            force=event.force_device_reminder,
        )
        if reminder_devices:
            device_names = ", ".join(device.name for device in reminder_devices[:4])
            title = f"Check devices left on in {previous_room_name or 'previous room'}"
            body = (
                f"Physical model detected {actor['display_name']} moved from "
                f"{previous_room_name or 'the previous room'} to {alias.alias}. "
                f"Please confirm these devices are off: {device_names}."
            )
            reminders.append(
                await _create_reminder(
                    session,
                    ws_id,
                    actor_user_id=actor_user_id,
                    title=title,
                    body=body,
                    patient_id=event.actor_id if event.actor_type == "patient" else None,
                    target_role="head_nurse",
                )
            )

    return PhysicalModelLocationEventOut(
        event=event,
        mapped_room=_room_out(room, alias),
        actor=DemoActorOut.model_validate(actor),
        previous_room_id=previous_room_id,
        previous_room_name=previous_room_name,
        previous_room_devices=[_device_summary(device) for device in reminder_devices],
        device_reminders=reminders,
    )


async def apply_yolo_fall_event(
    session: AsyncSession,
    ws_id: int,
    *,
    actor_user_id: int | None,
    event: PhysicalModelYoloFallEventIn,
) -> PhysicalModelYoloFallEventOut:
    room_selector = event.room_alias or event.physical_zone or event.room
    if room_selector is None and event.mapped_room_id is None:
        raise ValueError("YOLO fall event requires room_alias, room, physical_zone, or mapped_room_id")

    room, alias = await _resolve_room(
        session,
        ws_id,
        room_alias=room_selector,
        mapped_room_id=event.mapped_room_id,
    )
    mapped_room = _room_out(room, alias)

    if not event.detected:
        return PhysicalModelYoloFallEventOut(
            event=event,
            status="ignored",
            mapped_room=mapped_room,
            reason="YOLO event did not detect a resident",
        )

    patient = await _resolve_yolo_patient(
        session,
        ws_id,
        patient_id=event.patient_id,
        patient_name=event.patient_name,
    )
    cooldown_key = _yolo_cooldown_key(ws_id, patient.id, alias.physical_zone)
    cooldown_reason = _yolo_cooldown_reason(cooldown_key, force=event.force)
    if cooldown_reason:
        current_room = await session.get(Room, patient.room_id) if patient.room_id else None
        return PhysicalModelYoloFallEventOut(
            event=event,
            status="ignored",
            mapped_room=mapped_room,
            patient=_patient_actor(patient, current_room),
            reason=cooldown_reason,
        )

    patient_name = _patient_display_name(patient)
    actor = await demo_control_service.move_actor(
        session,
        ws_id,
        actor_type="patient",
        actor_id=patient.id,
        room_id=room.id,
        updated_by_user_id=actor_user_id,
        note=f"{event.source} YOLO fall detection ({event.confidence:.0%})",
    )
    alert = await demo_control_service.trigger_alert(
        session,
        ws_id,
        patient_id=patient.id,
        actor_user_id=actor_user_id,
        alert_type="fall",
        device_id=event.device_id,
        title=f"Physical model fall detected - {patient_name}",
        description=(
            f"YOLO physical model detected {patient_name} in {alias.alias} "
            f"({room.name}) at {event.confidence:.0%} confidence. "
            "Treat as a fall emergency for the demo."
        ),
        data={
            "source": event.source,
            "physical_model": True,
            "room_alias": alias.alias,
            "physical_zone": alias.physical_zone,
            "detection_confidence": event.confidence,
            "detection_method": event.method,
            "bbox": event.bbox,
            "frame_size": event.frame_size,
        },
    )
    if not event.force:
        _yolo_fall_cooldown[cooldown_key] = time.monotonic()
    return PhysicalModelYoloFallEventOut(
        event=event,
        status="alert_created",
        mapped_room=mapped_room,
        patient=DemoActorOut.model_validate(actor),
        alert=DemoAlertResponse.model_validate(alert),
    )


async def trigger_schedule_reminder(
    session: AsyncSession,
    ws_id: int,
    *,
    actor_user_id: int,
    payload: PhysicalModelScheduleReminderIn,
) -> PhysicalModelScheduleReminderOut:
    room_out: PhysicalModelRoomOut | None = None
    title = payload.title
    body = payload.body
    if payload.room_alias:
        room, alias = await _resolve_room(session, ws_id, room_alias=payload.room_alias)
        room_out = _room_out(room, alias)
        title = f"{payload.title} - {alias.alias}"
        body = f"{payload.body}\n\nPhysical model room: {alias.alias} ({room.name})."
    reminder = await _create_reminder(
        session,
        ws_id,
        actor_user_id=actor_user_id,
        title=title,
        body=body,
        patient_id=payload.patient_id,
        target_role=payload.target_role,
        schedule=True,
    )
    return PhysicalModelScheduleReminderOut(room=room_out, reminder=reminder)
