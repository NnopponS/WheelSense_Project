#!/usr/bin/env python3
"""Seed a complete WheelSense demo workspace with role-ready test data.

Usage:
    python scripts/seed_demo.py
    python scripts/seed_demo.py --workspace "WheelSense Demo Workspace" --reset
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import random
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from app.core.security import get_password_hash
from app.db.session import AsyncSessionLocal
from seed_device_extras import seed_additional_sim_devices
from app.models import (
    ActivityTimeline,
    Alert,
    AuditTrailEvent,
    CareDirective,
    CareGiver,
    CareGiverPatientAccess,
    DemoActorPosition,
    HandoverNote,
    PharmacyOrder,
    PhotoRecord,
    Prescription,
    RoleMessage,
    CareSchedule,
    CareTask,
    Device,
    Facility,
    Floor,
    FloorplanLayout,
    Patient,
    PatientDeviceAssignment,
    Room,
    SmartDevice,
    Specialist,
    User,
    VitalReading,
    Workspace,
)


SEED = 4242
DEMO_PASSWORD = "demo1234"
DEMO_WORKSPACE = "WheelSense Demo Workspace"
DEMO_PATIENT_COUNT = 5
DEMO_ROOM_NODE_COUNT = 5

THAI_ROOMS: list[dict[str, str]] = [
    {"name": "ห้องพักผู้ป่วย 1", "type": "bedroom"},
    {"name": "ห้องพักผู้ป่วย 2", "type": "bedroom"},
    {"name": "ห้องพักผู้ป่วย 3", "type": "bedroom"},
    {"name": "ห้องพักผู้ป่วย 4", "type": "bedroom"},
    {"name": "ห้องพักผู้ป่วย 5", "type": "bedroom"},
    {"name": "ห้องพักผู้ป่วย 6", "type": "bedroom"},
    {"name": "ห้องพักผู้ป่วย 7", "type": "bedroom"},
    {"name": "ห้องพักผู้ป่วย 8", "type": "bedroom"},
    {"name": "ห้องพักผู้ป่วย 9", "type": "bedroom"},
    {"name": "ห้องพักผู้ป่วย 10", "type": "bedroom"},
    {"name": "ห้องน้ำรวม", "type": "bathroom"},
    {"name": "ห้องอาหาร", "type": "dining"},
    {"name": "ลานกิจกรรม", "type": "activity"},
    {"name": "สวนหย่อมพักผ่อน", "type": "garden"},
    {"name": "ห้องพยาบาล", "type": "clinic"},
]

THAI_PATIENTS: list[dict] = [
    {
        "first_name": "บุญมี",
        "last_name": "มีสุข",
        "nickname": "ตาบุญ",
        "gender": "male",
        "date_of_birth": date(1945, 5, 12),
        "medical_conditions": [{"condition": "โรคอัลไซเมอร์", "severity": "สูง"}],
        "care_level": "special",
        "mobility_type": "wheelchair",
    },
    {
        "first_name": "สมปอง",
        "last_name": "ใจดี",
        "nickname": "ยายปอง",
        "gender": "female",
        "date_of_birth": date(1950, 8, 20),
        "medical_conditions": [{"condition": "เบาหวาน", "severity": "สูง"}],
        "care_level": "normal",
        "mobility_type": "walker",
    },
    {
        "first_name": "ประเสริฐ",
        "last_name": "มั่งคั่ง",
        "nickname": "ตาเสริฐ",
        "gender": "male",
        "date_of_birth": date(1942, 2, 10),
        "medical_conditions": [{"condition": "อัมพฤกษ์ครึ่งซีก", "severity": "สูง"}],
        "care_level": "critical",
        "mobility_type": "wheelchair",
    },
    {
        "first_name": "มาลี",
        "last_name": "รักสงบ",
        "nickname": "ยายลี",
        "gender": "female",
        "date_of_birth": date(1955, 11, 4),
        "medical_conditions": [{"condition": "โรคหัวใจ", "severity": "ปานกลาง"}],
        "care_level": "normal",
        "mobility_type": "independent",
    },
    {
        "first_name": "วิชัย",
        "last_name": "กล้าหาญ",
        "nickname": "ตาวิชัย",
        "gender": "male",
        "date_of_birth": date(1948, 1, 15),
        "medical_conditions": [{"condition": "พาร์กินสัน", "severity": "สูง"}],
        "care_level": "special",
        "mobility_type": "wheelchair",
    },
    {
        "first_name": "นภา",
        "last_name": "สวยงาม",
        "nickname": "ยายนภา",
        "gender": "female",
        "date_of_birth": date(1952, 7, 22),
        "medical_conditions": [{"condition": "กระดูกพรุน", "severity": "ปานกลาง"}],
        "care_level": "normal",
        "mobility_type": "walker",
    },
    {
        "first_name": "สมศักดิ์",
        "last_name": "มั่นคง",
        "nickname": "ตาศักดิ์",
        "gender": "male",
        "date_of_birth": date(1940, 9, 30),
        "medical_conditions": [{"condition": "โรคไตเรื้อรัง", "severity": "สูง"}],
        "care_level": "critical",
        "mobility_type": "wheelchair",
    },
    {
        "first_name": "จันทร์เพ็ญ",
        "last_name": "แสงจันทร์",
        "nickname": "ยายเพ็ญ",
        "gender": "female",
        "date_of_birth": date(1947, 4, 18),
        "medical_conditions": [{"condition": "ต้อกระจก", "severity": "ต่ำ"}],
        "care_level": "normal",
        "mobility_type": "independent",
    },
    {
        "first_name": "ทองดี",
        "last_name": "มีเงิน",
        "nickname": "ตาทอง",
        "gender": "male",
        "date_of_birth": date(1938, 12, 5),
        "medical_conditions": [{"condition": "หอบหืด", "severity": "ปานกลาง"}],
        "care_level": "special",
        "mobility_type": "wheelchair",
    },
    {
        "first_name": "ศรีสุดา",
        "last_name": "ใจผ่อง",
        "nickname": "ยายศรี",
        "gender": "female",
        "date_of_birth": date(1954, 3, 27),
        "medical_conditions": [],
        "care_level": "normal",
        "mobility_type": "independent",
    },
]


@dataclass
class SeedContext:
    workspace: Workspace
    facility: Facility
    floors: list[Floor]
    rooms: list[Room]
    caregivers_by_role: dict[str, CareGiver]
    users_by_role: dict[str, User]
    patients: list[Patient]
    devices: list[Device]


async def ensure_workspace(
    session: AsyncSession, workspace_name: str, reset: bool
) -> Workspace:
    result = await session.execute(
        select(Workspace).where(Workspace.name == workspace_name)
    )
    ws = result.scalar_one_or_none()
    if ws and reset:
        await session.delete(ws)
        await session.commit()
        ws = None

    if ws is None:
        ws = Workspace(name=workspace_name, mode="simulation", is_active=False)
        session.add(ws)
        await session.commit()
        await session.refresh(ws)
    return ws


async def clear_workspace_event_data(session: AsyncSession, workspace_id: int) -> None:
    for model in (
        PharmacyOrder,
        Prescription,
        Specialist,
        PhotoRecord,
        RoleMessage,
        HandoverNote,
        AuditTrailEvent,
        CareTask,
        CareSchedule,
        CareDirective,
        DemoActorPosition,
        Alert,
        ActivityTimeline,
        VitalReading,
        SmartDevice,
    ):
        await session.execute(delete(model).where(model.workspace_id == workspace_id))
    await session.commit()


async def seed_facility(session: AsyncSession, workspace_id: int) -> tuple[Facility, list[Floor]]:
    result = await session.execute(
        select(Facility).where(
            Facility.workspace_id == workspace_id,
            Facility.name == "บ้านบางแค - โรงพยาบาลสาขา",
        )
    )
    facility = result.scalar_one_or_none()
    if facility is None:
        facility = Facility(
            workspace_id=workspace_id,
            name="บ้านบางแค - โรงพยาบาลสาขา",
            address="กรุงเทพมหานคร",
            description="Demo facility for Phase 12 role walkthroughs",
            config={},
        )
        session.add(facility)
        await session.flush()

    floors: list[Floor] = []
    for floor_number, floor_name in ((1, "ชั้น 1"), (2, "ชั้น 2")):
        q = await session.execute(
            select(Floor).where(
                Floor.workspace_id == workspace_id,
                Floor.facility_id == facility.id,
                Floor.floor_number == floor_number,
            )
        )
        floor = q.scalar_one_or_none()
        if floor is None:
            floor = Floor(
                workspace_id=workspace_id,
                facility_id=facility.id,
                floor_number=floor_number,
                name=floor_name,
                map_data={},
            )
            session.add(floor)
            await session.flush()
        floors.append(floor)

    await session.commit()
    return facility, floors


async def seed_rooms(
    session: AsyncSession, workspace_id: int, floors: list[Floor]
) -> list[Room]:
    rooms: list[Room] = []
    floor1, floor2 = floors
    for idx, row in enumerate(THAI_ROOMS):
        floor_id = floor1.id if idx < 8 else floor2.id
        q = await session.execute(
            select(Room).where(Room.workspace_id == workspace_id, Room.name == row["name"])
        )
        room = q.scalar_one_or_none()
        if room is None:
            room = Room(
                workspace_id=workspace_id,
                floor_id=floor_id,
                name=row["name"],
                description="",
                room_type=row["type"],
                config={},
                adjacent_rooms=[],
            )
            session.add(room)
        else:
            room.floor_id = floor_id
            room.room_type = row["type"]
        await session.flush()
        rooms.append(room)
    await session.commit()
    return rooms


def _layout_room_geometry(index: int) -> tuple[float, float, float, float]:
    """Return deterministic room box geometry (percent-based) for demo layouts."""
    cols = 4
    col = index % cols
    row = index // cols
    gap = 2.0
    w = 22.0
    h = 20.0
    x = 2.0 + (w + gap) * col
    y = 2.0 + (h + gap) * row
    return x, y, w, h


async def seed_floorplan_layouts(
    session: AsyncSession,
    workspace_id: int,
    facility: Facility,
    floors: list[Floor],
    rooms: list[Room],
) -> None:
    """Ensure each seeded floor has interactive floorplan JSON."""
    for floor in floors:
        floor_rooms = [room for room in rooms if room.floor_id == floor.id]
        layout_rooms = []
        for idx, room in enumerate(floor_rooms):
            x, y, w, h = _layout_room_geometry(idx)
            layout_rooms.append(
                {
                    "id": f"room-{room.id}",
                    "label": room.name,
                    "x": x,
                    "y": y,
                    "w": w,
                    "h": h,
                    "device_id": None,
                    "power_kw": None,
                }
            )

        payload = {"version": 1, "rooms": layout_rooms}
        q = await session.execute(
            select(FloorplanLayout).where(
                FloorplanLayout.workspace_id == workspace_id,
                FloorplanLayout.facility_id == facility.id,
                FloorplanLayout.floor_id == floor.id,
            )
        )
        row = q.scalar_one_or_none()
        if row is None:
            row = FloorplanLayout(
                workspace_id=workspace_id,
                facility_id=facility.id,
                floor_id=floor.id,
                layout_json=payload,
            )
            session.add(row)
        else:
            row.layout_json = payload
    await session.commit()


async def seed_room_node_mappings(
    session: AsyncSession,
    workspace_id: int,
    rooms: list[Room],
) -> int:
    """Bind a subset of rooms to demo node devices for monitoring/presence workflows."""
    node_ids = [f"SIM_NODE_{idx:02d}" for idx in range(1, DEMO_ROOM_NODE_COUNT + 1)]
    mapped = 0
    for idx, node_id in enumerate(node_ids):
        if idx >= len(rooms):
            break
        room = rooms[idx]

        dq = await session.execute(
            select(Device).where(
                Device.workspace_id == workspace_id,
                Device.device_id == node_id,
            )
        )
        device = dq.scalar_one_or_none()
        if device is None:
            device = Device(
                workspace_id=workspace_id,
                device_id=node_id,
                device_type="camera",
                hardware_type="node",
                display_name=f"Demo Node {idx + 1:02d}",
                ip_address="",
                firmware="sim-node-v1",
                config={"seed": True},
            )
            session.add(device)
            await session.flush()

        # Keep 1:1 room-node mapping deterministic within the workspace.
        await session.execute(
            update(Room)
            .where(Room.workspace_id == workspace_id, Room.node_device_id == node_id)
            .values(node_device_id=None)
        )
        room.node_device_id = node_id
        mapped += 1

    await session.commit()
    return mapped


async def seed_smart_devices(
    session: AsyncSession,
    workspace_id: int,
    rooms: list[Room],
) -> int:
    """Seed deterministic smart-home entities per workspace/room."""
    seeded = 0
    specs = [
        ("Bedside Light 1", "light", "off", 0),
        ("Bedside Fan 1", "fan", "off", 0),
        ("Bedside Light 2", "light", "on", 1),
        ("Nurse Station Switch", "switch", "off", 10),
        ("Dining AC", "climate", "cool", 11),
        ("Garden Light", "light", "off", 13),
    ]
    for name, device_type, state, room_idx in specs:
        if room_idx >= len(rooms):
            continue
        room = rooms[room_idx]
        entity = f"{device_type}.ws{workspace_id}_room{room.id}_{name.lower().replace(' ', '_')}"
        q = await session.execute(
            select(SmartDevice).where(
                SmartDevice.workspace_id == workspace_id,
                SmartDevice.ha_entity_id == entity,
            )
        )
        row = q.scalar_one_or_none()
        if row is None:
            row = SmartDevice(
                workspace_id=workspace_id,
                room_id=room.id,
                name=name,
                ha_entity_id=entity,
                device_type=device_type,
                is_active=True,
                state=state,
                config={"seed": True, "room_name": room.name},
            )
            session.add(row)
        else:
            row.room_id = room.id
            row.name = name
            row.device_type = device_type
            row.is_active = True
            row.state = state
            row.config = {"seed": True, "room_name": room.name}
        seeded += 1

    await session.commit()
    return seeded


async def seed_caregivers_and_users(
    session: AsyncSession, workspace_id: int
) -> tuple[dict[str, CareGiver], dict[str, User]]:
    users_cfg = [
        ("admin", "demo_admin", "Demo", "Admin"),
        ("head_nurse", "demo_headnurse", "ศิริพร", "หัวหน้าวอร์ด"),
        ("supervisor", "demo_supervisor", "มานะ", "เวชกิจ"),
        ("observer", "demo_observer", "สุดา", "ใจดี"),
        ("observer", "demo_observer2", "วิมล", "รักษ์ไทย"),
    ]
    hashed = get_password_hash(DEMO_PASSWORD)
    profile_by_username = {
        "demo_admin": {
            "employee_code": "AD-001",
            "department": "Operations",
            "employment_type": "full_time",
            "specialty": "platform_admin",
            "license_number": "TH-OPS-90001",
            "phone": "081-100-1000",
            "email": "admin.demo@wheelsense.local",
            "emergency_contact_name": "Demo Systems",
            "emergency_contact_phone": "081-900-1000",
            "photo_url": "https://images.wheelsense.local/staff/admin-01.jpg",
        },
        "demo_headnurse": {
            "employee_code": "HN-001",
            "department": "Nursing",
            "employment_type": "full_time",
            "specialty": "geriatric_care",
            "license_number": "TH-RN-88001",
            "phone": "081-100-1001",
            "email": "headnurse.demo@wheelsense.local",
            "emergency_contact_name": "Somkorn Ward",
            "emergency_contact_phone": "081-900-1001",
            "photo_url": "https://images.wheelsense.local/staff/head-nurse-01.jpg",
        },
        "demo_supervisor": {
            "employee_code": "SV-001",
            "department": "Care Operations",
            "employment_type": "full_time",
            "specialty": "fall_response",
            "license_number": "TH-SV-24001",
            "phone": "081-100-1002",
            "email": "supervisor.demo@wheelsense.local",
            "emergency_contact_name": "Malinee Vejkit",
            "emergency_contact_phone": "081-900-1002",
            "photo_url": "https://images.wheelsense.local/staff/supervisor-01.jpg",
        },
        "demo_observer": {
            "employee_code": "OB-001",
            "department": "Nursing",
            "employment_type": "full_time",
            "specialty": "night_watch",
            "license_number": "TH-NA-55001",
            "phone": "081-100-1003",
            "email": "observer1.demo@wheelsense.local",
            "emergency_contact_name": "Thongbai Jaidee",
            "emergency_contact_phone": "081-900-1003",
            "photo_url": "https://images.wheelsense.local/staff/observer-01.jpg",
        },
        "demo_observer2": {
            "employee_code": "OB-002",
            "department": "Nursing",
            "employment_type": "part_time",
            "specialty": "mobility_support",
            "license_number": "TH-NA-55002",
            "phone": "081-100-1004",
            "email": "observer2.demo@wheelsense.local",
            "emergency_contact_name": "Prasert Rukthai",
            "emergency_contact_phone": "081-900-1004",
            "photo_url": "https://images.wheelsense.local/staff/observer-02.jpg",
        },
    }

    caregivers_by_role: dict[str, CareGiver] = {}
    users_by_role: dict[str, User] = {}

    for role, username, first_name, last_name in users_cfg:
        profile = profile_by_username[username]
        cq = await session.execute(
            select(CareGiver).where(
                CareGiver.workspace_id == workspace_id,
                CareGiver.first_name == first_name,
                CareGiver.last_name == last_name,
            )
        )
        caregiver = cq.scalar_one_or_none()
        if caregiver is None:
            caregiver = CareGiver(
                workspace_id=workspace_id,
                first_name=first_name,
                last_name=last_name,
                role=role,
                employee_code=profile["employee_code"],
                department=profile["department"],
                employment_type=profile["employment_type"],
                specialty=profile["specialty"],
                license_number=profile["license_number"],
                is_active=True,
                phone=profile["phone"],
                email=profile["email"],
                emergency_contact_name=profile["emergency_contact_name"],
                emergency_contact_phone=profile["emergency_contact_phone"],
                photo_url=profile["photo_url"],
            )
            session.add(caregiver)
            await session.flush()
        else:
            caregiver.role = role
            caregiver.employee_code = profile["employee_code"]
            caregiver.department = profile["department"]
            caregiver.employment_type = profile["employment_type"]
            caregiver.specialty = profile["specialty"]
            caregiver.license_number = profile["license_number"]
            caregiver.phone = profile["phone"]
            caregiver.email = profile["email"]
            caregiver.emergency_contact_name = profile["emergency_contact_name"]
            caregiver.emergency_contact_phone = profile["emergency_contact_phone"]
            caregiver.photo_url = profile["photo_url"]
            caregiver.is_active = True

        uq = await session.execute(select(User).where(User.username == username))
        user = uq.scalar_one_or_none()
        if user is None:
            user = User(
                workspace_id=workspace_id,
                username=username,
                hashed_password=hashed,
                role=role,
                caregiver_id=caregiver.id,
                is_active=True,
            )
            session.add(user)
        else:
            if user.workspace_id != workspace_id:
                raise RuntimeError(
                    f"Username '{username}' already belongs to workspace_id={user.workspace_id}. "
                    "Use a different workspace name or cleanup the old demo workspace."
                )
            user.role = role
            user.caregiver_id = caregiver.id
            user.is_active = True
            user.hashed_password = hashed
        await session.flush()
        # Keep a single canonical mapping for each role.
        users_by_role.setdefault(role, user)
        caregivers_by_role.setdefault(role, caregiver)
        users_by_role[username] = user
        caregivers_by_role[username] = caregiver

    await session.commit()
    return caregivers_by_role, users_by_role


async def seed_patients_and_devices(
    session: AsyncSession, workspace_id: int, rooms: list[Room]
) -> tuple[list[Patient], list[Device]]:
    patients: list[Patient] = []
    devices: list[Device] = []

    bedroom_rooms = [r for r in rooms if r.room_type == "bedroom"][:DEMO_PATIENT_COUNT]

    for i, payload in enumerate(THAI_PATIENTS[:DEMO_PATIENT_COUNT]):
        room = bedroom_rooms[i % len(bedroom_rooms)] if bedroom_rooms else None
        q = await session.execute(
            select(Patient).where(
                Patient.workspace_id == workspace_id,
                Patient.first_name == payload["first_name"],
                Patient.last_name == payload["last_name"],
            )
        )
        patient = q.scalar_one_or_none()
        if patient is None:
            patient = Patient(workspace_id=workspace_id, room_id=room.id if room else None, **payload)
            session.add(patient)
        else:
            patient.room_id = room.id if room else None
        await session.flush()
        patients.append(patient)

        device_id = f"SIM_WHEEL_{i + 1:02d}"
        dq = await session.execute(
            select(Device).where(Device.workspace_id == workspace_id, Device.device_id == device_id)
        )
        device = dq.scalar_one_or_none()
        if device is None:
            device = Device(
                workspace_id=workspace_id,
                device_id=device_id,
                device_type="wheelchair",
                hardware_type="wheelchair",
                display_name=f"Wheelchair {i + 1:02d}",
                ip_address="",
                firmware="sim-v1",
                config={},
            )
            session.add(device)
        await session.flush()
        devices.append(device)

        aq = await session.execute(
            select(PatientDeviceAssignment).where(
                PatientDeviceAssignment.workspace_id == workspace_id,
                PatientDeviceAssignment.device_id == device_id,
                PatientDeviceAssignment.is_active.is_(True),
            )
        )
        assign = aq.scalar_one_or_none()
        if assign is None:
            assign = PatientDeviceAssignment(
                workspace_id=workspace_id,
                patient_id=patient.id,
                device_id=device_id,
                device_role="wheelchair_sensor",
                is_active=True,
            )
            session.add(assign)
        else:
            assign.patient_id = patient.id
            assign.device_role = "wheelchair_sensor"
            assign.is_active = True

    await session.commit()
    return patients, devices


async def seed_patient_user(
    session: AsyncSession, workspace_id: int, patient: Patient
) -> User:
    hashed = get_password_hash(DEMO_PASSWORD)
    q = await session.execute(select(User).where(User.username == "demo_patient"))
    user = q.scalar_one_or_none()
    if user is None:
        user = User(
            workspace_id=workspace_id,
            username="demo_patient",
            hashed_password=hashed,
            role="patient",
            patient_id=patient.id,
            is_active=True,
        )
        session.add(user)
    else:
        if user.workspace_id != workspace_id:
            raise RuntimeError(
                f"Username 'demo_patient' already belongs to workspace_id={user.workspace_id}. "
                "Use a different workspace name or cleanup the old demo workspace."
            )
        user.role = "patient"
        user.patient_id = patient.id
        user.is_active = True
        user.hashed_password = hashed
    await session.commit()
    await session.refresh(user)
    return user


async def seed_demo_actor_positions(
    session: AsyncSession,
    workspace_id: int,
    users_by_role: dict[str, User],
    patients: list[Patient],
) -> int:
    seed_positions = [
        ("demo_admin", patients[3].room_id if len(patients) > 3 else patients[0].room_id),
        ("demo_headnurse", patients[0].room_id),
        ("demo_supervisor", patients[1].room_id if len(patients) > 1 else patients[0].room_id),
        ("demo_observer", patients[0].room_id),
        ("demo_observer2", patients[2].room_id if len(patients) > 2 else patients[0].room_id),
    ]
    count = 0
    for username, room_id in seed_positions:
        user = users_by_role.get(username)
        if user is None or room_id is None:
            continue
        row = (
            await session.execute(
                select(DemoActorPosition).where(
                    DemoActorPosition.workspace_id == workspace_id,
                    DemoActorPosition.actor_type == "staff",
                    DemoActorPosition.actor_id == user.id,
                )
            )
        ).scalar_one_or_none()
        if row is None:
            row = DemoActorPosition(
                workspace_id=workspace_id,
                actor_type="staff",
                actor_id=user.id,
                room_id=room_id,
                source="seed",
                note="show-demo seeded room presence",
                updated_by_user_id=users_by_role["demo_admin"].id,
            )
            session.add(row)
        else:
            row.room_id = room_id
            row.source = "seed"
            row.note = "show-demo seeded room presence"
            row.updated_by_user_id = users_by_role["demo_admin"].id
        count += 1
    await session.commit()
    return count


def _demo_photo_bytes() -> bytes:
    return base64.b64decode(
        "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBAQEA8PEA8PDw8PDw8PDw8PDw8PFREWFhUR"
        "FRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMsNygtLisBCgoKDg0OGxAQGi0fHyUtLS0tLS0tLS0tLS0t"
        "LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAXAAADAQAA"
        "AAAAAAAAAAAAAAABAgME/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEAMQAAAB6gD/xAAZEAEA"
        "AgMAAAAAAAAAAAAAAAABABEhMUH/2gAIAQEAAT8AqY1b1//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAI"
        "AQIBAT8AIP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8AIP/Z"
    )


async def seed_photo_snapshots(
    session: AsyncSession,
    workspace_id: int,
    rooms: list[Room],
) -> int:
    photo_root = ROOT / "storage" / "demo-photos" / f"workspace-{workspace_id}"
    photo_root.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)
    count = 0
    for idx, room in enumerate(rooms[:DEMO_ROOM_NODE_COUNT]):
        if not room.node_device_id:
            continue
        photo_id = f"seed_ws{workspace_id}_room{room.id}"
        filepath = photo_root / f"{photo_id}.jpg"
        filepath.write_bytes(_demo_photo_bytes())
        row = (
            await session.execute(
                select(PhotoRecord).where(
                    PhotoRecord.workspace_id == workspace_id,
                    PhotoRecord.photo_id == photo_id,
                )
            )
        ).scalar_one_or_none()
        if row is None:
            row = PhotoRecord(
                workspace_id=workspace_id,
                device_id=room.node_device_id,
                photo_id=photo_id,
                filepath=str(filepath),
                file_size=filepath.stat().st_size,
                timestamp=now - timedelta(minutes=idx * 3),
            )
            session.add(row)
        else:
            row.device_id = room.node_device_id
            row.filepath = str(filepath)
            row.file_size = filepath.stat().st_size
            row.timestamp = now - timedelta(minutes=idx * 3)
        count += 1
    await session.commit()
    return count


async def seed_vitals(
    session: AsyncSession, workspace_id: int, patients: list[Patient], devices: list[Device]
) -> int:
    rng = random.Random(SEED)
    now = datetime.now(timezone.utc)
    count = 0
    for p_idx, patient in enumerate(patients):
        device_id = devices[p_idx].device_id
        for j in range(5):
            ts = now - timedelta(days=(j % 7), hours=(p_idx + j) % 24, minutes=15 * j)
            row = VitalReading(
                workspace_id=workspace_id,
                patient_id=patient.id,
                device_id=device_id,
                timestamp=ts,
                heart_rate_bpm=rng.randint(60, 100),
                rr_interval_ms=float(rng.randint(600, 1050)),
                spo2=rng.randint(95, 100),
                skin_temperature=round(rng.uniform(36.1, 37.3), 1),
                sensor_battery=rng.randint(55, 100),
                # Same source tag as M5 Polar BLE relay so admin Vitals "Polar / Sense" filter matches demo rows.
                source="ble",
            )
            session.add(row)
            count += 1
    await session.commit()
    return count


async def seed_activity_timeline(
    session: AsyncSession, workspace_id: int, patients: list[Patient], rooms: list[Room]
) -> int:
    rng = random.Random(SEED + 1)
    now = datetime.now(timezone.utc)
    events = ("room_enter", "observation", "medication", "fall_detected")
    count = 0
    for patient in patients:
        for j in range(8):
            room = rooms[(patient.id + j) % len(rooms)]
            evt = events[j % len(events)]
            row = ActivityTimeline(
                workspace_id=workspace_id,
                patient_id=patient.id,
                timestamp=now - timedelta(hours=j * 3 + rng.randint(0, 2)),
                event_type=evt,
                room_id=room.id,
                room_name=room.name,
                description=f"{evt} generated for demo walkthrough",
                data={"seed": True, "index": j},
                source="system",
            )
            session.add(row)
            count += 1
    await session.commit()
    return count


async def seed_alerts(
    session: AsyncSession,
    workspace_id: int,
    patients: list[Patient],
    caregivers_by_role: dict[str, CareGiver],
    devices: list[Device],
) -> int:
    now = datetime.now(timezone.utc)
    observer_primary = caregivers_by_role.get("demo_observer") or caregivers_by_role.get("observer")
    observer_secondary = caregivers_by_role.get("demo_observer2") or observer_primary
    statuses = (
        ("active", None),
        ("active", None),
        ("active", None),
        ("acknowledged", caregivers_by_role.get("head_nurse")),
        ("acknowledged", caregivers_by_role.get("supervisor")),
        ("acknowledged", observer_primary),
        ("acknowledged", observer_secondary),
        ("resolved", caregivers_by_role.get("head_nurse")),
        ("resolved", caregivers_by_role.get("supervisor")),
        ("resolved", observer_secondary),
    )
    severities = ("critical", "warning", "warning", "critical", "warning", "info")
    count = 0
    for i in range(10):
        patient = patients[i % len(patients)]
        status, caregiver = statuses[i]
        ts = now - timedelta(hours=i * 2)
        resolved_at = ts + timedelta(hours=2) if status == "resolved" else None
        acknowledged_at = ts + timedelta(minutes=20) if status in ("acknowledged", "resolved") else None
        row = Alert(
            workspace_id=workspace_id,
            patient_id=patient.id,
            device_id=devices[i % len(devices)].device_id,
            timestamp=ts,
            alert_type="fall" if i % 3 == 0 else "abnormal_hr",
            severity=severities[i % len(severities)],
            title=f"Demo Alert #{i + 1}",
            description="Seeded alert for role walkthrough and triage testing",
            data={"seed": True, "sequence": i + 1},
            status=status,
            acknowledged_by=caregiver.id if caregiver and acknowledged_at else None,
            acknowledged_at=acknowledged_at,
            resolved_at=resolved_at,
            resolution_note="Resolved by demo workflow" if resolved_at else "",
        )
        session.add(row)
        count += 1
    await session.commit()
    return count


async def seed_workflow(
    session: AsyncSession,
    workspace_id: int,
    users_by_role: dict[str, User],
    patients: list[Patient],
    rooms: list[Room],
) -> tuple[int, int, int]:
    now = datetime.now(timezone.utc)
    schedule_count = 0
    task_count = 0
    directive_count = 0

    supervisor = users_by_role["supervisor"]
    head_nurse = users_by_role["head_nurse"]
    observers = [
        users_by_role.get("demo_observer") or users_by_role["observer"],
        users_by_role.get("demo_observer2") or users_by_role["observer"],
    ]

    for i in range(5):
        patient = patients[i]
        observer = observers[i % len(observers)]
        schedule = CareSchedule(
            workspace_id=workspace_id,
            patient_id=patient.id,
            room_id=rooms[i % len(rooms)].id,
            title=f"Medication Round #{i + 1}",
            schedule_type="medication",
            starts_at=now + timedelta(hours=i),
            ends_at=now + timedelta(hours=i + 1),
            recurrence_rule="FREQ=DAILY",
            assigned_role="observer",
            assigned_user_id=observer.id,
            notes="Demo schedule",
            status="scheduled",
            created_by_user_id=head_nurse.id,
        )
        session.add(schedule)
        await session.flush()
        schedule_count += 1

        task = CareTask(
            workspace_id=workspace_id,
            schedule_id=schedule.id,
            patient_id=patient.id,
            title=f"Check vitals #{i + 1}",
            description="Review latest vital trend before medication.",
            priority="high" if i % 2 == 0 else "normal",
            due_at=now + timedelta(hours=i + 2),
            status="pending",
            assigned_role="observer",
            assigned_user_id=observer.id,
            created_by_user_id=head_nurse.id,
        )
        session.add(task)
        task_count += 1

    for i in range(3):
        patient = patients[i]
        observer = observers[i % len(observers)]
        directive = CareDirective(
            workspace_id=workspace_id,
            patient_id=patient.id,
            issued_by_user_id=supervisor.id,
            target_role="observer",
            target_user_id=observer.id,
            title=f"Directive #{i + 1}",
            directive_text="Observe posture and update notes every 2 hours.",
            status="active",
            effective_from=now - timedelta(hours=i),
            effective_until=now + timedelta(days=1),
        )
        session.add(directive)
        directive_count += 1

    await session.commit()
    return schedule_count, task_count, directive_count


async def seed_messages_and_handovers(
    session: AsyncSession,
    workspace_id: int,
    users_by_role: dict[str, User],
    patients: list[Patient],
) -> tuple[int, int]:
    """Seed role messaging inboxes and handover notes for operational routes."""
    now = datetime.now(timezone.utc)
    head_nurse = users_by_role["head_nurse"]
    supervisor = users_by_role["supervisor"]
    observer = users_by_role.get("demo_observer") or users_by_role["observer"]
    observer_two = users_by_role.get("demo_observer2") or observer

    message_count = 0
    handover_count = 0

    message_specs: list[dict[str, object]] = [
        {
            "sender_user_id": head_nurse.id,
            "recipient_role": "observer",
            "recipient_user_id": None,
            "subject": "Shift kickoff",
            "body": "Start morning checks and escalate any warning vitals.",
            "patient_id": patients[0].id,
            "is_read": True,
        },
        {
            "sender_user_id": observer.id,
            "recipient_role": "head_nurse",
            "recipient_user_id": head_nurse.id,
            "subject": "Room follow-up",
            "body": "Patient requested posture adjustment after medication round.",
            "patient_id": patients[1].id,
            "is_read": False,
        },
        {
            "sender_user_id": supervisor.id,
            "recipient_role": "head_nurse",
            "recipient_user_id": head_nurse.id,
            "subject": "Directive context",
            "body": "Keep observer cadence at two-hour intervals for mobility risk patients.",
            "patient_id": patients[2].id,
            "is_read": False,
        },
        {
            "sender_user_id": observer_two.id,
            "recipient_role": "supervisor",
            "recipient_user_id": supervisor.id,
            "subject": "Escalation ready",
            "body": "Second observer has taken over rounds on the east wing.",
            "patient_id": patients[3].id,
            "is_read": False,
        },
    ]

    for idx, spec in enumerate(message_specs):
        row = RoleMessage(
            workspace_id=workspace_id,
            sender_user_id=int(spec["sender_user_id"]),
            recipient_role=spec["recipient_role"],  # type: ignore[arg-type]
            recipient_user_id=spec["recipient_user_id"],  # type: ignore[arg-type]
            patient_id=int(spec["patient_id"]),
            subject=str(spec["subject"]),
            body=str(spec["body"]),
            is_read=bool(spec["is_read"]),
            created_at=now - timedelta(hours=idx + 1),
        )
        if row.is_read:
            row.read_at = row.created_at + timedelta(minutes=15)
        session.add(row)
        message_count += 1

    for idx in range(4):
        row = HandoverNote(
            workspace_id=workspace_id,
            patient_id=patients[idx].id,
            author_user_id=observer.id if idx % 2 == 0 else head_nurse.id,
            target_role="head_nurse" if idx % 2 == 0 else "supervisor",
            shift_date=(now - timedelta(days=idx)).date(),
            shift_label="morning" if idx % 2 == 0 else "night",
            priority="routine" if idx < 2 else "urgent",
            note=f"Seed handover note #{idx + 1} for patient monitoring continuity.",
            created_at=now - timedelta(hours=idx * 3),
        )
        session.add(row)
        handover_count += 1

    await session.commit()
    return message_count, handover_count


async def seed_future_domains(
    session: AsyncSession,
    workspace_id: int,
    users_by_role: dict[str, User],
    patients: list[Patient],
) -> tuple[int, int, int]:
    """Seed specialists, prescriptions, and pharmacy orders for role routes."""
    now = datetime.now(timezone.utc)
    supervisor = users_by_role["supervisor"]
    specialist_count = 0
    prescription_count = 0
    pharmacy_order_count = 0

    specialist_specs = [
        ("Krit", "Sawang", "neurology", "NEU-1001"),
        ("Napat", "Raksa", "geriatrics", "GER-2204"),
        ("Ploy", "Anan", "cardiology", "CAR-3310"),
    ]
    specialists: list[Specialist] = []
    for first_name, last_name, specialty, license_number in specialist_specs:
        row = Specialist(
            workspace_id=workspace_id,
            first_name=first_name,
            last_name=last_name,
            specialty=specialty,
            license_number=license_number,
            phone="",
            email=f"{first_name.lower()}.{last_name.lower()}@demo.local",
            notes="Seeded specialist profile",
            is_active=True,
        )
        session.add(row)
        await session.flush()
        specialists.append(row)
        specialist_count += 1

    prescriptions: list[Prescription] = []
    for idx, patient in enumerate(patients[:6]):
        specialist = specialists[idx % len(specialists)]
        row = Prescription(
            workspace_id=workspace_id,
            patient_id=patient.id,
            specialist_id=specialist.id,
            prescribed_by_user_id=supervisor.id,
            medication_name=f"Medication {idx + 1}",
            dosage="1 tablet",
            frequency="BID",
            route="oral",
            instructions="Take after meals.",
            status="active" if idx < 4 else "paused",
            start_date=(now - timedelta(days=7 + idx)).date(),
            end_date=(now + timedelta(days=21)).date(),
        )
        session.add(row)
        await session.flush()
        prescriptions.append(row)
        prescription_count += 1

    for idx, prescription in enumerate(prescriptions):
        requested_at = now - timedelta(hours=idx * 6)
        status = "pending"
        fulfilled_at = None
        if idx % 3 == 1:
            status = "verified"
        elif idx % 3 == 2:
            status = "dispensed"
            fulfilled_at = requested_at + timedelta(hours=4)

        row = PharmacyOrder(
            workspace_id=workspace_id,
            prescription_id=prescription.id,
            patient_id=prescription.patient_id,
            order_number=f"WS{workspace_id:03d}-RX{idx + 1:04d}",
            pharmacy_name="Bang Khae Demo Pharmacy",
            quantity=30,
            refills_remaining=max(0, 2 - idx % 3),
            status=status,
            requested_at=requested_at,
            fulfilled_at=fulfilled_at,
            notes="Seeded pharmacy workflow order",
        )
        session.add(row)
        pharmacy_order_count += 1

    await session.commit()
    return specialist_count, prescription_count, pharmacy_order_count


async def attach_bootstrap_admin_to_workspace(
    session: AsyncSession, workspace_id: int
) -> None:
    """Point the bootstrap admin user at the demo workspace so /admin dashboard shows seeded data."""
    from app.config import settings

    username = settings.bootstrap_admin_username
    result = await session.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if user is None:
        return
    if user.workspace_id == workspace_id:
        return
    user.workspace_id = workspace_id
    await session.commit()


async def seed_sim_team_caregivers_and_users(
    session: AsyncSession, workspace_id: int
) -> tuple[dict[str, CareGiver], dict[str, User]]:
    """Head nurse, supervisor, and two observers — each with a linked User. No extra admin (use bootstrap admin)."""
    users_cfg: list[tuple[str, str, str, str]] = [
        ("head_nurse", "sim_headnurse", "ศิริพร", "หัวหน้าวอร์ด"),
        ("supervisor", "sim_supervisor", "มานะ", "เวชกิจ"),
        ("observer", "sim_observer1", "สุดา", "ใจดี"),
        ("observer", "sim_observer2", "วิมล", "รักษ์ไทย"),
    ]
    profile_by_username = {
        "sim_headnurse": {
            "employee_code": "HN-SIM-01",
            "department": "Nursing",
            "employment_type": "full_time",
            "specialty": "geriatric_care",
            "license_number": "TH-RN-SIM01",
            "phone": "081-200-2001",
            "email": "sim.headnurse@wheelsense.local",
            "emergency_contact_name": "Sim Ward",
            "emergency_contact_phone": "081-900-2001",
            "photo_url": "",
        },
        "sim_supervisor": {
            "employee_code": "SV-SIM-01",
            "department": "Care Operations",
            "employment_type": "full_time",
            "specialty": "fall_response",
            "license_number": "TH-SV-SIM01",
            "phone": "081-200-2002",
            "email": "sim.supervisor@wheelsense.local",
            "emergency_contact_name": "Sim Ops",
            "emergency_contact_phone": "081-900-2002",
            "photo_url": "",
        },
        "sim_observer1": {
            "employee_code": "OB-SIM-01",
            "department": "Nursing",
            "employment_type": "full_time",
            "specialty": "night_watch",
            "license_number": "TH-NA-SIM01",
            "phone": "081-200-2003",
            "email": "sim.observer1@wheelsense.local",
            "emergency_contact_name": "Sim Contact",
            "emergency_contact_phone": "081-900-2003",
            "photo_url": "",
        },
        "sim_observer2": {
            "employee_code": "OB-SIM-02",
            "department": "Nursing",
            "employment_type": "part_time",
            "specialty": "mobility_support",
            "license_number": "TH-NA-SIM02",
            "phone": "081-200-2004",
            "email": "sim.observer2@wheelsense.local",
            "emergency_contact_name": "Sim Contact 2",
            "emergency_contact_phone": "081-900-2004",
            "photo_url": "",
        },
    }
    hashed = get_password_hash(DEMO_PASSWORD)
    caregivers_by_key: dict[str, CareGiver] = {}
    users_by_key: dict[str, User] = {}

    for role, username, first_name, last_name in users_cfg:
        profile = profile_by_username[username]
        cq = await session.execute(
            select(CareGiver).where(
                CareGiver.workspace_id == workspace_id,
                CareGiver.first_name == first_name,
                CareGiver.last_name == last_name,
            )
        )
        caregiver = cq.scalar_one_or_none()
        if caregiver is None:
            caregiver = CareGiver(
                workspace_id=workspace_id,
                first_name=first_name,
                last_name=last_name,
                role=role,
                employee_code=profile["employee_code"],
                department=profile["department"],
                employment_type=profile["employment_type"],
                specialty=profile["specialty"],
                license_number=profile["license_number"],
                is_active=True,
                phone=profile["phone"],
                email=profile["email"],
                emergency_contact_name=profile["emergency_contact_name"],
                emergency_contact_phone=profile["emergency_contact_phone"],
                photo_url=profile["photo_url"],
            )
            session.add(caregiver)
            await session.flush()
        else:
            caregiver.role = role
            caregiver.employee_code = profile["employee_code"]
            caregiver.department = profile["department"]
            caregiver.employment_type = profile["employment_type"]
            caregiver.specialty = profile["specialty"]
            caregiver.license_number = profile["license_number"]
            caregiver.phone = profile["phone"]
            caregiver.email = profile["email"]
            caregiver.emergency_contact_name = profile["emergency_contact_name"]
            caregiver.emergency_contact_phone = profile["emergency_contact_phone"]
            caregiver.photo_url = profile["photo_url"]
            caregiver.is_active = True

        uq = await session.execute(select(User).where(User.username == username))
        user = uq.scalar_one_or_none()
        if user is None:
            user = User(
                workspace_id=workspace_id,
                username=username,
                hashed_password=hashed,
                role=role,
                caregiver_id=caregiver.id,
                is_active=True,
            )
            session.add(user)
        else:
            if user.workspace_id != workspace_id:
                raise RuntimeError(
                    f"Username '{username}' already belongs to workspace_id={user.workspace_id}. "
                    "Use --reset or a different workspace name."
                )
            user.role = role
            user.caregiver_id = caregiver.id
            user.is_active = True
            user.hashed_password = hashed
        await session.flush()
        caregivers_by_key[username] = caregiver
        users_by_key[username] = user

    await session.commit()
    return caregivers_by_key, users_by_key


async def seed_sim_team_observer_access(
    session: AsyncSession,
    workspace_id: int,
    caregivers_by_key: dict[str, CareGiver],
    patients: list[Patient],
) -> int:
    """Grant both sim observers visibility to all seeded patients (non-admin roles need access rows)."""
    observer_keys = ("sim_observer1", "sim_observer2")
    created = 0
    for key in observer_keys:
        cg = caregivers_by_key.get(key)
        if not cg:
            continue
        for patient in patients:
            q = await session.execute(
                select(CareGiverPatientAccess).where(
                    CareGiverPatientAccess.workspace_id == workspace_id,
                    CareGiverPatientAccess.caregiver_id == cg.id,
                    CareGiverPatientAccess.patient_id == patient.id,
                    CareGiverPatientAccess.is_active.is_(True),
                )
            )
            row = q.scalar_one_or_none()
            if row is None:
                session.add(
                    CareGiverPatientAccess(
                        workspace_id=workspace_id,
                        caregiver_id=cg.id,
                        patient_id=patient.id,
                        assigned_by_user_id=None,
                        is_active=True,
                    )
                )
                created += 1
    await session.commit()
    return created


async def run_sim_team_seed(workspace_name: str, reset: bool) -> int:
    """Minimal seed for MQTT simulator + role UX: rooms, 5 patients + wheelchair assignments, 4 staff users, bootstrap admin on workspace."""
    async with AsyncSessionLocal() as session:
        ws = await ensure_workspace(session, workspace_name, reset)
        await clear_workspace_event_data(session, ws.id)

        facility, floors = await seed_facility(session, ws.id)
        rooms = await seed_rooms(session, ws.id, floors)
        await seed_floorplan_layouts(session, ws.id, facility, floors, rooms)
        caregivers_by_key, _users_by_key = await seed_sim_team_caregivers_and_users(session, ws.id)
        patients, devices = await seed_patients_and_devices(session, ws.id, rooms)
        extra_devices = await seed_additional_sim_devices(session, ws.id)
        devices.extend(extra_devices)
        room_node_mappings = await seed_room_node_mappings(session, ws.id, rooms)
        smart_devices_count = await seed_smart_devices(session, ws.id, rooms)
        access_rows = await seed_sim_team_observer_access(session, ws.id, caregivers_by_key, patients)
        await attach_bootstrap_admin_to_workspace(session, ws.id)
        workspace_id = ws.id

    print("\n[OK] Sim team seed complete (simulator-ready).")
    print(f"Workspace id: {workspace_id} | name: {workspace_name}")
    print(f"Rooms: {len(rooms)} | Patients: {len(patients)} | Wheelchair devices + assignments: OK")
    print(f"Smart devices: {smart_devices_count} | Room-node mappings: {room_node_mappings}")
    print(f"Observer patient access rows (new): {access_rows}")
    print("\nStaff logins (password demo1234):")
    print("  sim_headnurse   (head_nurse)")
    print("  sim_supervisor  (supervisor)")
    print("  sim_observer1   (observer)")
    print("  sim_observer2   (observer)")
    print("\nAdmin: use your bootstrap account (see BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD).")
    print(f"\nDocker simulator: set SIM_WORKSPACE_ID={workspace_id} in server/.env, then:")
    print("  docker compose --profile simulator up -d --build wheelsense-simulator")
    return workspace_id


async def run_seed(workspace_name: str, reset: bool) -> None:
    async with AsyncSessionLocal() as session:
        ws = await ensure_workspace(session, workspace_name, reset)
        await clear_workspace_event_data(session, ws.id)

        facility, floors = await seed_facility(session, ws.id)
        rooms = await seed_rooms(session, ws.id, floors)
        await seed_floorplan_layouts(session, ws.id, facility, floors, rooms)
        caregivers_by_role, users_by_role = await seed_caregivers_and_users(session, ws.id)
        patients, devices = await seed_patients_and_devices(session, ws.id, rooms)
        extra_devices = await seed_additional_sim_devices(session, ws.id)
        devices.extend(extra_devices)
        room_node_mappings = await seed_room_node_mappings(session, ws.id, rooms)
        smart_devices_count = await seed_smart_devices(session, ws.id, rooms)

        vitals_count = await seed_vitals(session, ws.id, patients, devices)
        timeline_count = await seed_activity_timeline(session, ws.id, patients, rooms)
        alerts_count = await seed_alerts(session, ws.id, patients, caregivers_by_role, devices)
        schedules, tasks, directives = await seed_workflow(
            session, ws.id, users_by_role, patients, rooms
        )
        actor_positions = await seed_demo_actor_positions(session, ws.id, users_by_role, patients)
        photo_snapshots = await seed_photo_snapshots(session, ws.id, rooms)
        messages, handovers = await seed_messages_and_handovers(
            session, ws.id, users_by_role, patients
        )
        specialists, prescriptions, pharmacy_orders = await seed_future_domains(
            session, ws.id, users_by_role, patients
        )
        workspace_id = ws.id

    print("\n[OK] Demo seed complete.")
    print(f"Workspace id: {workspace_id} | name: {workspace_name}")
    print(f"Facility: {facility.name} | Floors: {len(floors)} | Rooms: {len(rooms)}")
    print(f"Patients: {len(patients)} | Devices: {len(devices)}")
    print(
        f"Vitals: {vitals_count} | Timeline events: {timeline_count} | Alerts: {alerts_count}"
    )
    print(
        "CareSchedules: "
        f"{schedules} | CareTasks: {tasks} | Directives: {directives} | "
        f"Messages: {messages} | Handovers: {handovers}"
    )
    print(
        "Smart devices: "
        f"{smart_devices_count} | Room-node mappings: {room_node_mappings} | "
        f"Actor positions: {actor_positions} | Photo snapshots: {photo_snapshots} | "
        f"Specialists: {specialists} | Prescriptions: {prescriptions} | "
        f"Pharmacy orders: {pharmacy_orders}\n"
    )
    print("Demo credentials:")
    print("- admin        : demo_admin / demo1234")
    print("- head_nurse   : demo_headnurse / demo1234")
    print("- supervisor   : demo_supervisor / demo1234")
    print("- observer     : demo_observer / demo1234")
    print("- observer     : demo_observer2 / demo1234")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed complete WheelSense demo data")
    parser.add_argument(
        "--workspace",
        default=DEMO_WORKSPACE,
        help=f"Workspace name (default: {DEMO_WORKSPACE!r})",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete existing workspace with this name before re-seeding",
    )
    return parser.parse_args()


def _configure_console_utf8() -> None:
    """Avoid UnicodeEncodeError on Windows when printing Thai demo names."""
    out = getattr(sys.stdout, "reconfigure", None)
    if callable(out):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass


def main() -> None:
    _configure_console_utf8()
    args = parse_args()
    asyncio.run(run_seed(args.workspace, args.reset))


if __name__ == "__main__":
    main()
