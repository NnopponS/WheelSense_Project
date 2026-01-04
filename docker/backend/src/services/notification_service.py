"""
Notification Service - Background task for schedule notifications and room change alerts.
Handles:
1. Schedule-based notifications (trigger at scheduled time)
2. Room change alerts (forgot to turn off appliances)

Uses MCP chat_message tool to send notifications (same as mcp_llm-wheelsense).
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
import json

logger = logging.getLogger(__name__)


class NotificationService:
    """Background service for automated notifications."""
    
    def __init__(self, db, mcp_router, mqtt_handler=None, app=None):
        """
        Initialize notification service.
        
        Args:
            db: Database instance
            mcp_router: MCP router for executing chat_message tool
            mqtt_handler: MQTT handler for device control (optional)
            app: FastAPI app instance for storing recent_notification in app.state
        """
        self.db = db
        self.mcp_router = mcp_router
        self.mqtt_handler = mqtt_handler
        self.app = app  # Store app instance for app.state access
        self._running = False
        self._task = None
        self._last_check_minute = None
        self._last_room = None  # Track user's last room for change detection
    
    async def start(self):
        """Start the notification service background task."""
        if self._running:
            logger.warning("Notification service already running")
            return
        
        self._running = True
        self._task = asyncio.create_task(self._background_loop())
        logger.info("✅ Notification service started")
    
    async def stop(self):
        """Stop the notification service."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("🛑 Notification service stopped")
    
    async def _background_loop(self):
        """Main background loop - runs every 30 seconds."""
        while self._running:
            try:
                await self._check_notifications()
            except Exception as e:
                logger.error(f"Error in notification loop: {e}", exc_info=True)
            
            # Sleep for 30 seconds
            await asyncio.sleep(30)
    
    async def _check_notifications(self):
        """Check for notifications to send."""
        now = datetime.now()
        current_minute = now.strftime("%H:%M")
        current_second = now.strftime("%H:%M:%S")
        
        # Only check schedule once per minute
        if current_minute != self._last_check_minute:
            logger.info(f"🔍 DEBUG: Checking schedule notifications at {current_second} (minute: {current_minute})")
            self._last_check_minute = current_minute
            await self._check_schedule_notifications(current_minute)
        
        # Check room change (every loop iteration)
        await self._check_room_change()
    
    async def _check_schedule_notifications(self, current_time: str):
        """
        Check schedule items and send notifications for matching times.
        
        Args:
            current_time: Current time in HH:MM format
        """
        try:
            logger.info(f"🔍 DEBUG: _check_schedule_notifications called with time: '{current_time}'")
            # Get schedule items
            schedule_items = await self.db.get_schedule_items()
            logger.info(f"🔍 DEBUG: Found {len(schedule_items)} schedule items")
            
            if not schedule_items:
                logger.warning(f"⚠️ No schedule items found in database!")
                return
            
            for item in schedule_items:
                item_time = item.get("time", "")
                activity = item.get("activity", "Unknown Activity")
                item_id = item.get("id", "")
                
                logger.info(f"🔍 DEBUG: Checking schedule item - time: '{item_time}', activity: '{activity}'")
                
                # Normalize time formats for comparison (handle both "07:00" and "7:00")
                item_time_normalized = item_time.strip()
                current_time_normalized = current_time.strip()
                
                # Check if this schedule matches current time
                if item_time_normalized == current_time_normalized:
                    logger.info(f"📅 Schedule notification triggered: {activity} at {current_time}")
                    
                    # Send notification via MCP chat_message tool
                    message = f"⏰ ถึงเวลา: {activity}"
                    logger.info(f"🔍 DEBUG: Sending schedule notification: '{message}'")
                    await self._send_notification(
                        message=message,
                        notification_type="schedule_notification",
                        metadata={
                            "activity": activity,
                            "time": current_time,
                            "item_id": item_id
                        }
                    )
                else:
                    logger.debug(f"🔍 DEBUG: Time mismatch - item: '{item_time_normalized}' != current: '{current_time_normalized}'")
                    
        except Exception as e:
            logger.error(f"Error checking schedule notifications: {e}", exc_info=True)
    
    async def _check_room_change(self):
        """
        Check if user changed rooms and left appliances on.
        Sends alert if user moved to new room with appliances still on in previous room.
        """
        try:
            # Get current user location
            user_info = await self.db.get_user_info()
            current_room = user_info.get("current_location", "").lower()
            
            if not current_room:
                return
            
            # Check if room changed
            if self._last_room and self._last_room != current_room:
                logger.info(f"🚶 Room change detected: {self._last_room} → {current_room}")
                
                # Check if previous room has appliances still on
                device_states = await self.db.get_all_device_states()
                previous_room_devices = device_states.get(self._last_room, {})
                
                # Find devices that are still ON (with deduplication)
                devices_on = []
                seen_devices = set()  # Track devices we've already added (case-insensitive)
                
                for device, state in previous_room_devices.items():
                    if state:  # Device is ON
                        # Create unique key for deduplication
                        device_key = device.lower()
                        
                        # Skip if we've already added this device (different case variant)
                        if device_key in seen_devices:
                            continue
                        
                        seen_devices.add(device_key)
                        devices_on.append({
                            "room": self._last_room,
                            "device": device.capitalize()  # Normalize to Title Case
                        })
                
                if devices_on:
                    # Check notification preferences
                    devices_to_notify = []
                    for device_info in devices_on:
                        room = device_info["room"]
                        device = device_info["device"]
                        
                        # Check if user set "do not notify" for this device
                        try:
                            pref = await self.db.get_notification_preference(room, device)
                            if not pref.get("do_not_notify", False):
                                devices_to_notify.append(device_info)
                        except:
                            devices_to_notify.append(device_info)
                    
                    if devices_to_notify:
                        device_names = [f"{d['device']}" for d in devices_to_notify]
                        room_display = self._last_room.capitalize()
                        
                        if len(device_names) == 1:
                            message = f"💡 คุณลืมปิด {device_names[0]} ห้อง{room_display} ต้องการให้ปิดไหม?"
                        else:
                            message = f"💡 คุณลืมปิด {', '.join(device_names)} ห้อง{room_display} ต้องการให้ปิดไหม?"
                        
                        logger.info(f"🔔 Sending room change alert: {message}")
                        
                        # Store recent_notification in app.state for YES/NO response handling
                        if self.app and hasattr(self.app, 'state'):
                            self.app.state.recent_notification = {
                                "devices": devices_to_notify,
                                "message": message,
                                "type": "room_change_alert"
                            }
                            logger.info(f"💾 Stored recent_notification in app.state: {len(devices_to_notify)} device(s)")
                            logger.info(f"💾 Recent notification devices: {devices_to_notify}")
                        
                        await self._send_notification(
                            message=message,
                            notification_type="room_change_alert",
                            metadata={
                                "devices": devices_to_notify,
                                "previous_room": self._last_room,
                                "current_room": current_room,
                                "requires_confirmation": True
                            }
                        )
            
            # Update last room
            self._last_room = current_room
            
        except Exception as e:
            logger.error(f"Error checking room change: {e}")
    
    async def _send_notification(self, message: str, notification_type: str, metadata: Optional[Dict[str, Any]] = None):
        """
        Send notification via MCP chat_message tool (same as mcp_llm-wheelsense).
        
        Args:
            message: Notification message text
            notification_type: Type of notification (schedule_notification, room_change_alert, custom)
            metadata: Optional metadata dict
        """
        try:
            logger.info(f"🔍 DEBUG: _send_notification called - type: '{notification_type}', message: '{message}'")
            if not self.mcp_router:
                logger.warning("⚠️ MCP router not available for notification")
                return
            
            # Execute chat_message tool via MCP router (same as mcp_llm-wheelsense)
            logger.info(f"🔍 DEBUG: Executing chat_message tool via MCP router...")
            tool_result = await self.mcp_router.execute({
                "tool": "chat_message",
                "arguments": {
                    "message": message
                }
            })
            logger.info(f"🔍 DEBUG: Tool result: {tool_result}")
            
            if tool_result.get("success"):
                notification_message = tool_result.get("message", message)
                logger.info(f"📤 Notification sent via MCP: {notification_type}")
                
                # Save to chat history (same pattern as other services)
                try:
                    await self.db.save_chat_message({
                        "role": "assistant",
                        "content": f"🔔 {notification_message}",
                        "is_notification": True,
                        "notification_type": notification_type,
                        "tool_result": tool_result
                    })
                    logger.info(f"✅ Notification saved to chat history: {notification_type}")
                except Exception as e:
                    logger.warning(f"Failed to save notification to chat history: {e}")
            else:
                error = tool_result.get("error", "Unknown error")
                logger.error(f"❌ Failed to send notification via MCP: {error}")
                
        except Exception as e:
            logger.error(f"Error sending notification: {e}", exc_info=True)
    
    async def send_notification(
        self, 
        message: str, 
        notification_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Public method for sending notifications (same approach as mcp_llm-wheelsense).
        Uses MCP router to execute chat_message tool and saves to database.
        No WebSocket broadcasting - messages are retrieved via chat history API.
        
        Args:
            message: Notification message text
            notification_data: Optional dict with notification metadata
                Expected keys: "type", "devices", etc.
        
        Returns:
            Dict with notification result (same format as mcp_llm-wheelsense):
            {
                "notified": bool,
                "message": str,
                "tool_result": dict (if tool was called)
            }
        """
        notification_type = (
            notification_data.get("type", "custom") 
            if notification_data 
            else "custom"
        )
        
        # Send notification via MCP router (same as mcp_llm-wheelsense)
        try:
            logger.info(f"🔍 DEBUG: send_notification called - message: '{message}', type: '{notification_type}'")
            # Execute chat_message tool via MCP router
            if not self.mcp_router:
                logger.warning("⚠️ MCP router not available for notification")
                return {
                    "notified": False,
                    "message": "",
                    "tool_result": {
                        "success": False,
                        "tool": "chat_message",
                        "message": "",
                        "error": "MCP router not available"
                    }
                }
            
            logger.info(f"🔍 DEBUG: Executing chat_message tool via MCP router...")
            tool_result = await self.mcp_router.execute({
                "tool": "chat_message",
                "arguments": {
                    "message": message
                }
            })
            logger.info(f"🔍 DEBUG: Tool result: {tool_result}")
            
            if tool_result.get("success"):
                notification_message = tool_result.get("message", message)
                logger.info(f"📤 Notification sent via MCP: {notification_type}")
                
                # Save to chat history (same pattern as other services)
                try:
                    await self.db.save_chat_message({
                        "role": "assistant",
                        "content": f"🔔 {notification_message}",
                        "is_notification": True,
                        "notification_type": notification_type,
                        "tool_result": tool_result
                    })
                    logger.debug(f"✅ Notification saved to chat history: {notification_type}")
                except Exception as e:
                    logger.warning(f"Failed to save notification to chat history: {e}")
                
                # Return success result (similar to mcp_llm-wheelsense)
                return {
                    "notified": True,
                    "message": notification_message,
                    "tool_result": tool_result
                }
            else:
                error = tool_result.get("error", "Unknown error")
                logger.error(f"Failed to send notification via MCP: {error}")
                return {
                    "notified": False,
                    "message": "",
                    "tool_result": tool_result
                }
                
        except Exception as e:
            logger.error(f"Failed to send notification: {e}", exc_info=True)
            return {
                "notified": False,
                "message": "",
                "tool_result": {
                    "success": False,
                    "tool": "chat_message",
                    "message": "",
                    "error": str(e)
                }
            }
    
    async def send_custom_notification(self, message: str, auto_popup: bool = True):
        """
        Send a custom notification.
        
        Args:
            message: Notification message
            auto_popup: Whether to auto-open the chat popup (kept for compatibility, not used in MCP approach)
        """
        await self._send_notification(
            message=message,
            notification_type="custom",
            metadata={"auto_popup": auto_popup}
        )


# Global instance
_notification_service: Optional[NotificationService] = None


def get_notification_service() -> Optional[NotificationService]:
    """Get the global notification service instance."""
    return _notification_service


async def start_notification_service(db, mcp_router, mqtt_handler=None, app=None):
    """
    Start the global notification service.
    
    Args:
        db: Database instance
        mcp_router: MCP router instance
        mqtt_handler: MQTT handler (optional)
        app: FastAPI app instance for storing recent_notification in app.state
    """
    global _notification_service
    
    if _notification_service:
        await _notification_service.stop()
    
    _notification_service = NotificationService(db, mcp_router, mqtt_handler, app)
    await _notification_service.start()
    return _notification_service


async def stop_notification_service():
    """Stop the global notification service."""
    global _notification_service
    
    if _notification_service:
        await _notification_service.stop()
        _notification_service = None
