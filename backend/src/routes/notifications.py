"""
WheelSense v2.0 - Notifications Routes
CRUD for notifications with patient-scoped filtering
"""

import logging
from fastapi import APIRouter, Query
from typing import Optional

from ..core.database import db

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("")
async def get_notifications(
    patient_id: Optional[str] = Query(None, description="Filter by patient"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    unread_only: bool = Query(False),
):
    """List notifications, optionally filtered by patient and read status."""
    try:
        conditions = []
        params = []
        idx = 1

        if patient_id:
            conditions.append(f"patient_id = ${idx}")
            params.append(patient_id)
            idx += 1

        if unread_only:
            conditions.append("is_read = FALSE")

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        rows = await db.fetch_all(
            f"""SELECT id, patient_id, title, message, type, is_read, created_at
                FROM notifications {where}
                ORDER BY created_at DESC
                LIMIT ${idx} OFFSET ${idx + 1}""",
            tuple(params + [limit, offset])
        )

        count_row = await db.fetch_one(
            f"SELECT COUNT(*) as total FROM notifications {where}",
            tuple(params)
        )
        total = count_row["total"] if count_row else 0

        return {"notifications": rows, "total": total}

    except Exception as e:
        logger.error(f"Error getting notifications: {e}", exc_info=True)
        return {"notifications": [], "total": 0, "error": str(e)}


@router.get("/unread-count")
async def unread_count(patient_id: Optional[str] = Query(None)):
    """Get count of unread notifications."""
    try:
        if patient_id:
            row = await db.fetch_one(
                "SELECT COUNT(*) as count FROM notifications WHERE is_read = FALSE AND patient_id = $1",
                (patient_id,)
            )
        else:
            row = await db.fetch_one(
                "SELECT COUNT(*) as count FROM notifications WHERE is_read = FALSE"
            )
        return {"unread_count": row["count"] if row else 0}

    except Exception as e:
        logger.error(f"Error getting unread count: {e}", exc_info=True)
        return {"unread_count": 0, "error": str(e)}


@router.post("")
async def create_notification(data: dict):
    """Create a notification."""
    title = data.get("title", "").strip()
    message = data.get("message", "").strip()
    notif_type = data.get("type", "info")
    patient_id = data.get("patient_id")

    if not title or not message:
        return {"success": False, "error": "title and message required"}

    try:
        await db.execute(
            """INSERT INTO notifications (patient_id, title, message, type)
               VALUES ($1, $2, $3, $4)""",
            (patient_id, title, message, notif_type)
        )
        return {"success": True, "message": "Notification created"}

    except Exception as e:
        logger.error(f"Error creating notification: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@router.put("/{notif_id}/read")
async def mark_read(notif_id: int):
    """Mark a notification as read."""
    try:
        await db.execute(
            "UPDATE notifications SET is_read = TRUE WHERE id = $1",
            (notif_id,)
        )
        return {"success": True}
    except Exception as e:
        logger.error(f"Error marking notification: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@router.put("/read-all")
async def mark_all_read(patient_id: Optional[str] = Query(None)):
    """Mark all notifications as read."""
    try:
        if patient_id:
            await db.execute(
                "UPDATE notifications SET is_read = TRUE WHERE patient_id = $1 AND is_read = FALSE",
                (patient_id,)
            )
        else:
            await db.execute("UPDATE notifications SET is_read = TRUE WHERE is_read = FALSE")
        return {"success": True}
    except Exception as e:
        logger.error(f"Error marking all read: {e}", exc_info=True)
        return {"success": False, "error": str(e)}
