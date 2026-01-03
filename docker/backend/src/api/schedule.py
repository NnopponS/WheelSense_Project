"""
Schedule APIs - MCP schedule management
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
import logging
import time

from ..dependencies import get_db, get_mqtt_handler

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Schedule"])


class ScheduleItemCreate(BaseModel):
    time: str
    activity: str
    location: Optional[str] = None
    action: Optional[Dict[str, Any]] = None


class ScheduleItemUpdate(BaseModel):
    time: Optional[str] = None
    activity: Optional[str] = None
    location: Optional[str] = None
    action: Optional[Dict[str, Any]] = None


@router.get("/schedule-items")
async def get_schedule_items(request: Request):
    """Get all base schedule items."""
    db = get_db(request)
    
    try:
        items = await db.get_schedule_items()
        return {"schedule_items": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get schedule items: {str(e)}")


@router.post("/schedule-items")
async def create_schedule_item(item: ScheduleItemCreate, request: Request):
    """Create a new schedule item."""
    db = get_db(request)
    mqtt_handler = get_mqtt_handler(request)
    
    try:
        item_dict = {
            "time": item.time,
            "activity": item.activity
        }
        if item.location:
            item_dict["location"] = item.location
        if item.action:
            item_dict["action"] = item.action
        
        item_id = await db.add_schedule_item(item_dict)
        
        # Broadcast schedule_item_update via WebSocket
        try:
            await mqtt_handler._broadcast_ws({
                "type": "schedule_item_update",
                "action": "created",
                "item": item_dict,
                "item_id": item_id,
                "timestamp": datetime.now().isoformat()
            })
        except Exception as e:
            logger.warning(f"Failed to broadcast schedule_item_update: {e}")
        
        return {"status": "created", "id": item_id, "item": item_dict}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create schedule item: {str(e)}")


@router.put("/schedule-items/{item_id}")
async def update_schedule_item(item_id: int, update: ScheduleItemUpdate, request: Request):
    """Update a schedule item by ID."""
    db = get_db(request)
    mqtt_handler = get_mqtt_handler(request)
    
    try:
        # Get existing item
        items = await db.get_schedule_items()
        if item_id < 1 or item_id > len(items):
            raise HTTPException(status_code=404, detail="Schedule item not found")
        
        # Get existing item
        existing = items[item_id - 1]  # item_id is 1-based from frontend
        
        # Build update dict
        update_dict = existing.copy()
        if update.time is not None:
            update_dict["time"] = update.time
        if update.activity is not None:
            update_dict["activity"] = update.activity
        if update.location is not None:
            update_dict["location"] = update.location
        if update.action is not None:
            update_dict["action"] = update.action
        
        # Replace all items (since we don't have direct update by ID)
        all_items = await db.get_schedule_items()
        all_items[item_id - 1] = update_dict
        await db.set_schedule_items(all_items)
        
        # Broadcast schedule_item_update via WebSocket
        try:
            await mqtt_handler._broadcast_ws({
                "type": "schedule_item_update",
                "action": "updated",
                "item": update_dict,
                "item_id": item_id,
                "timestamp": datetime.now().isoformat()
            })
        except Exception as e:
            logger.warning(f"Failed to broadcast schedule_item_update: {e}")
        
        return {"status": "updated", "item": update_dict}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update schedule item: {str(e)}")


@router.delete("/schedule-items/{item_id}")
async def delete_schedule_item(item_id: int, request: Request):
    """Delete a schedule item by ID."""
    db = get_db(request)
    mqtt_handler = get_mqtt_handler(request)
    
    try:
        items = await db.get_schedule_items()
        if item_id < 1 or item_id > len(items):
            raise HTTPException(status_code=404, detail="Schedule item not found")
        
        # Remove item
        item_to_delete = items[item_id - 1]
        time_to_delete = item_to_delete.get("time")
        
        success = await db.delete_schedule_item_by_time(time_to_delete)
        if not success:
            raise HTTPException(status_code=404, detail="Schedule item not found")
        
        # Broadcast schedule_item_update via WebSocket
        try:
            await mqtt_handler._broadcast_ws({
                "type": "schedule_item_update",
                "action": "deleted",
                "item": None,
                "item_id": item_id,
                "timestamp": datetime.now().isoformat()
            })
        except Exception as e:
            logger.warning(f"Failed to broadcast schedule_item_update: {e}")
        
        return {"status": "deleted", "item_id": item_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete schedule item: {str(e)}")


@router.post("/schedule/reset")
async def reset_schedule(request: Request):
    """Reset daily schedule to base schedule and clear all one-time events."""
    db = get_db(request)
    mqtt_handler = get_mqtt_handler(request)
    
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        
        # Clear all one-time events
        deleted_count = await db.delete_all_one_time_events()
        
        # Delete existing clone for today
        await db.delete_daily_clone(today)
        
        # Create fresh clone from base schedule
        base_schedule = await db.get_schedule_items()
        base_schedule_copy = [item.copy() for item in base_schedule]
        await db.set_daily_clone(today, base_schedule_copy)
        
        # Clear schedule checker's sent_notifications cache
        schedule_checker = getattr(request.app.state, 'schedule_checker', None)
        if schedule_checker:
            schedule_checker.sent_notifications.clear()
            logger.info("Cleared schedule checker sent_notifications cache on schedule reset")
        
        # Broadcast schedule reset via WebSocket (broadcast all items as refresh)
        try:
            # Broadcast a refresh event that tells UI to reload all schedule items
            await mqtt_handler._broadcast_ws({
                "type": "schedule_item_update",
                "action": "reset",
                "item": None,
                "item_id": None,
                "timestamp": datetime.now().isoformat()
            })
        except Exception as e:
            logger.warning(f"Failed to broadcast schedule reset: {e}")
        
        return {
            "status": "reset",
            "one_time_events_cleared": deleted_count,
            "clone_reset": True,
            "date": today
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reset schedule: {str(e)}")


class CustomTimeRequest(BaseModel):
    time: Optional[str] = None  # HH:MM format, or null to reset to real time
    date: Optional[str] = None  # Optional: YYYY-MM-DD format for custom date


@router.post("/schedule/custom-time")
async def set_custom_time(custom_time: CustomTimeRequest, request: Request):
    """Set custom time for schedule checking. Used for testing/debugging."""
    try:
        # #region agent log
        import json as json_module
        import os
        try:
            log_path = "/app/.cursor/debug.log"
            os.makedirs(os.path.dirname(log_path), exist_ok=True)
            log_entry = {
                "timestamp": time.time() * 1000,
                "location": "schedule.py:216",
                "message": "set_custom_time() called",
                "sessionId": "debug-session",
                "runId": "run1",
                "hypothesisId": "F",
                "data": {"time": custom_time.time, "date": custom_time.date}
            }
            with open(log_path, "a", encoding="utf-8") as f:
                f.write(json_module.dumps(log_entry) + "\n")
        except Exception:
            pass
        # #endregion
        if custom_time.time:
            # Validate time format (HH:MM)
            try:
                parts = custom_time.time.split(":")
                if len(parts) != 2:
                    raise ValueError("Invalid time format")
                hours = int(parts[0])
                minutes = int(parts[1])
                if hours < 0 or hours > 23 or minutes < 0 or minutes > 59:
                    raise ValueError("Invalid time values")
            except (ValueError, IndexError):
                raise HTTPException(status_code=400, detail="Invalid time format. Use HH:MM (e.g., '07:00')")
            
            # Store custom time in app.state
            request.app.state.custom_time = custom_time.time
            request.app.state.custom_time_set_timestamp = time.time()
            request.app.state.custom_date = custom_time.date  # Optional custom date
            
            # #region agent log
            try:
                log_path = "/app/.cursor/debug.log"
                os.makedirs(os.path.dirname(log_path), exist_ok=True)
                log_entry = {
                    "timestamp": time.time() * 1000,
                    "location": "schedule.py:233",
                    "message": "Custom time stored in app.state",
                    "sessionId": "debug-session",
                    "runId": "run1",
                    "hypothesisId": "F",
                    "data": {"custom_time": request.app.state.custom_time, "timestamp": request.app.state.custom_time_set_timestamp}
                }
                with open(log_path, "a", encoding="utf-8") as f:
                    f.write(json_module.dumps(log_entry) + "\n")
            except Exception:
                pass
            # #endregion
            
            # Reset last_checked_minute to allow immediate re-checking with new custom time
            schedule_checker = getattr(request.app.state, 'schedule_checker', None)
            if schedule_checker:
                await schedule_checker.reset_last_checked_minute()
                logger.info(f"Reset schedule checker last_checked_minute for custom time change")
            
            logger.info(f"Custom time set to: {custom_time.time}, date: {custom_time.date or 'today'}")
        else:
            # Reset to real time
            if hasattr(request.app.state, 'custom_time'):
                delattr(request.app.state, 'custom_time')
            if hasattr(request.app.state, 'custom_time_set_timestamp'):
                delattr(request.app.state, 'custom_time_set_timestamp')
            if hasattr(request.app.state, 'custom_date'):
                delattr(request.app.state, 'custom_date')
            
            # Reset last_checked_minute when switching back to real time
            schedule_checker = getattr(request.app.state, 'schedule_checker', None)
            if schedule_checker:
                await schedule_checker.reset_last_checked_minute()
                logger.info(f"Reset schedule checker last_checked_minute for real time reset")
            
            logger.info("Custom time reset to real time")
        
        return {
            "status": "updated",
            "custom_time": custom_time.time,
            "custom_date": custom_time.date
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to set custom time: {str(e)}")


@router.get("/schedule/custom-time")
async def get_custom_time(request: Request):
    """Get current custom time setting."""
    custom_time = getattr(request.app.state, 'custom_time', None)
    custom_date = getattr(request.app.state, 'custom_date', None)
    
    return {
        "custom_time": custom_time,
        "custom_date": custom_date,
        "using_custom_time": custom_time is not None
    }

