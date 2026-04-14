#!/usr/bin/env python3
"""
WheelSense Production Seed Script
=================================
Creates comprehensive, realistic seed data for the WheelSense platform.

This script creates:
- 8 Thai patients with complete medical profiles and linked user accounts
- 8 Staff members (2 head_nurse, 1 supervisor, 5 observers) with user accounts
- Facility with 2 floors and 15 rooms (Rooms 101-110)
- Patient-caregiver access assignments
- Schedules, tasks, and care routines
- Workflow items (directives, messages, handovers)
- 20+ devices (wheelchairs, Polar sensors, mobile phones, nodes)
- Smart devices for rooms

Usage:
    cd server
    python scripts/seed_production.py
    python scripts/seed_production.py --reset  # Clear existing data first

Admin credentials (preserved):
    username: admin
    password: wheelsense2026

Demo credentials (created):
    head_nurse:   nurse_siri / demo1234
    head_nurse:   nurse_kanya / demo1234
    supervisor:   nurse_mana / demo1234
    observer:     nurse_somchai / demo1234
    observer:     nurse_wanida / demo1234
    observer:     nurse_prasit / demo1234
    observer:     nurse_niramol / demo1234
    observer:     nurse_samorn / demo1234

Patient credentials (created):
    patient_wichai / demo1234
    patient_malee / demo1234
    patient_prasert / demo1234
    patient_sompop / demo1234
    patient_boonmee / demo1234
    patient_napa / demo1234
    patient_somsak / demo1234
    patient_charnpen / demo1234
"""

from __future__ import annotations

import argparse
import asyncio
import random
import sys
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

# Setup path to import app
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
    CareSchedule,
    CareTask,
    DemoActorPosition,
    Device,
    Facility,
    Floor,
    FloorplanLayout,
    HandoverNote,
    Patient,
    PatientContact,
    PatientDeviceAssignment,
    PharmacyOrder,
    PhotoRecord,
    Prescription,
    RoleMessage,
    Room,
    SmartDevice,
    Specialist,
    User,
    VitalReading,
    Workspace,
)

# ============================================================================
# CONFIGURATION
# ============================================================================

SEED = 4242
DEMO_PASSWORD = "demo1234"
ADMIN_PASSWORD = "wheelsense2026"
PRODUCTION_WORKSPACE = "WheelSense Production"

random.seed(SEED)

# ============================================================================
# DATA DEFINITIONS - PATIENTS (8 Thai patients)
# ============================================================================

THAI_PATIENTS: list[dict[str, Any]] = [
    {
        "first_name": "วิชัย",
        "last_name": "กล้าหาญ",
        "nickname": "ตาวิชัย",
        "gender": "male",
        "date_of_birth": date(1948, 1, 15),
        "medical_conditions": [
            {"condition": "โรคพาร์กินสัน", "severity": "สูง", "notes": "มีอาการสั่นมือขวา"},
            {"condition": "ความดันโลหิตสูง", "severity": "ปานกลาง"},
        ],
        "allergies": ["ยาแก้ปวดกลุ่ม NSAID"],
        "medications": [
            {"name": "Levodopa", "dosage": "100mg", "frequency": "3 ครั้ง/วัน", "instructions": "รับประทานหลังอาหาร"},
            {"name": "Amlodipine", "dosage": "5mg", "frequency": "1 ครั้ง/วัน", "instructions": "รับประทานเช้า"},
        ],
        "care_level": "special",
        "mobility_type": "wheelchair",
        "blood_type": "O+",
        "height_cm": 165.0,
        "weight_kg": 58.0,
        "notes": "ต้องการการดูแลเรื่องท่าทางการนั่ง ป้องกันแผลกดทับ",
    },
    {
        "first_name": "มาลี",
        "last_name": "รักสงบ",
        "nickname": "ยายลี",
        "gender": "female",
        "date_of_birth": date(1955, 11, 4),
        "medical_conditions": [
            {"condition": "โรคหัวใจ", "severity": "ปานกลาง", "notes": "ภาวะหัวใจเต้นผิดจังหวะ"},
        ],
        "allergies": [],
        "medications": [
            {"name": "Warfarin", "dosage": "3mg", "frequency": "1 ครั้ง/วัน", "instructions": "ต้องตรวจ INR สม่ำเสมอ"},
        ],
        "care_level": "normal",
        "mobility_type": "independent",
        "blood_type": "A+",
        "height_cm": 155.0,
        "weight_kg": 52.0,
        "notes": "ชอบอ่านหนังสือและเล่นดอกไม้",
    },
    {
        "first_name": "ประเสริฐ",
        "last_name": "มั่งคั่ง",
        "nickname": "ตาเสริฐ",
        "gender": "male",
        "date_of_birth": date(1942, 2, 10),
        "medical_conditions": [
            {"condition": "อัมพฤกษ์ครึ่งซีกซ้าย", "severity": "สูง", "notes": "จากอุบัติเหตุเมื่อ 5 ปีก่อน"},
            {"condition": "เบาหวาน", "severity": "สูง"},
        ],
        "allergies": ["ยาพ่นหอบหืด"],
        "medications": [
            {"name": "Metformin", "dosage": "500mg", "frequency": "2 ครั้ง/วัน"},
            {"name": "Insulin Glargine", "dosage": "12 units", "frequency": "1 ครั้ง/วัน", "instructions": "ฉีดก่อนนอน"},
        ],
        "care_level": "critical",
        "mobility_type": "wheelchair",
        "blood_type": "B+",
        "height_cm": 170.0,
        "weight_kg": 65.0,
        "notes": "ต้องการการช่วยเหลือในการเคลื่อนไหวทุกครั้ง มีความเสี่ยงตกจากเก้าอี้",
    },
    {
        "first_name": "สมปอง",
        "last_name": "ใจดี",
        "nickname": "ยายปอง",
        "gender": "female",
        "date_of_birth": date(1950, 8, 20),
        "medical_conditions": [
            {"condition": "เบาหวาน", "severity": "สูง", "notes": "Hba1c 8.5%"},
            {"condition": "ไขมันในเลือดสูง", "severity": "ปานกลาง"},
        ],
        "allergies": [],
        "medications": [
            {"name": "Glipizide", "dosage": "5mg", "frequency": "2 ครั้ง/วัน", "instructions": "ก่อนอาหาร 30 นาที"},
            {"name": "Atorvastatin", "dosage": "20mg", "frequency": "1 ครั้ง/วัน", "instructions": "ก่อนนอน"},
        ],
        "care_level": "normal",
        "mobility_type": "walker",
        "blood_type": "O+",
        "height_cm": 158.0,
        "weight_kg": 60.0,
        "notes": "ใช้ walker ช่วยเดิน ต้องระวังเรื่องอาหาร",
    },
    {
        "first_name": "บุญมี",
        "last_name": "มีสุข",
        "nickname": "ตาบุญ",
        "gender": "male",
        "date_of_birth": date(1945, 5, 12),
        "medical_conditions": [
            {"condition": "โรคอัลไซเมอร์", "severity": "สูง", "notes": "ระยะปานกลาง มีอาการหลงลืม"},
            {"condition": "ความดันโลหิตสูง", "severity": "ปานกลาง"},
            {"condition": "กระดูกพรุน", "severity": "ปานกลาง"},
        ],
        "allergies": ["นมวัว"],
        "medications": [
            {"name": "Donepezil", "dosage": "5mg", "frequency": "1 ครั้ง/วัน", "instructions": "ก่อนนอน"},
            {"name": "Losartan", "dosage": "50mg", "frequency": "1 ครั้ง/วัน"},
            {"name": "Calcium + Vitamin D", "dosage": "1 เม็ด", "frequency": "2 ครั้ง/วัน"},
        ],
        "care_level": "special",
        "mobility_type": "wheelchair",
        "blood_type": "AB+",
        "height_cm": 168.0,
        "weight_kg": 62.0,
        "notes": "ต้องการการดูแลเรื่องความจำ ต้องมีคนดูแลตลอดเวลา",
    },
    {
        "first_name": "นภา",
        "last_name": "สวยงาม",
        "nickname": "ยายนภา",
        "gender": "female",
        "date_of_birth": date(1952, 7, 22),
        "medical_conditions": [
            {"condition": "กระดูกพรุน", "severity": "ปานกลาง"},
            {"condition": "โรคข้อเข่าเสื่อม", "severity": "ปานกลาง"},
        ],
        "allergies": [],
        "medications": [
            {"name": "Alendronate", "dosage": "70mg", "frequency": "1 ครั้ง/สัปดาห์", "instructions": "ทานตอนเช้าบนท้องว่าง"},
        ],
        "care_level": "normal",
        "mobility_type": "walker",
        "blood_type": "A-",
        "height_cm": 160.0,
        "weight_kg": 55.0,
        "notes": "ใช้ walker ช่วยเดิน ต้องระวังการล้ม",
    },
    {
        "first_name": "สมศักดิ์",
        "last_name": "มั่นคง",
        "nickname": "ตาศักดิ์",
        "gender": "male",
        "date_of_birth": date(1940, 9, 30),
        "medical_conditions": [
            {"condition": "โรคไตเรื้อรัง", "severity": "สูง", "notes": "CKD Stage 4"},
            {"condition": "ความดันโลหิตสูง", "severity": "สูง"},
            {"condition": "โรคหัวใจ", "severity": "ปานกลาง"},
        ],
        "allergies": ["ยากลุ่ม penicillin"],
        "medications": [
            {"name": "Epoetin alfa", "dosage": "2000 IU", "frequency": "3 ครั้ง/สัปดาห์", "instructions": "ฉีด"},
            {"name": "Amlodipine", "dosage": "10mg", "frequency": "1 ครั้ง/วัน"},
        ],
        "care_level": "critical",
        "mobility_type": "wheelchair",
        "blood_type": "B+",
        "height_cm": 172.0,
        "weight_kg": 68.0,
        "notes": "ต้องติดตามค่าไตสม่ำเสมอ จำกัดน้ำและเกลือ",
    },
    {
        "first_name": "จันทร์เพ็ญ",
        "last_name": "แสงจันทร์",
        "nickname": "ยายเพ็ญ",
        "gender": "female",
        "date_of_birth": date(1947, 4, 18),
        "medical_conditions": [
            {"condition": "ต้อกระจก", "severity": "ต่ำ", "notes": "ตาขวา"},
            {"condition": "โรคหอบหืด", "severity": "ต่ำ"},
        ],
        "allergies": [],
        "medications": [
            {"name": "Salbutamol Inhaler", "dosage": "2 puffs", "frequency": "ตามอาการ"},
        ],
        "care_level": "normal",
        "mobility_type": "independent",
        "blood_type": "O+",
        "height_cm": 156.0,
        "weight_kg": 50.0,
        "notes": "สุขภาพโดยรวมดี ชอบทำกิจกรรมกลุ่ม",
    },
]

# ============================================================================
# DATA DEFINITIONS - ROOMS (Rooms 101-110 + common areas)
# ============================================================================

ROOMS_DATA: list[dict[str, Any]] = [
    # Bedrooms 101-110
    {"name": "ห้อง 101", "room_type": "bedroom", "floor": 1, "notes": "ห้องมุม วิวสวน"},
    {"name": "ห้อง 102", "room_type": "bedroom", "floor": 1, "notes": "ใกล้ห้องพยาบาล"},
    {"name": "ห้อง 103", "room_type": "bedroom", "floor": 1, "notes": "ห้องมาตรฐาน"},
    {"name": "ห้อง 104", "room_type": "bedroom", "floor": 1, "notes": "ห้องมาตรฐาน"},
    {"name": "ห้อง 105", "room_type": "bedroom", "floor": 1, "notes": "ห้องพิเศษ ขนาดใหญ่"},
    {"name": "ห้อง 106", "room_type": "bedroom", "floor": 2, "notes": "ห้องมาตรฐาน"},
    {"name": "ห้อง 107", "room_type": "bedroom", "floor": 2, "notes": "ห้องมาตรฐาน"},
    {"name": "ห้อง 108", "room_type": "bedroom", "floor": 2, "notes": "ห้องมุม วิวเมือง"},
    {"name": "ห้อง 109", "room_type": "bedroom", "floor": 2, "notes": "ห้องมาตรฐาน"},
    {"name": "ห้อง 110", "room_type": "bedroom", "floor": 2, "notes": "ห้องพักผู้ป่วยวิกลจริต"},
    # Common areas
    {"name": "ห้องน้ำรวมชั้น 1", "room_type": "bathroom", "floor": 1, "notes": "มีราวจับ"},
    {"name": "ห้องน้ำรวมชั้น 2", "room_type": "bathroom", "floor": 2, "notes": "มีราวจับ"},
    {"name": "ห้องอาหาร", "room_type": "dining", "floor": 1, "notes": "รับประทานอาหารรวม"},
    {"name": "ลานกิจกรรม", "room_type": "activity", "floor": 1, "notes": "กิจกรรมกายภาพ"},
    {"name": "สวนหย่อม", "room_type": "garden", "floor": 1, "notes": "พักผ่อน"},
    {"name": "ห้องพยาบาล", "room_type": "clinic", "floor": 1, "notes": "ตรวจเบื้องต้นและเก็บยา"},
    {"name": "ห้องฟิสิกัล", "room_type": "therapy", "floor": 2, "notes": "กายภาพบำบัด"},
]

# ============================================================================
# DATA DEFINITIONS - STAFF (8 caregivers)
# ============================================================================

STAFF_DATA: list[dict[str, Any]] = [
    {
        "username": "nurse_siri",
        "first_name": "ศิริพร",
        "last_name": "หัวหน้าวอร์ด",
        "role": "head_nurse",
        "employee_code": "HN-001",
        "department": "Nursing",
        "employment_type": "full_time",
        "specialty": "geriatric_care",
        "license_number": "TH-RN-88001",
        "phone": "081-100-1001",
        "email": "siri.p@wheelsense.local",
        "emergency_contact_name": "สมชาย หัวหน้าวอร์ด",
        "emergency_contact_phone": "081-900-1001",
    },
    {
        "username": "nurse_kanya",
        "first_name": "กัญญา",
        "last_name": "รักษาไทย",
        "role": "head_nurse",
        "employee_code": "HN-002",
        "department": "Nursing",
        "employment_type": "full_time",
        "specialty": "critical_care",
        "license_number": "TH-RN-88002",
        "phone": "081-100-1002",
        "email": "kanya.r@wheelsense.local",
        "emergency_contact_name": "ประเสริฐ รักษาไทย",
        "emergency_contact_phone": "081-900-1002",
    },
    {
        "username": "nurse_mana",
        "first_name": "มานะ",
        "last_name": "เวชกิจ",
        "role": "supervisor",
        "employee_code": "SV-001",
        "department": "Care Operations",
        "employment_type": "full_time",
        "specialty": "fall_response",
        "license_number": "TH-SV-24001",
        "phone": "081-100-1003",
        "email": "mana.v@wheelsense.local",
        "emergency_contact_name": "สมปอง เวชกิจ",
        "emergency_contact_phone": "081-900-1003",
    },
    {
        "username": "nurse_somchai",
        "first_name": "สมชัย",
        "last_name": "พินิจ",
        "role": "observer",
        "employee_code": "OB-001",
        "department": "Nursing",
        "employment_type": "full_time",
        "specialty": "night_watch",
        "license_number": "TH-NA-55001",
        "phone": "081-100-1004",
        "email": "somchai.p@wheelsense.local",
        "emergency_contact_name": "วิไล พินิจ",
        "emergency_contact_phone": "081-900-1004",
    },
    {
        "username": "nurse_wanida",
        "first_name": "วนิดา",
        "last_name": "ใจดี",
        "role": "observer",
        "employee_code": "OB-002",
        "department": "Nursing",
        "employment_type": "full_time",
        "specialty": "mobility_support",
        "license_number": "TH-NA-55002",
        "phone": "081-100-1005",
        "email": "wanida.j@wheelsense.local",
        "emergency_contact_name": "ประพันธ์ ใจดี",
        "emergency_contact_phone": "081-900-1005",
    },
    {
        "username": "nurse_prasit",
        "first_name": "ประสิทธิ์",
        "last_name": "รอดตาย",
        "role": "observer",
        "employee_code": "OB-003",
        "department": "Nursing",
        "employment_type": "part_time",
        "specialty": "medication_admin",
        "license_number": "TH-NA-55003",
        "phone": "081-100-1006",
        "email": "prasit.r@wheelsense.local",
        "emergency_contact_name": "มานี รอดตาย",
        "emergency_contact_phone": "081-900-1006",
    },
    {
        "username": "nurse_niramol",
        "first_name": "นิรมล",
        "last_name": "สุขสวัสดิ์",
        "role": "observer",
        "employee_code": "OB-004",
        "department": "Nursing",
        "employment_type": "full_time",
        "specialty": "wound_care",
        "license_number": "TH-NA-55004",
        "phone": "081-100-1007",
        "email": "niramol.s@wheelsense.local",
        "emergency_contact_name": "สมชาย สุขสวัสดิ์",
        "emergency_contact_phone": "081-900-1007",
    },
    {
        "username": "nurse_samorn",
        "first_name": "สำราญ",
        "last_name": "มีชัย",
        "role": "observer",
        "employee_code": "OB-005",
        "department": "Nursing",
        "employment_type": "part_time",
        "specialty": "dementia_care",
        "license_number": "TH-NA-55005",
        "phone": "081-100-1008",
        "email": "samorn.m@wheelsense.local",
        "emergency_contact_name": "ประทีป มีชัย",
        "emergency_contact_phone": "081-900-1008",
    },
]

# ============================================================================
# PATIENT-CAREGIVER ASSIGNMENTS (who can see which patient)
# ============================================================================

# Head nurses see all patients in their ward
# Supervisor sees critical patients
# Observers see assigned patients

PATIENT_CAREGIVER_ASSIGNMENTS: dict[str, list[str]] = {
    # Head nurses - see most patients
    "nurse_siri": ["วิชัย", "มาลี", "ประเสริฐ", "สมปอง", "บุญมี"],
    "nurse_kanya": ["นภา", "สมศักดิ์", "จันทร์เพ็ญ", "ประเสริฐ", "สมศักดิ์"],
    # Supervisor - see critical and special care patients
    "nurse_mana": ["วิชัย", "ประเสริฐ", "บุญมี", "สมศักดิ์"],
    # Observers - assigned specific patients
    "nurse_somchai": ["วิชัย", "มาลี"],
    "nurse_wanida": ["ประเสริฐ", "สมปอง"],
    "nurse_prasit": ["บุญมี", "นภา"],
    "nurse_niramol": ["สมศักดิ์", "จันทร์เพ็ญ"],
    "nurse_samorn": ["บุญมี"],  # Dementia care specialist
}


# ============================================================================
# SEED FUNCTIONS
# ============================================================================

async def clear_all_data(session: AsyncSession, preserve_admin: bool = True) -> None:
    """Clear all data except admin user if preserve_admin is True."""
    print("Clearing existing data...")

    # Delete in reverse dependency order
    tables_to_clear = [
        AuditTrailEvent,
        HandoverNote,
        RoleMessage,
        CareDirective,
        CareTask,
        CareSchedule,
        PharmacyOrder,
        Prescription,
        Specialist,
        PhotoRecord,
        DemoActorPosition,
        Alert,
        ActivityTimeline,
        VitalReading,
        PatientDeviceAssignment,
        SmartDevice,
        Device,
        PatientContact,
        Patient,
        CareGiverPatientAccess,
        CareGiver,
        Room,
        Floor,
        FloorplanLayout,
        Facility,
    ]

    for model in tables_to_clear:
        await session.execute(delete(model))
        print(f"  - Cleared {model.__tablename__}")

    # Handle users separately if preserving admin
    if preserve_admin:
        # Keep only admin user
        admin_result = await session.execute(
            select(User).where(User.username == "admin")
        )
        admin_user = admin_result.scalar_one_or_none()

        if admin_user:
            # Delete all other users
            await session.execute(
                delete(User).where(User.username != "admin")
            )
            print(f"  - Cleared users (kept admin id={admin_user.id})")
        else:
            print("  - WARNING: No admin user found to preserve")
            await session.execute(delete(User))
    else:
        await session.execute(delete(User))
        print("  - Cleared all users")

    # Don't clear workspaces - admin needs workspace_id
    # Workspace will be recreated by seed_workspace() after this
    print("  - Kept workspaces (admin dependency)")

    await session.commit()
    print("[OK] Database cleared")


async def ensure_admin_user(session: AsyncSession, workspace_id: int) -> User:
    """Ensure admin user exists with correct password and workspace."""
    result = await session.execute(
        select(User).where(User.username == "admin")
    )
    admin = result.scalar_one_or_none()

    hashed_pw = get_password_hash(ADMIN_PASSWORD)

    if admin is None:
        admin = User(
            username="admin",
            hashed_password=hashed_pw,
            role="admin",
            is_active=True,
            workspace_id=workspace_id,  # Required for NOT NULL constraint
        )
        session.add(admin)
        await session.flush()
        print(f"[OK] Created admin user (id={admin.id})")
    else:
        admin.hashed_password = hashed_pw
        admin.is_active = True
        admin.role = "admin"
        admin.workspace_id = workspace_id  # Ensure linked to workspace
        print(f"[OK] Updated admin user (id={admin.id})")

    await session.commit()
    return admin


async def seed_workspace(session: AsyncSession, workspace_name: str) -> Workspace:
    """Create or get the production workspace."""
    result = await session.execute(
        select(Workspace).where(Workspace.name == workspace_name)
    )
    ws = result.scalar_one_or_none()

    if ws is None:
        ws = Workspace(
            name=workspace_name,
            mode="real",
            is_active=True,
        )
        session.add(ws)
        await session.commit()
        await session.refresh(ws)
        print(f"[OK] Created workspace '{workspace_name}' (id={ws.id})")
    else:
        ws.is_active = True
        await session.commit()
        print(f"[OK] Using existing workspace '{workspace_name}' (id={ws.id})")

    return ws


async def seed_facility_and_floors(
    session: AsyncSession, workspace_id: int
) -> tuple[Facility, list[Floor]]:
    """Create facility and floors."""
    result = await session.execute(
        select(Facility).where(
            Facility.workspace_id == workspace_id,
            Facility.name == "บ้านพักผู้สูงอายุบางแค",
        )
    )
    facility = result.scalar_one_or_none()

    if facility is None:
        facility = Facility(
            workspace_id=workspace_id,
            name="บ้านพักผู้สูงอายุบางแค",
            address="123 ถนนบางแค แขวงบางแค เขตบางแค กรุงเทพมหานคร 10160",
            description="ศูนย์ดูแลผู้สูงอายุและผู้ป่วยระยะพักฟื้น",
            config={"phone": "02-123-4567", "email": "info@bangkhaecare.local"},
        )
        session.add(facility)
        await session.flush()
        print(f"[OK] Created facility '{facility.name}'")
    else:
        print(f"[OK] Using existing facility '{facility.name}'")

    floors: list[Floor] = []
    for floor_number, floor_name in [(1, "ชั้น 1"), (2, "ชั้น 2")]:
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
    print(f"[OK] Created {len(floors)} floors")
    return facility, floors


async def seed_rooms(
    session: AsyncSession, workspace_id: int, floors: list[Floor]
) -> list[Room]:
    """Create rooms."""
    rooms: list[Room] = []

    for room_data in ROOMS_DATA:
        floor = floors[0] if room_data["floor"] == 1 else floors[1]

        q = await session.execute(
            select(Room).where(
                Room.workspace_id == workspace_id,
                Room.name == room_data["name"],
            )
        )
        room = q.scalar_one_or_none()

        if room is None:
            room = Room(
                workspace_id=workspace_id,
                floor_id=floor.id,
                name=room_data["name"],
                description=room_data.get("notes", ""),
                room_type=room_data["room_type"],
                config={},
                adjacent_rooms=[],
            )
            session.add(room)
            await session.flush()
        else:
            room.floor_id = floor.id
            room.room_type = room_data["room_type"]
            room.description = room_data.get("notes", "")

        rooms.append(room)

    await session.commit()
    print(f"[OK] Created {len(rooms)} rooms")
    return rooms


async def seed_caregivers_and_users(
    session: AsyncSession, workspace_id: int
) -> tuple[dict[str, CareGiver], dict[str, User]]:
    """Create caregivers and their user accounts."""
    caregivers: dict[str, CareGiver] = {}
    users: dict[str, User] = {}
    hashed_pw = get_password_hash(DEMO_PASSWORD)

    for staff in STAFF_DATA:
        # Create/update CareGiver
        q = await session.execute(
            select(CareGiver).where(
                CareGiver.workspace_id == workspace_id,
                CareGiver.employee_code == staff["employee_code"],
            )
        )
        caregiver = q.scalar_one_or_none()

        if caregiver is None:
            caregiver = CareGiver(
                workspace_id=workspace_id,
                first_name=staff["first_name"],
                last_name=staff["last_name"],
                role=staff["role"],
                employee_code=staff["employee_code"],
                department=staff["department"],
                employment_type=staff["employment_type"],
                specialty=staff["specialty"],
                license_number=staff["license_number"],
                phone=staff["phone"],
                email=staff["email"],
                emergency_contact_name=staff["emergency_contact_name"],
                emergency_contact_phone=staff["emergency_contact_phone"],
                is_active=True,
            )
            session.add(caregiver)
            await session.flush()
        else:
            # Update existing
            caregiver.first_name = staff["first_name"]
            caregiver.last_name = staff["last_name"]
            caregiver.role = staff["role"]
            caregiver.department = staff["department"]
            caregiver.specialty = staff["specialty"]
            caregiver.phone = staff["phone"]
            caregiver.email = staff["email"]
            caregiver.is_active = True

        # Create/update User
        uq = await session.execute(
            select(User).where(User.username == staff["username"])
        )
        user = uq.scalar_one_or_none()

        if user is None:
            user = User(
                workspace_id=workspace_id,
                username=staff["username"],
                hashed_password=hashed_pw,
                role=staff["role"],
                caregiver_id=caregiver.id,
                is_active=True,
            )
            session.add(user)
        else:
            user.workspace_id = workspace_id
            user.role = staff["role"]
            user.caregiver_id = caregiver.id
            user.hashed_password = hashed_pw
            user.is_active = True

        await session.flush()
        caregivers[staff["username"]] = caregiver
        users[staff["username"]] = user

    await session.commit()
    print(f"[OK] Created {len(caregivers)} caregivers with user accounts")
    return caregivers, users


async def seed_patients_and_user_accounts(
    session: AsyncSession, workspace_id: int, rooms: list[Room]
) -> list[Patient]:
    """Create patients and their linked user accounts."""
    patients: list[Patient] = []
    hashed_pw = get_password_hash(DEMO_PASSWORD)

    # Get bedroom rooms for patient assignment
    bedroom_rooms = [r for r in rooms if r.room_type == "bedroom"]

    for i, patient_data in enumerate(THAI_PATIENTS):
        # Find or create patient
        q = await session.execute(
            select(Patient).where(
                Patient.workspace_id == workspace_id,
                Patient.first_name == patient_data["first_name"],
                Patient.last_name == patient_data["last_name"],
            )
        )
        patient = q.scalar_one_or_none()

        # Assign room
        room = bedroom_rooms[i % len(bedroom_rooms)] if bedroom_rooms else None

        if patient is None:
            patient = Patient(
                workspace_id=workspace_id,
                room_id=room.id if room else None,
                **patient_data,
            )
            session.add(patient)
            await session.flush()
        else:
            patient.room_id = room.id if room else None
            # Update medical data
            patient.medical_conditions = patient_data.get("medical_conditions", [])
            patient.allergies = patient_data.get("allergies", [])
            patient.medications = patient_data.get("medications", [])
            patient.care_level = patient_data.get("care_level", "normal")
            patient.mobility_type = patient_data.get("mobility_type", "wheelchair")

        patients.append(patient)

        # Create patient user account with link to patient record
        # Username based on first name
        username = f"patient_{patient_data['first_name'].lower()}"

        uq = await session.execute(
            select(User).where(User.username == username)
        )
        user = uq.scalar_one_or_none()

        if user is None:
            user = User(
                workspace_id=workspace_id,
                username=username,
                hashed_password=hashed_pw,
                role="patient",
                patient_id=patient.id,
                is_active=True,
            )
            session.add(user)
        else:
            user.workspace_id = workspace_id
            user.patient_id = patient.id
            user.hashed_password = hashed_pw
            user.is_active = True

    await session.commit()
    print(f"[OK] Created {len(patients)} patients with linked user accounts")
    return patients


async def seed_patient_contacts(
    session: AsyncSession, patients: list[Patient]
) -> int:
    """Create emergency contacts for patients."""
    count = 0

    contact_templates = [
        {"type": "family", "name": "{} บุตร", "relationship": "ลูกชาย", "phone": "081-{}-{:04d}"},
        {"type": "family", "name": "{} บุตรสาว", "relationship": "ลูกสาว", "phone": "089-{}-{:04d}"},
        {"type": "emergency", "name": "{} ญาติ", "relationship": "หลาน", "phone": "090-{}-{:04d}"},
    ]

    for i, patient in enumerate(patients):
        # Delete existing contacts
        await session.execute(
            delete(PatientContact).where(PatientContact.patient_id == patient.id)
        )

        # Add 1-2 contacts per patient
        num_contacts = (i % 2) + 1
        for j in range(num_contacts):
            template = contact_templates[j % len(contact_templates)]
            # Create Thai name based on patient name
            base_name = patient.first_name

            contact = PatientContact(
                patient_id=patient.id,
                contact_type=template["type"],
                name=template["name"].format(base_name),
                relationship=template["relationship"],
                phone=template["phone"].format(200 + i, 1000 + i * 10 + j),
                email="",
                is_primary=(j == 0),
            )
            session.add(contact)
            count += 1

    await session.commit()
    print(f"[OK] Created {count} patient contacts")
    return count


async def seed_caregiver_patient_access(
    session: AsyncSession,
    workspace_id: int,
    caregivers: dict[str, CareGiver],
    patients: list[Patient],
    users: dict[str, User],
) -> int:
    """Create caregiver-patient access assignments."""
    count = 0

    # Clear existing access for this workspace
    await session.execute(
        delete(CareGiverPatientAccess).where(
            CareGiverPatientAccess.workspace_id == workspace_id
        )
    )
    await session.commit()  # Commit the delete first

    # Build patient lookup by first name
    patient_by_name: dict[str, Patient] = {}
    for p in patients:
        patient_by_name[p.first_name] = p

    # Track created combinations to avoid duplicates
    created_pairs: set[tuple[int, int]] = set()

    for username, patient_first_names in PATIENT_CAREGIVER_ASSIGNMENTS.items():
        caregiver = caregivers.get(username)
        if not caregiver:
            continue

        for first_name in patient_first_names:
            patient = patient_by_name.get(first_name)
            if not patient:
                continue

            # Skip if this caregiver-patient pair already created
            pair = (caregiver.id, patient.id)
            if pair in created_pairs:
                continue
            created_pairs.add(pair)

            # Check if record already exists in DB
            existing = await session.execute(
                select(CareGiverPatientAccess).where(
                    CareGiverPatientAccess.workspace_id == workspace_id,
                    CareGiverPatientAccess.caregiver_id == caregiver.id,
                    CareGiverPatientAccess.patient_id == patient.id,
                )
            )
            if existing.scalar_one_or_none():
                continue

            # Create access record
            access = CareGiverPatientAccess(
                workspace_id=workspace_id,
                caregiver_id=caregiver.id,
                patient_id=patient.id,
                assigned_by_user_id=users["nurse_siri"].id,  # Head nurse assigns
                is_active=True,
            )
            session.add(access)
            count += 1

    await session.commit()
    print(f"[OK] Created {count} caregiver-patient access records")
    return count


async def seed_devices_and_assignments(
    session: AsyncSession,
    workspace_id: int,
    patients: list[Patient],
) -> list[Device]:
    """Create wheelchair devices and assign to patients."""
    devices: list[Device] = []

    # Create wheelchair devices for each patient
    for i, patient in enumerate(patients):
        device_id = f"WSWHEEL_{i + 1:03d}"

        dq = await session.execute(
            select(Device).where(
                Device.workspace_id == workspace_id,
                Device.device_id == device_id,
            )
        )
        device = dq.scalar_one_or_none()

        if device is None:
            device = Device(
                workspace_id=workspace_id,
                device_id=device_id,
                device_type="wheelchair",
                hardware_type="wheelchair",
                display_name=f"Wheelchair {patient.nickname or patient.first_name}",
                ip_address=f"192.168.1.{100 + i}",
                firmware="v2.1.0",
                config={"calibration": {}, "battery_alert": 20},
            )
            session.add(device)
            await session.flush()

        devices.append(device)

        # Create patient-device assignment
        aq = await session.execute(
            select(PatientDeviceAssignment).where(
                PatientDeviceAssignment.workspace_id == workspace_id,
                PatientDeviceAssignment.device_id == device_id,
                PatientDeviceAssignment.is_active.is_(True),
            )
        )
        assignment = aq.scalar_one_or_none()

        if assignment is None:
            assignment = PatientDeviceAssignment(
                workspace_id=workspace_id,
                patient_id=patient.id,
                device_id=device_id,
                device_role="wheelchair_sensor",
                is_active=True,
            )
            session.add(assignment)
        else:
            assignment.patient_id = patient.id
            assignment.is_active = True

    # Add additional sim devices (Polar, mobile, nodes)
    extra_devices = await seed_additional_sim_devices(session, workspace_id)
    devices.extend(extra_devices)

    await session.commit()
    print(f"[OK] Created {len(devices)} devices with patient assignments")
    return devices


async def seed_smart_devices(
    session: AsyncSession, workspace_id: int, rooms: list[Room]
) -> int:
    """Create smart devices for rooms."""
    count = 0

    smart_device_specs: list[tuple[str, str, str, int]] = [
        # (name, device_type, state, room_index)
        ("โคมไฟหัวเตียง", "light", "off", 0),
        ("แอร์", "climate", "cool", 0),
        ("โคมไฟหัวเตียง", "light", "on", 1),
        ("พัดลม", "fan", "off", 1),
        ("โคมไฟหัวเตียง", "light", "off", 2),
        ("แอร์", "climate", "cool", 2),
        ("สวิตช์เรียกพยาบาล", "switch", "off", 5),
        ("แอร์ห้องอาหาร", "climate", "cool", 12),
        ("โคมไฟสวน", "light", "off", 14),
    ]

    for name, device_type, state, room_idx in smart_device_specs:
        if room_idx >= len(rooms):
            continue

        room = rooms[room_idx]
        entity_id = f"{device_type}.{name.lower().replace(' ', '_')}_room{room.id}"

        q = await session.execute(
            select(SmartDevice).where(
                SmartDevice.workspace_id == workspace_id,
                SmartDevice.ha_entity_id == entity_id,
            )
        )
        row = q.scalar_one_or_none()

        if row is None:
            row = SmartDevice(
                workspace_id=workspace_id,
                room_id=room.id,
                name=name,
                ha_entity_id=entity_id,
                device_type=device_type,
                is_active=True,
                state=state,
                config={"room_name": room.name},
            )
            session.add(row)
            count += 1
        else:
            row.room_id = room.id
            row.name = name
            row.device_type = device_type
            row.state = state
            row.is_active = True

    await session.commit()
    print(f"[OK] Created/updated {count} smart devices")
    return count


async def seed_schedules_and_tasks(
    session: AsyncSession,
    workspace_id: int,
    patients: list[Patient],
    rooms: list[Room],
    users: dict[str, User],
) -> tuple[int, int]:
    """Create care schedules and tasks."""
    schedule_count = 0
    task_count = 0
    now = datetime.now(timezone.utc)

    # Get observer users
    observers = [
        users.get("nurse_somchai"),
        users.get("nurse_wanida"),
        users.get("nurse_prasit"),
        users.get("nurse_niramol"),
        users.get("nurse_samorn"),
    ]
    observers = [o for o in observers if o]

    head_nurse = users.get("nurse_siri")

    schedule_templates = [
        {"title": "ตรวจสอบสัญญาณชีพ", "type": "vital_check", "recurrence": "FREQ=HOURLY;INTERVAL=4"},
        {"title": "ให้ยาตามเวลา", "type": "medication", "recurrence": "FREQ=DAILY;BYHOUR=8,12,18"},
        {"title": "ตรวจแผลกดทับ", "type": "wound_check", "recurrence": "FREQ=DAILY;BYHOUR=9,21"},
        {"title": "กายภาพบำบัด", "type": "physical_therapy", "recurrence": "FREQ=DAILY;BYHOUR=10,16"},
        {"title": "เปลี่ยนท่านอน", "type": "repositioning", "recurrence": "FREQ=HOURLY;INTERVAL=2"},
    ]

    for i, patient in enumerate(patients):
        # Create 2-3 schedules per patient
        num_schedules = 2 + (i % 2)

        for j in range(num_schedules):
            template = schedule_templates[j % len(schedule_templates)]
            observer = observers[j % len(observers)]
            room = rooms[i % len(rooms)]

            starts_at = now + timedelta(hours=j * 4)

            schedule = CareSchedule(
                workspace_id=workspace_id,
                patient_id=patient.id,
                room_id=room.id,
                title=f"{template['title']} - {patient.nickname or patient.first_name}",
                schedule_type=template["type"],
                starts_at=starts_at,
                ends_at=starts_at + timedelta(hours=1),
                recurrence_rule=template["recurrence"],
                assigned_role="observer",
                assigned_user_id=observer.id,
                notes=f"ตารางดูแลประจำ {template['title']}",
                status="scheduled",
                created_by_user_id=head_nurse.id if head_nurse else None,
            )
            session.add(schedule)
            await session.flush()
            schedule_count += 1

            # Create task from schedule
            task = CareTask(
                workspace_id=workspace_id,
                schedule_id=schedule.id,
                patient_id=patient.id,
                title=template["title"],
                description=f"ดูแล {patient.nickname or patient.first_name}: {template['title']}",
                priority="high" if patient.care_level == "critical" else "normal",
                due_at=starts_at,
                status="pending",
                assigned_role="observer",
                assigned_user_id=observer.id,
                created_by_user_id=head_nurse.id if head_nurse else None,
            )
            session.add(task)
            task_count += 1

    await session.commit()
    print(f"[OK] Created {schedule_count} schedules and {task_count} tasks")
    return schedule_count, task_count


async def seed_workflow_items(
    session: AsyncSession,
    workspace_id: int,
    patients: list[Patient],
    users: dict[str, User],
) -> tuple[int, int, int]:
    """Create care directives, messages, and handover notes."""
    directive_count = 0
    message_count = 0
    handover_count = 0
    now = datetime.now(timezone.utc)

    head_nurse = users.get("nurse_siri")
    head_nurse2 = users.get("nurse_kanya")
    supervisor = users.get("nurse_mana")
    observers = [
        users.get("nurse_somchai"),
        users.get("nurse_wanida"),
        users.get("nurse_prasit"),
    ]
    observers = [o for o in observers if o]

    # Create care directives
    directive_specs = [
        {
            "title": "เฝ้าระวังการล้ม",
            "text": "ผู้ป่วยมีความเสี่ยงล้มสูง ต้องเฝ้าระวังทุกครั้งที่ลุกจากเก้าอี้",
            "patients": [p for p in patients if p.care_level in ("critical", "special")],
        },
        {
            "title": "ติดตามสัญญาณชีพ",
            "text": "ตรวจสัญญาณชีพทุก 4 ชั่วโมง หากผิดปกติแจ้งพยาบาลหัวหน้าทันที",
            "patients": [p for p in patients if p.care_level == "critical"],
        },
        {
            "title": "การดูแลอัลไซเมอร์",
            "text": "พูดคุยด้วยน้ำเสียงอ่อนโยน หลีกเลี่ยงการขัด หากมีอาการสับสนให้แจ้งหัวหน้า",
            "patients": [p for p in patients if any("อัลไซเมอร์" in str(c.get("condition", "")) for c in p.medical_conditions)],
        },
    ]

    for spec in directive_specs:
        for i, patient in enumerate(spec["patients"][:3]):  # Max 3 per directive
            observer = observers[i % len(observers)]

            directive = CareDirective(
                workspace_id=workspace_id,
                patient_id=patient.id,
                issued_by_user_id=supervisor.id if supervisor else None,
                target_role="observer",
                target_user_id=observer.id,
                title=spec["title"],
                directive_text=spec["text"],
                status="active",
                effective_from=now - timedelta(days=i),
                effective_until=now + timedelta(days=30),
            )
            session.add(directive)
            directive_count += 1

    # Create role messages
    message_specs = [
        {
            "sender": head_nurse,
            "recipient_role": "observer",
            "recipient": observers[0],
            "subject": "เริ่มกะเช้า",
            "body": "เริ่มตรวจสอบผู้ป่วยห้อง 101-105 ก่อน หากมีอะไรผิดปกติแจ้งทันที",
            "patient": patients[0],
            "is_read": True,
        },
        {
            "sender": observers[0],
            "recipient_role": "head_nurse",
            "recipient": head_nurse,
            "subject": "รายงานอาการ",
            "body": "คุณวิชัยมีอาการสั่นมากขึ้น แนะนำให้ปรับยา",
            "patient": patients[0],
            "is_read": False,
        },
        {
            "sender": supervisor,
            "recipient_role": "head_nurse",
            "recipient": head_nurse2,
            "subject": "แนวทางการดูแล",
            "body": "เพิ่มความถี่ในการตรวจสอบผู้ป่วยระดับ critical เป็น 2 ชั่วโมง",
            "patient": patients[2],
            "is_read": False,
        },
        {
            "sender": observers[1],
            "recipient_role": "supervisor",
            "recipient": supervisor,
            "subject": "พร้อมรับมอบหมาย",
            "body": "ฉันรับผิดชอบห้อง 106-110 เรียบร้อยแล้ว",
            "patient": patients[5],
            "is_read": True,
        },
        {
            "sender": head_nurse2,
            "recipient_role": "observer",
            "recipient": observers[2],
            "subject": "ระวังการตกจากเก้าอี้",
            "body": "คุณประเสริฐมีประวัติตกจากเก้าอี้ ต้องมีคนช่วยตลอดเวลา",
            "patient": patients[2],
            "is_read": False,
        },
    ]

    for idx, spec in enumerate(message_specs):
        msg = RoleMessage(
            workspace_id=workspace_id,
            sender_user_id=spec["sender"].id,
            recipient_role=spec["recipient_role"],
            recipient_user_id=spec["recipient"].id if spec["recipient"] else None,
            patient_id=spec["patient"].id,
            subject=spec["subject"],
            body=spec["body"],
            is_read=spec["is_read"],
            created_at=now - timedelta(hours=idx + 1),
            read_at=(now - timedelta(hours=idx)) if spec["is_read"] else None,
        )
        session.add(msg)
        message_count += 1

    # Create handover notes
    shift_labels = ["morning", "evening", "night"]
    priorities = ["routine", "urgent", "routine"]

    for i, patient in enumerate(patients[:6]):
        author = observers[i % len(observers)] if observers else head_nurse
        target_role = "head_nurse" if i % 2 == 0 else "supervisor"

        note = HandoverNote(
            workspace_id=workspace_id,
            patient_id=patient.id,
            author_user_id=author.id if author else None,
            target_role=target_role,
            shift_date=(now - timedelta(days=i % 3)).date(),
            shift_label=shift_labels[i % len(shift_labels)],
            priority=priorities[i % len(priorities)],
            note=f"บันทึกการส่งผู้ป่วย {patient.nickname or patient.first_name}: อาการคงที่ ต้องติดตามต่อ",
            created_at=now - timedelta(hours=i * 4),
        )
        session.add(note)
        handover_count += 1

    await session.commit()
    print(f"[OK] Created {directive_count} directives, {message_count} messages, {handover_count} handovers")
    return directive_count, message_count, handover_count


async def seed_vitals(
    session: AsyncSession,
    workspace_id: int,
    patients: list[Patient],
) -> int:
    """Create vital readings for patients."""
    count = 0
    now = datetime.now(timezone.utc)
    rng = random.Random(SEED)

    for patient in patients:
        # Create 10-15 vital readings per patient
        num_readings = 10 + rng.randint(0, 5)

        for i in range(num_readings):
            # Generate realistic vital signs based on care level
            if patient.care_level == "critical":
                heart_rate = rng.randint(75, 110)
                spo2 = rng.randint(93, 98)
            elif patient.care_level == "special":
                heart_rate = rng.randint(70, 100)
                spo2 = rng.randint(95, 99)
            else:
                heart_rate = rng.randint(65, 90)
                spo2 = rng.randint(96, 100)

            vital = VitalReading(
                workspace_id=workspace_id,
                patient_id=patient.id,
                device_id=f"SIM_POLAR_0{rng.randint(1, 5)}",
                timestamp=now - timedelta(hours=i * 4 + rng.randint(0, 3)),
                heart_rate_bpm=heart_rate,
                rr_interval_ms=float(rng.randint(600, 1000)),
                spo2=spo2,
                sensor_battery=rng.randint(40, 100),
                source="ble",
            )
            session.add(vital)
            count += 1

    await session.commit()
    print(f"[OK] Created {count} vital readings")
    return count


async def seed_alerts(
    session: AsyncSession,
    workspace_id: int,
    patients: list[Patient],
    caregivers: dict[str, CareGiver],
    devices: list[Device],
) -> int:
    """Create alerts for the system."""
    count = 0
    now = datetime.now(timezone.utc)

    alert_specs = [
        {"type": "fall", "severity": "critical", "title": "ตรวจพบการล้ม"},
        {"type": "abnormal_hr", "severity": "warning", "title": "ชีพจรผิดปกติ"},
        {"type": "low_battery", "severity": "info", "title": "แบตเตอรี่ต่ำ"},
        {"type": "room_change", "severity": "info", "title": "เปลี่ยนห้อง"},
        {"type": "medication_missed", "severity": "warning", "title": "ไม่ได้รับยาตามเวลา"},
    ]

    statuses = ["active", "acknowledged", "resolved"]

    # Create 15-20 alerts
    num_alerts = 15 + random.randint(0, 5)

    for i in range(num_alerts):
        patient = patients[i % len(patients)]
        device = devices[i % len(devices)] if devices else None
        spec = alert_specs[i % len(alert_specs)]
        status = statuses[i % len(statuses)]

        # Get an appropriate caregiver
        caregiver_keys = list(caregivers.keys())
        caregiver = caregivers.get(caregiver_keys[i % len(caregiver_keys)])

        ts = now - timedelta(hours=i * 2)

        alert = Alert(
            workspace_id=workspace_id,
            patient_id=patient.id,
            device_id=device.device_id if device else None,
            timestamp=ts,
            alert_type=spec["type"],
            severity=spec["severity"],
            title=f"{spec['title']} - {patient.nickname or patient.first_name}",
            description=f"Alert #{i+1} สำหรับ {patient.first_name} {patient.last_name}",
            data={"sequence": i + 1, "patient_room": patient.room_id},
            status=status,
            acknowledged_by=caregiver.id if caregiver and status in ("acknowledged", "resolved") else None,
            acknowledged_at=ts + timedelta(minutes=15) if status in ("acknowledged", "resolved") else None,
            resolved_at=ts + timedelta(hours=1) if status == "resolved" else None,
            resolution_note="แก้ไขปัญหาแล้ว" if status == "resolved" else "",
        )
        session.add(alert)
        count += 1

    await session.commit()
    print(f"[OK] Created {count} alerts")
    return count


async def seed_specialists_and_prescriptions(
    session: AsyncSession,
    workspace_id: int,
    patients: list[Patient],
    users: dict[str, User],
) -> tuple[int, int, int]:
    """Create specialists, prescriptions, and pharmacy orders."""
    specialist_count = 0
    prescription_count = 0
    pharmacy_order_count = 0
    now = datetime.now(timezone.utc)

    supervisor = users.get("nurse_mana")

    # Create specialists
    specialist_specs = [
        ("กริช", "ศรีสุข", "neurology", "NEU-1001", "081-234-5678"),
        ("นภัส", "รักษา", "geriatrics", "GER-2204", "081-345-6789"),
        ("พลอย", "อนันต์", "cardiology", "CAR-3310", "081-456-7890"),
        ("วิชัย", "แพทย์", "endocrinology", "END-4401", "081-567-8901"),
    ]

    specialists = []
    for first_name, last_name, specialty, license_num, phone in specialist_specs:
        q = await session.execute(
            select(Specialist).where(
                Specialist.workspace_id == workspace_id,
                Specialist.license_number == license_num,
            )
        )
        specialist = q.scalar_one_or_none()

        if specialist is None:
            specialist = Specialist(
                workspace_id=workspace_id,
                first_name=first_name,
                last_name=last_name,
                specialty=specialty,
                license_number=license_num,
                phone=phone,
                email=f"{first_name.lower()}.{last_name.lower()}@wheelsense.local",
                notes="แพทย์ผู้เชี่ยวชาญ",
                is_active=True,
            )
            session.add(specialist)
            await session.flush()

        specialists.append(specialist)
        specialist_count += 1

    # Create prescriptions for critical/special care patients
    critical_patients = [p for p in patients if p.care_level in ("critical", "special")]

    med_names = [
        ("Carbidopa/Levodopa", "25/100mg", "3 ครั้ง/วัน"),
        ("Metformin", "500mg", "2 ครั้ง/วัน"),
        ("Insulin Glargine", "12 units", "1 ครั้ง/วัน"),
        ("Amlodipine", "5mg", "1 ครั้ง/วัน"),
        ("Atorvastatin", "20mg", "1 ครั้ง/วัน"),
        ("Warfarin", "3mg", "1 ครั้ง/วัน"),
        ("Donepezil", "5mg", "1 ครั้ง/วัน"),
        ("Furosemide", "40mg", "1 ครั้ง/วัน"),
    ]

    prescriptions = []
    for i, patient in enumerate(critical_patients):
        specialist = specialists[i % len(specialists)]
        med = med_names[i % len(med_names)]

        prescription = Prescription(
            workspace_id=workspace_id,
            patient_id=patient.id,
            specialist_id=specialist.id,
            prescribed_by_user_id=supervisor.id if supervisor else None,
            medication_name=med[0],
            dosage=med[1],
            frequency=med[2],
            route="oral",
            instructions="รับประทานตามคำแนะนำ",
            status="active",
            start_date=(now - timedelta(days=14)).date(),
            end_date=(now + timedelta(days=30)).date(),
        )
        session.add(prescription)
        await session.flush()
        prescriptions.append(prescription)
        prescription_count += 1

    # Create pharmacy orders
    for i, prescription in enumerate(prescriptions):
        order = PharmacyOrder(
            workspace_id=workspace_id,
            prescription_id=prescription.id,
            patient_id=prescription.patient_id,
            order_number=f"WS{workspace_id:03d}-RX{i+1:04d}",
            pharmacy_name="ร้านขายยาบางแคเภสัช",
            quantity=30,
            refills_remaining=2 - (i % 3),
            status=["pending", "verified", "dispensed"][i % 3],
            requested_at=now - timedelta(hours=i * 6),
            fulfilled_at=now - timedelta(hours=i * 6 - 4) if i % 3 == 2 else None,
            notes="คำสั่งซื้อยาอัตโนมัติ",
        )
        session.add(order)
        pharmacy_order_count += 1

    await session.commit()
    print(f"[OK] Created {specialist_count} specialists, {prescription_count} prescriptions, {pharmacy_order_count} pharmacy orders")
    return specialist_count, prescription_count, pharmacy_order_count


async def update_admin_workspace(
    session: AsyncSession, admin: User, workspace_id: int
) -> None:
    """Link admin user to the production workspace."""
    admin.workspace_id = workspace_id
    await session.commit()
    print(f"[OK] Linked admin user to workspace {workspace_id}")


# ============================================================================
# MAIN EXECUTION
# ============================================================================

async def run_seed(reset: bool = False) -> None:
    """Main seeding function."""
    print("=" * 60)
    print("WheelSense Production Seed Script")
    print("=" * 60)

    async with AsyncSessionLocal() as session:
        # Step 1: Create workspace first (needed for admin)
        workspace = await seed_workspace(session, PRODUCTION_WORKSPACE)

        # Step 2: Ensure admin user exists (always preserve)
        # Create with workspace_id to satisfy NOT NULL constraint
        admin = await ensure_admin_user(session, workspace.id)

        # Step 3: Clear data if requested (keep admin and workspace)
        if reset:
            await clear_all_data(session, preserve_admin=True)
            # Re-ensure admin after clear
            admin = await ensure_admin_user(session, workspace.id)

        # Step 4: Admin already linked to workspace in ensure_admin_user
        print(f"[OK] Admin user linked to workspace {workspace.id}")

        # Step 5: Create facility and floors
        facility, floors = await seed_facility_and_floors(session, workspace.id)

        # Step 6: Create rooms
        rooms = await seed_rooms(session, workspace.id, floors)

        # Step 7: Create caregivers and users
        caregivers, users = await seed_caregivers_and_users(session, workspace.id)

        # Step 8: Create patients and their user accounts
        patients = await seed_patients_and_user_accounts(session, workspace.id, rooms)

        # Step 9: Create patient contacts
        await seed_patient_contacts(session, patients)

        # Step 10: Create caregiver-patient access
        await seed_caregiver_patient_access(
            session, workspace.id, caregivers, patients, users
        )

        # Step 11: Create devices and assignments
        devices = await seed_devices_and_assignments(session, workspace.id, patients)

        # Step 12: Create smart devices
        await seed_smart_devices(session, workspace.id, rooms)

        # Step 13: Create schedules and tasks
        await seed_schedules_and_tasks(session, workspace.id, patients, rooms, users)

        # Step 14: Create workflow items
        await seed_workflow_items(session, workspace.id, patients, users)

        # Step 15: Create vital readings
        await seed_vitals(session, workspace.id, patients)

        # Step 16: Create alerts
        await seed_alerts(session, workspace.id, patients, caregivers, devices)

        # Step 17: Create specialists and prescriptions
        await seed_specialists_and_prescriptions(session, workspace.id, patients, users)

    # Print summary
    print("\n" + "=" * 60)
    print("SEED COMPLETE - SUMMARY")
    print("=" * 60)
    print(f"Workspace: {PRODUCTION_WORKSPACE} (ID: {workspace.id})")
    print(f"Facility: {facility.name}")
    print(f"  - Floors: {len(floors)}")
    print(f"  - Rooms: {len(rooms)}")
    print(f"  - Bedrooms: {len([r for r in rooms if r.room_type == 'bedroom'])}")
    print(f"\nPeople:")
    print(f"  - Patients: {len(patients)}")
    print(f"  - Caregivers: {len(caregivers)}")
    print(f"  - Total user accounts: {len(patients) + len(caregivers) + 1} (including admin)")
    print(f"\nAccess Control:")
    access_count = sum(len(v) for v in PATIENT_CAREGIVER_ASSIGNMENTS.values())
    print(f"  - Caregiver-Patient access links: ~{access_count}")
    print(f"\nDevices:")
    print(f"  - Wheelchair sensors: {len(patients)}")
    print(f"  - Additional devices: Polar HR sensors, mobile phones, nodes")
    print(f"  - Smart room devices: lights, AC, switches")
    print(f"\nWorkflow:")
    print(f"  - Care schedules and tasks created for each patient")
    print(f"  - Directives, messages, handover notes seeded")
    print(f"  - Vital readings, alerts, specialists, prescriptions")

    print("\n" + "-" * 60)
    print("LOGIN CREDENTIALS")
    print("-" * 60)
    print(f"Admin (preserved):")
    print(f"  username: admin")
    print(f"  password: {ADMIN_PASSWORD}")
    print(f"\nHead Nurses (2):")
    print(f"  nurse_siri / {DEMO_PASSWORD}")
    print(f"  nurse_kanya / {DEMO_PASSWORD}")
    print(f"\nSupervisor (1):")
    print(f"  nurse_mana / {DEMO_PASSWORD}")
    print(f"\nObservers (5):")
    print(f"  nurse_somchai / {DEMO_PASSWORD}")
    print(f"  nurse_wanida / {DEMO_PASSWORD}")
    print(f"  nurse_prasit / {DEMO_PASSWORD}")
    print(f"  nurse_niramol / {DEMO_PASSWORD}")
    print(f"  nurse_samorn / {DEMO_PASSWORD}")
    print(f"\nPatient Users (8):")
    for p in patients:
        print(f"  patient_{p.first_name.lower()} / {DEMO_PASSWORD}")

    print("\n" + "=" * 60)
    print("[OK] Production seed completed successfully!")
    print("=" * 60)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed WheelSense with production-quality demo data"
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Clear all existing data (except admin) before seeding",
    )
    return parser.parse_args()


def _configure_console_utf8() -> None:
    """Configure console for UTF-8 output (Windows compatibility)."""
    out = getattr(sys.stdout, "reconfigure", None)
    if callable(out):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass


def main() -> None:
    _configure_console_utf8()
    args = parse_args()
    asyncio.run(run_seed(reset=args.reset))


if __name__ == "__main__":
    main()
