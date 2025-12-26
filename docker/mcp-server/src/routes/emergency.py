"""
Emergency APIs - Emergency alert management
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from ..dependencies import get_db, get_emergency_service

router = APIRouter(tags=["Emergency"])


class EmergencyAlert(BaseModel):
    room: str
    event_type: str
    severity: str
    message: Optional[str] = None


@router.post("/emergency/alert")
async def create_emergency(alert: EmergencyAlert, request: Request):
    """Create an emergency alert."""
    emergency_service = get_emergency_service(request)
    if not emergency_service:
        raise HTTPException(status_code=503, detail="Emergency service not available")
    
    event = await emergency_service.create_alert(
        room=alert.room,
        event_type=alert.event_type,
        severity=alert.severity,
        message=alert.message
    )
    
    return {"event_id": str(event["_id"]), "status": "created"}


@router.get("/emergency/active")
async def get_active_emergencies(request: Request):
    """Get all active emergency events."""
    db = get_db(request)
    
    events = await db.get_active_emergencies()
    return {"emergencies": events}


@router.post("/emergency/{event_id}/resolve")
async def resolve_emergency(event_id: str, request: Request):
    """Resolve an emergency event."""
    emergency_service = get_emergency_service(request)
    if not emergency_service:
        raise HTTPException(status_code=503, detail="Emergency service not available")
    
    success = await emergency_service.resolve_alert(event_id)
    if not success:
        raise HTTPException(status_code=404, detail="Emergency not found")
    
    return {"status": "resolved"}
