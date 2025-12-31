"""
Doctor Notes APIs - Medical notes and behavior analysis
"""

from datetime import datetime
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from ..core.database import Database
from ..dependencies import get_db, get_ai_service

router = APIRouter(tags=["Doctor Notes"])


# ==================== Doctor Notes ====================

@router.get("/doctor-notes/{patient_id}")
async def get_doctor_notes(patient_id: str, request: Request):
    """Get doctor notes for a patient."""
    db = get_db(request)
    
    notes = await db.db.doctorNotes.find({"patientId": patient_id}).to_list(length=100)
    return {"notes": [Database._serialize_doc(n) for n in notes]}


@router.post("/doctor-notes")
async def create_doctor_note(note: dict, request: Request):
    """Create a new doctor note."""
    db = get_db(request)
    
    note["id"] = f"DN{datetime.now().timestamp()}"
    note["createdAt"] = datetime.now()
    
    result = await db.db.doctorNotes.insert_one(note)
    note["_id"] = result.inserted_id
    return Database._serialize_doc(note)


# ==================== Behavior Analysis ====================

@router.get("/behavior/{patient_id}")
async def get_behavior_analysis(patient_id: str, request: Request):
    """Get behavior analysis for a patient."""
    db = get_db(request)
    
    analysis = await db.db.behaviorAnalysis.find(
        {"patientId": patient_id}
    ).sort("createdAt", -1).to_list(length=10)
    
    return {"analysis": [Database._serialize_doc(a) for a in analysis]}


# ==================== AI Analysis ====================

class BehaviorAnalysisRequest(BaseModel):
    user_id: str
    date: Optional[str] = None


@router.post("/ai/analyze-behavior")
async def analyze_behavior(request_body: BehaviorAnalysisRequest, request: Request):
    """Analyze user behavior using AI."""
    db = get_db(request)
    ai_service = get_ai_service(request)
    
    if not ai_service:
        raise HTTPException(status_code=503, detail="AI service not available")
    
    # Get activity logs for analysis
    activities = await db.get_user_activities(
        user_id=request_body.user_id,
        date=request_body.date
    )
    
    # Run AI analysis
    analysis = await ai_service.analyze_behavior(activities)
    
    # Save analysis result
    await db.save_behavior_analysis(
        user_id=request_body.user_id,
        date=request_body.date or datetime.now().date().isoformat(),
        patterns=analysis["patterns"],
        anomalies=analysis["anomalies"],
        gemini_analysis=analysis["gemini_response"]
    )
    
    return analysis


@router.get("/ai/recommendations/{user_id}")
async def get_ai_recommendations(user_id: str, request: Request):
    """Get AI-powered recommendations for the user."""
    db = get_db(request)
    ai_service = get_ai_service(request)
    
    if not ai_service:
        raise HTTPException(status_code=503, detail="AI service not available")
    
    # Get recent behavior analysis
    analysis = await db.get_latest_behavior_analysis(user_id)
    
    if not analysis:
        return {"recommendations": []}
    
    recommendations = await ai_service.generate_recommendations(analysis)
    return {"recommendations": recommendations}


# ==================== Migration Endpoint ====================

@router.post("/migrate/rooms-thai-to-english")
async def migrate_rooms_thai_to_english(request: Request):
    """Migrate Thai room names to English."""
    db = get_db(request)
    
    room_name_map = {
        "ห้องนอน": "Bedroom",
        "ห้องน้ำ": "Bathroom",
        "ห้องครัว": "Kitchen",
        "ห้องนั่งเล่น": "Living Room",
        "ทางเดิน": "Corridor"
    }
    
    rooms_updated = 0
    async for room in db.db.rooms.find({}):
        updates = {}
        updated = False
        
        if room.get('name') and room['name'] in room_name_map:
            updates['name'] = room_name_map[room['name']]
            updated = True
        
        if room.get('nameEn') and room['nameEn'] in room_name_map:
            updates['nameEn'] = room_name_map[room['nameEn']]
            updated = True
        elif not room.get('nameEn') and room.get('name'):
            if room['name'] in room_name_map:
                updates['nameEn'] = room_name_map[room['name']]
                updated = True
            elif room['name'] not in room_name_map.values():
                updates['nameEn'] = room['name']
                updated = True
        
        if room.get('nameEn') and room['nameEn'] not in room_name_map:
            if room.get('name') != room.get('nameEn'):
                updates['name'] = room['nameEn']
                updated = True
        
        if updated:
            await db.db.rooms.update_one(
                {'_id': room['_id']},
                {'$set': {**updates, 'updatedAt': datetime.now()}}
            )
            rooms_updated += 1
    
    return {
        "status": "success",
        "rooms_updated": rooms_updated,
        "message": f"Migration complete! Updated {rooms_updated} room(s)."
    }
