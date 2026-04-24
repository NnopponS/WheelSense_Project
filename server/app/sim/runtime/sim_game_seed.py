"""Minimal simulator-mode seed aligned 1:1 with the Godot game.

Creates exactly the characters, rooms, and devices that the `EaseAI_NursingHome`
Godot project uses — nothing else. This is deliberately small so reset is fast
and mental model matches what the user sees on-screen in the game.

Idempotent: running twice is a no-op. Running with `reset=True` clears
workspace-scoped dynamic data (vitals, alerts, tasks, activity) before re-seeding
structural rows.

Entry points:
    * `await seed_sim_game_workspace(name?, reset?) -> workspace_id`
    * CLI: `python -m app.sim.runtime.sim_game_seed [--reset]`

Replaces the old `scripts/seed_sim_team.py` + `scripts/seed_demo.py` pair for
simulator mode. Production mode is unaffected (seed is sim-only by design).
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any, Iterable

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import get_password_hash
from app.db.session import AsyncSessionLocal
from app.models import (
    ActivityTimeline,
    Alert,
    CareGiver,
    CareGiverPatientAccess,
    CareGiverShift,
    CareSchedule,
    CareTask,
    DemoActorPosition,
    Device,
    Facility,
    Floor,
    FloorplanLayout,
    Patient,
    PatientContact,
    PatientDeviceAssignment,
    PhotoRecord,
    Room,
    ShiftChecklistUserTemplate,
    SimGameActorMap,
    SimGameRoomMap,
    User,
    VitalReading,
    Workspace,
)
from app.models.sim_game import (
    ACTOR_ROLE_CAREGIVER,
    ACTOR_ROLE_PATIENT,
    SENSOR_MODE_MOCK,
)

DEFAULT_PASSWORD = "demo1234"


# Shift patterns for staff scheduling
_SHIFT_PATTERNS: dict[str, tuple[time, time]] = {
    "morning": (time(7, 0), time(15, 0)),    # 07:00-15:00
    "afternoon": (time(15, 0), time(23, 0)), # 15:00-23:00
    "night": (time(23, 0), time(7, 0)),      # 23:00-07:00
}

# Staff shift assignments (username -> shift pattern)
_STAFF_SHIFTS: dict[str, str] = {
    "demo_headnurse": "morning",
    "demo_supervisor": "afternoon",
    "demo_observer": "morning",
    "demo_observer2": "night",
}


# Role-specific shift checklist items seeded for each staff member
_CHECKLIST_ITEMS_BY_ROLE: dict[str, list[dict]] = {
    "head_nurse": [
        {"id": "1", "label_key": "ลงเวลาเข้ากะ", "category": "shift"},
        {"id": "2", "label_key": "ตรวจอุปกรณ์ฉุกเฉินทั้งหมด", "category": "shift"},
        {"id": "3", "label_key": "ทบทวนรายชื่อผู้ป่วยที่รับผิดชอบ", "category": "patient"},
        {"id": "4", "label_key": "ห้อง 401 – ตรวจวัดสัญญาณชีพ Emika", "category": "room"},
        {"id": "5", "label_key": "ห้อง 402 – ช่วยมื้ออาหาร Rattana", "category": "room"},
        {"id": "6", "label_key": "ห้อง 403 – แจกยา Krit", "category": "room"},
        {"id": "7", "label_key": "ห้อง 404 – ตรวจสภาพผู้ป่วย Wichai", "category": "room"},
        {"id": "8", "label_key": "บันทึกการสังเกตอาการประจำวัน", "category": "patient"},
        {"id": "9", "label_key": "ส่งมอบงานกะต่อไป", "category": "shift"},
    ],
    "supervisor": [
        {"id": "1", "label_key": "ลงเวลาเข้ากะ", "category": "shift"},
        {"id": "2", "label_key": "ตรวจสอบรายงานสรุปกะก่อนหน้า", "category": "shift"},
        {"id": "3", "label_key": "ประชุมทีมประจำวัน", "category": "shift"},
        {"id": "4", "label_key": "ตรวจสอบสต็อกยาและวัสดุสิ้นเปลือง", "category": "room"},
        {"id": "5", "label_key": "อนุมัติแผนการดูแลผู้ป่วย", "category": "patient"},
        {"id": "6", "label_key": "สรุปรายงานประจำวัน", "category": "shift"},
        {"id": "7", "label_key": "ส่งมอบงานกะต่อไป", "category": "shift"},
    ],
    "observer": [
        {"id": "1", "label_key": "ลงเวลาเข้ากะ", "category": "shift"},
        {"id": "2", "label_key": "ตรวจสอบอุปกรณ์รถเข็น Emika", "category": "room"},
        {"id": "3", "label_key": "ตรวจสอบอุปกรณ์รถเข็น Rattana", "category": "room"},
        {"id": "4", "label_key": "สังเกตอาการและบันทึกอาการผู้ป่วย Krit", "category": "patient"},
        {"id": "5", "label_key": "สังเกตอาการและบันทึกอาการผู้ป่วย Wichai", "category": "patient"},
        {"id": "6", "label_key": "ทำความสะอาดห้องพักผู้ป่วย", "category": "room"},
        {"id": "7", "label_key": "อัปเดตบันทึกการดูแลรายบุคคล", "category": "patient"},
        {"id": "8", "label_key": "ส่งมอบงานกะต่อไป", "category": "shift"},
    ],
}


async def _seed_shift_checklists(
    session: AsyncSession,
    workspace_id: int,
    caregivers_by_username: dict[str, CareGiver],
) -> None:
    """Upsert ShiftChecklistUserTemplate for every non-admin dashboard user."""
    for username, caregiver in caregivers_by_username.items():
        role = caregiver.role
        items = _CHECKLIST_ITEMS_BY_ROLE.get(role)
        if not items:
            continue
        result = await session.execute(
            select(User).where(
                User.workspace_id == workspace_id,
                User.username == username,
            )
        )
        user = result.scalar_one_or_none()
        if user is None:
            continue
        existing = await session.execute(
            select(ShiftChecklistUserTemplate).where(
                ShiftChecklistUserTemplate.workspace_id == workspace_id,
                ShiftChecklistUserTemplate.user_id == user.id,
            )
        )
        row = existing.scalar_one_or_none()
        payload = [{**item, "checked": False} for item in items]
        if row is None:
            session.add(
                ShiftChecklistUserTemplate(
                    workspace_id=workspace_id,
                    user_id=user.id,
                    items=payload,
                )
            )
        else:
            row.items = payload
    await session.flush()


async def _create_caregiver_shifts(
    session: AsyncSession,
    caregivers_by_username: dict[str, CareGiver],
    days_ahead: int = 14,
) -> None:
    """Create shift schedule for all caregivers for the next N days."""
    today = date.today()
    
    for username, caregiver in caregivers_by_username.items():
        shift_type = _STAFF_SHIFTS.get(username, "morning")
        start_time, end_time = _SHIFT_PATTERNS[shift_type]
        
        for day_offset in range(days_ahead):
            shift_date = today + timedelta(days=day_offset)
            
            # Check if shift already exists
            existing = await session.execute(
                select(CareGiverShift).where(
                    CareGiverShift.caregiver_id == caregiver.id,
                    CareGiverShift.shift_date == shift_date,
                )
            )
            if existing.scalar_one_or_none() is None:
                shift = CareGiverShift(
                    caregiver_id=caregiver.id,
                    shift_date=shift_date,
                    start_time=start_time,
                    end_time=end_time,
                    shift_type="regular",
                    notes=f"{shift_type.capitalize()} shift",
                )
                session.add(shift)
    
    await session.flush()


# Demo task templates for staff
_DEMO_TASKS: list[dict[str, any]] = [
    {"title": "Check Patient Blood Pressure", "description": "Measure blood pressure and record values", "priority": "high", "role": "head_nurse"},
    {"title": "Administer Morning Medication", "description": "Dispense medication per physician prescription", "priority": "high", "role": "head_nurse"},
    {"title": "Inspect Wheelchair Equipment", "description": "Check wheelchair condition and sensors", "priority": "medium", "role": "observer"},
    {"title": "Record Patient Symptoms", "description": "Document patient symptoms and wellbeing", "priority": "medium", "role": "observer"},
    {"title": "Clean Patient Room", "description": "Tidy room and change bed linens", "priority": "low", "role": "observer"},
    {"title": "Daily Work Summary", "description": "Summarize status and hand over to next shift", "priority": "medium", "role": "supervisor"},
    {"title": "Check Medication Stock", "description": "Verify remaining medication quantities", "priority": "medium", "role": "head_nurse"},
    {"title": "Weekly Team Meeting", "description": "Meeting with head nurse and staff", "priority": "high", "role": "supervisor"},
]


async def _create_demo_tasks(
    session: AsyncSession,
    workspace_id: int,
    caregivers_by_username: dict[str, CareGiver],
    days_ahead: int = 7,
) -> None:
    """Create demo tasks for all staff."""
    from app.models.tasks import Task as WorkspaceTask
    
    today = date.today()
    now = datetime.now()
    
    # Get user IDs for each caregiver
    from app.models import User
    user_ids_by_role: dict[str, list[int]] = {}
    
    for username, caregiver in caregivers_by_username.items():
        result = await session.execute(
            select(User).where(
                User.workspace_id == workspace_id,
                User.caregiver_id == caregiver.id,
            )
        )
        user = result.scalar_one_or_none()
        if user:
            role = caregiver.role
            if role not in user_ids_by_role:
                user_ids_by_role[role] = []
            user_ids_by_role[role].append(user.id)
    
    # Create tasks for each day
    for day_offset in range(days_ahead):
        task_date = today + timedelta(days=day_offset)
        
        for task_template in _DEMO_TASKS:
            role = task_template["role"]
            if role not in user_ids_by_role:
                continue
            
            # Pick a random user with this role
            import random
            assigned_user_id = random.choice(user_ids_by_role[role])
            
            # Schedule time (8 AM - 8 PM)
            hour = random.randint(8, 20)
            due_at = datetime.combine(task_date, time(hour, 0))
            
            # Check if task already exists
            existing = await session.execute(
                select(WorkspaceTask).where(
                    WorkspaceTask.workspace_id == workspace_id,
                    WorkspaceTask.title == task_template["title"],
                    WorkspaceTask.due_at == due_at,
                )
            )
            if existing.scalar_one_or_none() is None:
                task = WorkspaceTask(
                    workspace_id=workspace_id,
                    title=task_template["title"],
                    description=task_template["description"],
                    priority=task_template["priority"],
                    task_type="general",
                    status="pending",
                    assigned_user_id=assigned_user_id,
                    due_at=due_at,
                    is_active=True,
                )
                session.add(task)
    
    await session.flush()


@dataclass(frozen=True)
class _Character:
    """Godot character → WheelSense patient definition."""

    game_name: str  # Godot node name, e.g. "emika"
    first_name: str
    last_name: str
    nickname: str
    gender: str
    dob: date
    care_level: str
    mobility: str
    game_room: str  # starting room sensor name
    height_cm: float | None = None
    weight_kg: float | None = None
    blood_type: str = ""
    # Medical history as list of strings (bilingual: Thai / English)
    medical_conditions: tuple[str, ...] = ()
    allergies: tuple[str, ...] = ()
    # Medications as list of dicts with name, dosage, frequency
    medications: tuple[dict[str, str], ...] = ()
    # Past surgeries as list of dicts with procedure, facility, year
    past_surgeries: tuple[dict[str, str], ...] = ()
    # Emergency contact: (name, relationship, phone)
    emergency_contact: tuple[str, str, str] = ("", "", "")
    # Health Profile for AI anomaly prediction + daily plan UI
    stroke_risk_score: int | None = None  # 0-100
    next_30_day_projection: str = ""  # e.g., "Stable with mild fluctuation expected"
    last_vitals_summary: dict[str, str] | None = None  # {"bp": "120/80", "hr": "72", "temp": "36.5"}
    daily_plan_items: tuple[dict[str, str], ...] = ()  # [{"title": "", "category": "exercise|diet|rest", "duration": "15 min"}]


@dataclass(frozen=True)
class _Nurse:
    """Godot nurse → WheelSense caregiver + login user."""

    game_name: str
    username: str
    first_name: str
    last_name: str
    role: str  # "observer" | "head_nurse" | "supervisor"
    employee_code: str = ""  # Added to support custom employee codes


# Must exactly match the Godot room_sensor `room_name` values + patient
# starting rooms in the `scenes/game.tscn` world. Change together.
GAME_ROOMS: tuple[tuple[str, str], ...] = (
    # (game_room_name, room_type)
    ("Room401", "bedroom"),
    ("Room402", "bedroom"),
    ("Room403", "bedroom"),
    ("Room404", "bedroom"),
    ("Hallway", "general"),
)

# Default floorplan layout for the simulator (positions in grid units)
DEFAULT_FLOORPLAN_LAYOUT = {
    "rooms": [
        {"label": "Room401", "x": 1.0, "y": 1.0, "w": 5.0, "h": 4.0},
        {"label": "Room402", "x": 6.0, "y": 1.0, "w": 5.0, "h": 4.0},
        {"label": "Room403", "x": 1.0, "y": 10.0, "w": 5.0, "h": 4.0},
        {"label": "Room404", "x": 6.0, "y": 10.0, "w": 5.0, "h": 4.0},
        {"label": "Hallway", "x": 1.0, "y": 5.0, "w": 10.0, "h": 5.0},
    ],
    "version": 3,
}

# Must exactly match `scripts/characters/*.gd` NPC names (lowercased).
# Profiles include bilingual display names (Thai / English)
GAME_PATIENTS: tuple[_Character, ...] = (
    # 1. Emika Charoenpho - Wheelchair User (Spinal Cord Injury)
    _Character(
        game_name="emika",
        first_name="Emika",
        last_name="Charoenpho",
        nickname="Emika",
        gender="female",
        dob=date(1978, 8, 12),
        care_level="special",
        mobility="wheelchair",
        game_room="Room401",
        height_cm=165.0,
        weight_kg=60.0,
        blood_type="A+",
        medical_conditions=("T12 Spinal Cord Injury (2018)", "Chronic UTI"),
        allergies=("Latex",),
        medications=(
            {"name": "Baclofen", "dosage": "10mg", "frequency": "3x daily"},
            {"name": "Nitrofurantoin", "dosage": "100mg", "frequency": "1x daily"},
        ),
        past_surgeries=(
            {"procedure": "Spinal fusion", "facility": "Bangkok Hospital", "year": "2018"},
        ),
        emergency_contact=("Carlos Rodriguez", "Husband", "+1 (555) 123-4567"),
        stroke_risk_score=35,
        next_30_day_projection="Stable; pressure sore risk low",
        last_vitals_summary={"bp": "118/76", "hr": "68", "temp": "36.7"},
        daily_plan_items=(
            {"title": "Seated upper-body stretch", "category": "exercise", "duration": "15 min"},
            {"title": "Hydration check every 2h", "category": "diet", "duration": "5 min"},
            {"title": "Evening breathing exercise", "category": "rest", "duration": "10 min"},
        ),
    ),
    # 2. Rattana Srisuwan - Wheelchair User (Memory Care)
    _Character(
        game_name="rattana",
        first_name="Rattana",
        last_name="Srisuwan",
        nickname="Rattana",
        gender="female",
        dob=date(1948, 2, 25),
        care_level="special",
        mobility="wheelchair",
        game_room="Room403",
        height_cm=160.0,
        weight_kg=55.0,
        blood_type="AB+",
        medical_conditions=(
            "Alzheimer's Disease (Moderate-to-Severe)",
            "Severe Osteoarthritis (Bilateral knees)",
            "High Wandering Risk",
        ),
        allergies=("Ibuprofen",),
        medications=(
            {"name": "Donepezil", "dosage": "10mg", "frequency": "1x daily"},
            {"name": "Memantine", "dosage": "10mg", "frequency": "2x daily"},
            {"name": "Melatonin", "dosage": "3mg", "frequency": "at night"},
        ),
        past_surgeries=(
            {"procedure": "Right Knee Replacement", "facility": "Ramathibodi Hospital", "year": "2015"},
        ),
        emergency_contact=("David Chen", "Son", "+1 (555) 444-9988"),
        stroke_risk_score=60,
        next_30_day_projection="Moderate fall risk; wandering episodes",
        last_vitals_summary={"bp": "130/82", "hr": "75", "temp": "36.5"},
        daily_plan_items=(
            {"title": "Accompanied corridor walk", "category": "exercise", "duration": "20 min"},
            {"title": "Cognitive puzzle session", "category": "rest", "duration": "15 min"},
            {"title": "Afternoon snack with fluids", "category": "diet", "duration": "15 min"},
        ),
    ),
    # 3. Krit Wongwattana - Ambulatory / Normal Mobility
    _Character(
        game_name="krit",
        first_name="Krit",
        last_name="Wongwattana",
        nickname="Krit",
        gender="male",
        dob=date(1968, 7, 8),
        care_level="normal",
        mobility="independent",
        game_room="Room404",
        height_cm=185.0,
        weight_kg=92.0,
        blood_type="O-",
        medical_conditions=("Mild Hypertension", "Hyperlipidemia"),
        allergies=("Peanuts",),
        medications=(
            {"name": "Amlodipine", "dosage": "5mg", "frequency": "1x daily"},
            {"name": "Rosuvastatin", "dosage": "10mg", "frequency": "1x daily"},
        ),
        past_surgeries=(
            {"procedure": "Appendectomy", "facility": "General Hospital", "year": "1995"},
        ),
        emergency_contact=("Mary O'Connor", "Wife", "+1 (555) 222-3333"),
        stroke_risk_score=25,
        next_30_day_projection="Stable with controlled hypertension",
        last_vitals_summary={"bp": "128/78", "hr": "70", "temp": "36.4"},
        daily_plan_items=(
            {"title": "Morning jog around floor", "category": "exercise", "duration": "30 min"},
            {"title": "Balanced breakfast intake", "category": "diet", "duration": "20 min"},
            {"title": "Mid-day medication review", "category": "rest", "duration": "10 min"},
        ),
    ),
    # 4. Wichai Phattharaphong - Bedridden Patient
    _Character(
        game_name="wichai",
        first_name="Wichai",
        last_name="Phattharaphong",
        nickname="Wichai",
        gender="male",
        dob=date(1939, 12, 12),
        care_level="critical",
        mobility="bedridden",
        game_room="Room404",
        height_cm=172.0,
        weight_kg=65.0,
        blood_type="A-",
        medical_conditions=(
            "Severe Ischemic Stroke (Right hemiparesis)",
            "Advanced Dementia",
            "Dysphagia",
        ),
        allergies=("Penicillin",),
        medications=(
            {"name": "Clopidogrel", "dosage": "75mg", "frequency": "1x daily"},
            {"name": "Donepezil", "dosage": "10mg", "frequency": "1x daily"},
        ),
        past_surgeries=(
            {"procedure": "Pacemaker insertion", "facility": "King's Hospital", "year": "2015"},
        ),
        emergency_contact=("Thomas Davies", "Son", "+1 (555) 777-1122"),
        stroke_risk_score=85,
        next_30_day_projection="High recurrence risk; requires close monitoring",
        last_vitals_summary={"bp": "145/92", "hr": "88", "temp": "36.8"},
        daily_plan_items=(
            {"title": "Repositioning every 2 hours", "category": "rest", "duration": "10 min"},
            {"title": "Passive range-of-motion", "category": "exercise", "duration": "15 min"},
            {"title": "Thickened-fluid intake tracking", "category": "diet", "duration": "ongoing"},
        ),
    ),
)

GAME_NURSES: tuple[_Nurse, ...] = (
    # 1 Head Nurse (from game)
    _Nurse(
        game_name="female_nurse",
        username="sarah.j",
        first_name="Sarah",
        last_name="Johnson",
        role="head_nurse",
    ),
    # 1 Supervisor (from game)
    _Nurse(
        game_name="male_nurse",
        username="michael.s",
        first_name="Michael",
        last_name="Smith",
        role="supervisor",
    ),
    # 2 Observers (from game)
    _Nurse(
        game_name="observer_a",
        username="jennifer.l",
        first_name="Jennifer",
        last_name="Lee",
        role="observer",
    ),
    _Nurse(
        game_name="observer_b",
        username="david.k",
        first_name="David",
        last_name="Kim",
        role="observer",
    ),
)

# Dashboard users: Admin 1, Head Nurse 1, Supervisor 1, Observer 2.
# Head-nurse / supervisor / observer usernames are reused as the game nurse
# identities so the Godot characters and the dashboard logins stay 1:1.
DASHBOARD_USERS: tuple[tuple[str, str], ...] = (
    # (username, role)
    ("admin", "admin"),
    ("demo_headnurse", "head_nurse"),
    ("demo_supervisor", "supervisor"),
    ("demo_observer", "observer"),
    ("demo_observer2", "observer"),
)

# Caregiver profile per dashboard username. Admin has no caregiver row.
# first_name / last_name mirror the Godot nurse display names so the game and
# the dashboard reference the same people by name.
_DASHBOARD_CAREGIVERS: dict[str, tuple[str, str, str, str]] = {
    # username: (first_name, last_name, role, employee_code)
    # Thai names written in English for international presentation
    "demo_headnurse": ("Saranya", "Jaidee", "head_nurse", "HN-DEMO-01"),
    "demo_supervisor": ("Mongkol", "Srisuwan", "supervisor", "SV-DEMO-01"),
    "demo_observer": ("Janjira", "Phongsuwan", "observer", "OB-DEMO-01"),
    "demo_observer2": ("Dawit", "Rattanapong", "observer", "OB-DEMO-02"),
}

# Usernames whose caregivers must be granted access to every patient so the
# workspace-scoped caregiver queries return the full cohort on any staff login.
_ACCESS_GRANT_USERNAMES: tuple[str, ...] = (
    "demo_headnurse",
    "demo_supervisor",
    "demo_observer",
    "demo_observer2",
)


# ── Dynamic-data tables cleared on reset (structural rows are preserved by
# upsert semantics; these are the per-run event streams that must go). User
# rows are intentionally NOT here — clean-slate resets handle users via the
# full-clear helper in `simulator_reset.py`, which preserves the bootstrap
# admin row by username. ──
_DYNAMIC_TABLES: tuple[type, ...] = (
    VitalReading,
    Alert,
    ActivityTimeline,
    CareTask,
    DemoActorPosition,
)


async def _clear_dynamic(session: AsyncSession, workspace_id: int) -> None:
    for model in _DYNAMIC_TABLES:
        await session.execute(
            delete(model).where(model.workspace_id == workspace_id)
        )


async def _upsert_workspace(session: AsyncSession, name: str) -> Workspace:
    result = await session.execute(select(Workspace).where(Workspace.name == name))
    ws = result.scalar_one_or_none()
    if ws is None:
        ws = Workspace(name=name, mode="simulation", is_active=True)
        session.add(ws)
        await session.flush()
    else:
        ws.mode = "simulation"
        ws.is_active = True
    return ws


async def _upsert_facility(session: AsyncSession, workspace_id: int) -> tuple[Facility, Floor]:
    result = await session.execute(
        select(Facility).where(Facility.workspace_id == workspace_id)
    )
    facility = result.scalars().first()
    if facility is None:
        facility = Facility(workspace_id=workspace_id, name="EaseAI Nursing Home")
        session.add(facility)
        await session.flush()

    result = await session.execute(
        select(Floor).where(Floor.facility_id == facility.id, Floor.floor_number == 4)
    )
    floor = result.scalars().first()
    if floor is None:
        floor = Floor(
            workspace_id=workspace_id,
            facility_id=facility.id,
            floor_number=4,
            name="Floor 4",
        )
        session.add(floor)
        await session.flush()
    return facility, floor


async def _upsert_room(
    session: AsyncSession, workspace_id: int, floor_id: int, name: str, room_type: str
) -> Room:
    result = await session.execute(
        select(Room).where(Room.workspace_id == workspace_id, Room.name == name)
    )
    room = result.scalars().first()
    if room is None:
        room = Room(
            workspace_id=workspace_id,
            floor_id=floor_id,
            name=name,
            room_type=room_type,
        )
        session.add(room)
        await session.flush()
    else:
        room.floor_id = floor_id
        room.room_type = room_type
    return room


async def _upsert_patient(
    session: AsyncSession, workspace_id: int, room_id: int, char: _Character
) -> Patient:
    result = await session.execute(
        select(Patient).where(
            Patient.workspace_id == workspace_id,
            Patient.nickname == char.nickname,
        )
    )
    patient = result.scalars().first()
    
    # Convert medications and surgeries to JSON-compatible format
    medications_list = [
        {
            "name": med.get("name", ""),
            "name_th": med.get("name_th", ""),
            "dosage": med.get("dosage", ""),
            "frequency": med.get("frequency", ""),
        }
        for med in char.medications
    ]
    
    surgeries_list = [
        {
            "procedure": surg.get("procedure", ""),
            "procedure_th": surg.get("procedure_th", ""),
            "facility": surg.get("facility", ""),
            "year": surg.get("year", ""),
        }
        for surg in char.past_surgeries
    ]
    
    fields = dict(
        workspace_id=workspace_id,
        first_name=char.first_name,
        last_name=char.last_name,
        nickname=char.nickname,
        gender=char.gender,
        date_of_birth=char.dob,
        care_level=char.care_level,
        mobility_type=char.mobility,
        current_mode=char.mobility,
        room_id=room_id,
        is_active=True,
        height_cm=char.height_cm,
        weight_kg=char.weight_kg,
        blood_type=char.blood_type,
        medical_conditions=list(char.medical_conditions),
        allergies=list(char.allergies),
        medications=medications_list,
        past_surgeries=surgeries_list,
        profile={
            "stroke_risk_score": char.stroke_risk_score,
            "next_30_day_projection": char.next_30_day_projection,
            "last_vitals_summary": char.last_vitals_summary or {},
            "daily_plan_items": list(char.daily_plan_items),
        },
    )
    if patient is None:
        patient = Patient(**fields)
        session.add(patient)
        await session.flush()
    else:
        for k, v in fields.items():
            setattr(patient, k, v)
    return patient


async def _upsert_patient_contact(
    session: AsyncSession,
    workspace_id: int,
    patient_id: int,
    name: str,
    relationship: str,
    phone: str,
) -> PatientContact:
    """Create or update emergency contact for a patient."""
    result = await session.execute(
        select(PatientContact).where(
            PatientContact.patient_id == patient_id,
            PatientContact.contact_type == "emergency",
        )
    )
    contact = result.scalars().first()
    if contact is None:
        contact = PatientContact(
            patient_id=patient_id,
            contact_type="emergency",
            name=name,
            relationship=relationship,
            phone=phone,
            is_primary=True,
        )
        session.add(contact)
        await session.flush()
    else:
        contact.name = name
        contact.relationship = relationship
        contact.phone = phone
    return contact


async def _create_routine_schedules(
    session: AsyncSession,
    workspace_id: int,
    patient_id: int,
    char: _Character,
) -> None:
    """Create routine daily schedules for a patient based on their profile."""
    
    # Define schedules based on patient type
    schedules = []
    
    if char.game_name == "emika":
        # Emika - Spinal Cord Injury
        schedules = [
            ("Morning Medication", time(9, 0), "daily"),
            ("Occupational Therapy", time(11, 0), "daily"),
            ("Wheelchair Maintenance", time(14, 0), "weekly"),
            ("Evening Medication", time(18, 0), "daily"),
        ]
    elif char.game_name == "somchai":
        # Somchai - Amputee
        schedules = [
            ("Wound Care & Dressing", time(8, 30), "daily"),
            ("Morning Medication", time(10, 0), "daily"),
            ("Prosthetic Fitting", time(13, 30), "weekly"),
            ("Physical Therapy", time(15, 0), "daily"),
        ]
    elif char.game_name == "rattana":
        # Rattana - Memory Care
        schedules = [
            ("Morning Care & Medication", time(8, 0), "daily"),
            ("Cognitive Therapy", time(10, 30), "daily"),
            ("Assisted Lunch", time(12, 30), "daily"),
            ("Sensory Garden", time(14, 0), "daily"),
            ("Sundowning Care", time(16, 0), "daily"),
        ]
    elif char.game_name == "krit":
        # Krit - Normal mobility
        schedules = [
            ("Morning Jog", time(7, 30), "daily"),
            ("Morning Medication", time(9, 0), "daily"),
            ("Cardiac Stress Test", time(11, 0), "weekly"),
            ("Dietitian Consult", time(13, 0), "weekly"),
        ]
    elif char.game_name == "wichai":
        # Wichai - Bedridden
        schedules = [
            ("Morning Care & Medication", time(8, 0), "daily"),
            ("Repositioning", time(10, 0), "daily"),
            ("Speech Therapy", time(13, 0), "daily"),
            ("Afternoon Repositioning", time(16, 0), "daily"),
        ]
    
    # Get today's date for schedule start
    today = date.today()
    
    for title, sched_time, recurrence in schedules:
        # Create datetime for today with the schedule time
        starts_at = datetime.combine(today, sched_time)
        
        result = await session.execute(
            select(CareSchedule).where(
                CareSchedule.workspace_id == workspace_id,
                CareSchedule.patient_id == patient_id,
                CareSchedule.title == title,
            )
        )
        sched = result.scalars().first()
        
        if sched is None:
            sched = CareSchedule(
                workspace_id=workspace_id,
                patient_id=patient_id,
                title=title,
                schedule_type="routine",
                starts_at=starts_at,
                recurrence_rule=recurrence,
                assigned_role="nurse",
                status="scheduled",
            )
            session.add(sched)
        else:
            sched.starts_at = starts_at
            sched.status = "scheduled"
    
    await session.flush()


async def _upsert_caregiver(
    session: AsyncSession, workspace_id: int, nurse: _Nurse
) -> CareGiver:
    # Use employee_code if provided, otherwise fall back to username
    emp_code = nurse.employee_code if nurse.employee_code else nurse.username
    result = await session.execute(
        select(CareGiver).where(
            CareGiver.workspace_id == workspace_id,
            CareGiver.employee_code == emp_code,
        )
    )
    cg = result.scalars().first()
    fields = dict(
        workspace_id=workspace_id,
        first_name=nurse.first_name,
        last_name=nurse.last_name,
        role=nurse.role,
        employee_code=emp_code,
        department="Nursing",
        is_active=True,
    )
    if cg is None:
        cg = CareGiver(**fields)
        session.add(cg)
        await session.flush()
    else:
        for k, v in fields.items():
            setattr(cg, k, v)
    return cg


async def _upsert_user(
    session: AsyncSession, workspace_id: int, username: str, role: str, *, patient_id: int | None = None
) -> User:
    result = await session.execute(
        select(User).where(User.username == username)
    )
    user = result.scalar_one_or_none()
    if user is None:
        user = User(
            workspace_id=workspace_id,
            username=username,
            hashed_password=get_password_hash(DEFAULT_PASSWORD),
            role=role,
            patient_id=patient_id,
            is_active=True,
        )
        session.add(user)
        await session.flush()
    else:
        user.workspace_id = workspace_id
        user.role = role
        user.is_active = True
        user.hashed_password = get_password_hash(DEFAULT_PASSWORD)
        if patient_id is not None:
            user.patient_id = patient_id
    return user


async def _upsert_device(
    session: AsyncSession,
    workspace_id: int,
    device_id: str,
    hardware_type: str,
    display_name: str,
) -> Device:
    result = await session.execute(
        select(Device).where(
            Device.workspace_id == workspace_id, Device.device_id == device_id
        )
    )
    device = result.scalars().first()
    fields = dict(
        workspace_id=workspace_id,
        device_id=device_id,
        device_type=hardware_type,
        hardware_type=hardware_type,
        display_name=display_name,
    )
    if device is None:
        device = Device(**fields)
        session.add(device)
        await session.flush()
    else:
        for k, v in fields.items():
            setattr(device, k, v)
    return device


async def _upsert_assignment(
    session: AsyncSession,
    workspace_id: int,
    patient_id: int,
    device_id_str: str,
    device_role: str = "wheelchair_sensor",
) -> None:
    result = await session.execute(
        select(PatientDeviceAssignment).where(
            PatientDeviceAssignment.workspace_id == workspace_id,
            PatientDeviceAssignment.patient_id == patient_id,
            PatientDeviceAssignment.device_id == device_id_str,
        )
    )
    row = result.scalars().first()
    if row is None:
        session.add(
            PatientDeviceAssignment(
                workspace_id=workspace_id,
                patient_id=patient_id,
                device_id=device_id_str,
                device_role=device_role,
                is_active=True,
            )
        )
    else:
        row.is_active = True
        row.device_role = device_role


async def _upsert_actor_map(
    session: AsyncSession,
    workspace_id: int,
    character_name: str,
    character_role: str,
    *,
    patient_id: int | None = None,
    caregiver_id: int | None = None,
) -> None:
    result = await session.execute(
        select(SimGameActorMap).where(
            SimGameActorMap.workspace_id == workspace_id,
            SimGameActorMap.character_name == character_name,
        )
    )
    row = result.scalars().first()
    if row is None:
        session.add(
            SimGameActorMap(
                workspace_id=workspace_id,
                character_name=character_name,
                character_role=character_role,
                patient_id=patient_id,
                caregiver_id=caregiver_id,
                sensor_mode=SENSOR_MODE_MOCK,
            )
        )
    else:
        row.character_role = character_role
        row.patient_id = patient_id
        row.caregiver_id = caregiver_id
        # Do not reset sensor_mode on re-seed — user may have changed it.


async def _upsert_room_map(
    session: AsyncSession, workspace_id: int, game_room_name: str, room_id: int
) -> None:
    result = await session.execute(
        select(SimGameRoomMap).where(
            SimGameRoomMap.workspace_id == workspace_id,
            SimGameRoomMap.game_room_name == game_room_name,
        )
    )
    row = result.scalars().first()
    if row is None:
        session.add(
            SimGameRoomMap(
                workspace_id=workspace_id,
                game_room_name=game_room_name,
                room_id=room_id,
            )
        )
    else:
        row.room_id = room_id


async def _upsert_floorplan_layout(
    session: AsyncSession, workspace_id: int, facility_id: int, floor_id: int
) -> None:
    """Create or update the default floorplan layout for the simulator."""
    result = await session.execute(
        select(FloorplanLayout).where(
            FloorplanLayout.workspace_id == workspace_id,
            FloorplanLayout.facility_id == facility_id,
            FloorplanLayout.floor_id == floor_id,
        )
    )
    layout = result.scalars().first()
    if layout is None:
        layout = FloorplanLayout(
            workspace_id=workspace_id,
            facility_id=facility_id,
            floor_id=floor_id,
            layout_json=DEFAULT_FLOORPLAN_LAYOUT,
        )
        session.add(layout)
    else:
        layout.layout_json = DEFAULT_FLOORPLAN_LAYOUT


async def seed_sim_game_workspace(
    workspace_name: str | None = None,
    *,
    reset: bool = False,
) -> int:
    """Create-or-update the simulator workspace to match the Godot game exactly.

    Returns:
        workspace_id of the seeded workspace.
    """
    name = (
        workspace_name
        or settings.bootstrap_demo_workspace_name
        or "WheelSense Simulation"
    )

    async with AsyncSessionLocal() as session:
        ws = await _upsert_workspace(session, name)
        if reset:
            await _clear_dynamic(session, ws.id)

        _facility, floor = await _upsert_facility(session, ws.id)

        rooms_by_game_name: dict[str, Room] = {}
        for game_name, room_type in GAME_ROOMS:
            rooms_by_game_name[game_name] = await _upsert_room(
                session, ws.id, floor.id, game_name, room_type
            )

        # Create or update the default floorplan layout
        await _upsert_floorplan_layout(session, ws.id, _facility.id, floor.id)

        # Dashboard-only users (admin, head_nurse).
        for username, role in DASHBOARD_USERS:
            await _upsert_user(session, ws.id, username, role)

        # Patients: one per game character, plus mapping rows + wheelchair device + user account.
        for char in GAME_PATIENTS:
            room = rooms_by_game_name[char.game_room]
            patient = await _upsert_patient(session, ws.id, room.id, char)

            # Create patient user account with firstname.lastname format
            # Use only the first name part (before the parentheses) for username
            first_name_clean = char.first_name.split(" (")[0].lower()
            last_name_clean = char.last_name.split(" (")[0].lower()
            patient_username = f"{first_name_clean}.{last_name_clean[0]}"
            await _upsert_user(session, ws.id, patient_username, "patient", patient_id=patient.id)

            # Create emergency contact if provided
            if char.emergency_contact and char.emergency_contact[0]:
                contact_name, relationship, phone = char.emergency_contact
                await _upsert_patient_contact(
                    session, ws.id, patient.id, contact_name, relationship, phone
                )

            # Create routine schedules for the patient
            await _create_routine_schedules(session, ws.id, patient.id, char)

            wc_device = await _upsert_device(
                session,
                ws.id,
                device_id=f"WC-{char.game_name}",
                hardware_type="wheelchair",
                display_name=f"Wheelchair {char.nickname}",
            )
            await _upsert_assignment(
                session, ws.id, patient.id, wc_device.device_id
            )

            await _upsert_actor_map(
                session,
                ws.id,
                character_name=char.game_name,
                character_role=ACTOR_ROLE_PATIENT,
                patient_id=patient.id,
            )

        # Room-node cameras (WSN-*) for each bedroom; used when localization
        # runs in non-game mode. Safe no-ops in game-driven mode.
        for game_name, _rtype in GAME_ROOMS:
            if game_name == "Hallway":
                node = await _upsert_device(
                    session,
                    ws.id,
                    device_id=f"WSN-{game_name}",
                    hardware_type="node",
                    display_name=f"Node {game_name}",
                )
                rooms_by_game_name[game_name].node_device_id = node.device_id
                continue
            if not game_name.startswith("Room"):
                continue
            if game_name == "Room405":
                continue  # Skip Room405, use Hallway node instead
            node = await _upsert_device(
                session,
                ws.id,
                device_id=f"WSN-{game_name}",
                hardware_type="node",
                display_name=f"Node {game_name}",
            )
            rooms_by_game_name[game_name].node_device_id = node.device_id

        # Create caregiver rows for every non-admin dashboard user and link the
        # User.caregiver_id so Account Management / Personnel pages see them.
        caregivers_by_username: dict[str, CareGiver] = {}
        for username, _role in DASHBOARD_USERS:
            profile = _DASHBOARD_CAREGIVERS.get(username)
            if profile is None:
                continue
            first_name, last_name, role, employee_code = profile
            cg = await _upsert_caregiver(
                session,
                ws.id,
                _Nurse(
                    game_name=f"staff_{username}",
                    username=employee_code,
                    first_name=first_name,
                    last_name=last_name,
                    role=role,
                ),
            )
            caregivers_by_username[username] = cg
            result = await session.execute(
                select(User).where(User.username == username)
            )
            user = result.scalar_one_or_none()
            if user:
                user.caregiver_id = cg.id

        # SimGameActorMap entries for all 4 game nurse characters (female_nurse,
        # male_nurse, observer_a, observer_b) so dispatch_accepted can resolve
        # role → character and the dashboard sees who is online.
        for nurse in GAME_NURSES:
            # Map nurse.game_name → caregiver via username lookup from _Nurse
            # The game_name may be "observer_a" which matches no dashboard caregiver
            # directly, so we seed actor rows for all 4 explicitly.
            await _upsert_actor_map(
                session,
                ws.id,
                character_name=nurse.game_name,
                character_role=ACTOR_ROLE_CAREGIVER,
                caregiver_id=caregivers_by_username.get(nurse.username, None),
            )

        # Sim room appliances: lamp + AC for each bedroom so EaseAI
        # control_room_smart_device and /patient room-controls work.
        from app.models.core import SmartDevice
        for game_name, _rtype in GAME_ROOMS:
            if not game_name.startswith("Room"):
                continue
            room = rooms_by_game_name[game_name]
            for device_kind, device_type, ha_suffix in (
                ("lamp", "light", "LAMP"),
                ("ac", "climate", "AC"),
            ):
                entity_id = f"sim.{device_kind}.{game_name.lower()}"
                sd = await session.scalar(
                    select(SmartDevice).where(
                        SmartDevice.workspace_id == ws.id,
                        SmartDevice.ha_entity_id == entity_id,
                    )
                )
                if sd is None:
                    session.add(
                        SmartDevice(
                            workspace_id=ws.id,
                            room_id=room.id,
                            name=f"{device_kind.upper()} {game_name}",
                            ha_entity_id=entity_id,
                            device_type=device_type,
                            state="off",
                            is_active=True,
                            config={"source": "sim_game_seed", "room": game_name},
                        )
                    )
                else:
                    sd.room_id = room.id
                    sd.is_active = True

        # Create shift schedules for all caregivers (14 days ahead)
        await _create_caregiver_shifts(session, caregivers_by_username, days_ahead=14)

        # Seed shift checklist templates for each staff role
        await _seed_shift_checklists(session, ws.id, caregivers_by_username)

        # Create demo tasks for all staff (7 days ahead)
        await _create_demo_tasks(session, ws.id, caregivers_by_username, days_ahead=7)

        # Grant head-nurse / supervisor / observers visibility to every patient
        # so role-scoped queries (e.g. observer dashboards) return the full
        # cohort without relying on zone assignments.
        patient_ids = [
            pid
            for pid in (
                (
                    await session.execute(
                        select(Patient.id).where(Patient.workspace_id == ws.id)
                    )
                )
                .scalars()
                .all()
            )
        ]
        for username in _ACCESS_GRANT_USERNAMES:
            cg = caregivers_by_username.get(username)
            if cg is None:
                continue
            for patient_id in patient_ids:
                existing = await session.execute(
                    select(CareGiverPatientAccess).where(
                        CareGiverPatientAccess.workspace_id == ws.id,
                        CareGiverPatientAccess.caregiver_id == cg.id,
                        CareGiverPatientAccess.patient_id == patient_id,
                    )
                )
                row = existing.scalar_one_or_none()
                if row is None:
                    session.add(
                        CareGiverPatientAccess(
                            workspace_id=ws.id,
                            caregiver_id=cg.id,
                            patient_id=patient_id,
                            is_active=True,
                        )
                    )
                else:
                    row.is_active = True

        # Room mappings (game_room_name → room_id).
        for game_name, _rtype in GAME_ROOMS:
            await _upsert_room_map(
                session, ws.id, game_name, rooms_by_game_name[game_name].id
            )

        # Point the bootstrap admin at the demo workspace so `/admin` shows
        # the freshly seeded cohort without a manual workspace switch.
        await _attach_bootstrap_admin_to_workspace(session, ws.id)

        # Seed captured photos from simulation/Node-capture/
        await _seed_simulation_photos(session, ws.id, rooms_by_game_name)

        await session.commit()
        return ws.id


async def _seed_simulation_photos(
    session: AsyncSession,
    ws_id: int,
    rooms_by_game_name: dict[str, Room],
) -> None:
    """Copy simulation Node-capture images to photos dir and create PhotoRecord entries."""
    import shutil
    from datetime import datetime, timezone
    from pathlib import Path

    # Map of room names to capture image filenames
    capture_files = {
        "Room401": "Room-401.png",
        "Room402": "Room402.png",
        "Room403": "Room403.png",
        "Room404": "Room404.png",
        "Hallway": "Room-Hallway.png",
    }

    # Source and destination directories
    source_dir = Path(__file__).resolve().parents[4] / "simulation" / "Node-capture"
    photos_dir = Path(__file__).resolve().parents[3] / "photos"
    photos_dir.mkdir(parents=True, exist_ok=True)

    for room_name, filename in capture_files.items():
        room = rooms_by_game_name.get(room_name)
        if not room or not room.node_device_id:
            continue

        source_path = source_dir / filename
        if not source_path.exists():
            continue

        # Copy file to photos directory with timestamp
        ts_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        dest_filename = f"{room.node_device_id}_{ts_str}_sim.jpg"
        dest_path = photos_dir / dest_filename

        try:
            shutil.copy2(source_path, dest_path)
            file_size = dest_path.stat().st_size
        except OSError:
            continue

        # Check if photo record already exists for this device
        result = await session.execute(
            select(PhotoRecord).where(
                PhotoRecord.workspace_id == ws_id,
                PhotoRecord.device_id == room.node_device_id,
            ).order_by(PhotoRecord.timestamp.desc()).limit(1)
        )
        existing = result.scalar_one_or_none()

        if existing:
            # Update existing record
            existing.filepath = str(dest_path)
            existing.file_size = file_size
            existing.timestamp = datetime.now(timezone.utc)
        else:
            # Create new PhotoRecord
            session.add(
                PhotoRecord(
                    workspace_id=ws_id,
                    device_id=room.node_device_id,
                    photo_id=f"sim_{room_name}_{ts_str}",
                    filepath=str(dest_path),
                    file_size=file_size,
                    timestamp=datetime.now(timezone.utc),
                )
            )


async def _attach_bootstrap_admin_to_workspace(
    session: AsyncSession, workspace_id: int
) -> None:
    """Move the bootstrap admin user onto the demo workspace (idempotent)."""
    result = await session.execute(
        select(User).where(User.username == settings.bootstrap_admin_username)
    )
    user = result.scalar_one_or_none()
    if user is None:
        return
    if user.workspace_id != workspace_id:
        user.workspace_id = workspace_id
    user.is_active = True


def _parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Seed WheelSense simulator workspace to match the Godot game."
    )
    p.add_argument("--workspace", default=None, help="Override workspace name.")
    p.add_argument(
        "--reset",
        action="store_true",
        help="Clear workspace-scoped dynamic data before re-seeding.",
    )
    return p.parse_args(list(argv) if argv is not None else None)


def main() -> None:
    args = _parse_args()
    ws_id = asyncio.run(
        seed_sim_game_workspace(workspace_name=args.workspace, reset=args.reset)
    )
    print(f"[sim_game_seed] workspace_id={ws_id} reset={args.reset}")


if __name__ == "__main__":
    main()
