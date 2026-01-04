"""
WheelSense Backend - Schedule Checker Service
Periodically checks schedule items and triggers notifications when time matches.
Phase 4E: Added automatic device action execution and notification persistence.
"""

import asyncio
import logging
import time
import json
from datetime import datetime
from typing import Optional, Dict, Any, Set, List

logger = logging.getLogger(__name__)

# Debug logging helper
def debug_log(location, message, data=None, hypothesis_id=None):
    """Write debug log to file"""
    try:
        import os
        # Use /app/.cursor/debug.log (mounted volume in Docker)
        log_path = "/app/.cursor/debug.log"
        
        # Create directory if needed
        log_dir = os.path.dirname(log_path)
        if log_dir:
            os.makedirs(log_dir, exist_ok=True)
        
        log_entry = {
            "timestamp": time.time() * 1000,
            "location": location,
            "message": message,
            "sessionId": "debug-session",
            "runId": "run1",
        }
        if data:
            log_entry["data"] = data
        if hypothesis_id:
            log_entry["hypothesisId"] = hypothesis_id
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(log_entry) + "\n")
    except Exception as e:
        # Log to standard logger as fallback
        logger.warning(f"Debug log write failed: {e}")


class ScheduleCheckerService:
    """Service that periodically checks schedule and triggers notifications."""
    
    def __init__(self, db, mqtt_handler, app=None):
        self.db = db
        self.mqtt_handler = mqtt_handler
        self.app = app  # FastAPI app reference for accessing app.state
        self.running = False
        self.task: Optional[asyncio.Task] = None
        self.sent_notifications: Set[str] = set()  # Track sent notifications to avoid duplicates
        self.last_checked_minute: Optional[str] = None
        
        # Phase 4F: Health tracking
        self.last_successful_check: Optional[datetime] = None
        self.last_error: Optional[str] = None
    
    async def start(self):
        """Start the schedule checker service."""
        # #region agent log
        debug_log("schedule_checker.py:32", "start() called", {"running": self.running}, "A")
        # #endregion
        if self.running:
            logger.warning("Schedule checker is already running")
            return
        
        # Load last checked minute from database (Phase 4E)
        try:
            last_minute = await self.db.get_last_schedule_check_minute()
            if last_minute:
                self.last_checked_minute = last_minute
                logger.info(f"Resumed schedule checking from: {last_minute}")
        except Exception as e:
            logger.warning(f"Failed to load last schedule check minute: {e}")
        
        self.running = True
        self.task = asyncio.create_task(self._run_loop())
        # #region agent log
        debug_log("schedule_checker.py:49", "Schedule checker started, task created", {"running": self.running, "task_created": self.task is not None}, "A")
        # #endregion
        logger.info("Schedule checker service started")
    
    async def stop(self):
        """Stop the schedule checker service."""
        self.running = False
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
        logger.info("Schedule checker service stopped")
    
    async def reset_last_checked_minute(self):
        """Reset last checked minute to allow immediate re-checking. Useful when custom time changes."""
        self.last_checked_minute = None
        logger.info("Reset last_checked_minute - schedule checker will check on next cycle")
    
    async def _run_loop(self):
        """Main loop that runs every 60 seconds."""
        # #region agent log
        debug_log("schedule_checker.py:67", "_run_loop() started", {"running": self.running}, "A")
        # #endregion
        while self.running:
            try:
                # #region agent log
                debug_log("schedule_checker.py:71", "About to call _check_schedule()", {}, "A")
                # #endregion
                await self._check_schedule()
                # #region agent log
                debug_log("schedule_checker.py:73", "_check_schedule() completed, sleeping 60s", {}, "A")
                # #endregion
                # Wait 60 seconds before next check
                await asyncio.sleep(60)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in schedule checker loop: {e}", exc_info=True)
                # #region agent log
                debug_log("schedule_checker.py:77", "Error in _run_loop", {"error": str(e)}, "A")
                # #endregion
                # Wait a bit before retrying on error
                await asyncio.sleep(10)
    
    def get_health_status(self) -> Dict[str, Any]:
        """
        Get health status of schedule checker service.
        Phase 4F: Returns health information for monitoring.
        
        Returns:
            Dict with health status:
            {
                "healthy": bool,
                "running": bool,
                "last_successful_check": Optional[str] (ISO timestamp),
                "last_error": Optional[str],
                "stale_threshold_seconds": int
            }
        """
        now = datetime.now()
        stale_threshold = 300  # 5 minutes
        
        healthy = True
        if not self.running:
            healthy = False
        elif self.last_successful_check:
            time_since_last_check = (now - self.last_successful_check).total_seconds()
            if time_since_last_check > stale_threshold:
                healthy = False
        
        return {
            "healthy": healthy,
            "running": self.running,
            "last_successful_check": self.last_successful_check.isoformat() if self.last_successful_check else None,
            "last_error": self.last_error,
            "stale_threshold_seconds": stale_threshold
        }
    
    def _get_current_time_and_date(self) -> tuple[str, str]:
        """
        Get current time and date, using custom time if set in app.state.
        
        Returns:
            tuple: (current_time_str, current_date_str) in format ("HH:MM", "YYYY-MM-DD")
        """
        from datetime import timezone, timedelta
        
        # Check if custom time is set
        # #region agent log
        has_custom_time = self.app and hasattr(self.app.state, 'custom_time') and self.app.state.custom_time
        debug_log("schedule_checker.py:125", "_get_current_time_and_date() entry", {"has_app": self.app is not None, "has_custom_time": has_custom_time, "custom_time": getattr(self.app.state, 'custom_time', None) if self.app else None}, "F")
        # #endregion
        if has_custom_time:
            # Use custom time
            custom_time = self.app.state.custom_time
            custom_time_set_timestamp = getattr(self.app.state, 'custom_time_set_timestamp', time.time())
            
            # Parse custom time (HH:MM)
            parts = custom_time.split(":")
            custom_hours = int(parts[0])
            custom_minutes = int(parts[1])
            
            # Calculate elapsed seconds since custom time was set
            elapsed_seconds = int(time.time() - custom_time_set_timestamp)
            
            # Calculate current time from custom time + elapsed seconds
            total_seconds = custom_hours * 3600 + custom_minutes * 60 + elapsed_seconds
            current_hours = (total_seconds // 3600) % 24
            current_minutes = (total_seconds % 3600) // 60
            
            current_time_str = f"{current_hours:02d}:{current_minutes:02d}"
            
            # Use custom date if set, otherwise use real date
            if hasattr(self.app.state, 'custom_date') and self.app.state.custom_date:
                current_date_str = self.app.state.custom_date
            else:
                gmt7 = timezone(timedelta(hours=7))
                current_date_str = datetime.now(gmt7).strftime("%Y-%m-%d")
            
            logger.info(f"Using custom time: {current_time_str}, date: {current_date_str}")
            return current_time_str, current_date_str
        else:
            # Use real time (GMT+7)
            gmt7 = timezone(timedelta(hours=7))
            now = datetime.now(gmt7)
            current_time_str = now.strftime("%H:%M")
            current_date_str = now.strftime("%Y-%m-%d")
            logger.info(f"Using real time: {current_time_str}, date: {current_date_str}")
            return current_time_str, current_date_str
    
    async def _check_schedule(self):
        """Check if current time matches any schedule items."""
        try:
            # Get current time and date (uses custom time if set)
            current_time_str, current_date_str = self._get_current_time_and_date()
            current_minute_key = f"{current_date_str}_{current_time_str}"
            # #region agent log
            debug_log("schedule_checker.py:163", "_check_schedule() entry", {"current_time": current_time_str, "current_date": current_date_str, "minute_key": current_minute_key, "last_checked": self.last_checked_minute}, "B")
            # #endregion
            
            # Only check if minute has changed (avoid checking multiple times in same minute)
            if self.last_checked_minute == current_minute_key:
                # #region agent log
                debug_log("schedule_checker.py:171", "Check skipped - same minute", {"minute_key": current_minute_key}, "B")
                # #endregion
                logger.debug(f"Schedule check skipped - same minute as last check: {current_minute_key}")
                return
            
            # #region agent log
            debug_log("schedule_checker.py:175", "Minute changed, proceeding with check", {"from": self.last_checked_minute, "to": current_minute_key}, "B")
            # #endregion
            logger.info(f"Schedule check: minute changed from {self.last_checked_minute} to {current_minute_key}")
            self.last_checked_minute = current_minute_key
            
            # Save last checked minute to database (Phase 4E)
            try:
                await self.db.save_last_schedule_check_minute(current_minute_key)
            except Exception as e:
                logger.warning(f"Failed to save last schedule check minute: {e}")
            
            # Check for matching schedule items
            matching_items = await self.db.check_schedule_notifications(
                current_time_str, current_date_str
            )
            # #region agent log
            debug_log("schedule_checker.py:185", "Database query completed", {"matching_count": len(matching_items), "items": [{"time": i.get("time"), "activity": i.get("activity")} for i in matching_items]}, "B")
            # #endregion
            
            if not matching_items:
                # Phase 4F: Record successful check even if no items found
                # #region agent log
                debug_log("schedule_checker.py:189", "No matching items found", {"current_time": current_time_str}, "B")
                # #endregion
                logger.info(f"Schedule check at {current_time_str}: no matching items found")
                self.last_successful_check = datetime.now()
                self.last_error = None
                return
            
            # #region agent log
            debug_log("schedule_checker.py:196", "Matching items found", {"count": len(matching_items), "activities": [i.get("activity") for i in matching_items]}, "B")
            # #endregion
            logger.info(f"Schedule check at {current_time_str}: found {len(matching_items)} matching item(s): {[item.get('activity') for item in matching_items]}")
            
            # Get notification preferences and do_not_remind items
            notification_prefs = await self.db.get_notification_preferences()
            do_not_remind = await self.db.get_do_not_remind()
            
            # Process each matching item
            for item in matching_items:
                # Create notification key to track if already sent
                notification_key = f"{current_date_str}_{item['time']}_{item['activity']}"
                
                # Check if already sent
                if notification_key in self.sent_notifications:
                    continue
                
                # Check do_not_remind (returns list of activity strings)
                activity_lower = item.get("activity", "").lower()
                if any(dnr.lower() == activity_lower for dnr in do_not_remind):
                    logger.debug(f"Skipping notification for {item['activity']} (in do_not_remind)")
                    continue
                
                # Phase 4E: Execute device actions if present
                device_action_results = []
                if item.get("action") and item["action"].get("devices"):
                    device_action_results = await self._execute_schedule_device_actions(item["action"]["devices"])
                
                # Phase 4E: Check location requirement
                location_notification_sent = False
                if item.get("location"):
                    location_notification_sent = await self._check_location_requirement(
                        item["location"], item["activity"], current_date_str
                    )
                    # If location mismatch, skip activity notification (user needs to move first)
                    if location_notification_sent:
                        self.sent_notifications.add(notification_key)
                        continue
                
                # Phase 4E: Build notification message
                notification_message = f"It's time to: {item['activity']}"
                
                # Append device action results if any
                if device_action_results:
                    success_devices = [r["device_desc"] for r in device_action_results if r.get("success")]
                    if success_devices:
                        if len(success_devices) == 1:
                            notification_message += f" I've turned on the {success_devices[0]}."
                        else:
                            devices_list = ", ".join(success_devices[:-1]) + f", and {success_devices[-1]}"
                            notification_message += f" I've turned on: {devices_list}."
                
                # Save notification as chat message in database (so it appears in chat interface)
                # Simplified: Just save to database, frontend will fetch from there
                try:
                    await self.db.save_chat_message({
                        "role": "assistant",
                        "content": f"🔔 {notification_message}",
                        "is_notification": True,
                        "notification_type": "schedule_notification",
                        "schedule_time": item.get("time"),
                        "schedule_activity": item.get("activity")
                    })
                    logger.info(f"💬 Saved schedule notification to chat_history: {item['time']} - {item['activity']}")
                    
                    # Mark as sent
                    self.sent_notifications.add(notification_key)
                    logger.info(f"✅ Successfully saved schedule notification: {item['time']} - {item['activity']}")
                except Exception as e:
                    logger.error(f"❌ Failed to save schedule notification: {e}", exc_info=True)
            
            # Clean up old sent notifications (keep only today's)
            self.sent_notifications = {
                key for key in self.sent_notifications 
                if key.startswith(current_date_str)
            }
            
            # Phase 4F: Record successful check
            self.last_successful_check = datetime.now()
            self.last_error = None

        except Exception as e:
            # Phase 4F: Record error for health check
            self.last_error = str(e)
            logger.error(f"Error checking schedule: {e}", exc_info=True)
    
    async def _execute_schedule_device_actions(self, devices: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Execute device actions from schedule item.
        Phase 4E: Directly calls tool handlers to control devices.
        
        Args:
            devices: List of device actions from schedule item action field
                Format: [{"room": "Bedroom", "device": "Light", "state": "ON"}, ...]
        
        Returns:
            List of action results: [{"success": bool, "device_desc": str, "error": str}, ...]
        """
        results = []
        
        # Import tool handler
        from .tool_handlers import handle_e_device_control
        
        for device_action in devices:
            room = device_action.get("room")
            device = device_action.get("device")
            state = device_action.get("state")  # "ON" or "OFF"
            
            # Skip Alarm devices (user must manually turn off)
            if device and device.lower() == "alarm":
                logger.debug(f"Skipping Alarm device (user must manually control)")
                continue
            
            if not room or not device or not state:
                logger.warning(f"Invalid device action: {device_action}")
                continue
            
            # Map state to action
            action = "ON" if state.upper() == "ON" else "OFF"
            
            try:
                # Call tool handler directly (bypass LLM)
                result = await handle_e_device_control(
                    self.db,
                    self.mqtt_handler,
                    {
                        "room": room,
                        "device": device,
                        "action": action
                    }
                )
                
                device_desc = f"{room} {device}"
                if result.get("success"):
                    logger.info(f"✓ Scheduled device action: {device_desc} → {action}")
                    results.append({
                        "success": True,
                        "device_desc": device_desc,
                        "room": room,
                        "device": device,
                        "action": action
                    })
                else:
                    error_msg = result.get("error", "Unknown error")
                    logger.warning(f"✗ Scheduled device action failed: {device_desc} → {action}: {error_msg}")
                    results.append({
                        "success": False,
                        "device_desc": device_desc,
                        "room": room,
                        "device": device,
                        "action": action,
                        "error": error_msg
                    })
            except Exception as e:
                logger.error(f"Error executing scheduled device action {room} {device}: {e}", exc_info=True)
                results.append({
                    "success": False,
                    "device_desc": f"{room} {device}",
                    "room": room,
                    "device": device,
                    "action": action,
                    "error": str(e)
                })
        
        return results
    
    async def _check_location_requirement(self, required_location: str, activity: str, date_str: str) -> bool:
        """
        Check if user is in the required location for the activity.
        Phase 4E: Sends location notification if user is not in correct location.
        
        Args:
            required_location: Required location from schedule item
            activity: Activity name
            date_str: Current date string
        
        Returns:
            True if location notification was sent, False otherwise
        """
        try:
            # Get current user location
            user_info = await self.db.get_user_info()
            current_location = user_info.get("current_location", "")
            
            # Normalize location names for comparison
            from ..core.database import normalize_room_name
            required_normalized = normalize_room_name(required_location) if required_location else ""
            current_normalized = normalize_room_name(current_location) if current_location else ""
            
            if required_normalized == current_normalized:
                logger.debug(f"User already in correct location: {required_location}")
                return False
            
            # Location mismatch - send notification
            location_message = f"Please move to {required_location} for {activity}"
            
            # Broadcast via WebSocket (no database save - matches mcp_llm-wheelsense)
            try:
                await self.mqtt_handler._broadcast_ws({
                    "type": "location_notification",
                    "message": location_message,
                    "required_location": required_location,
                    "current_location": current_location,
                    "activity": activity,
                    "timestamp": datetime.now().isoformat()
                })
                logger.info(f"Sent location notification: {location_message}")
                return True
            except Exception as e:
                logger.error(f"Failed to broadcast location notification: {e}")
                return False
                
        except Exception as e:
            logger.error(f"Error checking location requirement: {e}", exc_info=True)
            return False

