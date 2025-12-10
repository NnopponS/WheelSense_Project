"""
WheelSense Backend - Emergency Service
Handles emergency detection and alerts
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class EmergencyService:
    """Emergency detection and notification service."""
    
    EMERGENCY_TYPES = {
        "fall": {
            "name_th": "การล้ม",
            "severity": "critical",
            "auto_notify": True
        },
        "fire": {
            "name_th": "ไฟไหม้",
            "severity": "critical",
            "auto_notify": True
        },
        "prolonged_stay": {
            "name_th": "อยู่ในห้องนานผิดปกติ",
            "severity": "medium",
            "auto_notify": False
        },
        "unusual_behavior": {
            "name_th": "พฤติกรรมผิดปกติ",
            "severity": "medium",
            "auto_notify": False
        },
        "sos": {
            "name_th": "ขอความช่วยเหลือ",
            "severity": "critical",
            "auto_notify": True
        },
        "no_movement": {
            "name_th": "ไม่มีการเคลื่อนไหว",
            "severity": "high",
            "auto_notify": True
        }
    }
    
    def __init__(self, db, mqtt_handler):
        self.db = db
        self.mqtt_handler = mqtt_handler
        
        # Register MQTT callbacks
        if mqtt_handler:
            mqtt_handler.on_emergency_callback = self._handle_device_emergency
    
    async def _handle_device_emergency(self, room: str, emergency_data: Dict):
        """Handle emergency alert from device."""
        logger.warning(f"Emergency from {room}: {emergency_data}")
        
        event_type = emergency_data.get("event_type", "unknown")
        severity = emergency_data.get("severity", "medium")
        message = emergency_data.get("message", "")
        
        # Create emergency record
        await self.create_alert(
            room=room,
            event_type=event_type,
            severity=severity,
            message=message
        )
    
    async def create_alert(
        self,
        room: str,
        event_type: str,
        severity: str,
        message: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> Dict:
        """Create a new emergency alert."""
        
        # Get emergency type config
        type_config = self.EMERGENCY_TYPES.get(event_type, {})
        
        # Override severity if specified in config
        if type_config.get("severity"):
            severity = type_config["severity"]
        
        # Create alert in database
        event = await self.db.create_emergency(
            room_id=room,
            event_type=event_type,
            severity=severity,
            message=message or type_config.get("name_th", event_type),
            user_id=user_id
        )
        
        # Auto-notify if configured
        if type_config.get("auto_notify", False):
            await self._notify_emergency_contacts(event)
        
        # Log the alert
        logger.warning(
            f"Emergency created: {event_type} in {room} "
            f"(severity: {severity})"
        )
        
        return event
    
    async def resolve_alert(self, event_id: str) -> bool:
        """Resolve an emergency alert."""
        success = await self.db.resolve_emergency(event_id)
        
        if success:
            logger.info(f"Emergency {event_id} resolved")
        
        return success
    
    async def _notify_emergency_contacts(self, event: Dict):
        """Notify emergency contacts about an alert."""
        logger.info(f"Notifying contacts about emergency: {event.get('_id')}")
        
        # Get user's emergency contacts
        user_id = event.get("userId")
        if user_id:
            user = await self.db.get_user(str(user_id))
            contacts = user.get("emergencyContacts", []) if user else []
            
            for contact in contacts:
                await self._send_notification(contact, event)
        
        # Update event with notified contacts
        # (In production, would update database)
    
    async def _send_notification(self, contact: Dict, event: Dict):
        """Send notification to a contact."""
        # In production, this would:
        # - Send SMS via Twilio/other provider
        # - Send push notification
        # - Send email
        # - Make phone call for critical alerts
        
        contact_name = contact.get("name", "Unknown")
        contact_phone = contact.get("phone", "")
        event_type = event.get("eventType", "emergency")
        room = event.get("roomId", "unknown")
        
        logger.info(
            f"[NOTIFICATION] Sending {event_type} alert to {contact_name} "
            f"({contact_phone}) - Room: {room}"
        )
        
        # Placeholder for actual notification logic
        # await self._send_sms(contact_phone, message)
        # await self._send_push(contact, event)
    
    async def check_prolonged_stays(self):
        """Check for prolonged stays in rooms (called periodically)."""
        rooms = ["bathroom", "bedroom"]
        thresholds = {
            "bathroom": 30,  # 30 minutes
            "bedroom": 240   # 4 hours during day
        }
        
        for room in rooms:
            status = self.mqtt_handler.get_room_status(room)
            
            if status.get("user_in_room"):
                stay_duration = status.get("stay_duration_ms", 0) / 60000  # to minutes
                threshold = thresholds.get(room, 60)
                
                if stay_duration > threshold:
                    await self.create_alert(
                        room=room,
                        event_type="prolonged_stay",
                        severity="medium",
                        message=f"ผู้ใช้อยู่ใน{self._get_room_name_th(room)}นาน {stay_duration:.0f} นาที"
                    )
    
    async def check_no_movement(self, threshold_minutes: int = 120):
        """Check for no movement across all rooms."""
        all_rooms_empty = True
        
        for room in ["bedroom", "bathroom", "kitchen", "livingroom"]:
            status = self.mqtt_handler.get_room_status(room)
            if status.get("user_detected"):
                all_rooms_empty = False
                break
        
        if all_rooms_empty:
            # Check last detection time
            # In production, would check database for last activity
            logger.warning("No movement detected in any room")
            # Could trigger alert after threshold
    
    @staticmethod
    def _get_room_name_th(room: str) -> str:
        """Get Thai name for room."""
        names = {
            "bedroom": "ห้องนอน",
            "bathroom": "ห้องน้ำ",
            "kitchen": "ห้องครัว",
            "livingroom": "ห้องนั่งเล่น"
        }
        return names.get(room, room)

