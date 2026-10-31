#!/usr/bin/env python3
"""
WheelSense Phase 10: Environment Simulation Seeder
Sets up nursing home environments (Workspaces), 15 Rooms, 10 Thai Patients, 
5 Caregivers, and virtual MQTT devices.
"""

import sys
import os
import asyncio
import argparse
from datetime import date

# Adjust python path to ensure we can import 'app'
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update

from app.db.session import AsyncSessionLocal
from app.models import Workspace, Room, Patient, User, Device, PatientDeviceAssignment
from app.core.security import get_password_hash
from seed_device_extras import seed_additional_sim_devices

ENVIRONMENTS = [
    "Simulation 1 - Nursing Home",
    "Real Place 1 - Ban Bang Khae",
]

THAI_ROOMS = [
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

THAI_PATIENTS = [
    {
        "first_name": "บุญมี",
        "last_name": "มีสุข",
        "nickname": "ตาบุญ",
        "gender": "male",
        "date_of_birth": date(1945, 5, 12),
        "medical_conditions": [{"condition": "โรคอัลไซเมอร์", "severity": "สูง"}, {"condition": "ความดันโลหิตสูง", "severity": "ปานกลาง"}],
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
        "medical_conditions": [{"condition": "หอบหืด", "severity": "ปานกลาง"}, {"condition": "หลงลืม", "severity": "ปานกลาง"}],
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

CAREGIVERS = [
    {"username": "nurse_somying", "first_name": "สมหญิง", "last_name": "พยาบาลดี", "role": "supervisor"},
    {"username": "nurse_mana", "first_name": "มานะ", "last_name": "ขยัน", "role": "supervisor"},
    {"username": "nurse_suda", "first_name": "สุดา", "last_name": "อ่อนโยน", "role": "observer"},
    {"username": "nurse_wimon", "first_name": "วิมล", "last_name": "รักษ์ไทย", "role": "observer"},
    {"username": "nurse_niti", "first_name": "นิติ", "last_name": "เที่ยงธรรม", "role": "observer"},
]


async def activate_workspace(session: AsyncSession, target_env: str):
    """Sets the target workspace to is_active=True and all others to False."""
    result = await session.execute(select(Workspace).where(Workspace.name == target_env))
    ws = result.scalar_one_or_none()
    if not ws:
        # Create it if it doesn't exist
        ws = Workspace(name=target_env, mode="simulation", is_active=True)
        session.add(ws)
        await session.commit()
    
    # Deactivate all
    await session.execute(update(Workspace).values(is_active=False))
    # Activate target
    await session.execute(update(Workspace).where(Workspace.id == ws.id).values(is_active=True))
    await session.commit()
    return ws


async def seed_data(env_name: str):
    async with AsyncSessionLocal() as session:
        print(f"Loading environment: {env_name}")
        ws = await activate_workspace(session, env_name)
        print(f"Workspace '{ws.name}' is now ACTIVE (ID: {ws.id})")

        # Rooms
        print("Seeding Rooms...")
        room_ids = []
        for r_idx, r_data in enumerate(THAI_ROOMS):
            result = await session.execute(
                select(Room).where(Room.workspace_id == ws.id, Room.name == r_data["name"])
            )
            room = result.scalar_one_or_none()
            if not room:
                room = Room(workspace_id=ws.id, name=r_data["name"], room_type=r_data["type"])
                session.add(room)
                await session.flush()
            room_ids.append(room.id)

        from app.models.caregivers import CareGiver
        print("Seeding Caregivers & Users...")
        hashed_pw = get_password_hash("wheelsense123")
        for u_data in CAREGIVERS:
            # Upsert CareGiver
            result = await session.execute(
                select(CareGiver).where(CareGiver.first_name == u_data["first_name"], CareGiver.workspace_id == ws.id)
            )
            cg = result.scalar_one_or_none()
            if not cg:
                cg = CareGiver(
                    workspace_id=ws.id,
                    first_name=u_data["first_name"],
                    last_name=u_data["last_name"],
                    role=u_data["role"],
                    is_active=True
                )
                session.add(cg)
                await session.flush()
                
            # Upsert User
            result = await session.execute(select(User).where(User.username == u_data["username"]))
            user = result.scalar_one_or_none()
            if not user:
                user = User(
                    workspace_id=ws.id,
                    username=u_data["username"],
                    hashed_password=hashed_pw,
                    role=u_data["role"],
                    caregiver_id=cg.id,
                    is_active=True
                )
                session.add(user)

        # Patients
        print("Seeding Patients...")
        patient_records = []
        for p_idx, p_data in enumerate(THAI_PATIENTS):
            result = await session.execute(
                select(Patient).where(Patient.workspace_id == ws.id, Patient.first_name == p_data["first_name"])
            )
            patient = result.scalar_one_or_none()
            if not patient:
                # Assign to a room (first 10 rooms are bedrooms)
                room_id = room_ids[p_idx % 10] if room_ids else None
                patient = Patient(workspace_id=ws.id, room_id=room_id, **p_data)
                session.add(patient)
                await session.flush()
            patient_records.append(patient)

        # Devices
        print("Seeding Devices & Assignments...")
        for i, patient in enumerate(patient_records):
            dev_id = f"SIM_WHEEL_0{i+1}" if i < 9 else f"SIM_WHEEL_{i+1}"
            
            # Check device
            result = await session.execute(
                select(Device).where(Device.workspace_id == ws.id, Device.device_id == dev_id)
            )
            device = result.scalar_one_or_none()
            if not device:
                device = Device(
                    workspace_id=ws.id,
                    device_id=dev_id,
                    device_type="wheelchair",
                    hardware_type="wheelchair",
                    display_name=f"Wheelchair {i + 1:02d}",
                    ip_address="",
                    firmware="sim-v1",
                    config={},
                )
                session.add(device)
                await session.flush()
            else:
                device.hardware_type = "wheelchair"
                device.device_type = "wheelchair"
                if not (device.display_name or "").strip():
                    device.display_name = f"Wheelchair {i + 1:02d}"

            # Check assignment
            result = await session.execute(
                select(PatientDeviceAssignment).where(
                    PatientDeviceAssignment.workspace_id == ws.id, 
                    PatientDeviceAssignment.device_id == dev_id,
                    PatientDeviceAssignment.is_active == True
                )
            )
            assignment = result.scalar_one_or_none()
            if not assignment:
                assignment = PatientDeviceAssignment(
                    workspace_id=ws.id,
                    patient_id=patient.id,
                    device_id=dev_id,
                    device_role="wheelchair_sensor",
                    is_active=True
                )
                session.add(assignment)

        print("Seeding Node / Polar Sense / Mobile Phone sim devices...")
        await seed_additional_sim_devices(session, ws.id)

        await session.commit()
        print("[OK] Environment seeding complete.")


def main():
    parser = argparse.ArgumentParser(description="WheelSense Environment Seeder")
    parser.add_argument("--env", type=str, default="Simulation 1 - Nursing Home", help="Environment name to load/seed")
    parser.add_argument("--activate", action="store_true", help="Set this environment as active")
    
    args = parser.parse_args()
    
    # Normally we might want to check if the target env is in our list, but creating it is fine.
    asyncio.run(seed_data(args.env))


if __name__ == "__main__":
    main()
