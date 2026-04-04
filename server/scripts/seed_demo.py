#!/usr/bin/env python3
"""Seed a complete WheelSense demo workspace with role-ready test data.

Usage:
    python scripts/seed_demo.py
    python scripts/seed_demo.py --workspace "WheelSense Demo Workspace" --reset
"""

from __future__ import annotations

import argparse
import asyncio
import random
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from app.core.security import get_password_hash
from app.db.session import AsyncSessionLocal
from app.models import (
    ActivityTimeline,
    Alert,
    CareDirective,
    CareGiver,
    CareSchedule,
    CareTask,
    Device,
    Facility,
    Floor,
    FloorplanLayout,
    Patient,
    PatientDeviceAssignment,
    Room,
    User,
    VitalReading,
    Workspace,
)


SEED = 4242
DEMO_PASSWORD = "demo1234"
DEMO_WORKSPACE = "WheelSense Demo Workspace"

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
    for model in (CareTask, CareSchedule, CareDirective, Alert, ActivityTimeline, VitalReading):
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


async def seed_caregivers_and_users(
    session: AsyncSession, workspace_id: int
) -> tuple[dict[str, CareGiver], dict[str, User]]:
    users_cfg = [
        ("head_nurse", "demo_headnurse", "ศิริพร", "หัวหน้าวอร์ด"),
        ("supervisor", "demo_supervisor", "มานะ", "เวชกิจ"),
        ("observer", "demo_observer", "สุดา", "ใจดี"),
        ("observer", "demo_observer2", "วิมล", "รักษ์ไทย"),
    ]
    hashed = get_password_hash(DEMO_PASSWORD)

    caregivers_by_role: dict[str, CareGiver] = {}
    users_by_role: dict[str, User] = {}

    for role, username, first_name, last_name in users_cfg:
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
                is_active=True,
                phone="",
                email="",
            )
            session.add(caregiver)
            await session.flush()

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

    await session.commit()
    return caregivers_by_role, users_by_role


async def seed_patients_and_devices(
    session: AsyncSession, workspace_id: int, rooms: list[Room]
) -> tuple[list[Patient], list[Device]]:
    patients: list[Patient] = []
    devices: list[Device] = []

    bedroom_rooms = [r for r in rooms if r.room_type == "bedroom"][:10]

    for i, payload in enumerate(THAI_PATIENTS):
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
                source="sim_seed",
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
    statuses = (
        ("active", None),
        ("active", None),
        ("active", None),
        ("acknowledged", caregivers_by_role.get("head_nurse")),
        ("acknowledged", caregivers_by_role.get("supervisor")),
        ("acknowledged", caregivers_by_role.get("observer")),
        ("acknowledged", caregivers_by_role.get("observer")),
        ("resolved", caregivers_by_role.get("head_nurse")),
        ("resolved", caregivers_by_role.get("supervisor")),
        ("resolved", caregivers_by_role.get("observer")),
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
    observer = users_by_role["observer"]
    head_nurse = users_by_role["head_nurse"]

    for i in range(5):
        patient = patients[i]
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


async def run_seed(workspace_name: str, reset: bool) -> None:
    async with AsyncSessionLocal() as session:
        ws = await ensure_workspace(session, workspace_name, reset)
        await clear_workspace_event_data(session, ws.id)

        facility, floors = await seed_facility(session, ws.id)
        rooms = await seed_rooms(session, ws.id, floors)
        await seed_floorplan_layouts(session, ws.id, facility, floors, rooms)
        caregivers_by_role, users_by_role = await seed_caregivers_and_users(session, ws.id)
        patients, devices = await seed_patients_and_devices(session, ws.id, rooms)
        patient_user = await seed_patient_user(session, ws.id, patients[0])
        users_by_role["patient"] = patient_user

        vitals_count = await seed_vitals(session, ws.id, patients, devices)
        timeline_count = await seed_activity_timeline(session, ws.id, patients, rooms)
        alerts_count = await seed_alerts(session, ws.id, patients, caregivers_by_role, devices)
        schedules, tasks, directives = await seed_workflow(
            session, ws.id, users_by_role, patients, rooms
        )

        await attach_bootstrap_admin_to_workspace(session, ws.id)
        workspace_id = ws.id

    print("\n[OK] Demo seed complete.")
    print(f"Workspace id: {workspace_id} | name: {workspace_name}")
    print(f"Facility: {facility.name} | Floors: {len(floors)} | Rooms: {len(rooms)}")
    print(f"Patients: {len(patients)} | Devices: {len(devices)}")
    print(
        f"Vitals: {vitals_count} | Timeline events: {timeline_count} | Alerts: {alerts_count}"
    )
    print(f"CareSchedules: {schedules} | CareTasks: {tasks} | Directives: {directives}\n")
    print("Demo credentials:")
    print("- admin        : BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD (from env)")
    print("- head_nurse   : demo_headnurse / demo1234")
    print("- supervisor   : demo_supervisor / demo1234")
    print("- observer     : demo_observer / demo1234")
    print("- patient      : demo_patient / demo1234")


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
