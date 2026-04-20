#!/usr/bin/env python3
"""Seed WheelSense with the 2026-04-20 redesign test cohort.

Staff (5 users total, one password for all): admin, head_nurse, supervisor, observer, observer2.
Patients (5): Emika, Somchai, Rattana, Krit, Wichai (user-provided profiles).

Idempotent: safe to re-run. Pass --reset to wipe the workspace first.

Run from host (simulator stack):
    docker compose -f docker-compose.sim.yml exec wheelsense-backend \
        python scripts/seed_redesign_demo.py --reset

Or locally against a dev DB:
    cd server
    python scripts/seed_redesign_demo.py --reset
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from app.config import settings
from app.core.security import get_password_hash
from app.db.session import AsyncSessionLocal
from app.models import (
    CareGiver,
    CareGiverPatientAccess,
    Device,
    Facility,
    Floor,
    FloorplanLayout,
    Patient,
    PatientContact,
    PatientDeviceAssignment,
    Room,
    User,
    Workspace,
)

DEMO_PASSWORD = "demo1234"
DEMO_WORKSPACE = (settings.bootstrap_demo_workspace_name or "WheelSense Demo Workspace").strip()

# ────────────────────────────────────────────────────────────────────────────
# Staff roster (5 users)
# ────────────────────────────────────────────────────────────────────────────
STAFF: list[dict] = [
    {
        "role": "admin",
        "username": "admin",
        "first_name": "IT",
        "last_name": "Support",
        "employee_code": "AD-001",
        "department": "Operations",
        "phone": "081-100-0001",
        "email": "admin@wheelsense.local",
    },
    {
        "role": "head_nurse",
        "username": "headnurse",
        "first_name": "ศิริพร",
        "last_name": "หัวหน้าวอร์ด",
        "employee_code": "HN-001",
        "department": "Nursing",
        "phone": "081-100-0002",
        "email": "headnurse@wheelsense.local",
    },
    {
        "role": "supervisor",
        "username": "supervisor",
        "first_name": "มานะ",
        "last_name": "เวชกิจ",
        "employee_code": "SV-001",
        "department": "Clinical Specialist",
        "phone": "081-100-0003",
        "email": "supervisor@wheelsense.local",
    },
    {
        "role": "observer",
        "username": "observer1",
        "first_name": "สุดา",
        "last_name": "ใจดี",
        "employee_code": "OB-001",
        "department": "Nursing",
        "phone": "081-100-0004",
        "email": "observer1@wheelsense.local",
    },
    {
        "role": "observer",
        "username": "observer2",
        "first_name": "วิมล",
        "last_name": "รักษ์ไทย",
        "employee_code": "OB-002",
        "department": "Nursing",
        "phone": "081-100-0005",
        "email": "observer2@wheelsense.local",
    },
]

# ────────────────────────────────────────────────────────────────────────────
# Patient cohort — exactly as user specified (2026-04-20)
# ────────────────────────────────────────────────────────────────────────────
PATIENTS: list[dict] = [
    {
        # #55902 — Wheelchair user, Spinal Cord Injury
        "first_name": "เอมิกา",
        "last_name": "เจริญผล",
        "nickname": "Emika",
        "gender": "female",
        "date_of_birth": date(1978, 8, 12),
        "height_cm": 165,
        "weight_kg": 60,
        "blood_type": "A+",
        "medical_conditions": [
            {"condition": "T12 Spinal Cord Injury", "severity": "high", "since": "2018"},
            {"condition": "Chronic UTI", "severity": "medium"},
        ],
        "allergies": ["Latex"],
        "medications": [
            {"name": "Baclofen", "dosage": "10mg", "frequency": "3x daily"},
            {"name": "Nitrofurantoin", "dosage": "100mg", "frequency": "1x daily"},
        ],
        "past_surgeries": [{"procedure": "Spinal fusion", "year": 2018}],
        "care_level": "special",
        "mobility_type": "wheelchair",
        "current_mode": "wheelchair",
        "notes": "Patient ID 55902. Wheelchair rolling distance today ≈1850m. Room 210.",
        "room_name": "Room 210",
        "emergency_contact": {
            "name": "Carlos Rodriguez",
            "relationship": "Husband",
            "phone": "+1 555 123 4567",
        },
    },
    {
        # #77314 — Wheelchair user, Amputee
        "first_name": "สมชาย",
        "last_name": "รักษาดี",
        "nickname": "Somchai",
        "gender": "male",
        "date_of_birth": date(1961, 11, 3),
        "height_cm": 180,
        "weight_kg": 88,
        "blood_type": "B-",
        "medical_conditions": [
            {"condition": "Type 2 Diabetes", "severity": "medium"},
            {"condition": "Peripheral Artery Disease", "severity": "medium"},
        ],
        "allergies": [],
        "medications": [
            {"name": "Metformin", "dosage": "1000mg", "frequency": "2x daily"},
            {"name": "Gabapentin", "dosage": "300mg", "frequency": "3x daily"},
        ],
        "past_surgeries": [
            {"procedure": "Right Below-Knee Amputation", "year": 2023}
        ],
        "care_level": "special",
        "mobility_type": "wheelchair",
        "current_mode": "wheelchair",
        "notes": "Patient ID 77314. Elevated BP 135/85. Gait training with prosthetic. Room 305.",
        "room_name": "Room 305",
        "emergency_contact": {
            "name": "Alicia Johnson",
            "relationship": "Daughter",
            "phone": "+1 555 987 6543",
        },
    },
    {
        # #44291 — Wheelchair user, Memory Care, high wandering risk
        "first_name": "รัตนา",
        "last_name": "ศรีสุวรรณ",
        "nickname": "Rattana",
        "gender": "female",
        "date_of_birth": date(1948, 2, 25),
        "height_cm": 160,
        "weight_kg": 55,
        "blood_type": "AB+",
        "medical_conditions": [
            {"condition": "Alzheimer's Disease", "severity": "high", "stage": "moderate_to_severe"},
            {"condition": "Severe Osteoarthritis (bilateral knees)", "severity": "high"},
            {"condition": "High Wandering Risk", "severity": "high"},
        ],
        "allergies": ["Ibuprofen"],
        "medications": [
            {"name": "Donepezil", "dosage": "10mg", "frequency": "1x daily"},
            {"name": "Memantine", "dosage": "10mg", "frequency": "2x daily"},
            {"name": "Melatonin", "dosage": "3mg", "frequency": "at night"},
        ],
        "past_surgeries": [{"procedure": "Right Knee Replacement", "year": 2015}],
        "care_level": "critical",
        "mobility_type": "wheelchair",
        "current_mode": "wheelchair",
        "notes": "Patient ID 44291. Secured Memory Care Unit. Sundowning prevention in evening. Room 112.",
        "room_name": "Room 112",
        "emergency_contact": {
            "name": "David Chen",
            "relationship": "Son",
            "phone": "+1 555 444 9988",
        },
    },
    {
        # #99105 — Ambulatory, normal mobility
        "first_name": "กฤษณ์",
        "last_name": "วงศ์วัฒนา",
        "nickname": "Krit",
        "gender": "male",
        "date_of_birth": date(1968, 7, 8),
        "height_cm": 185,
        "weight_kg": 92,
        "blood_type": "O-",
        "medical_conditions": [
            {"condition": "Mild Hypertension", "severity": "low"},
            {"condition": "Hyperlipidemia", "severity": "low"},
        ],
        "allergies": ["Peanuts"],
        "medications": [
            {"name": "Amlodipine", "dosage": "5mg", "frequency": "1x daily"},
            {"name": "Rosuvastatin", "dosage": "10mg", "frequency": "1x daily"},
        ],
        "past_surgeries": [{"procedure": "Appendectomy", "year": 1995}],
        "care_level": "normal",
        "mobility_type": "independent",
        "current_mode": "walking",
        "notes": "Patient ID 99105. Cardiac stress test scheduled. Room 415.",
        "room_name": "Room 415",
        "emergency_contact": {
            "name": "Mary O'Connor",
            "relationship": "Wife",
            "phone": "+1 555 222 3333",
        },
    },
    {
        # #33048 — Bedridden, ICU/High dependency
        "first_name": "วิชัย",
        "last_name": "ภัทรพงศ์",
        "nickname": "Wichai",
        "gender": "male",
        "date_of_birth": date(1939, 12, 12),
        "height_cm": 172,
        "weight_kg": 65,
        "blood_type": "A-",
        "medical_conditions": [
            {"condition": "Severe Ischemic Stroke (right hemiparesis)", "severity": "high"},
            {"condition": "Advanced Dementia", "severity": "high"},
            {"condition": "Dysphagia", "severity": "high"},
        ],
        "allergies": ["Penicillin"],
        "medications": [
            {"name": "Clopidogrel", "dosage": "75mg", "frequency": "1x daily"},
            {"name": "Donepezil", "dosage": "10mg", "frequency": "1x daily"},
        ],
        "past_surgeries": [{"procedure": "Pacemaker insertion", "year": 2015}],
        "care_level": "critical",
        "mobility_type": "wheelchair",  # bedridden — closest enum
        "current_mode": "wheelchair",
        "notes": "Patient ID 33048. ICU / High Dependency. Pacemaker HR ~60. On 2L O2. Repositioning q2h. Room 501.",
        "room_name": "Room 501",
        "emergency_contact": {
            "name": "Thomas Davies",
            "relationship": "Son",
            "phone": "+1 555 777 1122",
        },
    },
]

# Rooms to ensure exist
ROOM_NAMES = ["Room 112", "Room 210", "Room 305", "Room 415", "Room 501"]


@dataclass
class SeedCtx:
    workspace: Workspace
    facility: Facility
    floors: list[Floor]
    rooms_by_name: dict[str, Room]


# ────────────────────────────────────────────────────────────────────────────
# Workspace & facility
# ────────────────────────────────────────────────────────────────────────────
async def ensure_workspace(session: AsyncSession, name: str, reset: bool) -> Workspace:
    q = await session.execute(select(Workspace).where(Workspace.name == name))
    ws = q.scalar_one_or_none()
    if ws and reset:
        await session.delete(ws)
        await session.commit()
        ws = None
    if ws is None:
        ws = Workspace(name=name, mode="simulation", is_active=True)
        session.add(ws)
        await session.commit()
        await session.refresh(ws)
    return ws


async def ensure_facility(session: AsyncSession, ws_id: int) -> tuple[Facility, list[Floor]]:
    q = await session.execute(
        select(Facility).where(
            Facility.workspace_id == ws_id,
            Facility.name == "WheelSense Demo Facility",
        )
    )
    fac = q.scalar_one_or_none()
    if fac is None:
        fac = Facility(
            workspace_id=ws_id,
            name="WheelSense Demo Facility",
            address="Bangkok",
            description="Redesign cohort demo facility",
            config={},
        )
        session.add(fac)
        await session.flush()
    floors: list[Floor] = []
    for n, label in ((1, "Floor 1"), (2, "Floor 2"), (3, "Floor 3"), (4, "Floor 4"), (5, "Floor 5")):
        q = await session.execute(
            select(Floor).where(
                Floor.workspace_id == ws_id,
                Floor.facility_id == fac.id,
                Floor.floor_number == n,
            )
        )
        fl = q.scalar_one_or_none()
        if fl is None:
            fl = Floor(
                workspace_id=ws_id,
                facility_id=fac.id,
                floor_number=n,
                name=label,
                map_data={},
            )
            session.add(fl)
            await session.flush()
        floors.append(fl)
    await session.commit()
    return fac, floors


async def ensure_rooms(
    session: AsyncSession, ws_id: int, floors: list[Floor]
) -> dict[str, Room]:
    """Map rooms by patient floor: Room 1xx→F1, 2xx→F2, etc."""
    out: dict[str, Room] = {}
    for name in ROOM_NAMES:
        # Room 210 → floor 2
        num = int(name.split()[-1])
        floor_idx = min(num // 100, len(floors)) - 1
        floor = floors[max(floor_idx, 0)]
        q = await session.execute(
            select(Room).where(Room.workspace_id == ws_id, Room.name == name)
        )
        r = q.scalar_one_or_none()
        if r is None:
            r = Room(
                workspace_id=ws_id,
                floor_id=floor.id,
                name=name,
                description="",
                room_type="bedroom",
                config={},
                adjacent_rooms=[],
            )
            session.add(r)
            await session.flush()
        else:
            r.floor_id = floor.id
        out[name] = r
    await session.commit()
    return out


async def ensure_floorplan_layout(
    session: AsyncSession,
    ws_id: int,
    facility: Facility,
    floors: list[Floor],
    rooms_by_name: dict[str, Room],
) -> None:
    for floor in floors:
        floor_rooms = [r for r in rooms_by_name.values() if r.floor_id == floor.id]
        layout_rooms = []
        for i, room in enumerate(floor_rooms):
            x = 5.0 + (i % 3) * 30.0
            y = 5.0 + (i // 3) * 30.0
            layout_rooms.append({
                "id": f"room-{room.id}",
                "label": room.name,
                "x": x, "y": y, "w": 25.0, "h": 20.0,
                "device_id": None, "power_kw": None,
            })
        payload = {"version": 1, "rooms": layout_rooms}
        q = await session.execute(
            select(FloorplanLayout).where(
                FloorplanLayout.workspace_id == ws_id,
                FloorplanLayout.facility_id == facility.id,
                FloorplanLayout.floor_id == floor.id,
            )
        )
        row = q.scalar_one_or_none()
        if row is None:
            session.add(FloorplanLayout(
                workspace_id=ws_id, facility_id=facility.id,
                floor_id=floor.id, layout_json=payload,
            ))
        else:
            row.layout_json = payload
    await session.commit()


# ────────────────────────────────────────────────────────────────────────────
# Staff
# ────────────────────────────────────────────────────────────────────────────
async def seed_staff(session: AsyncSession, ws_id: int) -> dict[str, tuple[User, CareGiver | None]]:
    hashed = get_password_hash(DEMO_PASSWORD)
    out: dict[str, tuple[User, CareGiver | None]] = {}
    for cfg in STAFF:
        role = cfg["role"]
        # Caregiver row (skip for pure admin — admin does not need a caregiver row for ops)
        caregiver = None
        if role != "admin":
            cq = await session.execute(
                select(CareGiver).where(
                    CareGiver.workspace_id == ws_id,
                    CareGiver.first_name == cfg["first_name"],
                    CareGiver.last_name == cfg["last_name"],
                )
            )
            caregiver = cq.scalar_one_or_none()
            if caregiver is None:
                caregiver = CareGiver(
                    workspace_id=ws_id,
                    first_name=cfg["first_name"],
                    last_name=cfg["last_name"],
                    role=role,
                    employee_code=cfg["employee_code"],
                    department=cfg["department"],
                    employment_type="full_time",
                    is_active=True,
                    phone=cfg["phone"],
                    email=cfg["email"],
                )
                session.add(caregiver)
                await session.flush()
            else:
                caregiver.role = role
                caregiver.is_active = True

        uq = await session.execute(select(User).where(User.username == cfg["username"]))
        user = uq.scalar_one_or_none()
        if user is None:
            user = User(
                workspace_id=ws_id,
                username=cfg["username"],
                hashed_password=hashed,
                role=role,
                caregiver_id=(caregiver.id if caregiver else None),
                is_active=True,
            )
            session.add(user)
        else:
            if user.workspace_id != ws_id:
                raise RuntimeError(
                    f"User '{cfg['username']}' already exists in workspace={user.workspace_id}. "
                    "Run with --reset or drop the stale workspace."
                )
            user.role = role
            user.caregiver_id = caregiver.id if caregiver else None
            user.hashed_password = hashed
            user.is_active = True
        await session.flush()
        out[cfg["username"]] = (user, caregiver)
    await session.commit()
    return out


# ────────────────────────────────────────────────────────────────────────────
# Patients + contacts + device
# ────────────────────────────────────────────────────────────────────────────
async def seed_patients(
    session: AsyncSession,
    ws_id: int,
    rooms_by_name: dict[str, Room],
) -> list[Patient]:
    out: list[Patient] = []
    for i, p in enumerate(PATIENTS):
        room = rooms_by_name.get(p["room_name"])  # may be None if room missing
        emergency = p["emergency_contact"]

        q = await session.execute(
            select(Patient).where(
                Patient.workspace_id == ws_id,
                Patient.first_name == p["first_name"],
                Patient.last_name == p["last_name"],
            )
        )
        patient = q.scalar_one_or_none()

        patient_kwargs = {
            "first_name": p["first_name"],
            "last_name": p["last_name"],
            "nickname": p["nickname"],
            "gender": p["gender"],
            "date_of_birth": p["date_of_birth"],
            "height_cm": p["height_cm"],
            "weight_kg": p["weight_kg"],
            "blood_type": p["blood_type"],
            "medical_conditions": p["medical_conditions"],
            "allergies": p["allergies"],
            "medications": p["medications"],
            "past_surgeries": p["past_surgeries"],
            "care_level": p["care_level"],
            "mobility_type": p["mobility_type"],
            "current_mode": p["current_mode"],
            "notes": p["notes"],
            "is_active": True,
            "room_id": room.id if room else None,
        }

        if patient is None:
            patient = Patient(workspace_id=ws_id, **patient_kwargs)
            session.add(patient)
        else:
            for k, v in patient_kwargs.items():
                setattr(patient, k, v)
        await session.flush()

        # Emergency contact
        cq = await session.execute(
            select(PatientContact).where(
                PatientContact.patient_id == patient.id,
                PatientContact.contact_type == "emergency",
            )
        )
        contact = cq.scalar_one_or_none()
        if contact is None:
            session.add(PatientContact(
                patient_id=patient.id,
                contact_type="emergency",
                name=emergency["name"],
                relationship=emergency["relationship"],
                phone=emergency["phone"],
                is_primary=True,
            ))
        else:
            contact.name = emergency["name"]
            contact.relationship = emergency["relationship"]
            contact.phone = emergency["phone"]
            contact.is_primary = True

        # Wheelchair device + assignment for every patient (simulator will publish telemetry)
        device_id = f"SIM_WHEEL_{i + 1:02d}"
        dq = await session.execute(
            select(Device).where(Device.workspace_id == ws_id, Device.device_id == device_id)
        )
        dev = dq.scalar_one_or_none()
        if dev is None:
            session.add(Device(
                workspace_id=ws_id,
                device_id=device_id,
                device_type="wheelchair",
                hardware_type="wheelchair",
                display_name=f"Wheelchair {i + 1:02d} ({p['nickname']})",
                ip_address="",
                firmware="sim-v1",
                config={"sim": True, "patient_nickname": p["nickname"]},
            ))
            await session.flush()

        aq = await session.execute(
            select(PatientDeviceAssignment).where(
                PatientDeviceAssignment.workspace_id == ws_id,
                PatientDeviceAssignment.device_id == device_id,
                PatientDeviceAssignment.is_active.is_(True),
            )
        )
        assign = aq.scalar_one_or_none()
        if assign is None:
            session.add(PatientDeviceAssignment(
                workspace_id=ws_id,
                patient_id=patient.id,
                device_id=device_id,
                device_role="wheelchair_sensor",
                is_active=True,
            ))
        out.append(patient)
    await session.commit()
    return out


async def assign_caregivers_to_patients(
    session: AsyncSession,
    ws_id: int,
    staff: dict[str, tuple[User, CareGiver | None]],
    patients: list[Patient],
) -> None:
    """Give both observers visibility to all patients; supervisor + head_nurse too."""
    targets = [
        staff.get(u) for u in ("headnurse", "supervisor", "observer1", "observer2")
    ]
    for entry in targets:
        if not entry:
            continue
        _, caregiver = entry
        if caregiver is None:
            continue
        for patient in patients:
            q = await session.execute(
                select(CareGiverPatientAccess).where(
                    CareGiverPatientAccess.caregiver_id == caregiver.id,
                    CareGiverPatientAccess.patient_id == patient.id,
                )
            )
            row = q.scalar_one_or_none()
            if row is None:
                session.add(CareGiverPatientAccess(
                    workspace_id=ws_id,
                    caregiver_id=caregiver.id,
                    patient_id=patient.id,
                    is_active=True,
                ))
            else:
                row.is_active = True
    await session.commit()


# ────────────────────────────────────────────────────────────────────────────
# Entry
# ────────────────────────────────────────────────────────────────────────────
async def run(workspace_name: str, reset: bool) -> None:
    async with AsyncSessionLocal() as session:
        ws = await ensure_workspace(session, workspace_name, reset)
        fac, floors = await ensure_facility(session, ws.id)
        rooms = await ensure_rooms(session, ws.id, floors)
        await ensure_floorplan_layout(session, ws.id, fac, floors, rooms)
        staff = await seed_staff(session, ws.id)
        patients = await seed_patients(session, ws.id, rooms)
        await assign_caregivers_to_patients(session, ws.id, staff, patients)

    print("───────────────────────────────────────────────────────────")
    print(f"Workspace   : {workspace_name}")
    print(f"Staff users : {', '.join(cfg['username'] for cfg in STAFF)}")
    print(f"Password    : {DEMO_PASSWORD}")
    print(f"Patients    : {', '.join(p['nickname'] for p in PATIENTS)}")
    print("───────────────────────────────────────────────────────────")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Seed the 2026-04-20 redesign cohort")
    p.add_argument("--workspace", default=DEMO_WORKSPACE)
    p.add_argument("--reset", action="store_true")
    return p.parse_args()


def main() -> None:
    out = getattr(sys.stdout, "reconfigure", None)
    if callable(out):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass
    args = parse_args()
    asyncio.run(run(args.workspace, args.reset))


if __name__ == "__main__":
    main()
