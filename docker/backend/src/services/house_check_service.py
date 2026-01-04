"""
WheelSense Backend - House Check Service
Location-based house check to detect devices ON in other rooms.
Phase 4E: Proactive notifications when user changes location.
"""

import json
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class HouseCheckService:
    """
    Service that runs house checks when user location changes.
    Detects devices ON in rooms other than user location and sends notifications.
    """
    
    def __init__(self, db, mqtt_handler, notification_service=None):
        self.db = db
        self.mqtt_handler = mqtt_handler
        self.notification_service = notification_service
        self.last_location: Optional[str] = None
        
        # Phase 4F: Health tracking
        self.last_successful_check: Optional[datetime] = None
        self.last_error: Optional[str] = None
        self.total_checks = 0
        self.total_errors = 0
    
    async def detect_potential_issues(self, current_location: str) -> List[Dict[str, str]]:
        """
        Detect devices that are ON in rooms other than current location.
        Phase 4E: Core detection logic for house check.
        
        Args:
            current_location: Current user location (room name)
        
        Returns:
            List of potential issues: [{"room": "Bedroom", "device": "Light"}, ...]
        """
        try:
            # Get all device states from database (returns Dict[room, Dict[device, bool]])
            device_states = await self.db.get_all_device_states()
            logger.info(f"🔍 DEBUG: Device states retrieved: {device_states}")
            if not device_states:
                logger.warning(f"⚠️ No device states found in database!")
                return []
            
            # Normalize current location for comparison
            from ..core.database import normalize_room_name
            current_normalized = normalize_room_name(current_location) if current_location else ""
            logger.info(f"🔍 DEBUG: Current location normalized: '{current_location}' → '{current_normalized}'")
            
            # Filter devices that are ON and in different rooms
            potential_issues = []
            seen_devices = set()  # Track devices we've already added (case-insensitive)
            
            for room, devices in device_states.items():
                # Normalize room name for comparison
                room_normalized = normalize_room_name(room)
                
                # Skip if device is in current location
                if room_normalized == current_normalized:
                    continue
                
                # Check each device in this room
                for device_name, device_state in devices.items():
                    # Check if device is ON
                    if device_state:  # True = ON, False = OFF
                        # Create unique key for deduplication (room + device, case-insensitive)
                        device_key = f"{room_normalized}_{device_name.lower()}"
                        
                        # Skip if we've already added this device (different case variant)
                        if device_key in seen_devices:
                            continue
                        
                        seen_devices.add(device_key)
                        potential_issues.append({
                            "room": room,
                            "device": device_name.capitalize()  # Normalize device name to Title Case
                        })
            
            return potential_issues
            
        except Exception as e:
            logger.error(f"Error detecting potential issues: {e}", exc_info=True)
            return []
    
    async def run_house_check(self, previous_location: Optional[str], current_location: str) -> Optional[Dict[str, Any]]:
        """
        Run a house check when location changes.
        Phase 4E: Main entry point for house check logic.
        
        Args:
            previous_location: Previous user location (None on first detection)
            current_location: Current user location
        
        Returns:
            Notification result dict if notification was sent, None otherwise
            Format: {
                "notified": bool,
                "message": str,
                "devices": [{"room": str, "device": str}, ...]
            }
        """
        # Do NOT trigger on initial load (first detection)
        if previous_location is None:
            self.last_location = current_location
            logger.debug(f"House check: Initial location set to {current_location}, skipping check")
            return None
        
        # Only trigger on actual room change
        if previous_location == current_location:
            return None
        
        self.last_location = current_location
        
        try:
            # Step 1: Always send location change message first
            location_change_message = f"You moved to {current_location}."
            logger.info(f"💬 Sending location change message: {location_change_message}")
            
            # Send location change message directly to chat history
            try:
                await self.db.save_chat_message({
                    "role": "assistant",
                    "content": location_change_message,
                    "is_notification": False,
                    "notification_type": "location_change"
                })
                logger.info(f"💬 Saved location change message to chat_history: {location_change_message}")
            except Exception as e:
                logger.error(f"❌ Failed to save location change message: {e}", exc_info=True)
            
            # Send WebSocket notification to trigger popup chat
            try:
                if self.mqtt_handler and hasattr(self.mqtt_handler, '_broadcast_ws'):
                    await self.mqtt_handler._broadcast_ws({
                        "type": "notification",
                        "data": {
                            "type": "location_change",
                            "message": location_change_message,
                            "previous_location": previous_location,
                            "current_location": current_location,
                            "auto_popup": True,  # Trigger popup chat automatically
                            "show_in_bell_icon": False,  # Don't show in bell icon
                            "timestamp": datetime.now().isoformat()
                        }
                    })
                    logger.info(f"📤 Sent location change WebSocket notification (auto_popup=True)")
            except Exception as e:
                logger.error(f"❌ Failed to send location change WebSocket notification: {e}", exc_info=True)
            
            # Step 2: Check for devices ON in previous room
            logger.info(f"🔍 DEBUG: Running house check - previous: '{previous_location}', current: '{current_location}'")
            
            # Get devices ON in previous room specifically
            devices_in_previous_room = []
            if previous_location:
                device_states = await self.db.get_all_device_states()
                from ..core.database import normalize_room_name
                previous_normalized = normalize_room_name(previous_location)
                
                for room, devices in device_states.items():
                    room_normalized = normalize_room_name(room)
                    if room_normalized == previous_normalized:
                        # Check each device in previous room
                        for device_name, device_state in devices.items():
                            if device_state:  # True = ON
                                devices_in_previous_room.append({
                                    "room": room,
                                    "device": device_name
                                })
            
            logger.info(f"🔍 DEBUG: Devices ON in previous room ({previous_location}): {devices_in_previous_room}")
            
            # If no devices ON in previous room, we're done
            if not devices_in_previous_room:
                logger.info(f"🔍 DEBUG: House check: No devices ON in previous room")
                # Phase 4F: Record successful check
                self.last_successful_check = datetime.now()
                self.last_error = None
                self.total_checks += 1
                return {
                    "notified": True,
                    "message": location_change_message,
                    "devices": []
                }
            
            # Step 3: Ask user if they want to turn off devices in previous room
            devices_to_notify = devices_in_previous_room
            logger.info(f"🔍 DEBUG: Devices to notify: {len(devices_to_notify)} (always ask user to confirm)")
            
            # Build notification message asking user to turn off devices
            message = self._build_notification_message(devices_to_notify)
            logger.info(f"🔍 DEBUG: Notification message built: '{message}'")
            
            # Send notification directly to chat history (logic-based, no LLM needed)
            try:
                await self.db.save_chat_message({
                    "role": "assistant",
                    "content": message,
                    "is_notification": True,
                    "notification_type": "house_check_notification"
                })
                logger.info(f"💬 Saved house check notification to chat_history: {message}")
            except Exception as e:
                logger.error(f"❌ Failed to save house check notification: {e}", exc_info=True)
            
            # Send WebSocket notification to trigger popup chat (if not already open from location change)
            try:
                if self.mqtt_handler and hasattr(self.mqtt_handler, '_broadcast_ws'):
                    await self.mqtt_handler._broadcast_ws({
                        "type": "notification",
                        "data": {
                            "type": "house_check_notification",
                            "message": message,
                            "devices": devices_to_notify,
                            "auto_popup": True,  # Trigger popup chat automatically
                            "show_in_bell_icon": True,  # Also show in bell icon
                            "timestamp": datetime.now().isoformat()
                        }
                    })
                    logger.info(f"📤 Sent house check WebSocket notification (auto_popup=True)")
            except Exception as e:
                logger.error(f"❌ Failed to send house check WebSocket notification: {e}", exc_info=True)
            
            # Phase 4F: Record successful check
            self.last_successful_check = datetime.now()
            self.last_error = None
            self.total_checks += 1
            
            # Return notification result for LLM context storage
            return {
                "notified": True,
                "message": message,
                "devices": devices_to_notify
            }
            
        except Exception as e:
            # Phase 4F: Record error for health check
            self.last_error = str(e)
            self.total_checks += 1
            self.total_errors += 1
            logger.error(f"Error running house check: {e}", exc_info=True)
            return None
    
    def get_health_status(self) -> Dict[str, Any]:
        """
        Get health status of house check service.
        Phase 4F: Returns health information for monitoring.
        
        Returns:
            Dict with health status:
            {
                "healthy": bool,
                "last_successful_check": Optional[str] (ISO timestamp),
                "last_error": Optional[str],
                "total_checks": int,
                "total_errors": int,
                "error_rate": float
            }
        """
        error_rate = (self.total_errors / self.total_checks) if self.total_checks > 0 else 0.0
        healthy = error_rate < 0.5  # Healthy if error rate < 50%
        
        return {
            "healthy": healthy,
            "last_successful_check": self.last_successful_check.isoformat() if self.last_successful_check else None,
            "last_error": self.last_error,
            "total_checks": self.total_checks,
            "total_errors": self.total_errors,
            "error_rate": error_rate
        }
    
    def _build_notification_message(self, devices_to_notify: List[Dict[str, str]]) -> str:
        """
        Build notification message for devices that need attention.
        Phase 4E: Formats message based on number of devices.
        
        Args:
            devices_to_notify: List of devices that should trigger notifications
                Format: [{"room": "Bedroom", "device": "Light"}, ...]
        
        Returns:
            Notification message string
        """
        if not devices_to_notify:
            return ""
        
        # Build list of device descriptions
        device_descriptions = []
        for issue in devices_to_notify:
            room = issue["room"]
            device = issue["device"]
            device_descriptions.append(f"{room} {device}")
        
        # Format message based on number of devices
        if len(device_descriptions) == 1:
            device_desc = device_descriptions[0]
            return f"I noticed the {device_desc} is still ON. Would you like me to turn it off?"
        else:
            devices_list = ", ".join(device_descriptions[:-1]) + f", and {device_descriptions[-1]}"
            return f"I noticed these devices are still ON: {devices_list}. Would you like me to turn them off?"

