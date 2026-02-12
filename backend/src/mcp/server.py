"""
MCP Server - WheelSense v2.0
Wraps ToolRegistry and provides state management interface.
Enhanced with system state, safety detection, and alert capabilities.
"""

import logging
import json
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)


class MCPServer:
    """
    MCP Server that provides tools for the LLM to interact with the system.
    Wraps the ToolRegistry and provides state management.
    """

    def __init__(self, tool_registry):
        self.tool_registry = tool_registry

    def get_tool_definitions(self):
        """Get all tool definitions for LLM system prompt."""
        return self.tool_registry.get_tools()

    async def get_system_state(self, db, ha_client=None) -> Dict[str, Any]:
        """
        Get comprehensive system state for AI context.
        Combines DB state with live HA entity states.
        
        Returns dict with:
        - wheelchairs: list of wheelchair status
        - rooms: list of rooms with appliance states
        - patients: list of patient info
        - nodes: list of node status
        - ha_entities: list of live HA entity states (if connected)
        - routines: today's routine schedule
        """
        state = {
            "wheelchairs": [],
            "rooms": [],
            "patients": [],
            "nodes": [],
            "ha_entities": [],
            "routines": [],
        }

        try:
            # Wheelchairs
            wheelchairs = await db.fetch_all("""
                SELECT w.id, w.name, w.status, w.mac_address,
                       r.name as room_name, w.current_room_id,
                       w.distance_m, w.speed_ms, w.rssi, w.stale,
                       w.last_seen
                FROM wheelchairs w
                LEFT JOIN rooms r ON w.current_room_id = r.id
            """)
            state["wheelchairs"] = [dict(w) for w in wheelchairs]

            # Rooms with appliances
            rooms = await db.fetch_all("""
                SELECT rm.id, rm.name, rm.type,
                       f.name as floor_name, b.name as building_name
                FROM rooms rm
                LEFT JOIN floors f ON rm.floor_id = f.id
                LEFT JOIN buildings b ON f.building_id = b.id
                ORDER BY b.name, f.name, rm.name
            """)
            for room in rooms:
                room_dict = dict(room)
                appliances = await db.fetch_all(
                    """SELECT id, name, type, state, ha_entity_id
                       FROM appliances WHERE room_id = $1""",
                    (room["id"],)
                )
                room_dict["appliances"] = [dict(a) for a in appliances]
                state["rooms"].append(room_dict)

            # Patients
            patients = await db.fetch_all("""
                SELECT p.id, p.name, p.age, p.condition, p.wheelchair_id,
                       w.name as wheelchair_name, r.name as room_name
                FROM patients p
                LEFT JOIN wheelchairs w ON p.wheelchair_id = w.id
                LEFT JOIN rooms r ON w.current_room_id = r.id
            """)
            state["patients"] = [dict(p) for p in patients]

            # Nodes
            nodes = await db.fetch_all("""
                SELECT n.id, n.name, n.status, n.rssi, n.room_id,
                       r.name as room_name
                FROM nodes n
                LEFT JOIN rooms r ON n.room_id = r.id
            """)
            state["nodes"] = [dict(n) for n in nodes]

            # Routines (today's)
            from datetime import datetime, timezone, timedelta
            bangkok_tz = timezone(timedelta(hours=7))
            current_day = datetime.now(bangkok_tz).strftime("%a")

            routines = await db.fetch_all("""
                SELECT r.id, r.title, r.time, r.days, r.actions, r.enabled,
                       r.last_triggered, rm.name as room_name
                FROM routines r
                LEFT JOIN rooms rm ON r.room_id = rm.id
                WHERE r.enabled = 1
                ORDER BY r.time
            """)
            for r in routines:
                r_dict = dict(r)
                days = r_dict.get("days", [])
                if isinstance(days, str):
                    try:
                        days = json.loads(days)
                    except (json.JSONDecodeError, TypeError):
                        days = []
                if not days or current_day in days:
                    state["routines"].append(r_dict)

            # HA entity states (if connected)
            if ha_client and ha_client.connected:
                try:
                    ha_states = await ha_client.get_states()
                    # Filter to relevant entities
                    for entity in ha_states:
                        entity_id = entity.get("entity_id", "")
                        if any(entity_id.startswith(d) for d in ["light.", "switch.", "fan.", "climate.", "input_boolean."]):
                            state["ha_entities"].append({
                                "entity_id": entity_id,
                                "state": entity.get("state"),
                                "friendly_name": entity.get("attributes", {}).get("friendly_name", entity_id),
                                "last_changed": entity.get("last_changed"),
                            })
                except Exception as e:
                    logger.warning(f"Error fetching HA states: {e}")

        except Exception as e:
            logger.error(f"Error building system state: {e}")

        return state

    async def detect_potential_issues(self, db) -> list:
        """
        Detect situations where something might be "off" in the house.
        Returns list of {room, device, state} for devices ON in vacant rooms.
        """
        try:
            # Get current wheelchair location
            wheelchair = await db.fetch_one("""
                SELECT r.name as room_name
                FROM wheelchairs w
                LEFT JOIN rooms r ON w.current_room_id = r.id
                WHERE w.status != 'offline'
                LIMIT 1
            """)
            user_room = wheelchair.get("room_name") if wheelchair else None

            if not user_room:
                return []

            # Find devices ON in rooms other than user's current room
            issues = await db.fetch_all("""
                SELECT a.name as device, r.name as room, a.state
                FROM appliances a
                LEFT JOIN rooms r ON a.room_id = r.id
                WHERE a.state = 1 AND LOWER(r.name) != LOWER($1)
            """, (user_room,))

            return [
                {
                    "room": item["room"],
                    "device": item["device"],
                    "state": True,
                    "user_location": user_room
                }
                for item in issues
            ]

        except Exception as e:
            logger.error(f"Error detecting issues: {e}")
            return []

    async def detect_safety_concerns(self, db) -> List[Dict[str, Any]]:
        """
        Detect safety-related concerns:
        - Stale wheelchair data (possibly disconnected)
        - Offline nodes in occupied rooms
        - Long idle periods (possible fall/emergency)
        """
        concerns = []

        try:
            # Stale wheelchairs (hasn't updated in > 2 minutes)
            stale = await db.fetch_all("""
                SELECT w.id, w.name, w.last_seen, p.name as patient_name
                FROM wheelchairs w
                LEFT JOIN patients p ON p.wheelchair_id = w.id
                WHERE w.stale = 1 OR w.status = 'offline'
            """)
            for w in stale:
                concerns.append({
                    "type": "stale_wheelchair",
                    "severity": "warning",
                    "message": f"Wheelchair '{w['name']}' is stale/offline. Patient: {w.get('patient_name', 'Unknown')}",
                    "wheelchair_id": w["id"],
                })

            # All nodes offline
            online_nodes = await db.fetch_one(
                "SELECT COUNT(*) as count FROM nodes WHERE status = 'online'"
            )
            total_nodes = await db.fetch_one(
                "SELECT COUNT(*) as count FROM nodes"
            )
            if total_nodes and total_nodes["count"] > 0 and (not online_nodes or online_nodes["count"] == 0):
                concerns.append({
                    "type": "all_nodes_offline",
                    "severity": "critical",
                    "message": f"All {total_nodes['count']} nodes are offline. Positioning system is down.",
                })

        except Exception as e:
            logger.error(f"Error detecting safety concerns: {e}")

        return concerns
