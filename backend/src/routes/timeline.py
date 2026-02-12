"""
WheelSense v2.0 - Timeline Routes
Event history and tracking
"""

from fastapi import APIRouter, HTTPException
from typing import Optional

from ..core.database import db

router = APIRouter()


@router.get("")
async def get_timeline(
    patient_id: Optional[str] = None,
    wheelchair_id: Optional[str] = None,
    event_type: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
):
    """Get timeline events with optional filters"""
    query = """
        SELECT te.*, 
               p.name as patient_name,
               w.name as wheelchair_name,
               r1.name as from_room_name,
               r2.name as to_room_name
        FROM timeline_events te
        LEFT JOIN patients p ON te.patient_id = p.id
        LEFT JOIN wheelchairs w ON te.wheelchair_id = w.id
        LEFT JOIN rooms r1 ON te.from_room_id = r1.id
        LEFT JOIN rooms r2 ON te.to_room_id = r2.id
        WHERE 1=1
    """
    params = []
    param_idx = 1
    
    if patient_id:
        query += f" AND te.patient_id = ${param_idx}"
        params.append(patient_id)
        param_idx += 1
    
    if wheelchair_id:
        query += f" AND te.wheelchair_id = ${param_idx}"
        params.append(wheelchair_id)
        param_idx += 1
    
    if event_type:
        query += f" AND te.event_type = ${param_idx}"
        params.append(event_type)
        param_idx += 1
    
    query += f" ORDER BY te.timestamp DESC LIMIT ${param_idx} OFFSET ${param_idx + 1}"
    params.extend([limit, offset])
    
    events = await db.fetch_all(query, tuple(params))
    
    # Get total count
    count_query = "SELECT COUNT(*) as count FROM timeline_events WHERE 1=1"
    count_params = []
    count_idx = 1
    if patient_id:
        count_query += f" AND patient_id = ${count_idx}"
        count_params.append(patient_id)
        count_idx += 1
    if wheelchair_id:
        count_query += f" AND wheelchair_id = ${count_idx}"
        count_params.append(wheelchair_id)
        count_idx += 1
    if event_type:
        count_query += f" AND event_type = ${count_idx}"
        count_params.append(event_type)
        count_idx += 1
    
    total = await db.fetch_one(count_query, tuple(count_params))
    
    return {
        "timeline": events,
        "total": total["count"] if total else 0,
        "limit": limit,
        "offset": offset
    }


@router.get("/today")
async def get_today_timeline(limit: int = 50):
    """Get today's timeline events"""
    events = await db.fetch_all("""
        SELECT te.*, 
               p.name as patient_name,
               w.name as wheelchair_name,
               r1.name as from_room_name,
               r2.name as to_room_name
        FROM timeline_events te
        LEFT JOIN patients p ON te.patient_id = p.id
        LEFT JOIN wheelchairs w ON te.wheelchair_id = w.id
        LEFT JOIN rooms r1 ON te.from_room_id = r1.id
        LEFT JOIN rooms r2 ON te.to_room_id = r2.id
        WHERE te.timestamp::date = CURRENT_DATE
        ORDER BY te.timestamp DESC
        LIMIT $1
    """, (limit,))
    return {"timeline": events}


@router.get("/patient/{patient_id}")
async def get_patient_timeline(patient_id: str, limit: int = 50):
    """Get timeline events for a specific patient"""
    events = await db.fetch_all("""
        SELECT te.*, 
               p.name as patient_name,
               w.name as wheelchair_name,
               r1.name as from_room_name,
               r2.name as to_room_name
        FROM timeline_events te
        LEFT JOIN patients p ON te.patient_id = p.id
        LEFT JOIN wheelchairs w ON te.wheelchair_id = w.id
        LEFT JOIN rooms r1 ON te.from_room_id = r1.id
        LEFT JOIN rooms r2 ON te.to_room_id = r2.id
        WHERE te.patient_id = $1
        ORDER BY te.timestamp DESC
        LIMIT $2
    """, (patient_id, limit))
    return {"timeline": events}


@router.get("/stats")
async def get_timeline_stats():
    """Get timeline statistics"""
    # Events by type
    by_type = await db.fetch_all("""
        SELECT event_type, COUNT(*) as count
        FROM timeline_events
        WHERE timestamp::date = CURRENT_DATE
        GROUP BY event_type
    """)
    
    # Room visits today
    room_visits = await db.fetch_all("""
        SELECT r.name as room_name, COUNT(*) as visits
        FROM timeline_events te
        JOIN rooms r ON te.to_room_id = r.id
        WHERE te.event_type = 'location_change'
        AND te.timestamp::date = CURRENT_DATE
        GROUP BY r.id, r.name
        ORDER BY visits DESC
    """)
    
    # Hourly activity
    hourly = await db.fetch_all("""
        SELECT to_char(timestamp, 'HH24') as hour, COUNT(*) as count
        FROM timeline_events
        WHERE timestamp::date = CURRENT_DATE
        GROUP BY hour
        ORDER BY hour
    """)
    
    return {
        "by_type": by_type,
        "room_visits": room_visits,
        "hourly_activity": hourly
    }


@router.delete("/{event_id}")
async def delete_timeline_event(event_id: int):
    """Delete a timeline event"""
    await db.execute("DELETE FROM timeline_events WHERE id = $1", (event_id,))
    return {"message": "Event deleted successfully"}
