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
    
    def __init__(self, db, mqtt_handler):
        self.db = db
        self.mqtt_handler = mqtt_handler
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
            if not device_states:
                return []
            
            # Normalize current location for comparison
            from ..core.database import normalize_room_name
            current_normalized = normalize_room_name(current_location) if current_location else ""
            
            # Filter devices that are ON and in different rooms
            potential_issues = []
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
                        potential_issues.append({
                            "room": room,
                            "device": device_name
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
            # Detect potential issues
            potential_issues = self.detect_potential_issues(current_location)
            
            if not potential_issues:
                logger.debug(f"House check: No devices ON in other rooms")
                return None
            
            # Get notification preferences
            notification_prefs = await self.db.get_notification_preferences()
            
            # Filter out devices in notification preferences
            devices_to_notify = []
            for issue in potential_issues:
                room = issue["room"]
                device = issue["device"]
                device_key = f"{room} {device}"
                
                # Check if this device is in notification preferences
                if device_key not in notification_prefs:
                    devices_to_notify.append(issue)
            
            # If no devices need notification (all are in preferences), return None
            if not devices_to_notify:
                logger.debug(f"House check: Devices detected but all are in notification_preferences - skipping notification")
                return None
            
            # Build notification message
            message = self._build_notification_message(devices_to_notify)
            
            # Broadcast via WebSocket (no database save - matches mcp_llm-wheelsense)
            try:
                await self.mqtt_handler._broadcast_ws({
                    "type": "house_check_notification",
                    "message": message,
                    "devices": devices_to_notify,
                    "timestamp": datetime.now().isoformat()
                })
                logger.info(f"Sent house check notification: {message}")
            except Exception as e:
                logger.error(f"Failed to broadcast house check notification: {e}")
            
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

