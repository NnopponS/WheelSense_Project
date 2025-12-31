"""
Timeline APIs - Timeline and location history management
"""

from datetime import datetime
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional

from ..dependencies import get_db, get_mqtt_handler

router = APIRouter(tags=["Timeline"])


class TimelineQuery(BaseModel):
    user_id: Optional[str] = None
    room_id: Optional[str] = None
    event_type: Optional[str] = None
    date: Optional[str] = None
    limit: int = 100


class LocationEventRequest(BaseModel):
    user_id: str
    wheelchair_id: str
    from_room: Optional[str] = None
    to_room: str
    user_name: Optional[str] = None
    detection_confidence: float = 0.0
    bbox: Optional[List] = None


@router.get("/timeline")
async def get_timeline(
    request: Request,
    user_id: Optional[str] = None,
    room_id: Optional[str] = None,
    event_type: Optional[str] = None,
    limit: int = 100
):
    """Get timeline events with optional filters."""
    db = get_db(request)
    
    events = await db.get_timeline(
        user_id=user_id,
        room_id=room_id,
        event_type=event_type,
        limit=limit
    )
    return {"timeline": events, "count": len(events)}


@router.get("/timeline/history")
async def get_timeline_history(date: str, request: Request, user_id: Optional[str] = None):
    """Get timeline events for a specific date (historical analysis)."""
    db = get_db(request)
    
    events = await db.get_timeline_by_date(date, user_id)
    return {
        "date": date,
        "timeline": events,
        "count": len(events)
    }


@router.get("/timeline/summary/{user_id}")
async def get_timeline_summary(user_id: str, request: Request, date: Optional[str] = None):
    """Get summary of user's timeline for analysis."""
    db = get_db(request)
    
    summary = await db.get_timeline_summary(user_id, date)
    return summary


@router.post("/timeline/location")
async def save_location_event(event: LocationEventRequest, request: Request):
    """Save a location change event to timeline."""
    db = get_db(request)
    mqtt_handler = getattr(request.app.state, 'mqtt_handler', None)
    
    saved_event = await db.save_location_event(
        user_id=event.user_id,
        wheelchair_id=event.wheelchair_id,
        from_room=event.from_room,
        to_room=event.to_room,
        user_name=event.user_name,
        detection_confidence=event.detection_confidence,
        bbox=event.bbox
    )
    
    # Broadcast to WebSocket clients
    if mqtt_handler:
        await mqtt_handler._broadcast_ws({
            "type": "timeline_event",
            "event": saved_event
        })
    
    return {"status": "saved", "event": saved_event}


# Location APIs
@router.get("/location/current")
async def get_current_location(request: Request):
    """Get current user location based on camera detection."""
    mqtt_handler = get_mqtt_handler(request)
    location = mqtt_handler.get_user_location()
    return location


@router.get("/location/history")
async def get_location_history(request: Request, limit: int = 100):
    """Get user location history."""
    db = get_db(request)
    
    history = await db.get_activity_logs(
        event_types=["enter", "exit"],
        limit=limit
    )
    return {"history": history}


# Activity Logs
@router.get("/activities")
async def get_activities(
    request: Request,
    room_id: Optional[str] = None,
    event_type: Optional[str] = None,
    limit: int = 50
):
    """Get activity logs."""
    db = get_db(request)
    
    activities = await db.get_activity_logs(
        room_id=room_id,
        event_types=[event_type] if event_type else None,
        limit=limit
    )
    return {"activities": activities}
