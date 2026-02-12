"""
WheelSense v2.0 - Analytics Routes
Building, floor, patient, and room-usage analytics
"""

import logging
import json
from fastapi import APIRouter, Query
from typing import Optional

from ..core.database import db

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/building/{building_id}")
async def building_analytics(building_id: str):
    """Get analytics for a building: floor count, room count, active wheelchairs, node status."""
    try:
        building = await db.fetch_one(
            "SELECT id, name FROM buildings WHERE id = $1", (building_id,)
        )
        if not building:
            return {"error": "Building not found"}

        floors = await db.fetch_all(
            "SELECT id, name, level FROM floors WHERE building_id = $1 ORDER BY level",
            (building_id,)
        )

        room_count = await db.fetch_one(
            """SELECT COUNT(*) as count FROM rooms r
               JOIN floors f ON r.floor_id = f.id
               WHERE f.building_id = $1""",
            (building_id,)
        )

        active_wheelchairs = await db.fetch_one(
            """SELECT COUNT(*) as count FROM wheelchairs w
               JOIN rooms r ON w.current_room_id = r.id
               JOIN floors f ON r.floor_id = f.id
               WHERE f.building_id = $1 AND w.status != 'offline'""",
            (building_id,)
        )

        online_nodes = await db.fetch_one(
            """SELECT COUNT(*) as count FROM nodes n
               JOIN rooms r ON n.room_id = r.id
               JOIN floors f ON r.floor_id = f.id
               WHERE f.building_id = $1 AND n.status = 'online'""",
            (building_id,)
        )

        return {
            "building": building,
            "floors": floors,
            "room_count": room_count["count"] if room_count else 0,
            "active_wheelchairs": active_wheelchairs["count"] if active_wheelchairs else 0,
            "online_nodes": online_nodes["count"] if online_nodes else 0,
        }

    except Exception as e:
        logger.error(f"Error getting building analytics: {e}", exc_info=True)
        return {"error": str(e)}


@router.get("/floor/{floor_id}")
async def floor_analytics(floor_id: str):
    """Get floor-level analytics: rooms, wheelchair positions, node coverage."""
    try:
        floor = await db.fetch_one(
            """SELECT f.id, f.name, f.level, b.name as building_name
               FROM floors f JOIN buildings b ON f.building_id = b.id
               WHERE f.id = $1""",
            (floor_id,)
        )
        if not floor:
            return {"error": "Floor not found"}

        rooms = await db.fetch_all(
            """SELECT r.id, r.name, r.room_type, r.x, r.y, r.width, r.height,
                      r.color, r.node_id
               FROM rooms r WHERE r.floor_id = $1""",
            (floor_id,)
        )

        # Enrich rooms with wheelchair and appliance data
        enriched_rooms = []
        for room in rooms:
            r = dict(room)
            wheelchairs = await db.fetch_all(
                """SELECT id, name, status, rssi FROM wheelchairs
                   WHERE current_room_id = $1""",
                (room["id"],)
            )
            appliances = await db.fetch_all(
                """SELECT id, name, type, state FROM appliances
                   WHERE room_id = $1""",
                (room["id"],)
            )
            r["wheelchairs"] = wheelchairs
            r["appliances"] = appliances
            enriched_rooms.append(r)

        return {"floor": floor, "rooms": enriched_rooms}

    except Exception as e:
        logger.error(f"Error getting floor analytics: {e}", exc_info=True)
        return {"error": str(e)}


@router.get("/patient/{patient_id}")
async def patient_analytics(patient_id: str):
    """Get patient analytics: location history, activity timeline, health scores."""
    try:
        patient = await db.fetch_one(
            """SELECT p.id, p.name, p.age, p.condition, p.wheelchair_id,
                      w.name as wheelchair_name, w.status as wheelchair_status,
                      r.name as current_room
               FROM patients p
               LEFT JOIN wheelchairs w ON p.wheelchair_id = w.id
               LEFT JOIN rooms r ON w.current_room_id = r.id
               WHERE p.id = $1""",
            (patient_id,)
        )
        if not patient:
            return {"error": "Patient not found"}

        # Recent timeline events
        timeline = await db.fetch_all(
            """SELECT event_type, description, timestamp
               FROM timeline_events
               WHERE patient_id = $1 OR wheelchair_id = $2
               ORDER BY timestamp DESC LIMIT 20""",
            (patient_id, patient.get("wheelchair_id"))
        )

        # Latest health scores
        health_scores = await db.fetch_all(
            """SELECT score, analysis, recommendations, calculated_at
               FROM health_scores
               WHERE patient_id = $1
               ORDER BY calculated_at DESC LIMIT 5""",
            (patient_id,)
        )

        # Process recommendations JSONB
        for hs in health_scores:
            recs = hs.get("recommendations", [])
            if isinstance(recs, str):
                try: hs["recommendations"] = json.loads(recs)
                except: pass

        # Room visit counts (from wheelchair history)
        room_visits = []
        if patient.get("wheelchair_id"):
            room_visits = await db.fetch_all(
                """SELECT r.name as room_name, COUNT(*) as visit_count
                   FROM wheelchair_history wh
                   JOIN rooms r ON wh.room_id = r.id
                   WHERE wh.wheelchair_id = $1
                   GROUP BY r.name
                   ORDER BY visit_count DESC
                   LIMIT 10""",
                (patient["wheelchair_id"],)
            )

        # Active routines
        routines = await db.fetch_all(
            """SELECT title, time, days, enabled
               FROM routines WHERE patient_id = $1 AND enabled = 1
               ORDER BY time""",
            (patient_id,)
        )
        for r in routines:
            if isinstance(r.get("days"), str):
                try: r["days"] = json.loads(r["days"])
                except: pass

        return {
            "patient": patient,
            "timeline": timeline,
            "health_scores": health_scores,
            "room_visits": room_visits,
            "routines": routines,
        }

    except Exception as e:
        logger.error(f"Error getting patient analytics: {e}", exc_info=True)
        return {"error": str(e)}


@router.get("/room-usage")
async def room_usage(hours: int = Query(24, ge=1, le=168)):
    """Get room usage statistics over a time period."""
    try:
        usage = await db.fetch_all(
            """SELECT r.name as room_name, r.id as room_id,
                      COUNT(DISTINCT wh.wheelchair_id) as unique_wheelchairs,
                      COUNT(*) as total_visits
               FROM wheelchair_history wh
               JOIN rooms r ON wh.room_id = r.id
               WHERE wh.timestamp > NOW() - ($1 || ' hours')::interval
               GROUP BY r.name, r.id
               ORDER BY total_visits DESC""",
            (str(hours),)
        )
        return {"room_usage": usage, "period_hours": hours}

    except Exception as e:
        logger.error(f"Error getting room usage: {e}", exc_info=True)
        return {"room_usage": [], "error": str(e)}


@router.get("/summary")
async def analytics_summary():
    """Get high-level system analytics summary."""
    try:
        patients = await db.fetch_one("SELECT COUNT(*) as count FROM patients")
        wheelchairs = await db.fetch_one("SELECT COUNT(*) as count FROM wheelchairs")
        online_wc = await db.fetch_one("SELECT COUNT(*) as count FROM wheelchairs WHERE status != 'offline'")
        nodes = await db.fetch_one("SELECT COUNT(*) as count FROM nodes")
        online_nodes = await db.fetch_one("SELECT COUNT(*) as count FROM nodes WHERE status = 'online'")
        rooms = await db.fetch_one("SELECT COUNT(*) as count FROM rooms")
        active_alerts = await db.fetch_one("SELECT COUNT(*) as count FROM alerts WHERE resolved = FALSE")
        unread_notifs = await db.fetch_one("SELECT COUNT(*) as count FROM notifications WHERE is_read = FALSE")

        return {
            "patients": patients["count"] if patients else 0,
            "wheelchairs": {
                "total": wheelchairs["count"] if wheelchairs else 0,
                "online": online_wc["count"] if online_wc else 0,
            },
            "nodes": {
                "total": nodes["count"] if nodes else 0,
                "online": online_nodes["count"] if online_nodes else 0,
            },
            "rooms": rooms["count"] if rooms else 0,
            "active_alerts": active_alerts["count"] if active_alerts else 0,
            "unread_notifications": unread_notifs["count"] if unread_notifs else 0,
        }

    except Exception as e:
        logger.error(f"Error getting summary: {e}", exc_info=True)
        return {"error": str(e)}
