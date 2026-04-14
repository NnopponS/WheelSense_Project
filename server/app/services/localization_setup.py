from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.localization import (
    _device_node_aliases,
    get_localization_strategy,
    set_localization_strategy,
)
from app.models.core import Device, Room
from app.models.facility import Facility, Floor
from app.models.floorplans import FloorplanLayout
from app.models.patients import Patient, PatientDeviceAssignment
from app.models.telemetry import RSSIReading
from app.models.users import User


DEFAULT_LOCALIZATION_BASELINE = {
    "facility_name": "บ้านบางแค",
    "facility_name_aliases": ("บ้านบางแค", "บ้านอยุธยา"),
    "floor_number": 1,
    "floor_name": "ชั้น 1",
    "room_name": "Room 101",
    "room_aliases": ("Room 101", "ห้อง 101"),
    "node_aliases": ("WSN_001", "wsn_001"),
    "wheelchair_device_ids": ("WS_01", "ws_01"),
    "patient_usernames": ("somchai",),
    "patient_names": (("สมชาย", "ใจดี"),),
}


@dataclass
class _ResolvedBaseline:
    strategy: str
    facility: Facility | None
    floor: Floor | None
    room: Room | None
    node_device: Device | None
    wheelchair_device: Device | None
    patient: Patient | None
    patient_user: User | None
    active_assignment: PatientDeviceAssignment | None
    floorplan_layout: FloorplanLayout | None
    floorplan_has_room: bool
    telemetry_detected: bool


def _room_box(index: int) -> dict[str, float | str | None]:
    cols = 4
    col = index % cols
    row = index // cols
    gap = 2.0
    width = 22.0
    height = 20.0
    x = 2.0 + (width + gap) * col
    y = 2.0 + (height + gap) * row
    return {
        "x": x,
        "y": y,
        "w": width,
        "h": height,
    }


def _room_matches(room: Room, aliases: tuple[str, ...]) -> bool:
    room_name = (room.name or "").strip().lower()
    return any(room_name == alias.strip().lower() for alias in aliases)


def _layout_has_room(layout_json: dict[str, Any] | None, room: Room) -> bool:
    if not isinstance(layout_json, dict):
        return False
    room_key = f"room-{room.id}"
    room_name = (room.name or "").strip().lower()
    for item in layout_json.get("rooms", []):
        if not isinstance(item, dict):
            continue
        if str(item.get("id") or "") == room_key:
            return True
        if str(item.get("label") or "").strip().lower() == room_name:
            return True
    return False


async def _resolve_baseline(
    session: AsyncSession,
    workspace_id: int,
) -> _ResolvedBaseline:
    strategy = await get_localization_strategy(session, workspace_id)

    facilities = (
        await session.execute(
            select(Facility).where(Facility.workspace_id == workspace_id).order_by(Facility.id.asc())
        )
    ).scalars().all()
    facility_name_aliases = tuple(
        str(name).strip() for name in DEFAULT_LOCALIZATION_BASELINE.get("facility_name_aliases", ()) if str(name).strip()
    )
    facility = next(
        (
            item
            for item in facilities
            if (item.name or "").strip() in facility_name_aliases
        ),
        None,
    )
    if facility is None and facilities:
        facility = facilities[0]

    floors = (
        await session.execute(
            select(Floor).where(Floor.workspace_id == workspace_id).order_by(Floor.id.asc())
        )
    ).scalars().all()
    floor_by_id = {item.id: item for item in floors}

    floor = None
    if facility is not None:
        floors_for_facility = [item for item in floors if item.facility_id == facility.id]
        floor = next(
            (
                item
                for item in floors_for_facility
                if item.floor_number == DEFAULT_LOCALIZATION_BASELINE["floor_number"]
            ),
            None,
        )
        if floor is None and floors_for_facility:
            floor = floors_for_facility[0]

    rooms = (
        await session.execute(
            select(Room).where(Room.workspace_id == workspace_id).order_by(Room.id.asc())
        )
    ).scalars().all()
    room = next(
        (item for item in rooms if _room_matches(item, DEFAULT_LOCALIZATION_BASELINE["room_aliases"])),
        None,
    )
    if room is not None:
        room_floor = floor_by_id.get(room.floor_id)
        if room_floor is not None:
            floor = room_floor
            facility = next((item for item in facilities if item.id == room_floor.facility_id), facility)

    devices = (
        await session.execute(
            select(Device).where(Device.workspace_id == workspace_id).order_by(Device.id.asc())
        )
    ).scalars().all()
    wheelchair_device = next(
        (
            item
            for item in devices
            if (item.device_id or "").strip() in DEFAULT_LOCALIZATION_BASELINE["wheelchair_device_ids"]
        ),
        None,
    )
    node_device = next(
        (
            item
            for item in devices
            if item.hardware_type == "node"
            and any(alias in _device_node_aliases(item) for alias in DEFAULT_LOCALIZATION_BASELINE["node_aliases"])
        ),
        None,
    )

    users = (
        await session.execute(
            select(User).where(User.workspace_id == workspace_id).order_by(User.id.asc())
        )
    ).scalars().all()
    patient_user = next(
        (
            item
            for item in users
            if (item.username or "").strip().lower() in DEFAULT_LOCALIZATION_BASELINE["patient_usernames"]
        ),
        None,
    )

    patients = (
        await session.execute(
            select(Patient).where(Patient.workspace_id == workspace_id).order_by(Patient.id.asc())
        )
    ).scalars().all()
    patient = None
    if patient_user and patient_user.patient_id:
        patient = next((item for item in patients if item.id == patient_user.patient_id), None)
    if patient is None:
        patient = next(
            (
                item
                for item in patients
                if any(
                    (item.first_name or "").strip() == first_name
                    and (item.last_name or "").strip() == last_name
                    for first_name, last_name in DEFAULT_LOCALIZATION_BASELINE["patient_names"]
                )
            ),
            None,
        )
    if patient is not None and patient.room_id is not None:
        patient_room = next((item for item in rooms if item.id == patient.room_id), None)
        if patient_room is not None:
            room = patient_room
            room_floor = floor_by_id.get(patient_room.floor_id)
            if room_floor is not None:
                floor = room_floor
                facility = next((item for item in facilities if item.id == room_floor.facility_id), facility)

    active_assignment = None
    if wheelchair_device is not None:
        assignments = (
            await session.execute(
                select(PatientDeviceAssignment).where(
                    PatientDeviceAssignment.workspace_id == workspace_id,
                    PatientDeviceAssignment.device_id == wheelchair_device.device_id,
                    PatientDeviceAssignment.is_active.is_(True),
                )
            )
        ).scalars().all()
        active_assignment = next(iter(assignments), None)

    floorplan_layout = None
    floorplan_has_room = False
    if facility is not None and floor is not None:
        floorplan_layout = (
            await session.execute(
                select(FloorplanLayout).where(
                    FloorplanLayout.workspace_id == workspace_id,
                    FloorplanLayout.facility_id == facility.id,
                    FloorplanLayout.floor_id == floor.id,
                )
            )
        ).scalar_one_or_none()
        if floorplan_layout is not None and room is not None:
            floorplan_has_room = _layout_has_room(floorplan_layout.layout_json or {}, room)

    telemetry_detected = False
    if wheelchair_device is not None:
        telemetry_detected = (
            await session.execute(
                select(RSSIReading.id).where(
                    RSSIReading.workspace_id == workspace_id,
                    RSSIReading.device_id == wheelchair_device.device_id,
                )
            )
        ).first() is not None

    return _ResolvedBaseline(
        strategy=strategy,
        facility=facility,
        floor=floor,
        room=room,
        node_device=node_device,
        wheelchair_device=wheelchair_device,
        patient=patient,
        patient_user=patient_user,
        active_assignment=active_assignment,
        floorplan_layout=floorplan_layout,
        floorplan_has_room=floorplan_has_room,
        telemetry_detected=telemetry_detected,
    )


def _build_readiness_payload(resolved: _ResolvedBaseline) -> dict[str, Any]:
    missing: list[str] = []
    if resolved.wheelchair_device is None:
        missing.append("wheelchair_device")
    if resolved.node_device is None:
        missing.append("node_device")
    if resolved.patient is None:
        missing.append("patient")
    if resolved.room is None:
        missing.append("room")
    if resolved.facility is None:
        missing.append("facility")
    if resolved.floor is None:
        missing.append("floor")
    if resolved.patient is not None and resolved.room is not None and resolved.patient.room_id != resolved.room.id:
        missing.append("patient_room_assignment")
    if resolved.room is not None and resolved.node_device is not None and resolved.room.node_device_id != resolved.node_device.device_id:
        missing.append("room_node_binding")
    if resolved.patient is not None and resolved.wheelchair_device is not None:
        if resolved.active_assignment is None or resolved.active_assignment.patient_id != resolved.patient.id:
            missing.append("wheelchair_patient_assignment")
    if resolved.strategy != "max_rssi":
        missing.append("strategy")
    if resolved.room is not None and not resolved.floorplan_has_room:
        missing.append("floorplan_layout")

    patient_name = None
    if resolved.patient is not None:
        patient_name = " ".join(
            part for part in [resolved.patient.first_name, resolved.patient.last_name] if (part or "").strip()
        ).strip()

    ready = len(missing) == 0
    return {
        "ready": ready,
        "missing": missing,
        "strategy": resolved.strategy,
        "facility_id": resolved.facility.id if resolved.facility else None,
        "facility_name": resolved.facility.name if resolved.facility else None,
        "floor_id": resolved.floor.id if resolved.floor else None,
        "floor_name": resolved.floor.name if resolved.floor else None,
        "floor_number": resolved.floor.floor_number if resolved.floor else None,
        "room_id": resolved.room.id if resolved.room else None,
        "room_name": resolved.room.name if resolved.room else None,
        "room_node_device_id": resolved.room.node_device_id if resolved.room else None,
        "node_device_id": resolved.node_device.device_id if resolved.node_device else None,
        "node_display_name": resolved.node_device.display_name if resolved.node_device else None,
        "wheelchair_device_id": resolved.wheelchair_device.device_id if resolved.wheelchair_device else None,
        "patient_id": resolved.patient.id if resolved.patient else None,
        "patient_name": patient_name,
        "patient_username": resolved.patient_user.username if resolved.patient_user else None,
        "patient_room_id": resolved.patient.room_id if resolved.patient else None,
        "assignment_patient_id": resolved.active_assignment.patient_id if resolved.active_assignment else None,
        "floorplan_has_room": resolved.floorplan_has_room,
        "telemetry_detected": resolved.telemetry_detected,
    }


async def get_localization_readiness(
    session: AsyncSession,
    workspace_id: int,
) -> dict[str, Any]:
    resolved = await _resolve_baseline(session, workspace_id)
    payload = _build_readiness_payload(resolved)
    payload["workspace_id"] = workspace_id
    return payload


async def repair_localization_readiness(
    session: AsyncSession,
    workspace_id: int,
    *,
    updated_by_user_id: int | None = None,
    facility_id: int | None = None,
    floor_id: int | None = None,
    room_id: int | None = None,
) -> dict[str, Any]:
    resolved = await _resolve_baseline(session, workspace_id)
    changed: list[str] = []

    await set_localization_strategy(
        session,
        workspace_id,
        strategy="max_rssi",
        updated_by_user_id=updated_by_user_id,
    )

    selected_facility = None
    if facility_id is not None:
        selected_facility = await session.get(Facility, facility_id)
        if selected_facility is None or selected_facility.workspace_id != workspace_id:
            raise ValueError("Selected facility is not in this workspace")

    selected_floor = None
    if floor_id is not None:
        selected_floor = await session.get(Floor, floor_id)
        if selected_floor is None or selected_floor.workspace_id != workspace_id:
            raise ValueError("Selected floor is not in this workspace")
        if selected_facility is not None and selected_floor.facility_id != selected_facility.id:
            raise ValueError("Selected floor does not belong to selected facility")
        if selected_facility is None:
            selected_facility = await session.get(Facility, selected_floor.facility_id)

    selected_room = None
    if room_id is not None:
        selected_room = await session.get(Room, room_id)
        if selected_room is None or selected_room.workspace_id != workspace_id:
            raise ValueError("Selected room is not in this workspace")
        if selected_floor is not None and selected_room.floor_id != selected_floor.id:
            raise ValueError("Selected room does not belong to selected floor")
        if selected_floor is None:
            selected_floor = await session.get(Floor, selected_room.floor_id)
            if selected_floor is None:
                raise ValueError("Selected room floor was not found")
        if selected_facility is None:
            selected_facility = await session.get(Facility, selected_floor.facility_id)

    facility = selected_facility or resolved.facility
    if facility is None:
        facility = Facility(
            workspace_id=workspace_id,
            name=DEFAULT_LOCALIZATION_BASELINE["facility_name"],
            address="",
            description="Auto-created for strongest RSSI localization baseline",
            config={"auto_created_by": "localization_readiness"},
        )
        session.add(facility)
        await session.flush()
        changed.append("facility_created")

    floor = selected_floor or resolved.floor
    if floor is None:
        floor = Floor(
            workspace_id=workspace_id,
            facility_id=facility.id,
            floor_number=DEFAULT_LOCALIZATION_BASELINE["floor_number"],
            name=DEFAULT_LOCALIZATION_BASELINE["floor_name"],
            map_data={},
        )
        session.add(floor)
        await session.flush()
        changed.append("floor_created")

    room = selected_room or resolved.room
    if room is None:
        room = Room(
            workspace_id=workspace_id,
            floor_id=floor.id,
            name=DEFAULT_LOCALIZATION_BASELINE["room_name"],
            description="Auto-created for strongest RSSI localization baseline",
            room_type="bedroom",
            config={"auto_created_by": "localization_readiness"},
            adjacent_rooms=[],
        )
        session.add(room)
        await session.flush()
        changed.append("room_created")
    elif room.floor_id != floor.id:
        room.floor_id = floor.id
        changed.append("room_floor_updated")

    node_device = resolved.node_device
    if node_device is None:
        raise ValueError("Could not find node device alias WSN_001 in this workspace")

    if room.node_device_id != node_device.device_id:
        other_rooms = (
            await session.execute(
                select(Room).where(
                    Room.workspace_id == workspace_id,
                    Room.node_device_id == node_device.device_id,
                    Room.id != room.id,
                )
            )
        ).scalars().all()
        for other_room in other_rooms:
            other_room.node_device_id = None
        room.node_device_id = node_device.device_id
        changed.append("room_node_bound")

    patient = resolved.patient
    if patient is None:
        raise ValueError("Could not find patient สมชาย ใจดี / somchai in this workspace")

    if patient.room_id != room.id:
        patient.room_id = room.id
        changed.append("patient_room_bound")

    wheelchair_device = resolved.wheelchair_device
    if wheelchair_device is None:
        raise ValueError("Could not find wheelchair device WS_01 in this workspace")

    assignments = (
        await session.execute(
            select(PatientDeviceAssignment).where(
                PatientDeviceAssignment.workspace_id == workspace_id,
                PatientDeviceAssignment.device_id == wheelchair_device.device_id,
            )
        )
    ).scalars().all()
    active_assignment = next((item for item in assignments if item.is_active), None)
    if active_assignment is None:
        active_assignment = PatientDeviceAssignment(
            workspace_id=workspace_id,
            patient_id=patient.id,
            device_id=wheelchair_device.device_id,
            device_role="wheelchair_sensor",
            is_active=True,
        )
        session.add(active_assignment)
        changed.append("wheelchair_assignment_created")
    else:
        if active_assignment.patient_id != patient.id:
            active_assignment.patient_id = patient.id
            changed.append("wheelchair_assignment_retargeted")
        if not active_assignment.is_active:
            active_assignment.is_active = True
            changed.append("wheelchair_assignment_activated")

    for assignment in assignments:
        if assignment.id == active_assignment.id:
            continue
        if assignment.is_active:
            assignment.is_active = False
            changed.append("stale_wheelchair_assignment_deactivated")

    layout = resolved.floorplan_layout
    if layout is None:
        layout = FloorplanLayout(
            workspace_id=workspace_id,
            facility_id=facility.id,
            floor_id=floor.id,
            layout_json={"version": 1, "rooms": []},
        )
        session.add(layout)
        await session.flush()
        changed.append("floorplan_created")

    layout_rooms = list((layout.layout_json or {}).get("rooms", []))
    room_key = f"room-{room.id}"
    room_entry = next(
        (item for item in layout_rooms if isinstance(item, dict) and str(item.get("id") or "") == room_key),
        None,
    )
    if room_entry is None:
        room_label = (room.name or "").strip().lower()
        room_entry = next(
            (
                item
                for item in layout_rooms
                if isinstance(item, dict)
                and str(item.get("label") or "").strip().lower() == room_label
            ),
            None,
        )
        if room_entry is not None and str(room_entry.get("id") or "") != room_key:
            room_entry["id"] = room_key
            changed.append("floorplan_room_id_normalized")
    if room_entry is None:
        geometry = _room_box(len(layout_rooms))
        layout_rooms.append(
            {
                "id": room_key,
                "label": room.name,
                "x": geometry["x"],
                "y": geometry["y"],
                "w": geometry["w"],
                "h": geometry["h"],
                "device_id": None,
                "power_kw": None,
            }
        )
        layout.layout_json = {"version": 1, "rooms": layout_rooms}
        changed.append("floorplan_room_added")
    else:
        if room_entry.get("label") != room.name:
            room_entry["label"] = room.name
            layout.layout_json = {"version": 1, "rooms": layout_rooms}
            changed.append("floorplan_room_label_updated")

    await session.commit()
    payload = await get_localization_readiness(session, workspace_id)
    payload["changed"] = changed
    return payload
