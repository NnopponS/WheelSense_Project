"""
WheelSense v2.0 - Alerts Routes
Emergency/warning alert management with resolve workflow
"""

import logging
from fastapi import APIRouter, Query
from typing import Optional

from ..core.database import db

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("")
async def get_alerts(
    resolved: Optional[bool] = Query(None, description="Filter by resolved status"),
    patient_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """List alerts, optionally filtered by status and patient."""
    try:
        conditions = []
        params = []
        idx = 1

        if resolved is not None:
            conditions.append(f"resolved = ${idx}")
            params.append(resolved)
            idx += 1

        if patient_id:
            conditions.append(f"patient_id = ${idx}")
            params.append(patient_id)
            idx += 1

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        rows = await db.fetch_all(
            f"""SELECT id, patient_id, wheelchair_id, alert_type, severity,
                       message, resolved, resolved_at, created_at
                FROM alerts {where}
                ORDER BY created_at DESC
                LIMIT ${idx}""",
            tuple(params + [limit])
        )
        return {"alerts": rows}

    except Exception as e:
        logger.error(f"Error getting alerts: {e}", exc_info=True)
        return {"alerts": [], "error": str(e)}


@router.post("")
async def create_alert(data: dict):
    """Create a new alert."""
    alert_type = data.get("alert_type", "warning")
    severity = data.get("severity", alert_type)
    message = data.get("message", "").strip()
    patient_id = data.get("patient_id")
    wheelchair_id = data.get("wheelchair_id")

    if not message:
        return {"success": False, "error": "message required"}

    if alert_type not in ("emergency", "warning", "info"):
        alert_type = "warning"

    try:
        await db.execute(
            """INSERT INTO alerts (alert_type, severity, message, patient_id, wheelchair_id)
               VALUES ($1, $2, $3, $4, $5)""",
            (alert_type, severity, message, patient_id, wheelchair_id)
        )

        # Also create a notification
        emoji = {"emergency": "🚨", "warning": "⚠️"}.get(alert_type, "ℹ️")
        await db.execute(
            """INSERT INTO notifications (patient_id, type, title, message)
               VALUES ($1, $2, $3, $4)""",
            (patient_id, alert_type, f"{emoji} {alert_type.capitalize()} Alert", message)
        )

        # Log timeline event
        await db.execute(
            """INSERT INTO timeline_events (event_type, description)
               VALUES ('alert', $1)""",
            (f"[{alert_type.upper()}] {message}",)
        )

        return {"success": True, "message": f"Alert created: {message}"}

    except Exception as e:
        logger.error(f"Error creating alert: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@router.post("/emergency")
async def trigger_emergency(data: dict):
    """Trigger an emergency alert — high-priority shortcut."""
    data["alert_type"] = "emergency"
    data["severity"] = "emergency"
    return await create_alert(data)


@router.put("/{alert_id}/resolve")
async def resolve_alert(alert_id: int):
    """Resolve an alert."""
    try:
        await db.execute(
            "UPDATE alerts SET resolved = TRUE, resolved_at = NOW() WHERE id = $1",
            (alert_id,)
        )
        return {"success": True, "message": f"Alert {alert_id} resolved"}
    except Exception as e:
        logger.error(f"Error resolving alert: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@router.get("/active-count")
async def active_alert_count():
    """Get count of unresolved alerts."""
    try:
        row = await db.fetch_one(
            "SELECT COUNT(*) as count FROM alerts WHERE resolved = FALSE"
        )
        return {"active_count": row["count"] if row else 0}
    except Exception as e:
        logger.error(f"Error getting alert count: {e}", exc_info=True)
        return {"active_count": 0, "error": str(e)}
