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
import hashlib
import os
import random
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from app.config import settings
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
    PatientContact,
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
DEMO_PATIENT_COUNT = 6
DEMO_ROOM_NODE_COUNT = 12

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
        # Patient 1 — Wichai: ICU/Bedridden, stroke + dementia (matches reference image)
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
            {"name": "Aspirin", "dosage": "100mg", "frequency": "1x daily"},
        ],
        "past_surgeries": [{"procedure": "Pacemaker insertion", "year": 2015}],
        "care_level": "critical",
        "mobility_type": "wheelchair",
        "current_mode": "wheelchair",
        "notes": "ICU / High Dependency. Pacemaker HR ~60. On 2L O2. Repositioning q2h. High stroke risk score 78/100.",
    },
    {
        # Patient 2 — Rattana: Memory Care, wandering risk
        "first_name": "รัตนา",
        "last_name": "ศรีสุวรรณ",
        "nickname": "Rattana",
        "gender": "female",
        "date_of_birth": date(1948, 2, 25),
        "height_cm": 160,
        "weight_kg": 55,
        "blood_type": "AB+",
        "medical_conditions": [
            {"condition": "Alzheimer's Disease (moderate-to-severe)", "severity": "high"},
            {"condition": "Severe Osteoarthritis (bilateral knees)", "severity": "high"},
            {"condition": "High Wandering Risk", "severity": "high"},
        ],
        "allergies": ["Ibuprofen", "Aspirin"],
        "medications": [
            {"name": "Donepezil", "dosage": "10mg", "frequency": "1x daily"},
            {"name": "Memantine", "dosage": "10mg", "frequency": "2x daily"},
            {"name": "Melatonin", "dosage": "3mg", "frequency": "nightly"},
        ],
        "past_surgeries": [{"procedure": "Right Knee Replacement", "year": 2015}],
        "care_level": "critical",
        "mobility_type": "wheelchair",
        "current_mode": "wheelchair",
        "notes": "Secured Memory Care Unit. Sundowning prevention protocol active in evenings. Check q1h.",
    },
    {
        # Patient 3 — Emika: Spinal cord injury, wheelchair user
        "first_name": "เอมิกา",
        "last_name": "เจริญผล",
        "nickname": "Emika",
        "gender": "female",
        "date_of_birth": date(1978, 8, 12),
        "height_cm": 165,
        "weight_kg": 60,
        "blood_type": "A+",
        "medical_conditions": [
            {"condition": "T12 Spinal Cord Injury", "severity": "high"},
            {"condition": "Chronic UTI", "severity": "medium"},
        ],
        "allergies": ["Latex"],
        "medications": [
            {"name": "Baclofen", "dosage": "10mg", "frequency": "3x daily"},
            {"name": "Nitrofurantoin", "dosage": "100mg", "frequency": "1x daily"},
        ],
        "past_surgeries": [{"procedure": "Spinal fusion L1-L2", "year": 2018}],
        "care_level": "special",
        "mobility_type": "wheelchair",
        "current_mode": "wheelchair",
        "notes": "Wheelchair rolling distance ~1850m/day. Bladder management program. Independent ADL with aids.",
    },
    {
        # Patient 4 — Somchai: Diabetic amputee, PT in progress
        "first_name": "สมชาย",
        "last_name": "รักษาดี",
        "nickname": "Somchai",
        "gender": "male",
        "date_of_birth": date(1961, 11, 3),
        "height_cm": 180,
        "weight_kg": 88,
        "blood_type": "B-",
        "medical_conditions": [
            {"condition": "Type 2 Diabetes Mellitus", "severity": "medium"},
            {"condition": "Peripheral Artery Disease", "severity": "medium"},
            {"condition": "Right Below-Knee Amputation", "severity": "high"},
        ],
        "allergies": [],
        "medications": [
            {"name": "Metformin", "dosage": "1000mg", "frequency": "2x daily"},
            {"name": "Gabapentin", "dosage": "300mg", "frequency": "3x daily"},
            {"name": "Amlodipine", "dosage": "5mg", "frequency": "1x daily"},
        ],
        "past_surgeries": [{"procedure": "Right Below-Knee Amputation", "year": 2023}],
        "care_level": "special",
        "mobility_type": "wheelchair",
        "current_mode": "wheelchair",
        "notes": "Elevated BP 135/85. Prosthetic gait training 3x/week. Wound check daily. Monitor blood glucose.",
    },
    {
        # Patient 5 — Krit: Hypertension, ambulatory, lower risk
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
        "notes": "Cardiac stress test scheduled. Routine monitoring. Encourage 30-min daily walk.",
    },
    {
        # Patient 6 — นภา: Osteoporosis, walker
        "first_name": "นภา",
        "last_name": "สวยงาม",
        "nickname": "Napa",
        "gender": "female",
        "date_of_birth": date(1952, 7, 22),
        "height_cm": 158,
        "weight_kg": 50,
        "blood_type": "O+",
        "medical_conditions": [
            {"condition": "Osteoporosis", "severity": "medium"},
            {"condition": "Vitamin D Deficiency", "severity": "low"},
        ],
        "allergies": [],
        "medications": [
            {"name": "Calcium carbonate", "dosage": "500mg", "frequency": "2x daily"},
            {"name": "Vitamin D3", "dosage": "1000IU", "frequency": "1x daily"},
            {"name": "Alendronate", "dosage": "70mg", "frequency": "1x weekly"},
        ],
        "past_surgeries": [],
        "care_level": "normal",
        "mobility_type": "walker",
        "current_mode": "walking",
        "notes": "Fall prevention protocol. Walker assistance for all ambulation. DEXA scan due next quarter.",
    },
    {
        # Patient 7 — สมศักดิ์: CKD, wheelchair
        "first_name": "สมศักดิ์",
        "last_name": "มั่นคง",
        "nickname": "Somsak",
        "gender": "male",
        "date_of_birth": date(1940, 9, 30),
        "height_cm": 168,
        "weight_kg": 58,
        "blood_type": "B+",
        "medical_conditions": [
            {"condition": "Chronic Kidney Disease Stage 4", "severity": "high"},
            {"condition": "Anemia of CKD", "severity": "medium"},
            {"condition": "Hypertension", "severity": "medium"},
        ],
        "allergies": ["NSAIDs"],
        "medications": [
            {"name": "Erythropoietin", "dosage": "4000IU", "frequency": "3x weekly (SC)"},
            {"name": "Calcium acetate", "dosage": "667mg", "frequency": "3x daily with meals"},
            {"name": "Lisinopril", "dosage": "5mg", "frequency": "1x daily"},
        ],
        "past_surgeries": [{"procedure": "AV Fistula creation (left forearm)", "year": 2021}],
        "care_level": "critical",
        "mobility_type": "wheelchair",
        "current_mode": "wheelchair",
        "notes": "Dialysis Monday/Wednesday/Friday 08:00-11:30. Fluid restriction 1L/day. AV fistula left arm — no BP cuff.",
    },
    {
        # Patient 8 — จันทร์เพ็ญ: Cataract surgery recovery
        "first_name": "จันทร์เพ็ญ",
        "last_name": "แสงจันทร์",
        "nickname": "Chanpen",
        "gender": "female",
        "date_of_birth": date(1947, 4, 18),
        "height_cm": 155,
        "weight_kg": 52,
        "blood_type": "AB-",
        "medical_conditions": [
            {"condition": "Bilateral Cataract (post-op right eye)", "severity": "low"},
            {"condition": "Type 2 Diabetes", "severity": "medium"},
        ],
        "allergies": [],
        "medications": [
            {"name": "Prednisolone eye drops (right)", "dosage": "1 drop", "frequency": "4x daily"},
            {"name": "Metformin", "dosage": "500mg", "frequency": "2x daily"},
        ],
        "past_surgeries": [{"procedure": "Right eye phacoemulsification (cataract)", "year": 2026}],
        "care_level": "normal",
        "mobility_type": "independent",
        "current_mode": "walking",
        "notes": "Post-op cataract right eye. Avoid bending/lifting >5kg. Left eye surgery pending. Blood glucose weekly.",
    },
    {
        # Patient 9 — ทองดี: Asthma + COPD
        "first_name": "ทองดี",
        "last_name": "มีเงิน",
        "nickname": "Thongdi",
        "gender": "male",
        "date_of_birth": date(1938, 12, 5),
        "height_cm": 165,
        "weight_kg": 55,
        "blood_type": "A+",
        "medical_conditions": [
            {"condition": "COPD (Gold Stage III)", "severity": "high"},
            {"condition": "Asthma", "severity": "medium"},
            {"condition": "Cor Pulmonale", "severity": "medium"},
        ],
        "allergies": ["Aspirin", "Beta-blockers"],
        "medications": [
            {"name": "Tiotropium inhaler", "dosage": "18mcg", "frequency": "1x daily"},
            {"name": "Salbutamol inhaler", "dosage": "2 puffs", "frequency": "PRN"},
            {"name": "Prednisolone", "dosage": "5mg", "frequency": "1x daily"},
        ],
        "past_surgeries": [],
        "care_level": "special",
        "mobility_type": "wheelchair",
        "current_mode": "wheelchair",
        "notes": "On 2L O2 continuous. SpO2 target 88-92%. Pursed lip breathing exercises. No smoking areas strictly.",
    },
    {
        # Patient 10 — ศรีสุดา: Healthy, rehab discharge candidate
        "first_name": "ศรีสุดา",
        "last_name": "ใจผ่อง",
        "nickname": "Sri",
        "gender": "female",
        "date_of_birth": date(1954, 3, 27),
        "height_cm": 162,
        "weight_kg": 57,
        "blood_type": "O+",
        "medical_conditions": [
            {"condition": "Hip Fracture (post-op, recovering)", "severity": "medium"},
        ],
        "allergies": [],
        "medications": [
            {"name": "Paracetamol", "dosage": "500mg", "frequency": "PRN (max 4x daily)"},
            {"name": "Enoxaparin", "dosage": "40mg", "frequency": "1x daily (SC)"},
        ],
        "past_surgeries": [{"procedure": "Right hip ORIF", "year": 2026}],
        "care_level": "normal",
        "mobility_type": "walker",
        "current_mode": "walking",
        "notes": "Post-ORIF hip rehab. Weight-bearing as tolerated. PT 2x daily. DVT prophylaxis. Target discharge in 3 weeks.",
    },
]

DEMO_FACILITY_NAME = "WheelSense Care Center"
DEMO_FACILITY_ADDRESS = "401 Wellness Avenue, Simulation Campus"

DEMO_ROOMS: list[dict[str, str]] = [
    {"name": "Room 401", "type": "bedroom"},
    {"name": "Room 402", "type": "bedroom"},
    {"name": "Room 403", "type": "bedroom"},
    {"name": "Room 404", "type": "bedroom"},
    {"name": "Room 405", "type": "bedroom"},
    {"name": "Room 406", "type": "bedroom"},
    {"name": "Bathroom", "type": "bathroom"},
    {"name": "Dining Room", "type": "dining"},
    {"name": "Main Hall", "type": "activity"},
    {"name": "Physiotherapy Room", "type": "clinic"},
    {"name": "Nurses' Station", "type": "clinic"},
    {"name": "Garden Lounge", "type": "garden"},
]

DEMO_PATIENTS: list[dict] = [
    {
        "first_name": "Eleanor",
        "last_name": "Price",
        "nickname": "Eleanor",
        "gender": "female",
        "date_of_birth": date(1942, 5, 14),
        "height_cm": 158,
        "weight_kg": 54,
        "blood_type": "A+",
        "medical_conditions": [
            {"condition": "Parkinson's disease", "severity": "high"},
            {"condition": "Postural hypotension", "severity": "medium"},
        ],
        "allergies": ["Penicillin"],
        "medications": [
            {"name": "Carbidopa/Levodopa", "dosage": "25/100mg", "frequency": "4x daily"},
            {"name": "Midodrine", "dosage": "5mg", "frequency": "2x daily"},
        ],
        "past_surgeries": [{"procedure": "Left hip ORIF", "year": 2021}],
        "care_level": "critical",
        "mobility_type": "wheelchair",
        "current_mode": "wheelchair",
        "notes": "Room 401. High fall risk and assisted transfers only.",
        "portrait_slug": "patient-eleanor-price",
    },
    {
        "first_name": "Robert",
        "last_name": "Chen",
        "nickname": "Robert",
        "gender": "male",
        "date_of_birth": date(1938, 10, 2),
        "height_cm": 170,
        "weight_kg": 68,
        "blood_type": "O+",
        "medical_conditions": [
            {"condition": "Congestive heart failure", "severity": "high"},
            {"condition": "Chronic kidney disease stage 3", "severity": "medium"},
        ],
        "allergies": ["Sulfa drugs"],
        "medications": [
            {"name": "Furosemide", "dosage": "40mg", "frequency": "1x daily"},
            {"name": "Metoprolol", "dosage": "25mg", "frequency": "2x daily"},
        ],
        "past_surgeries": [{"procedure": "Coronary stent placement", "year": 2017}],
        "care_level": "critical",
        "mobility_type": "wheelchair",
        "current_mode": "wheelchair",
        "notes": "Room 402. Daily weight check and edema monitoring.",
        "portrait_slug": "patient-robert-chen",
    },
    {
        "first_name": "Margaret",
        "last_name": "Lewis",
        "nickname": "Maggie",
        "gender": "female",
        "date_of_birth": date(1949, 1, 21),
        "height_cm": 162,
        "weight_kg": 59,
        "blood_type": "B+",
        "medical_conditions": [
            {"condition": "Moderate dementia", "severity": "high"},
            {"condition": "Osteoarthritis", "severity": "medium"},
        ],
        "allergies": ["Ibuprofen"],
        "medications": [
            {"name": "Donepezil", "dosage": "10mg", "frequency": "1x daily"},
            {"name": "Acetaminophen", "dosage": "500mg", "frequency": "PRN"},
        ],
        "past_surgeries": [{"procedure": "Right knee replacement", "year": 2016}],
        "care_level": "special",
        "mobility_type": "walker",
        "current_mode": "walking",
        "notes": "Room 403. Wandering precautions active after dinner.",
        "portrait_slug": "patient-margaret-lewis",
    },
    {
        "first_name": "Daniel",
        "last_name": "Carter",
        "nickname": "Dan",
        "gender": "male",
        "date_of_birth": date(1956, 7, 9),
        "height_cm": 178,
        "weight_kg": 82,
        "blood_type": "A-",
        "medical_conditions": [
            {"condition": "Right below-knee amputation", "severity": "high"},
            {"condition": "Type 2 diabetes", "severity": "medium"},
        ],
        "allergies": [],
        "medications": [
            {"name": "Metformin", "dosage": "1000mg", "frequency": "2x daily"},
            {"name": "Gabapentin", "dosage": "300mg", "frequency": "3x daily"},
        ],
        "past_surgeries": [{"procedure": "Right below-knee amputation", "year": 2024}],
        "care_level": "special",
        "mobility_type": "wheelchair",
        "current_mode": "wheelchair",
        "notes": "Room 404. Prosthetic gait training in Physiotherapy Room.",
        "portrait_slug": "patient-daniel-carter",
    },
    {
        "first_name": "Grace",
        "last_name": "Wilson",
        "nickname": "Grace",
        "gender": "female",
        "date_of_birth": date(1951, 3, 30),
        "height_cm": 160,
        "weight_kg": 57,
        "blood_type": "AB+",
        "medical_conditions": [
            {"condition": "Osteoporosis", "severity": "medium"},
            {"condition": "Macular degeneration", "severity": "medium"},
        ],
        "allergies": ["Latex"],
        "medications": [
            {"name": "Alendronate", "dosage": "70mg", "frequency": "1x weekly"},
            {"name": "Vitamin D3", "dosage": "1000IU", "frequency": "1x daily"},
        ],
        "past_surgeries": [],
        "care_level": "normal",
        "mobility_type": "walker",
        "current_mode": "walking",
        "notes": "Room 405. Needs visual cueing and walker checks.",
        "portrait_slug": "patient-grace-wilson",
    },
    {
        "first_name": "Samuel",
        "last_name": "Ortiz",
        "nickname": "Sam",
        "gender": "male",
        "date_of_birth": date(1946, 11, 18),
        "height_cm": 174,
        "weight_kg": 73,
        "blood_type": "O-",
        "medical_conditions": [
            {"condition": "COPD", "severity": "medium"},
            {"condition": "Hypertension", "severity": "medium"},
        ],
        "allergies": ["Aspirin"],
        "medications": [
            {"name": "Tiotropium inhaler", "dosage": "18mcg", "frequency": "1x daily"},
            {"name": "Amlodipine", "dosage": "5mg", "frequency": "1x daily"},
        ],
        "past_surgeries": [{"procedure": "Cataract extraction", "year": 2022}],
        "care_level": "normal",
        "mobility_type": "wheelchair",
        "current_mode": "wheelchair",
        "notes": "Room 406. Encourage breathing exercises after lunch.",
        "portrait_slug": "patient-samuel-ortiz",
    },
]

DEMO_STAFF: list[tuple[str, str, str, str]] = [
    ("admin", "demo_admin", "Ada", "Morgan"),
    ("head_nurse", "demo_headnurse", "Helen", "Brooks"),
    ("supervisor", "demo_supervisor", "Marcus", "Lee"),
    ("observer", "demo_observer", "Nina", "Patel"),
    ("observer", "demo_observer2", "Jason", "Kim"),
]

DEMO_STAFF_PROFILE_BY_USERNAME: dict[str, dict[str, str]] = {
    "demo_admin": {
        "employee_code": "AD-401",
        "department": "Operations",
        "employment_type": "full_time",
        "specialty": "platform_admin",
        "license_number": "US-OPS-401",
        "phone": "+1 555 401 0100",
        "email": "ada.morgan@wheelsense.local",
        "emergency_contact_name": "Operations Desk",
        "emergency_contact_phone": "+1 555 401 0900",
        "portrait_slug": "staff-ada-morgan",
    },
    "demo_headnurse": {
        "employee_code": "HN-401",
        "department": "Nursing",
        "employment_type": "full_time",
        "specialty": "geriatric_care",
        "license_number": "US-RN-401",
        "phone": "+1 555 401 0101",
        "email": "helen.brooks@wheelsense.local",
        "emergency_contact_name": "Charge Nurse Desk",
        "emergency_contact_phone": "+1 555 401 0901",
        "portrait_slug": "staff-helen-brooks",
    },
    "demo_supervisor": {
        "employee_code": "SV-401",
        "department": "Care Operations",
        "employment_type": "full_time",
        "specialty": "fall_response",
        "license_number": "US-SV-401",
        "phone": "+1 555 401 0102",
        "email": "marcus.lee@wheelsense.local",
        "emergency_contact_name": "Care Ops Desk",
        "emergency_contact_phone": "+1 555 401 0902",
        "portrait_slug": "staff-marcus-lee",
    },
    "demo_observer": {
        "employee_code": "OB-401",
        "department": "Nursing",
        "employment_type": "full_time",
        "specialty": "night_watch",
        "license_number": "US-NA-401",
        "phone": "+1 555 401 0103",
        "email": "nina.patel@wheelsense.local",
        "emergency_contact_name": "Observer Desk",
        "emergency_contact_phone": "+1 555 401 0903",
        "portrait_slug": "staff-nina-patel",
    },
    "demo_observer2": {
        "employee_code": "OB-402",
        "department": "Nursing",
        "employment_type": "full_time",
        "specialty": "mobility_support",
        "license_number": "US-NA-402",
        "phone": "+1 555 401 0104",
        "email": "jason.kim@wheelsense.local",
        "emergency_contact_name": "Observer Desk",
        "emergency_contact_phone": "+1 555 401 0904",
        "portrait_slug": "staff-jason-kim",
    },
}


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


def _demo_account_username(first_name: str, last_name: str) -> str:
    first = "".join(ch for ch in first_name.strip().lower() if ch.isalnum())
    last_initial = next((ch for ch in last_name.strip().lower() if ch.isalnum()), "")
    if not first or not last_initial:
        raise ValueError(f"Cannot derive demo account username from {first_name!r} {last_name!r}")
    return f"{first}.{last_initial}"


async def _user_by_username(session: AsyncSession, username: str) -> User | None:
    return (await session.execute(select(User).where(User.username == username))).scalar_one_or_none()


async def _retire_legacy_seed_users(
    session: AsyncSession,
    *,
    workspace_id: int,
    active_user: User,
    legacy_usernames: tuple[str, ...],
    caregiver_id: int | None,
    patient_id: int | None,
) -> None:
    if not legacy_usernames:
        return
    rows = (
        await session.execute(
            select(User).where(
                User.workspace_id == workspace_id,
                User.username.in_(legacy_usernames),
            )
        )
    ).scalars().all()
    for legacy in rows:
        if legacy.id == active_user.id:
            continue
        legacy.is_active = False
        if caregiver_id is not None and legacy.caregiver_id == caregiver_id:
            legacy.caregiver_id = None
        if patient_id is not None and legacy.patient_id == patient_id:
            legacy.patient_id = None


async def _find_seed_user_for_person(
    session: AsyncSession,
    *,
    workspace_id: int,
    username: str,
    legacy_usernames: tuple[str, ...],
    caregiver_id: int | None,
    patient_id: int | None,
    reserved_usernames: tuple[str, ...] = (),
) -> User | None:
    user = await _user_by_username(session, username)
    if user is not None:
        if user.workspace_id != workspace_id:
            raise RuntimeError(
                f"Username '{username}' already belongs to workspace_id={user.workspace_id}. "
                "Use --reset or a different workspace name."
            )
        return user

    for legacy_username in legacy_usernames:
        legacy = await _user_by_username(session, legacy_username)
        if legacy is None:
            continue
        if legacy.workspace_id != workspace_id:
            raise RuntimeError(
                f"Username '{legacy_username}' already belongs to workspace_id={legacy.workspace_id}. "
                "Use --reset or a different workspace name."
            )
        return legacy

    if patient_id is not None:
        return (
            await session.execute(
                select(User).where(
                    User.workspace_id == workspace_id,
                    User.patient_id == patient_id,
                )
            )
        ).scalars().first()

    if caregiver_id is not None:
        linked = (
            await session.execute(
                select(User)
                .where(
                    User.workspace_id == workspace_id,
                    User.caregiver_id == caregiver_id,
                )
                .order_by(User.id)
            )
        ).scalars().all()
        for candidate in linked:
            if candidate.username not in reserved_usernames:
                return candidate
    return None


async def _upsert_demo_user(
    session: AsyncSession,
    *,
    workspace_id: int,
    username: str,
    password: str,
    role: str,
    profile_image_url: str,
    caregiver_id: int | None = None,
    patient_id: int | None = None,
    legacy_usernames: tuple[str, ...] = (),
    reserved_usernames: tuple[str, ...] = (),
) -> User:
    user = await _find_seed_user_for_person(
        session,
        workspace_id=workspace_id,
        username=username,
        legacy_usernames=legacy_usernames,
        caregiver_id=caregiver_id,
        patient_id=patient_id,
        reserved_usernames=reserved_usernames,
    )
    if user is None:
        user = User(
            workspace_id=workspace_id,
            username=username,
            hashed_password=get_password_hash(password),
            role=role,
            caregiver_id=caregiver_id,
            patient_id=patient_id,
            profile_image_url=profile_image_url,
            is_active=True,
        )
        session.add(user)
    else:
        await _retire_legacy_seed_users(
            session,
            workspace_id=workspace_id,
            active_user=user,
            legacy_usernames=legacy_usernames,
            caregiver_id=caregiver_id,
            patient_id=patient_id,
        )
        user.username = username
        user.hashed_password = get_password_hash(password)
        user.role = role
        user.caregiver_id = caregiver_id
        user.patient_id = patient_id
        user.profile_image_url = profile_image_url
        user.is_active = True
    await session.flush()
    return user


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
        ws = Workspace(name=workspace_name, mode="simulation", is_active=True)
        session.add(ws)
        await session.commit()
        await session.refresh(ws)
    elif not ws.is_active:
        ws.is_active = True
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
            Facility.name == DEMO_FACILITY_NAME,
        )
    )
    facility = result.scalar_one_or_none()
    if facility is None:
        facility = Facility(
            workspace_id=workspace_id,
            name=DEMO_FACILITY_NAME,
            address=DEMO_FACILITY_ADDRESS,
            description="English demo facility for role walkthroughs",
            config={},
        )
        session.add(facility)
        await session.flush()
    else:
        facility.address = DEMO_FACILITY_ADDRESS
        facility.description = "English demo facility for role walkthroughs"

    floors: list[Floor] = []
    for floor_number, floor_name in ((4, "Level 4 - Resident Wing"), (1, "Ground Level - Shared Care")):
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
        else:
            floor.name = floor_name
        floors.append(floor)

    await session.commit()
    return facility, floors


async def seed_rooms(
    session: AsyncSession, workspace_id: int, floors: list[Floor]
) -> list[Room]:
    rooms: list[Room] = []
    floor1, floor2 = floors
    for idx, row in enumerate(DEMO_ROOMS):
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
    """Return deterministic room box geometry (percent-based) for demo layouts.

    Layout models a realistic 2-wing nursing floor:
    - Rooms 0-4 (left wing): patient bedrooms along left corridor
    - Rooms 5-9 (right wing): patient bedrooms along right corridor
    - Rooms 10+: shared/utility spaces at the bottom (wider)
    """
    # Left wing: 5 rooms stacked vertically on the left side
    if index < 5:
        x = 2.0
        y = 2.0 + index * 18.0
        w = 26.0
        h = 16.0
        return x, y, w, h
    # Right wing: 5 rooms stacked vertically on the right side
    if index < 10:
        x = 72.0
        y = 2.0 + (index - 5) * 18.0
        w = 26.0
        h = 16.0
        return x, y, w, h
    # Shared spaces: clinic, dining, activity, garden, bathroom at the bottom
    shared_index = index - 10
    cols = 3
    col = shared_index % cols
    row = shared_index // cols
    w_s = 28.0
    h_s = 16.0
    gap_s = 2.0
    x = 2.0 + (w_s + gap_s) * col
    y = 94.0 + row * (h_s + gap_s)
    return x, y, w_s, h_s


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
        if room.node_device_id and str(room.node_device_id).strip():
            # User or prior run already linked this room — do not overwrite.
            continue

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
    expected_entities: set[str] = set()
    specs = [
        ("Room 401 Bedside Light", "light", "off", 0, "bedroom", "light"),
        ("Room 401 AC", "climate", "off", 0, "bedroom", "AC"),
        ("Room 401 TV", "switch", "off", 0, "bedroom", "tv"),
        ("Room 401 Alarm", "switch", "off", 0, "bedroom", "alarm"),
        ("Room 402 Bedside Light", "light", "on", 1, "livingroom", "light"),
        ("Room 402 Fan", "fan", "off", 1, "livingroom", "fan"),
        ("Room 402 AC", "climate", "off", 1, "livingroom", "AC"),
        ("Room 402 TV", "switch", "off", 1, "livingroom", "tv"),
        ("Bathroom Light", "light", "off", 6, "bathroom", "light"),
        ("Kitchen / Dining Light", "light", "off", 7, "kitchen", "light"),
        ("Kitchen / Dining Alarm", "switch", "off", 7, "kitchen", "alarm"),
        ("Nurses' Station Switch", "switch", "off", 10, None, None),
        ("Garden Lounge Light", "light", "off", 11, None, None),
    ]
    for name, device_type, state, room_idx, legacy_room, legacy_appliance in specs:
        if room_idx >= len(rooms):
            continue
        room = rooms[room_idx]
        entity = f"{device_type}.ws{workspace_id}_room{room.id}_{name.lower().replace(' ', '_')}"
        expected_entities.add(entity)
        config: dict[str, object] = {"seed": True, "room_name": room.name}
        if legacy_room and legacy_appliance:
            config["legacy_firmware"] = {
                "enabled": True,
                "room": legacy_room,
                "appliance": legacy_appliance,
                "ha_enabled": False,
                "transport": "public_mqtt",
            }
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
                config=config,
            )
            session.add(row)
        else:
            row.room_id = room.id
            row.name = name
            row.device_type = device_type
            row.is_active = True
            row.state = state
            row.config = config
        seeded += 1

    if expected_entities:
        stale_seeded = await session.execute(
            select(SmartDevice).where(
                SmartDevice.workspace_id == workspace_id,
                SmartDevice.config["seed"].as_boolean().is_(True),
            )
        )
        for row in stale_seeded.scalars().all():
            if row.ha_entity_id not in expected_entities:
                await session.delete(row)

    await session.commit()
    return seeded


async def seed_caregivers_and_users(
    session: AsyncSession, workspace_id: int
) -> tuple[dict[str, CareGiver], dict[str, User]]:
    users_cfg = DEMO_STAFF

    # Preserve bootstrap admin user if it exists (from BOOTSTRAP_ADMIN_USERNAME env var)
    bootstrap_admin_username = os.getenv("BOOTSTRAP_ADMIN_USERNAME", "admin")

    caregivers_by_role: dict[str, CareGiver] = {}
    users_by_role: dict[str, User] = {}

    for role, legacy_username, first_name, last_name in users_cfg:
        username = _demo_account_username(first_name, last_name)
        profile = dict(DEMO_STAFF_PROFILE_BY_USERNAME[legacy_username])
        portrait_slug = profile.pop("portrait_slug")
        profile["photo_url"] = _demo_portrait_url(portrait_slug)
        cq = await session.execute(
            select(CareGiver).where(
                CareGiver.workspace_id == workspace_id,
                CareGiver.employee_code == profile["employee_code"],
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
            caregiver.first_name = first_name
            caregiver.last_name = last_name
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

        user = await _upsert_demo_user(
            session,
            workspace_id=workspace_id,
            username=username,
            password=username,
            role=role,
            caregiver_id=caregiver.id,
            profile_image_url=caregiver.photo_url,
            legacy_usernames=(legacy_username,),
            reserved_usernames=(bootstrap_admin_username,),
        )
        await session.flush()
        # Keep a single canonical mapping for each role.
        users_by_role.setdefault(role, user)
        caregivers_by_role.setdefault(role, caregiver)
        users_by_role[legacy_username] = user
        caregivers_by_role[legacy_username] = caregiver
        users_by_role[username] = user
        caregivers_by_role[username] = caregiver

    # Ensure bootstrap admin user exists with correct credentials
    bootstrap_admin_password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "wheelsense2026")
    bootstrap_hashed = get_password_hash(bootstrap_admin_password)

    ba_uq = await session.execute(select(User).where(User.username == bootstrap_admin_username))
    bootstrap_admin = ba_uq.scalar_one_or_none()
    demo_admin_caregiver = caregivers_by_role.get("ada.m") or caregivers_by_role.get("demo_admin")

    if bootstrap_admin is None:
        bootstrap_admin = User(
            workspace_id=workspace_id,
            username=bootstrap_admin_username,
            hashed_password=bootstrap_hashed,
            role="admin",
            caregiver_id=demo_admin_caregiver.id if demo_admin_caregiver else None,
            profile_image_url=demo_admin_caregiver.photo_url if demo_admin_caregiver else "",
            is_active=True,
        )
        session.add(bootstrap_admin)
        await session.flush()

        users_by_role.setdefault("admin", bootstrap_admin)
        if demo_admin_caregiver:
            caregivers_by_role[bootstrap_admin_username] = demo_admin_caregiver
        users_by_role[bootstrap_admin_username] = bootstrap_admin
    else:
        # Ensure bootstrap admin has correct password and is active
        bootstrap_admin.hashed_password = bootstrap_hashed
        bootstrap_admin.is_active = True
        bootstrap_admin.role = "admin"
        previous_caregiver_id = bootstrap_admin.caregiver_id
        bootstrap_admin.caregiver_id = demo_admin_caregiver.id if demo_admin_caregiver else None
        bootstrap_admin.profile_image_url = demo_admin_caregiver.photo_url if demo_admin_caregiver else ""
        if previous_caregiver_id and demo_admin_caregiver and previous_caregiver_id != demo_admin_caregiver.id:
            previous = await session.get(CareGiver, previous_caregiver_id)
            if previous and previous.workspace_id == workspace_id and previous.employee_code == "BOOT-001":
                previous.is_active = False
                session.add(previous)
        if demo_admin_caregiver:
            caregivers_by_role.setdefault("admin", demo_admin_caregiver)
            caregivers_by_role[bootstrap_admin_username] = demo_admin_caregiver

        users_by_role.setdefault("admin", bootstrap_admin)
        users_by_role[bootstrap_admin_username] = bootstrap_admin

    await session.commit()
    return caregivers_by_role, users_by_role


async def seed_patients_and_devices(
    session: AsyncSession, workspace_id: int, rooms: list[Room]
) -> tuple[list[Patient], list[Device]]:
    patients: list[Patient] = []
    devices: list[Device] = []

    bedroom_rooms = [r for r in rooms if r.room_type == "bedroom"][:DEMO_PATIENT_COUNT]

    for i, payload in enumerate(DEMO_PATIENTS[:DEMO_PATIENT_COUNT]):
        patient_payload = dict(payload)
        portrait_slug = patient_payload.pop("portrait_slug")
        patient_payload["photo_url"] = _demo_portrait_url(portrait_slug)
        room = bedroom_rooms[i % len(bedroom_rooms)] if bedroom_rooms else None
        q = await session.execute(
            select(Patient).where(
                Patient.workspace_id == workspace_id,
                Patient.first_name == patient_payload["first_name"],
                Patient.last_name == patient_payload["last_name"],
            )
        )
        patient = q.scalar_one_or_none()
        if patient is None:
            patient = Patient(workspace_id=workspace_id, room_id=room.id if room else None, **patient_payload)
            session.add(patient)
        else:
            for key, value in patient_payload.items():
                setattr(patient, key, value)
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


async def seed_patient_users(
    session: AsyncSession, workspace_id: int, patients: list[Patient]
) -> dict[str, User]:
    users: dict[str, User] = {}
    for idx, patient in enumerate(patients):
        username = _demo_account_username(patient.first_name, patient.last_name)
        user = await _upsert_demo_user(
            session,
            workspace_id=workspace_id,
            username=username,
            password=username,
            role="patient",
            patient_id=patient.id,
            profile_image_url=patient.photo_url or "",
            legacy_usernames=("demo_patient",) if idx == 0 else (),
        )
        users[username] = user
        users[f"{patient.first_name} {patient.last_name}"] = user
    await session.commit()
    for user in set(users.values()):
        await session.refresh(user)
    return users


async def seed_patient_user(
    session: AsyncSession, workspace_id: int, patient: Patient
) -> User:
    users = await seed_patient_users(session, workspace_id, [patient])
    return users[_demo_account_username(patient.first_name, patient.last_name)]


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


def _demo_portrait_url(slug: str) -> str:
    """Return a deterministic local profile-image URL for seeded AI portrait assets.

    If `WHEELSENSE_DEMO_PORTRAIT_DIR/<slug>.jpg` exists, its bytes are copied into the
    public profile image store. Until generated portrait assets are available, a stable
    placeholder JPEG is written at the same deterministic filename.
    """
    filename = f"{hashlib.sha256(f'wheelsense-demo-portrait:{slug}'.encode('utf-8')).hexdigest()[:32]}.jpg"
    storage_dir = Path(settings.profile_image_storage_dir)
    storage_dir.mkdir(parents=True, exist_ok=True)
    target = storage_dir / filename
    asset_dir = Path(os.environ.get("WHEELSENSE_DEMO_PORTRAIT_DIR", str(ROOT / "assets" / "demo-portraits")))
    asset_path = asset_dir / f"{slug}.jpg"
    source_bytes = asset_path.read_bytes() if asset_path.is_file() else _demo_photo_bytes()
    if not target.is_file() or target.read_bytes() != source_bytes:
        target.write_bytes(source_bytes)
    return f"/api/public/profile-images/{filename}"


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


LEGACY_PATIENT_EMERGENCY_CONTACTS: list[dict] = [
    {
        "name": "Somporn Phatthrapong",
        "relationship": "Son",
        "phone": "+66 81 234 5678",
        "email": "somporn.p@email.th",
        "contact_type": "emergency",
        "is_primary": True,
        "notes": "Primary next-of-kin. Speaks English. Call first.",
    },
    {
        "name": "Saowanee Srisuwan",
        "relationship": "Daughter",
        "phone": "+66 81 345 6789",
        "email": "sao.s@email.th",
        "contact_type": "emergency",
        "is_primary": True,
        "notes": "Lives in Bangkok. Available 08:00-20:00.",
    },
    {
        "name": "Carlos Rodriguez",
        "relationship": "Husband",
        "phone": "+1 555 123 4567",
        "email": "carlos.r@email.com",
        "contact_type": "emergency",
        "is_primary": True,
        "notes": "International contact — WhatsApp preferred. Thai time +7h from California.",
    },
    {
        "name": "Malee Raksadee",
        "relationship": "Wife",
        "phone": "+66 81 456 7890",
        "email": "malee.r@email.th",
        "contact_type": "emergency",
        "is_primary": True,
        "notes": "Daily visitor 14:00-16:00. Bring interpreter if Malee absent.",
    },
    {
        "name": "Pattama Wongwattana",
        "relationship": "Spouse",
        "phone": "+66 81 567 8901",
        "email": "pattama.w@email.th",
        "contact_type": "emergency",
        "is_primary": True,
        "notes": "Authorised for all medical decisions. DNR order on file.",
    },
]


PATIENT_EMERGENCY_CONTACTS: list[dict] = [
    {
        "name": "Olivia Price",
        "relationship": "Daughter",
        "phone": "+1 555 401 1101",
        "email": "olivia.price@example.com",
        "contact_type": "emergency",
        "is_primary": True,
        "notes": "Primary next-of-kin. Call first for care-plan changes.",
    },
    {
        "name": "Linda Chen",
        "relationship": "Spouse",
        "phone": "+1 555 401 1102",
        "email": "linda.chen@example.com",
        "contact_type": "emergency",
        "is_primary": True,
        "notes": "Available 08:00-20:00 local time.",
    },
    {
        "name": "Peter Lewis",
        "relationship": "Son",
        "phone": "+1 555 401 1103",
        "email": "peter.lewis@example.com",
        "contact_type": "emergency",
        "is_primary": True,
        "notes": "Authorized for dementia care decisions.",
    },
    {
        "name": "Amelia Carter",
        "relationship": "Daughter",
        "phone": "+1 555 401 1104",
        "email": "amelia.carter@example.com",
        "contact_type": "emergency",
        "is_primary": True,
        "notes": "Coordinates prosthetic appointments.",
    },
    {
        "name": "Thomas Wilson",
        "relationship": "Brother",
        "phone": "+1 555 401 1105",
        "email": "thomas.wilson@example.com",
        "contact_type": "emergency",
        "is_primary": True,
        "notes": "Prefers text updates for routine issues.",
    },
    {
        "name": "Isabel Ortiz",
        "relationship": "Spouse",
        "phone": "+1 555 401 1106",
        "email": "isabel.ortiz@example.com",
        "contact_type": "emergency",
        "is_primary": True,
        "notes": "Call for respiratory flare-ups or medication changes.",
    },
]


async def seed_patient_contacts(
    session: AsyncSession,
    workspace_id: int,
    patients: list[Patient],
) -> int:
    """Seed one emergency contact per patient for the first N demo patients."""
    count = 0
    for i, contact_data in enumerate(PATIENT_EMERGENCY_CONTACTS):
        if i >= len(patients):
            break
        patient = patients[i]
        q = await session.execute(
            select(PatientContact).where(
                PatientContact.patient_id == patient.id,
                PatientContact.contact_type == contact_data["contact_type"],
                PatientContact.name == contact_data["name"],
            )
        )
        existing = q.scalar_one_or_none()
        if existing is None:
            contact = PatientContact(
                patient_id=patient.id,
                contact_type=contact_data["contact_type"],
                name=contact_data["name"],
                relationship=contact_data["relationship"],
                phone=contact_data["phone"],
                email=contact_data["email"],
                is_primary=contact_data["is_primary"],
                notes=contact_data["notes"],
            )
            session.add(contact)
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

    # ── 10 richly-labelled clinical tasks (max 10 as required) ──────────────
    DEMO_TASKS: list[dict] = [
        {
            "patient_idx": 0,
            "title": "Reposition and skin check - Eleanor",
            "description": "Reposition Eleanor and inspect sacrum, heels, and shoulders. Document skin integrity in the chart.",
            "priority": "high",
            "schedule_type": "care",
            "hours_offset": 0,
        },
        {
            "patient_idx": 1,
            "title": "Cardiac weight and edema check - Robert",
            "description": "Record Robert's weight, edema status, and breathing effort. Notify head nurse for sudden weight gain.",
            "priority": "high",
            "schedule_type": "monitoring",
            "hours_offset": 1,
        },
        {
            "patient_idx": 2,
            "title": "Wandering safety check - Margaret",
            "description": "Confirm Margaret is wearing her location tag and log her observed room after dinner.",
            "priority": "high",
            "schedule_type": "care",
            "hours_offset": 0,
        },
        {
            "patient_idx": 3,
            "title": "Residual limb wound check - Daniel",
            "description": "Inspect Daniel's residual limb, apply sterile dressing, and document redness, drainage, and pain score.",
            "priority": "high",
            "schedule_type": "care",
            "hours_offset": 2,
        },
        {
            "patient_idx": 4,
            "title": "Walker and vision safety round - Grace",
            "description": "Check Grace's walker tips, room lighting, and call-bell reach before afternoon rest.",
            "priority": "normal",
            "schedule_type": "monitoring",
            "hours_offset": 1,
        },
        {
            "patient_idx": 0,
            "title": "Morning medication round - Eleanor",
            "description": "Administer Eleanor's scheduled Parkinson medication and monitor standing blood pressure.",
            "priority": "high",
            "schedule_type": "medication",
            "hours_offset": 0,
        },
        {
            "patient_idx": 1,
            "title": "Fluid balance review - Robert",
            "description": "Review Robert's intake/output log and escalate any shortness of breath or edema changes.",
            "priority": "normal",
            "schedule_type": "care",
            "hours_offset": 9,
        },
        {
            "patient_idx": 5,
            "title": "COPD breathing exercise - Samuel",
            "description": "Guide Samuel through pursed-lip breathing and document SpO2 after the session.",
            "priority": "high",
            "schedule_type": "procedure",
            "hours_offset": 0,
        },
        {
            "patient_idx": 3,
            "title": "Blood glucose check - Daniel",
            "description": "Check Daniel's pre-lunch glucose and document the result in the diabetes log.",
            "priority": "normal",
            "schedule_type": "monitoring",
            "hours_offset": 3,
        },
        {
            "patient_idx": 4,
            "title": "Physiotherapy transfer practice - Grace",
            "description": "Assist Grace with supervised transfer practice in the Physiotherapy Room and record gait quality.",
            "priority": "normal",
            "schedule_type": "therapy",
            "hours_offset": 4,
        },
    ]

    for i, td in enumerate(DEMO_TASKS):
        patient = patients[td["patient_idx"]] if td["patient_idx"] < len(patients) else patients[0]
        observer = observers[i % len(observers)]
        room_idx = i % len(rooms)
        schedule = CareSchedule(
            workspace_id=workspace_id,
            patient_id=patient.id,
            room_id=rooms[room_idx].id,
            title=td["title"],
            schedule_type=td["schedule_type"],
            starts_at=now + timedelta(hours=td["hours_offset"]),
            ends_at=now + timedelta(hours=td["hours_offset"] + 1),
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
            title=td["title"],
            description=td["description"],
            priority=td["priority"],
            due_at=now + timedelta(hours=td["hours_offset"] + 1),
            status="pending",
            assigned_role="observer",
            assigned_user_id=observer.id,
            created_by_user_id=head_nurse.id,
        )
        session.add(task)
        task_count += 1

    # ── 3 standing care directives ───────────────────────────────────────────
    DEMO_DIRECTIVES: list[dict] = [
        {
            "patient_idx": 0,
            "title": "Critical care - Repositioning every 2 hours",
            "text": "Eleanor must be repositioned every 2 hours. Document skin integrity each time and notify Helen Brooks if pressure injury develops.",
        },
        {
            "patient_idx": 1,
            "title": "Cardiac care - Fluid balance watch",
            "text": "Robert needs fluid balance review each shift. Escalate sudden shortness of breath or weight gain to Helen Brooks.",
        },
        {
            "patient_idx": 5,
            "title": "Respiratory care - COPD precautions",
            "text": "Samuel needs SpO2 review after exertion. Escalate persistent SpO2 below 90 percent or increased work of breathing.",
        },
    ]

    for i, dd in enumerate(DEMO_DIRECTIVES):
        patient = patients[dd["patient_idx"]] if dd["patient_idx"] < len(patients) else patients[0]
        observer = observers[i % len(observers)]
        directive = CareDirective(
            workspace_id=workspace_id,
            patient_id=patient.id,
            issued_by_user_id=supervisor.id,
            target_role="observer",
            target_user_id=observer.id,
            title=dd["title"],
            directive_text=dd["text"],
            status="active",
            effective_from=now - timedelta(hours=i),
            effective_until=now + timedelta(days=7),
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
    """Compatibility wrapper for the old simulator-only staff seeder.

    The current demo has one canonical English staff roster shared by seed_demo.py,
    simulator reset, and Docker sim mode. Keep this function for older imports, but
    route it through the canonical staff/account path.
    """
    return await seed_caregivers_and_users(session, workspace_id)

    users_cfg: list[tuple[str, str, str, str]] = [
        ("head_nurse", "sim_headnurse", "Helen", "Brooks"),
        ("supervisor", "sim_supervisor", "Marcus", "Lee"),
        ("observer", "sim_observer1", "Nina", "Patel"),
        ("observer", "sim_observer2", "Jason", "Kim"),
    ]
    profile_by_username = {
        "sim_headnurse": {
            "employee_code": "HN-SIM-01",
            "department": "Nursing",
            "employment_type": "full_time",
            "specialty": "geriatric_care",
            "license_number": "US-RN-SIM01",
            "phone": "+1 555 401 0201",
            "email": "sim.headnurse@wheelsense.local",
            "emergency_contact_name": "Charge Nurse Desk",
            "emergency_contact_phone": "+1 555 401 0911",
            "photo_url": _demo_portrait_url("staff-helen-brooks"),
        },
        "sim_supervisor": {
            "employee_code": "SV-SIM-01",
            "department": "Care Operations",
            "employment_type": "full_time",
            "specialty": "fall_response",
            "license_number": "US-SV-SIM01",
            "phone": "+1 555 401 0202",
            "email": "sim.supervisor@wheelsense.local",
            "emergency_contact_name": "Care Ops Desk",
            "emergency_contact_phone": "+1 555 401 0912",
            "photo_url": _demo_portrait_url("staff-marcus-lee"),
        },
        "sim_observer1": {
            "employee_code": "OB-SIM-01",
            "department": "Nursing",
            "employment_type": "full_time",
            "specialty": "night_watch",
            "license_number": "US-NA-SIM01",
            "phone": "+1 555 401 0203",
            "email": "sim.observer1@wheelsense.local",
            "emergency_contact_name": "Observer Desk",
            "emergency_contact_phone": "+1 555 401 0913",
            "photo_url": _demo_portrait_url("staff-nina-patel"),
        },
        "sim_observer2": {
            "employee_code": "OB-SIM-02",
            "department": "Nursing",
            "employment_type": "full_time",
            "specialty": "mobility_support",
            "license_number": "US-NA-SIM02",
            "phone": "+1 555 401 0204",
            "email": "sim.observer2@wheelsense.local",
            "emergency_contact_name": "Observer Desk",
            "emergency_contact_phone": "+1 555 401 0914",
            "photo_url": _demo_portrait_url("staff-jason-kim"),
        },
    }
    hashed = get_password_hash(DEMO_PASSWORD)
    caregivers_by_key: dict[str, CareGiver] = {}
    users_by_key: dict[str, User] = {}

    for role, username, first_name, last_name in users_cfg:
        profile = profile_by_username[username]
        emp_code = profile["employee_code"]
        cq = await session.execute(
            select(CareGiver).where(
                CareGiver.workspace_id == workspace_id,
                CareGiver.employee_code == emp_code,
            )
        )
        caregiver = cq.scalar_one_or_none()
        if caregiver is None:
            caregiver = CareGiver(
                workspace_id=workspace_id,
                first_name=first_name,
                last_name=last_name,
                role=role,
                employee_code=emp_code,
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
            caregiver.first_name = first_name
            caregiver.last_name = last_name
            caregiver.role = role
            caregiver.employee_code = emp_code
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
    """Grant sim floor staff visibility to all seeded patients (non-admin roles need access rows)."""
    staff_keys = (
        "supervisor",
        "demo_supervisor",
        "marcus.l",
        "sim_supervisor",
        "demo_observer",
        "demo_observer2",
        "nina.p",
        "jason.k",
        "sim_observer1",
        "sim_observer2",
    )
    created = 0
    seen_caregiver_ids: set[int] = set()
    for key in staff_keys:
        cg = caregivers_by_key.get(key)
        if not cg:
            continue
        if cg.id in seen_caregiver_ids:
            continue
        seen_caregiver_ids.add(cg.id)
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
    """Minimal seed for MQTT simulator + role UX: English rooms, patients, staff, and bootstrap admin."""
    async with AsyncSessionLocal() as session:
        ws = await ensure_workspace(session, workspace_name, reset)

        force = os.environ.get("SIM_FORCE_SEED", "").lower() in ("1", "true", "yes")
        dcount = await session.scalar(
            select(func.count()).select_from(Device).where(Device.workspace_id == ws.id)
        )
        pcount = await session.scalar(
            select(func.count()).select_from(Patient).where(Patient.workspace_id == ws.id)
        )
        if ((dcount or 0) > 0 or (pcount or 0) > 0) and not force:
            print(
                "[skip] Sim team seed skipped: workspace already has devices or patients. "
                "Set SIM_FORCE_SEED=1 to re-run full baseline seed."
            )
            return ws.id

        await clear_workspace_event_data(session, ws.id)

        facility, floors = await seed_facility(session, ws.id)
        rooms = await seed_rooms(session, ws.id, floors)
        await seed_floorplan_layouts(session, ws.id, facility, floors, rooms)
        caregivers_by_key, users_by_key = await seed_caregivers_and_users(session, ws.id)
        patients, devices = await seed_patients_and_devices(session, ws.id, rooms)
        patient_users = await seed_patient_users(session, ws.id, patients)
        extra_devices = await seed_additional_sim_devices(session, ws.id)
        devices.extend(extra_devices)
        room_node_mappings = await seed_room_node_mappings(session, ws.id, rooms)
        smart_devices_count = await seed_smart_devices(session, ws.id, rooms)
        actor_positions = await seed_demo_actor_positions(session, ws.id, users_by_key, patients)
        access_rows = await seed_sim_team_observer_access(session, ws.id, caregivers_by_key, patients)
        await attach_bootstrap_admin_to_workspace(session, ws.id)
        workspace_id = ws.id

    print("\n[OK] Sim team seed complete (simulator-ready).")
    print(f"Workspace id: {workspace_id} | name: {workspace_name}")
    print(f"Rooms: {len(rooms)} | Patients: {len(patients)} | Wheelchair devices + assignments: OK")
    print(
        f"Smart devices: {smart_devices_count} | Room-node mappings: {room_node_mappings} | "
        f"Actor positions: {actor_positions}"
    )
    print(f"Floor-staff patient access rows (new): {access_rows}")
    print("\nStaff logins (password is the username):")
    print("  ada.m      (admin)")
    print("  helen.b    (head_nurse)")
    print("  marcus.l   (supervisor)")
    print("  nina.p     (observer)")
    print("  jason.k    (observer)")
    print("\nPatient logins (password is the username):")
    for username in sorted(key for key in patient_users if "." in key):
        print(f"  {username}")
    print("\nAdmin: use your bootstrap account (see BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD).")
    print(f"\nDocker simulator: set SIM_WORKSPACE_ID={workspace_id} in server/.env, then:")
    print("  docker compose -f docker-compose.sim.yml up -d --build wheelsense-simulator")
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
        patient_users = await seed_patient_users(session, ws.id, patients)
        extra_devices = await seed_additional_sim_devices(session, ws.id)
        devices.extend(extra_devices)
        room_node_mappings = await seed_room_node_mappings(session, ws.id, rooms)
        smart_devices_count = await seed_smart_devices(session, ws.id, rooms)

        contacts_count = await seed_patient_contacts(session, ws.id, patients)
        vitals_count = await seed_vitals(session, ws.id, patients, devices)
        timeline_count = await seed_activity_timeline(session, ws.id, patients, rooms)
        seed_demo_alerts = os.environ.get("SEED_DEMO_ALERTS", "").lower() in ("1", "true", "yes")
        alerts_count = (
            await seed_alerts(session, ws.id, patients, caregivers_by_role, devices)
            if seed_demo_alerts
            else 0
        )
        staff_access_rows = await seed_sim_team_observer_access(session, ws.id, caregivers_by_role, patients)
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
    print(f"Patients: {len(patients)} | Devices: {len(devices)} | Patient contacts: {contacts_count}")
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
        f"Pharmacy orders: {pharmacy_orders} | Staff access rows: {staff_access_rows}\n"
    )
    print("Demo credentials:")
    bootstrap_username = os.getenv("BOOTSTRAP_ADMIN_USERNAME", "admin")
    bootstrap_password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "wheelsense2026")
    print(f"- bootstrap    : {bootstrap_username} / {bootstrap_password}")
    print("- admin        : ada.m / ada.m")
    print("- head_nurse   : helen.b / helen.b")
    print("- supervisor   : marcus.l / marcus.l")
    print("- observer     : nina.p / nina.p")
    print("- observer     : jason.k / jason.k")
    for username in sorted(key for key in patient_users if "." in key):
        print(f"- patient      : {username} / {username}")


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
    """Avoid UnicodeEncodeError on Windows when printing names from older seed constants."""
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
