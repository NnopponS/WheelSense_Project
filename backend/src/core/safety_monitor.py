"""
WheelSense v2.0 - Safety Monitor
Background task that checks for safety concerns and auto-generates alerts.
Runs periodically and checks all active wheelchairs.
"""

import asyncio
import logging
import json
from datetime import datetime, timedelta
from typing import Optional

from .database import db
from .config import settings

logger = logging.getLogger(__name__)

# ─── Configuration ──────────────────────────
SPEED_THRESHOLD_MS = 2.0        # Max safe speed (m/s)
INACTIVITY_HOURS = 2            # Hours before inactivity alert (daytime only)
BATHROOM_MAX_MINUTES = 30       # Max time in bathroom before alert
RSSI_WEAK_THRESHOLD = -85       # Weak signal threshold
RSSI_WEAK_MINUTES = 5           # Minutes of weak signal before alert
ALERT_DEDUP_MINUTES = 30        # Don't repeat same alert type within this window
DAYTIME_START = 8               # 8 AM
DAYTIME_END = 22                # 10 PM


async def _has_recent_alert(patient_id: str, alert_type: str, minutes: int = ALERT_DEDUP_MINUTES) -> bool:
    """Check if a similar alert was already created recently (dedup)."""
    row = await db.fetch_one(
        """SELECT id FROM alerts
           WHERE patient_id = $1 AND alert_type = $2
           AND created_at > NOW() - ($3 || ' minutes')::INTERVAL
           LIMIT 1""",
        (patient_id, alert_type, str(minutes))
    )
    return row is not None


async def _create_safety_alert(
    patient_id: str,
    wheelchair_id: Optional[str],
    alert_type: str,
    severity: str,
    message: str,
):
    """Create alert + notification + timeline event for a safety concern."""
    # Dedup check
    if await _has_recent_alert(patient_id, alert_type):
        return

    # Create alert
    await db.execute(
        """INSERT INTO alerts (patient_id, wheelchair_id, alert_type, severity, message)
           VALUES ($1, $2, $3, $4, $5)""",
        (patient_id, wheelchair_id, alert_type, severity, message)
    )

    # Create notification
    emoji = {"emergency": "🚨", "warning": "⚠️"}.get(severity, "ℹ️")
    await db.execute(
        """INSERT INTO notifications (patient_id, type, title, message)
           VALUES ($1, $2, $3, $4)""",
        (patient_id, severity, f"{emoji} Safety Alert", message)
    )

    # Log timeline event
    await db.execute(
        """INSERT INTO timeline_events (patient_id, wheelchair_id, event_type, description)
           VALUES ($1, $2, 'safety_alert', $3)""",
        (patient_id, wheelchair_id, f"[{severity.upper()}] {message}")
    )

    logger.warning(f"🚨 Safety alert: {severity} for {patient_id}: {message}")


async def _check_excessive_speed():
    """Check for wheelchairs moving too fast."""
    rows = await db.fetch_all(
        """SELECT w.id as wheelchair_id, w.patient_id, w.speed_ms, p.name as patient_name
           FROM wheelchairs w
           LEFT JOIN patients p ON w.patient_id = p.id
           WHERE w.status = 'active' AND w.speed_ms > $1""",
        (SPEED_THRESHOLD_MS,)
    )
    for row in rows:
        if row.get("patient_id"):
            await _create_safety_alert(
                patient_id=row["patient_id"],
                wheelchair_id=row["wheelchair_id"],
                alert_type="excessive_speed",
                severity="warning",
                message=f"Wheelchair speed {row['speed_ms']:.1f} m/s exceeds safe limit ({SPEED_THRESHOLD_MS} m/s)."
            )


async def _check_long_inactivity():
    """Check for patients with no activity during daytime hours."""
    now = datetime.now()
    if not (DAYTIME_START <= now.hour < DAYTIME_END):
        return  # Only check during daytime

    patients = await db.fetch_all(
        """SELECT p.id, p.name, p.wheelchair_id
           FROM patients p
           WHERE p.wheelchair_id IS NOT NULL"""
    )

    for patient in patients:
        last_event = await db.fetch_one(
            """SELECT timestamp FROM timeline_events
               WHERE (patient_id = $1 OR wheelchair_id = $2)
               ORDER BY timestamp DESC LIMIT 1""",
            (patient["id"], patient.get("wheelchair_id"))
        )

        if last_event:
            last_ts = last_event["timestamp"]
            if isinstance(last_ts, str):
                last_ts = datetime.fromisoformat(last_ts.replace('Z', '+00:00'))
            hours_ago = (datetime.now(last_ts.tzinfo) - last_ts).total_seconds() / 3600
            if hours_ago >= INACTIVITY_HOURS:
                await _create_safety_alert(
                    patient_id=patient["id"],
                    wheelchair_id=patient.get("wheelchair_id"),
                    alert_type="long_inactivity",
                    severity="warning",
                    message=f"No activity detected for {hours_ago:.0f} hours during daytime."
                )
        else:
            # No events ever — check if wheelchair was last seen long ago
            wc = await db.fetch_one(
                "SELECT last_seen FROM wheelchairs WHERE id = $1",
                (patient.get("wheelchair_id"),)
            )
            if wc and wc.get("last_seen"):
                last_seen = wc["last_seen"]
                if isinstance(last_seen, str):
                    last_seen = datetime.fromisoformat(last_seen.replace('Z', '+00:00'))
                hours_ago = (datetime.now(last_seen.tzinfo) - last_seen).total_seconds() / 3600
                if hours_ago >= INACTIVITY_HOURS:
                    await _create_safety_alert(
                        patient_id=patient["id"],
                        wheelchair_id=patient.get("wheelchair_id"),
                        alert_type="long_inactivity",
                        severity="warning",
                        message=f"No wheelchair data for {hours_ago:.0f} hours."
                    )


async def _check_bathroom_duration():
    """Check for patients who have been in a bathroom-type room too long."""
    # Find wheelchairs currently in bathroom rooms
    rows = await db.fetch_all(
        """SELECT w.id as wheelchair_id, w.patient_id, w.current_room_id,
                  r.name as room_name, r.room_type, p.name as patient_name
           FROM wheelchairs w
           JOIN rooms r ON w.current_room_id = r.id
           LEFT JOIN patients p ON w.patient_id = p.id
           WHERE w.status = 'active'
           AND r.room_type = 'bathroom'"""
    )

    for row in rows:
        if not row.get("patient_id"):
            continue
        # Find when they entered this room
        enter_event = await db.fetch_one(
            """SELECT timestamp FROM timeline_events
               WHERE (patient_id = $1 OR wheelchair_id = $2)
               AND to_room_id = $3 AND event_type = 'enter'
               ORDER BY timestamp DESC LIMIT 1""",
            (row["patient_id"], row["wheelchair_id"], row["current_room_id"])
        )
        if enter_event:
            enter_ts = enter_event["timestamp"]
            if isinstance(enter_ts, str):
                enter_ts = datetime.fromisoformat(enter_ts.replace('Z', '+00:00'))
            minutes_in = (datetime.now(enter_ts.tzinfo) - enter_ts).total_seconds() / 60
            if minutes_in >= BATHROOM_MAX_MINUTES:
                await _create_safety_alert(
                    patient_id=row["patient_id"],
                    wheelchair_id=row["wheelchair_id"],
                    alert_type="bathroom_duration",
                    severity="warning",
                    message=f"Patient has been in {row['room_name']} for {minutes_in:.0f} minutes (limit: {BATHROOM_MAX_MINUTES} min)."
                )


async def _check_restricted_areas():
    """Check for wheelchairs in restricted rooms."""
    rows = await db.fetch_all(
        """SELECT w.id as wheelchair_id, w.patient_id, w.current_room_id,
                  r.name as room_name, p.name as patient_name
           FROM wheelchairs w
           JOIN rooms r ON w.current_room_id = r.id
           LEFT JOIN patients p ON w.patient_id = p.id
           WHERE w.status = 'active' AND r.restricted = TRUE"""
    )
    for row in rows:
        if row.get("patient_id"):
            await _create_safety_alert(
                patient_id=row["patient_id"],
                wheelchair_id=row["wheelchair_id"],
                alert_type="restricted_area",
                severity="emergency",
                message=f"Wheelchair entered restricted area: {row['room_name']}."
            )


async def _check_low_connectivity():
    """Check for wheelchairs with consistently weak signal."""
    rows = await db.fetch_all(
        """SELECT w.id as wheelchair_id, w.patient_id, w.rssi, w.last_seen,
                  p.name as patient_name
           FROM wheelchairs w
           LEFT JOIN patients p ON w.patient_id = p.id
           WHERE w.status = 'active' AND w.rssi IS NOT NULL AND w.rssi < $1""",
        (RSSI_WEAK_THRESHOLD,)
    )
    for row in rows:
        if not row.get("patient_id"):
            continue
        # Check if weak signal persists (look at recent history)
        weak_count = await db.fetch_one(
            """SELECT COUNT(*) as count FROM wheelchair_history
               WHERE wheelchair_id = $1
               AND rssi < $2
               AND timestamp > NOW() - ($3 || ' minutes')::INTERVAL""",
            (row["wheelchair_id"], RSSI_WEAK_THRESHOLD, str(RSSI_WEAK_MINUTES))
        )
        if weak_count and weak_count["count"] >= 3:
            await _create_safety_alert(
                patient_id=row["patient_id"],
                wheelchair_id=row["wheelchair_id"],
                alert_type="low_connectivity",
                severity="info",
                message=f"Weak signal (RSSI: {row['rssi']} dBm) for over {RSSI_WEAK_MINUTES} minutes."
            )


async def safety_monitor_task():
    """Background task: runs safety checks every 30 seconds."""
    logger.info("🛡️ Safety monitor started")
    while True:
        try:
            await asyncio.sleep(30)

            await _check_excessive_speed()
            await _check_long_inactivity()
            await _check_bathroom_duration()
            await _check_restricted_areas()
            await _check_low_connectivity()

        except asyncio.CancelledError:
            logger.info("🛡️ Safety monitor stopped")
            break
        except Exception as e:
            logger.error(f"Safety monitor error: {e}", exc_info=True)
            # Don't break — continue monitoring


async def periodic_health_score_task():
    """Background task: calculates health scores every hour for all patients."""
    logger.info("📊 Periodic health score task started")
    while True:
        try:
            await asyncio.sleep(3600)  # 1 hour

            patients = await db.fetch_all("SELECT id FROM patients")
            for patient in patients:
                try:
                    from ..routes.health_scores import calculate_health_score
                    await calculate_health_score(patient["id"])
                    logger.info(f"📊 Health score calculated for {patient['id']}")
                except Exception as calc_err:
                    logger.warning(f"Failed to calculate score for {patient['id']}: {calc_err}")

        except asyncio.CancelledError:
            logger.info("📊 Periodic health score task stopped")
            break
        except Exception as e:
            logger.error(f"Health score task error: {e}", exc_info=True)


async def check_speed_alert(wheelchair_id: str, patient_id: Optional[str], speed_ms: float):
    """
    Immediate speed check called from MQTT processor.
    Creates an instant alert for dangerous speeds without waiting for background cycle.
    """
    if speed_ms <= SPEED_THRESHOLD_MS or not patient_id:
        return
    await _create_safety_alert(
        patient_id=patient_id,
        wheelchair_id=wheelchair_id,
        alert_type="excessive_speed",
        severity="warning" if speed_ms < 3.0 else "emergency",
        message=f"Dangerous speed detected: {speed_ms:.1f} m/s (limit: {SPEED_THRESHOLD_MS} m/s)."
    )
