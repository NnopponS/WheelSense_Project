"""
Context Builder - WheelSense v2.0
Assembles system state context for the LLM from the database and Home Assistant.
Supports role-based data scoping (admin vs user).
"""

import logging
import json
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)


class ContextBuilder:
    """Builds context for LLM from database state and HA entities."""

    async def build_context(self, db, ha_client=None, patient_id: Optional[str] = None, role: str = "user") -> str:
        """
        Assemble system state context from database and Home Assistant.
        
        Args:
            db: Database instance
            ha_client: Home Assistant client (optional)
            patient_id: If provided, scope data to this patient (user mode)
            role: "admin" (sees everything) or "user" (sees own data only)
        
        Returns formatted string for LLM system prompt.
        """
        try:
            sections = []

            sections.append(await self._get_user_info(db, patient_id))
            sections.append(await self._get_location_info(db, patient_id))
            sections.append(await self._get_device_summary(db))
            sections.append(await self._get_routine_info(db, patient_id))

            if ha_client and ha_client.connected:
                sections.append(await self._get_ha_summary(ha_client))

            if role == "admin":
                sections.append(await self._get_admin_overview(db))

            sections.append(await self._get_safety_summary(db))

            context = "CURRENT SYSTEM STATE:\n\n" + "\n\n".join(s for s in sections if s)
            return context

        except Exception as e:
            logger.error(f"Error building context: {e}")
            return "CURRENT SYSTEM STATE:\nInformation temporarily unavailable"

    async def _get_user_info(self, db, patient_id: Optional[str] = None) -> str:
        """Get patient/user information."""
        try:
            if patient_id:
                patient = await db.fetch_one(
                    "SELECT name, age, condition FROM patients WHERE id = $1", (patient_id,)
                )
                if patient:
                    return (
                        f"User: {patient.get('name', 'Unknown')}\n"
                        f"Age: {patient.get('age', 'N/A')}\n"
                        f"Condition: {patient.get('condition', 'N/A')}"
                    )
            else:
                patients = await db.fetch_all(
                    "SELECT name, age, condition FROM patients LIMIT 1"
                )
                if patients:
                    p = patients[0]
                    return (
                        f"User: {p.get('name', 'Unknown')}\n"
                        f"Age: {p.get('age', 'N/A')}\n"
                        f"Condition: {p.get('condition', 'N/A')}"
                    )
            return "User: Not configured"
        except Exception as e:
            logger.error(f"Error getting user info: {e}")
            return "User: Error loading"

    async def _get_location_info(self, db, patient_id: Optional[str] = None) -> str:
        """Get wheelchair location information."""
        try:
            if patient_id:
                wheelchair = await db.fetch_one("""
                    SELECT w.name, w.status, r.name as room_name,
                           w.distance_m, w.speed_ms, w.rssi
                    FROM wheelchairs w
                    LEFT JOIN rooms r ON w.current_room_id = r.id
                    LEFT JOIN patients p ON p.wheelchair_id = w.id
                    WHERE p.id = $1
                """, (patient_id,))
                if wheelchair:
                    room = wheelchair.get("room_name", "Unknown")
                    return (
                        f"Current Location: {room}\n"
                        f"Wheelchair: {wheelchair['name']} ({wheelchair.get('status', 'unknown')})\n"
                        f"Signal: RSSI {wheelchair.get('rssi', 'N/A')}"
                    )
            else:
                wheelchairs = await db.fetch_all("""
                    SELECT w.name, w.status, r.name as room_name
                    FROM wheelchairs w
                    LEFT JOIN rooms r ON w.current_room_id = r.id
                """)
                if wheelchairs:
                    lines = ["Wheelchair Status:"]
                    for wc in wheelchairs:
                        room = wc.get("room_name", "Unknown")
                        status = wc.get("status", "unknown")
                        lines.append(f"  {wc['name']}: {status} in {room}")
                    return "\n".join(lines)
            return "Wheelchair: Not detected"
        except Exception as e:
            logger.error(f"Error getting location info: {e}")
            return "Wheelchair: Error loading"

    async def _get_device_summary(self, db) -> str:
        """Get appliance states grouped by room."""
        try:
            appliances = await db.fetch_all("""
                SELECT a.name, a.type, a.state, r.name as room_name
                FROM appliances a
                LEFT JOIN rooms r ON a.room_id = r.id
                ORDER BY r.name, a.name
            """)

            if not appliances:
                return "Device States:\n  No appliances configured"

            rooms: Dict[str, list] = {}
            for app in appliances:
                room = app.get("room_name", "Unknown")
                if room not in rooms:
                    rooms[room] = []
                rooms[room].append(app)

            lines = ["Device States:"]
            for room, devices in rooms.items():
                lines.append(f"  {room}:")
                for dev in devices:
                    status = "ON" if dev.get("state") else "OFF"
                    lines.append(f"    - {dev['name']}: {status}")

            return "\n".join(lines)

        except Exception as e:
            logger.error(f"Error getting device summary: {e}")
            return "Device States:\n  Error loading"

    async def _get_routine_info(self, db, patient_id: Optional[str] = None) -> str:
        """Get today's routine schedule."""
        try:
            from datetime import datetime, timezone, timedelta

            bangkok_tz = timezone(timedelta(hours=7))
            current_day = datetime.now(bangkok_tz).strftime("%a")
            current_time = datetime.now(bangkok_tz).strftime("%H:%M")

            if patient_id:
                routines = await db.fetch_all(
                    """SELECT r.title, r.time, r.days, r.actions, r.enabled,
                              rm.name as room_name
                       FROM routines r
                       LEFT JOIN rooms rm ON r.room_id = rm.id
                       WHERE r.enabled = 1 AND r.patient_id = $1
                       ORDER BY r.time""",
                    (patient_id,)
                )
            else:
                routines = await db.fetch_all(
                    """SELECT r.title, r.time, r.days, r.actions, r.enabled,
                              rm.name as room_name
                       FROM routines r
                       LEFT JOIN rooms rm ON r.room_id = rm.id
                       WHERE r.enabled = 1
                       ORDER BY r.time"""
                )

            if not routines:
                return "Daily Schedule: No routines configured"

            lines = [f"Daily Schedule (today's routines, current time: {current_time}):"]
            next_routine = None

            for r in routines:
                days = r.get("days", [])
                if isinstance(days, str):
                    try: days = json.loads(days)
                    except: days = []

                if days and current_day not in days:
                    continue

                actions = r.get("actions", [])
                if isinstance(actions, str):
                    try: actions = json.loads(actions)
                    except: actions = []

                action_text = ""
                if actions:
                    action_text = " → " + ", ".join(
                        f"{a.get('device')} {a.get('state')}" for a in actions
                    )

                room_text = f" ({r['room_name']})" if r.get("room_name") else ""
                time_marker = ""
                if r["time"] > current_time and not next_routine:
                    time_marker = " ← NEXT"
                    next_routine = r
                lines.append(f"  {r['time']} - {r['title']}{room_text}{action_text}{time_marker}")

            return "\n".join(lines)

        except Exception as e:
            logger.error(f"Error getting routine info: {e}")
            return "Daily Schedule: Error loading"

    async def _get_ha_summary(self, ha_client) -> str:
        """Get Home Assistant entity states summary."""
        try:
            states = await ha_client.get_states()
            relevant = [
                s for s in states
                if any(s.get("entity_id", "").startswith(d) for d in
                       ["light.", "switch.", "fan.", "climate.", "input_boolean."])
            ]

            if not relevant:
                return "Home Assistant: No controllable devices found"

            lines = [f"Home Assistant Entities ({len(relevant)}):"]
            for s in relevant:
                name = s.get("attributes", {}).get("friendly_name", s.get("entity_id"))
                lines.append(f"  {name}: {s['state']}")

            return "\n".join(lines)

        except Exception as e:
            logger.error(f"Error getting HA summary: {e}")
            return "Home Assistant: Error loading"

    async def _get_admin_overview(self, db) -> str:
        """Get admin-level overview (all patients, system stats)."""
        try:
            patient_count = await db.fetch_one("SELECT COUNT(*) as count FROM patients")
            wheelchair_count = await db.fetch_one("SELECT COUNT(*) as count FROM wheelchairs")
            online_nodes = await db.fetch_one("SELECT COUNT(*) as count FROM nodes WHERE status = 'online'")
            total_nodes = await db.fetch_one("SELECT COUNT(*) as count FROM nodes")
            unread_notifs = await db.fetch_one("SELECT COUNT(*) as count FROM notifications WHERE is_read = false")

            lines = ["Admin Overview:"]
            lines.append(f"  Patients: {patient_count['count'] if patient_count else 0}")
            lines.append(f"  Wheelchairs: {wheelchair_count['count'] if wheelchair_count else 0}")
            lines.append(f"  Nodes: {online_nodes['count'] if online_nodes else 0}/{total_nodes['count'] if total_nodes else 0} online")
            lines.append(f"  Unread notifications: {unread_notifs['count'] if unread_notifs else 0}")

            return "\n".join(lines)

        except Exception as e:
            logger.error(f"Error getting admin overview: {e}")
            return "Admin Overview: Error loading"

    async def _get_safety_summary(self, db) -> str:
        """Get safety-related information."""
        try:
            # Stale wheelchairs
            stale = await db.fetch_all(
                """SELECT w.name, p.name as patient_name
                   FROM wheelchairs w
                   LEFT JOIN patients p ON p.wheelchair_id = w.id
                   WHERE w.stale = 1 OR w.status = 'offline'"""
            )

            # Active alerts
            active_alerts = await db.fetch_all(
                "SELECT alert_type, message FROM alerts WHERE resolved = FALSE ORDER BY created_at DESC LIMIT 5"
            )

            if not stale and not active_alerts:
                return "Safety: All clear ✅"

            lines = ["Safety Status:"]
            if stale:
                for w in stale:
                    lines.append(f"  ⚠️ {w['name']} is offline (Patient: {w.get('patient_name', 'N/A')})")
            if active_alerts:
                for a in active_alerts:
                    emoji = {"emergency": "🚨", "warning": "⚠️"}.get(a.get("alert_type"), "ℹ️")
                    lines.append(f"  {emoji} {a['message']}")

            return "\n".join(lines)

        except Exception as e:
            logger.error(f"Error getting safety summary: {e}")
            return "Safety: Error loading"
