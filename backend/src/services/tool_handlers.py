"""
Tool Handlers for MCP tool execution - WheelSense v2.0
Handlers for chat_message, device_control, add_routine, get_routines,
delete_routine, get_system_state, ha_get_states, and send_alert tools.
"""

import logging
import json
import uuid
from typing import Dict, Any

logger = logging.getLogger(__name__)


# ─── Chat Message ───────────────────────────────────────────────────

async def handle_chat_message(arguments: Dict[str, Any], **context) -> Dict[str, Any]:
    """Handle chat_message tool call — passes through AI's text response."""
    message = arguments.get("message")
    if not message or not isinstance(message, str):
        return {
            "success": False, "tool": "chat_message",
            "message": "", "error": "Invalid message argument"
        }
    return {"success": True, "tool": "chat_message", "message": message, "error": None}


# ─── Device Control ─────────────────────────────────────────────────

async def handle_device_control(arguments: Dict[str, Any], **context) -> Dict[str, Any]:
    """
    Control an appliance via Home Assistant.
    Arguments: appliance_name, room_name, action (ON/OFF)
    """
    db = context.get("db")
    ha_client = context.get("ha_client")

    appliance_name = arguments.get("appliance_name", "").strip()
    room_name = arguments.get("room_name", "").strip()
    action = arguments.get("action", "").strip().upper()

    if not appliance_name or not room_name or not action:
        missing = []
        if not appliance_name: missing.append("appliance_name")
        if not room_name: missing.append("room_name")
        if not action: missing.append("action")
        return {
            "success": False, "tool": "device_control",
            "message": "", "error": f"Missing required arguments: {', '.join(missing)}"
        }

    if action not in ("ON", "OFF"):
        return {
            "success": False, "tool": "device_control",
            "message": "", "error": f"Invalid action: '{action}'. Must be 'ON' or 'OFF'."
        }

    try:
        # Find appliance by name and room
        appliance = await db.fetch_one("""
            SELECT a.*, r.name as room_name
            FROM appliances a
            LEFT JOIN rooms r ON a.room_id = r.id
            WHERE LOWER(a.name) LIKE $1 AND LOWER(r.name) LIKE $2
        """, (f"%{appliance_name.lower()}%", f"%{room_name.lower()}%"))

        if not appliance:
            # Broader search by name only
            appliance = await db.fetch_one("""
                SELECT a.*, r.name as room_name
                FROM appliances a
                LEFT JOIN rooms r ON a.room_id = r.id
                WHERE LOWER(a.name) LIKE $1
            """, (f"%{appliance_name.lower()}%",))

        if not appliance:
            return {
                "success": False, "tool": "device_control",
                "message": "", "error": f"Appliance '{appliance_name}' not found in '{room_name}'"
            }

        new_state = action == "ON"
        ha_entity_id = appliance.get("ha_entity_id")
        ha_controlled = False

        # Control via Home Assistant
        if ha_entity_id and ha_client and ha_client.connected:
            if new_state:
                success = await ha_client.turn_on(ha_entity_id)
            else:
                success = await ha_client.turn_off(ha_entity_id)
            ha_controlled = success
            if not success:
                logger.warning(f"HA control failed for {ha_entity_id}")

        # Update local DB state
        await db.execute(
            "UPDATE appliances SET state = $1, updated_at = NOW() WHERE id = $2",
            (1 if new_state else 0, appliance["id"])
        )

        # Log timeline event
        await db.execute(
            """INSERT INTO timeline_events (event_type, to_room_id, description)
               VALUES ('appliance_control', $1, $2)""",
            (appliance.get("room_id"),
             f"AI: {appliance['name']} {'turned on' if new_state else 'turned off'} in {appliance.get('room_name', 'unknown')}")
        )

        state_text = "ON" if new_state else "OFF"
        return {
            "success": True, "tool": "device_control",
            "appliance_name": appliance["name"],
            "room_name": appliance.get("room_name", room_name),
            "action": action, "new_state": new_state,
            "ha_controlled": ha_controlled,
            "message": f"Set {appliance.get('room_name', room_name)} {appliance['name']} to {state_text}",
            "error": None
        }

    except Exception as e:
        logger.error(f"Error controlling device: {e}", exc_info=True)
        return {
            "success": False, "tool": "device_control",
            "message": "", "error": f"Error controlling device: {str(e)}"
        }


# ─── Routine Management ─────────────────────────────────────────────

async def handle_add_routine(arguments: Dict[str, Any], **context) -> Dict[str, Any]:
    """
    Create a new routine.
    Arguments: title, time, room_name (optional), actions (optional), days (optional)
    """
    db = context.get("db")

    title = arguments.get("title", "").strip()
    time_str = arguments.get("time", "").strip()
    room_name = arguments.get("room_name", "").strip()
    actions = arguments.get("actions", [])
    days = arguments.get("days", ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])

    if not title or not time_str:
        missing = []
        if not title: missing.append("title")
        if not time_str: missing.append("time")
        return {
            "success": False, "tool": "add_routine",
            "message": "", "error": f"Missing required arguments: {', '.join(missing)}"
        }

    # Validate time
    try:
        parts = time_str.split(":")
        if len(parts) != 2 or not (0 <= int(parts[0]) <= 23) or not (0 <= int(parts[1]) <= 59):
            raise ValueError()
    except (ValueError, IndexError):
        return {
            "success": False, "tool": "add_routine",
            "message": "", "error": f"Invalid time format: '{time_str}'. Use HH:MM (e.g., '12:00')"
        }

    try:
        room_id = None
        if room_name:
            room = await db.fetch_one(
                "SELECT id, name FROM rooms WHERE LOWER(name) LIKE $1",
                (f"%{room_name.lower()}%",)
            )
            if room:
                room_id = room["id"]

        patient = await db.fetch_one("SELECT id FROM patients LIMIT 1")
        patient_id = patient["id"] if patient else None

        routine_id = f"RT-{uuid.uuid4().hex[:8].upper()}"
        actions_json = json.dumps(actions) if actions else "[]"
        days_json = json.dumps(days) if days else "[]"

        await db.execute(
            """INSERT INTO routines (id, patient_id, title, time, room_id, days, actions, enabled)
               VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, 1)""",
            (routine_id, patient_id, title, time_str, room_id, days_json, actions_json)
        )

        action_desc = ""
        if actions:
            action_desc = " with actions: " + ", ".join(
                f"{a.get('device')} {a.get('state')}" for a in actions
            )

        room_desc = f" in {room_name}" if room_name else ""
        return {
            "success": True, "tool": "add_routine",
            "routine_id": routine_id,
            "message": f"Created routine '{title}' at {time_str}{room_desc}{action_desc}",
            "error": None
        }

    except Exception as e:
        logger.error(f"Error adding routine: {e}", exc_info=True)
        return {
            "success": False, "tool": "add_routine",
            "message": "", "error": f"Error adding routine: {str(e)}"
        }


async def handle_get_routines(arguments: Dict[str, Any], **context) -> Dict[str, Any]:
    """Get list of routines from the database."""
    db = context.get("db")

    try:
        rows = await db.fetch_all(
            """SELECT r.title, r.time, r.enabled, r.days, r.actions,
                      rm.name as room_name
               FROM routines r
               LEFT JOIN rooms rm ON r.room_id = rm.id
               ORDER BY r.time"""
        )

        routines_list = []
        for row in rows:
            actions = row.get("actions", [])
            if isinstance(actions, str):
                try: actions = json.loads(actions)
                except: actions = []

            days = row.get("days", [])
            if isinstance(days, str):
                try: days = json.loads(days)
                except: days = []

            action_text = ", ".join(
                f"{a.get('device')} {a.get('state')}" for a in actions
            ) if actions else "No device actions"

            routines_list.append(
                f"  {row['time']} - {row['title']}"
                f"{' (' + row['room_name'] + ')' if row.get('room_name') else ''}"
                f": {action_text}"
                f" [{'Enabled' if row.get('enabled') else 'Disabled'}]"
                f" [{', '.join(days) if isinstance(days, list) else days}]"
            )

        schedule_text = "\n".join(routines_list) if routines_list else "No routines configured"
        return {
            "success": True, "tool": "get_routines",
            "message": f"Current schedule ({len(routines_list)} routines):\n{schedule_text}",
            "error": None
        }

    except Exception as e:
        logger.error(f"Error getting routines: {e}", exc_info=True)
        return {
            "success": False, "tool": "get_routines",
            "message": "", "error": f"Error getting routines: {str(e)}"
        }


async def handle_delete_routine(arguments: Dict[str, Any], **context) -> Dict[str, Any]:
    """
    Delete a routine by title (and optionally time).
    Arguments: title (required), time (optional)
    """
    db = context.get("db")
    title = arguments.get("title", "").strip()
    time_str = arguments.get("time", "").strip()

    if not title:
        return {
            "success": False, "tool": "delete_routine",
            "message": "", "error": "Missing required argument: title"
        }

    try:
        # Find routine by title (and optionally time)
        if time_str:
            routine = await db.fetch_one(
                "SELECT id, title, time FROM routines WHERE LOWER(title) LIKE $1 AND time = $2",
                (f"%{title.lower()}%", time_str)
            )
        else:
            routine = await db.fetch_one(
                "SELECT id, title, time FROM routines WHERE LOWER(title) LIKE $1",
                (f"%{title.lower()}%",)
            )

        if not routine:
            return {
                "success": False, "tool": "delete_routine",
                "message": "", "error": f"Routine '{title}' not found"
            }

        await db.execute("DELETE FROM routines WHERE id = $1", (routine["id"],))

        return {
            "success": True, "tool": "delete_routine",
            "message": f"Deleted routine '{routine['title']}' (at {routine['time']})",
            "error": None
        }

    except Exception as e:
        logger.error(f"Error deleting routine: {e}", exc_info=True)
        return {
            "success": False, "tool": "delete_routine",
            "message": "", "error": f"Error deleting routine: {str(e)}"
        }


# ─── System State ────────────────────────────────────────────────────

async def handle_get_system_state(arguments: Dict[str, Any], **context) -> Dict[str, Any]:
    """
    Get comprehensive system state via MCP server.
    Returns formatted state summary for the LLM.
    """
    db = context.get("db")
    ha_client = context.get("ha_client")
    mcp_server = context.get("mcp_server")

    if not mcp_server:
        return {
            "success": False, "tool": "get_system_state",
            "message": "", "error": "MCP server not initialized"
        }

    try:
        state = await mcp_server.get_system_state(db, ha_client)

        # Format state as readable text for the LLM
        lines = ["=== SYSTEM STATE ==="]

        # Wheelchairs
        wc_count = len(state.get("wheelchairs", []))
        lines.append(f"\nWheelchairs ({wc_count}):")
        for wc in state.get("wheelchairs", []):
            room = wc.get("room_name", "Unknown")
            status = wc.get("status", "unknown")
            lines.append(f"  {wc['name']}: {status} in {room}")

        # Patients
        patients = state.get("patients", [])
        lines.append(f"\nPatients ({len(patients)}):")
        for p in patients:
            lines.append(f"  {p['name']} (age: {p.get('age', 'N/A')}, condition: {p.get('condition', 'N/A')})")

        # Rooms & appliances
        rooms = state.get("rooms", [])
        lines.append(f"\nRooms ({len(rooms)}):")
        for room in rooms:
            appliance_states = ", ".join(
                f"{a['name']}: {'ON' if a.get('state') else 'OFF'}"
                for a in room.get("appliances", [])
            ) or "no appliances"
            lines.append(f"  {room['name']}: {appliance_states}")

        # Nodes
        nodes = state.get("nodes", [])
        online = sum(1 for n in nodes if n.get("status") == "online")
        lines.append(f"\nNodes: {online}/{len(nodes)} online")

        # HA entities
        ha = state.get("ha_entities", [])
        if ha:
            lines.append(f"\nHome Assistant ({len(ha)} entities):")
            for entity in ha:
                lines.append(f"  {entity['friendly_name']}: {entity['state']}")

        # Routines
        routines = state.get("routines", [])
        lines.append(f"\nToday's Routines ({len(routines)}):")
        for r in routines:
            lines.append(f"  {r.get('time', '??:??')} - {r.get('title', 'Untitled')}")

        return {
            "success": True, "tool": "get_system_state",
            "message": "\n".join(lines),
            "error": None
        }

    except Exception as e:
        logger.error(f"Error getting system state: {e}", exc_info=True)
        return {
            "success": False, "tool": "get_system_state",
            "message": "", "error": f"Error getting system state: {str(e)}"
        }


# ─── Home Assistant State ────────────────────────────────────────────

async def handle_ha_get_states(arguments: Dict[str, Any], **context) -> Dict[str, Any]:
    """
    Get live Home Assistant entity states.
    Arguments: entity_id (optional — if omitted, returns all relevant entities)
    """
    ha_client = context.get("ha_client")

    if not ha_client or not ha_client.connected:
        return {
            "success": False, "tool": "ha_get_states",
            "message": "", "error": "Home Assistant is not connected"
        }

    entity_id = arguments.get("entity_id", "").strip()

    try:
        if entity_id:
            state = await ha_client.get_state(entity_id)
            if state:
                return {
                    "success": True, "tool": "ha_get_states",
                    "message": f"{state.get('attributes', {}).get('friendly_name', entity_id)}: {state.get('state')}",
                    "entity_id": entity_id,
                    "state": state.get("state"),
                    "attributes": state.get("attributes", {}),
                    "error": None
                }
            return {
                "success": False, "tool": "ha_get_states",
                "message": "", "error": f"Entity '{entity_id}' not found"
            }
        else:
            all_states = await ha_client.get_states()
            relevant = [
                s for s in all_states
                if any(s.get("entity_id", "").startswith(d) for d in
                       ["light.", "switch.", "fan.", "climate.", "input_boolean."])
            ]
            lines = [f"Home Assistant Entities ({len(relevant)}):"]
            for s in relevant:
                name = s.get("attributes", {}).get("friendly_name", s.get("entity_id"))
                lines.append(f"  {s['entity_id']}: {s['state']} ({name})")

            return {
                "success": True, "tool": "ha_get_states",
                "message": "\n".join(lines),
                "entity_count": len(relevant),
                "error": None
            }

    except Exception as e:
        logger.error(f"Error getting HA states: {e}", exc_info=True)
        return {
            "success": False, "tool": "ha_get_states",
            "message": "", "error": f"Error getting HA states: {str(e)}"
        }


# ─── Alerts ──────────────────────────────────────────────────────────

async def handle_send_alert(arguments: Dict[str, Any], **context) -> Dict[str, Any]:
    """
    Create an alert/notification in the system.
    Arguments: alert_type (emergency/warning/info), message, patient_id (optional)
    """
    db = context.get("db")

    alert_type = arguments.get("alert_type", "info").strip().lower()
    message = arguments.get("message", "").strip()
    patient_id = arguments.get("patient_id", "").strip() or None

    if not message:
        return {
            "success": False, "tool": "send_alert",
            "message": "", "error": "Missing required argument: message"
        }

    if alert_type not in ("emergency", "warning", "info"):
        alert_type = "info"

    try:
        # Insert alert (SERIAL id, no TEXT id needed)
        await db.execute(
            """INSERT INTO alerts (alert_type, severity, message, patient_id, resolved)
               VALUES ($1, $2, $3, $4, FALSE)""",
            (alert_type, alert_type, message, patient_id)
        )

        # Also create a notification (SERIAL id)
        notif_title = f"{'🚨 EMERGENCY' if alert_type == 'emergency' else '⚠️ Warning' if alert_type == 'warning' else 'ℹ️ Info'}: Alert"
        await db.execute(
            """INSERT INTO notifications (patient_id, type, title, message)
               VALUES ($1, $2, $3, $4)""",
            (patient_id, alert_type, notif_title, message)
        )

        # Log timeline event
        await db.execute(
            """INSERT INTO timeline_events (event_type, description)
               VALUES ('alert', $1)""",
            (f"[{alert_type.upper()}] {message}",)
        )

        severity_emoji = {"emergency": "🚨", "warning": "⚠️", "info": "ℹ️"}.get(alert_type, "ℹ️")
        return {
            "success": True, "tool": "send_alert",
            "message": f"{severity_emoji} Alert created: {message}",
            "error": None
        }

    except Exception as e:
        logger.error(f"Error sending alert: {e}", exc_info=True)
        return {
            "success": False, "tool": "send_alert",
            "message": "", "error": f"Error sending alert: {str(e)}"
        }
