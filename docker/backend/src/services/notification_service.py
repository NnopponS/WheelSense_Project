"""
Notification Service - Background task for schedule notifications and room change alerts.
Handles:
1. Schedule-based notifications (trigger at scheduled time)
2. Room change alerts (forgot to turn off appliances)
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
import json

logger = logging.getLogger(__name__)


class NotificationService:
    """Background service for automated notifications."""
    
    def __init__(self, db, ws_manager, mqtt_handler=None):
        """
        Initialize notification service.
        
        Args:
            db: Database instance
            ws_manager: WebSocket manager for broadcasting notifications
            mqtt_handler: MQTT handler for device control (optional)
        """
        self.db = db
        self.ws_manager = ws_manager
        self.mqtt_handler = mqtt_handler
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
        
        # Only check schedule once per minute
        if current_minute != self._last_check_minute:
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
            # Get schedule items
            schedule_items = await self.db.get_schedule_items()
            
            for item in schedule_items:
                item_time = item.get("time", "")
                activity = item.get("activity", "Unknown Activity")
                item_id = item.get("id", "")
                
                # Check if this schedule matches current time
                if item_time == current_time:
                    logger.info(f"📅 Schedule notification triggered: {activity} at {current_time}")
                    
                    # Send notification to frontend
                    await self._send_notification({
                        "type": "schedule_notification",
                        "activity": activity,
                        "time": current_time,
                        "message": f"⏰ ถึงเวลา: {activity}",
                        "auto_popup": True,
                        "item_id": item_id
                    })
                    
        except Exception as e:
            logger.error(f"Error checking schedule notifications: {e}")
    
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
                
                # Find devices that are still ON
                devices_on = [
                    {"room": self._last_room, "device": device}
                    for device, state in previous_room_devices.items()
                    if state
                ]
                
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
                        
                        await self._send_notification({
                            "type": "room_change_alert",
                            "message": message,
                            "devices": devices_to_notify,
                            "previous_room": self._last_room,
                            "current_room": current_room,
                            "auto_popup": True,
                            "requires_confirmation": True
                        })
            
            # Update last room
            self._last_room = current_room
            
        except Exception as e:
            logger.error(f"Error checking room change: {e}")
    
    async def _send_notification(self, notification: Dict[str, Any]):
        """
        Send notification to frontend via WebSocket.
        
        Args:
            notification: Notification data dict
        """
        try:
            notification["timestamp"] = datetime.now().isoformat()
            
            if self.ws_manager:
                await self.ws_manager.broadcast({
                    "type": "notification",
                    "data": notification
                })
                logger.info(f"📤 Notification sent: {notification.get('type')}")
            else:
                logger.warning("WebSocket manager not available for notification")
                
        except Exception as e:
            logger.error(f"Error sending notification: {e}")
    
    async def send_custom_notification(self, message: str, auto_popup: bool = True):
        """
        Send a custom notification to the frontend.
        
        Args:
            message: Notification message
            auto_popup: Whether to auto-open the chat popup
        """
        await self._send_notification({
            "type": "custom",
            "message": message,
            "auto_popup": auto_popup
        })


# Global instance
_notification_service: Optional[NotificationService] = None


def get_notification_service() -> Optional[NotificationService]:
    """Get the global notification service instance."""
    return _notification_service


async def start_notification_service(db, ws_manager, mqtt_handler=None):
    """
    Start the global notification service.
    
    Args:
        db: Database instance
        ws_manager: WebSocket manager
        mqtt_handler: MQTT handler (optional)
    """
    global _notification_service
    
    if _notification_service:
        await _notification_service.stop()
    
    _notification_service = NotificationService(db, ws_manager, mqtt_handler)
    await _notification_service.start()
    return _notification_service


async def stop_notification_service():
    """Stop the global notification service."""
    global _notification_service
    
    if _notification_service:
        await _notification_service.stop()
        _notification_service = None
