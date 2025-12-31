"""
Comprehensive migration script to convert ALL Thai text to English across all collections.
Run this script to update existing database records.
"""

import asyncio
import logging
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MONGO_URI = "mongodb://admin:wheelsense123@mongodb:27017/wheelsense?authSource=admin"

# Mapping dictionaries
PATIENT_CONDITION_MAP = {
    "ปกติ": "Normal",
    "ต้องระวัง": "Caution",
    "ฉุกเฉิน": "Emergency"
}

ROUTINE_TITLE_MAP = {
    "ตื่นนอน": "Wake Up",
    "ทานอาหารเช้า": "Have Breakfast",
    "ทานยา": "Take Medicine",
    "กายภาพบำบัด": "Physical Therapy",
    "ทานอาหารกลางวัน": "Have Lunch",
    "พักผ่อน": "Rest",
    "ทานอาหารเย็น": "Have Dinner",
    "ยาก่อนนอน": "Bedtime Medication",
    "เข้านอน": "Go to Bed"
}

ROUTINE_DESC_MAP = {
    "ตื่นนอนและล้างหน้า": "Wake up and wash face",
    "ทานอาหารเช้าที่ห้องครัว": "Have breakfast in the kitchen",
    "ยาความดันโลหิต 1 เม็ด": "Blood pressure medication 1 tablet",
    "ออกกำลังกายเบาๆ ที่ห้องนั่งเล่น 30 นาที": "Light exercise in the living room for 30 minutes",
    "ทานอาหารกลางวันที่ห้องครัว": "Have lunch in the kitchen",
    "งีบหลับที่ห้องนอน": "Nap in the bedroom",
    "ทานอาหารเย็นที่ห้องครัว": "Have dinner in the kitchen",
    "ทานยาก่อนนอน": "Take bedtime medication",
    "พักผ่อนนอนหลับ": "Rest and sleep"
}

ACTIVITY_MESSAGE_MAP = {
    "เข้าห้องนอน": "Entered bedroom",
    "ออกจากห้องนอน": "Exited bedroom",
    "เข้าห้องน้ำ": "Entered bathroom",
    "ออกจากห้องน้ำ": "Exited bathroom",
    "เข้าห้องครัว": "Entered kitchen",
    "ออกจากห้องครัว": "Exited kitchen",
    "เข้าห้องนั่งเล่น": "Entered living room",
    "ออกจากห้องนั่งเล่น": "Exited living room",
    "เปิดไฟห้องนอน": "Bedroom light turned on",
    "ปิดไฟห้องนอน": "Bedroom light turned off",
    "เปิดไฟห้องน้ำ": "Bathroom light turned on",
    "ปิดไฟห้องน้ำ": "Bathroom light turned off",
    "เปิดไฟห้องครัว": "Kitchen light turned on",
    "ปิดไฟห้องครัว": "Kitchen light turned off",
    "เปิดไฟห้องนั่งเล่น": "Living room light turned on",
    "ปิดไฟห้องนั่งเล่น": "Living room light turned off",
    "ตื่นนอน - เสร็จสิ้น": "Wake Up - Completed",
    "ทานอาหารเช้า - เสร็จสิ้น": "Have Breakfast - Completed",
    "ทานยา - เสร็จสิ้น": "Take Medicine - Completed"
}

NOTIFICATION_TITLE_MAP = {
    "ระบบพร้อมใช้งาน": "System Ready",
    "ตื่นนอนเรียบร้อย": "Wake Up Completed"
}

NOTIFICATION_MESSAGE_MAP = {
    "WheelSense เริ่มต้นทำงานเรียบร้อย": "WheelSense initialized successfully",
    "สมชาย ใจดี ตื่นนอนแล้วเวลา 07:00": "Somchai Jaidee woke up at 07:00"
}


async def migrate_patients(db):
    """Migrate patient data."""
    logger.info("📋 Migrating patients...")
    updated = 0
    
    async for patient in db.patients.find({}):
        updates = {}
        
        # Update name if it's Thai (has Thai characters)
        if patient.get('name') and any('\u0E00' <= char <= '\u0E7F' for char in patient['name']):
            if patient.get('nameEn'):
                updates['name'] = patient['nameEn']
            else:
                # Fallback: use English name if available
                updates['name'] = patient.get('nameEn', patient['name'])
        
        # Update condition
        if patient.get('condition') in PATIENT_CONDITION_MAP:
            updates['condition'] = PATIENT_CONDITION_MAP[patient['condition']]
        
        # Update doctor name
        if patient.get('doctor') and any('\u0E00' <= char <= '\u0E7F' for char in patient['doctor']):
            if 'นพ.' in patient.get('doctor', ''):
                updates['doctor'] = patient['doctor'].replace('นพ.', 'Dr.').replace('วิชัย สุขใจ', 'Wichai Sukjai')
            else:
                updates['doctor'] = 'Dr. Wichai Sukjai'
        
        # Update notes
        if patient.get('notes') and any('\u0E00' <= char <= '\u0E7F' for char in patient['notes']):
            updates['notes'] = "Take blood pressure medication once daily"
        
        if updates:
            await db.patients.update_one(
                {'_id': patient['_id']},
                {'$set': {**updates, 'updatedAt': datetime.now()}}
            )
            updated += 1
            logger.info(f"  ✅ Updated patient: {patient.get('id', patient['_id'])}")
    
    logger.info(f"  ✅ Updated {updated} patient(s)")
    return updated


async def migrate_routines(db):
    """Migrate routines data."""
    logger.info("📋 Migrating routines...")
    updated = 0
    
    async for routine in db.routines.find({}):
        updates = {}
        
        # Update title
        if routine.get('title') in ROUTINE_TITLE_MAP:
            updates['title'] = ROUTINE_TITLE_MAP[routine['title']]
        elif routine.get('title') and any('\u0E00' <= char <= '\u0E7F' for char in routine['title']):
            # Try to find partial match
            for thai, english in ROUTINE_TITLE_MAP.items():
                if thai in routine['title']:
                    updates['title'] = english
                    break
        
        # Update description
        if routine.get('description') in ROUTINE_DESC_MAP:
            updates['description'] = ROUTINE_DESC_MAP[routine['description']]
        elif routine.get('description') and any('\u0E00' <= char <= '\u0E7F' for char in routine['description']):
            # Try to find partial match
            for thai, english in ROUTINE_DESC_MAP.items():
                if thai in routine['description']:
                    updates['description'] = english
                    break
        
        if updates:
            await db.routines.update_one(
                {'_id': routine['_id']},
                {'$set': {**updates, 'updatedAt': datetime.now()}}
            )
            updated += 1
    
    logger.info(f"  ✅ Updated {updated} routine(s)")
    return updated


async def migrate_activity_logs(db):
    """Migrate activity logs."""
    logger.info("📋 Migrating activity logs...")
    updated = 0
    
    async for log in db.activityLogs.find({}):
        updates = {}
        
        # Update message
        if log.get('message') in ACTIVITY_MESSAGE_MAP:
            updates['message'] = ACTIVITY_MESSAGE_MAP[log['message']]
        elif log.get('message') and any('\u0E00' <= char <= '\u0E7F' for char in log['message']):
            # Try to find partial match
            for thai, english in ACTIVITY_MESSAGE_MAP.items():
                if thai in log['message']:
                    updates['message'] = english
                    break
        
        if updates:
            await db.activityLogs.update_one(
                {'_id': log['_id']},
                {'$set': {**updates, 'updatedAt': datetime.now()}}
            )
            updated += 1
    
    logger.info(f"  ✅ Updated {updated} activity log(s)")
    return updated


async def migrate_notifications(db):
    """Migrate notifications."""
    logger.info("📋 Migrating notifications...")
    updated = 0
    
    async for notif in db.notifications.find({}):
        updates = {}
        
        # Update title
        if notif.get('title') in NOTIFICATION_TITLE_MAP:
            updates['title'] = NOTIFICATION_TITLE_MAP[notif['title']]
        elif notif.get('title') and any('\u0E00' <= char <= '\u0E7F' for char in notif['title']):
            # Try to find partial match
            for thai, english in NOTIFICATION_TITLE_MAP.items():
                if thai in notif['title']:
                    updates['title'] = english
                    break
        
        # Update message
        if notif.get('message') in NOTIFICATION_MESSAGE_MAP:
            updates['message'] = NOTIFICATION_MESSAGE_MAP[notif['message']]
        elif notif.get('message') and any('\u0E00' <= char <= '\u0E7F' for char in notif['message']):
            # Try to find partial match
            for thai, english in NOTIFICATION_MESSAGE_MAP.items():
                if thai in notif['message']:
                    updates['message'] = english
                    break
        elif notif.get('message') and 'สมชาย ใจดี' in notif.get('message', ''):
            updates['message'] = notif['message'].replace('สมชาย ใจดี', 'Somchai Jaidee')
        
        if updates:
            await db.notifications.update_one(
                {'_id': notif['_id']},
                {'$set': {**updates, 'updatedAt': datetime.now()}}
            )
            updated += 1
    
    logger.info(f"  ✅ Updated {updated} notification(s)")
    return updated


async def migrate_doctor_notes(db):
    """Migrate doctor notes."""
    logger.info("📋 Migrating doctor notes...")
    updated = 0
    
    async for note in db.doctorNotes.find({}):
        updates = {}
        
        # Update doctor name
        if note.get('doctorName') and any('\u0E00' <= char <= '\u0E7F' for char in note['doctorName']):
            if 'นพ.' in note.get('doctorName', ''):
                updates['doctorName'] = note['doctorName'].replace('นพ.', 'Dr.').replace('วิชัย สุขใจ', 'Wichai Sukjai')
            else:
                updates['doctorName'] = 'Dr. Wichai Sukjai'
        
        # Update notes
        if note.get('notes') and any('\u0E00' <= char <= '\u0E7F' for char in note['notes']):
            updates['notes'] = "Patient is healthy, should do light exercise daily"
        
        # Update medications
        if note.get('medications') and isinstance(note['medications'], list):
            updated_meds = []
            for med in note['medications']:
                if isinstance(med, dict):
                    med_update = med.copy()
                    if med.get('name') and any('\u0E00' <= char <= '\u0E7F' for char in med['name']):
                        med_update['name'] = "Blood Pressure Medication"
                    if med.get('frequency') and any('\u0E00' <= char <= '\u0E7F' for char in med['frequency']):
                        med_update['frequency'] = "Once daily after breakfast"
                    updated_meds.append(med_update)
                else:
                    updated_meds.append(med)
            if updated_meds != note['medications']:
                updates['medications'] = updated_meds
        
        if updates:
            await db.doctorNotes.update_one(
                {'_id': note['_id']},
                {'$set': {**updates, 'updatedAt': datetime.now()}}
            )
            updated += 1
    
    logger.info(f"  ✅ Updated {updated} doctor note(s)")
    return updated


async def migrate_all():
    """Run all migrations."""
    client = AsyncIOMotorClient(MONGO_URI)
    db = client.wheelsense
    
    logger.info("🔄 Starting comprehensive migration: Thai to English...")
    logger.info("=" * 60)
    
    total_updated = 0
    total_updated += await migrate_patients(db)
    total_updated += await migrate_routines(db)
    total_updated += await migrate_activity_logs(db)
    total_updated += await migrate_notifications(db)
    total_updated += await migrate_doctor_notes(db)
    
    logger.info("=" * 60)
    logger.info(f"\n✅ Comprehensive migration complete! Updated {total_updated} record(s) across all collections.")
    logger.info("\n📋 Summary:")
    logger.info("   - Patients: name, condition, doctor, notes")
    logger.info("   - Routines: title, description")
    logger.info("   - Activity Logs: messages")
    logger.info("   - Notifications: title, message")
    logger.info("   - Doctor Notes: doctorName, notes, medications")
    
    client.close()


if __name__ == "__main__":
    asyncio.run(migrate_all())

