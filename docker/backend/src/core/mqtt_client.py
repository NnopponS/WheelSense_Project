"""
WheelSense MCP Server - MQTT Client
MQTT client for device communication
"""

import json
import logging
from datetime import datetime
from typing import Dict, Optional

import paho.mqtt.client as mqtt

logger = logging.getLogger(__name__)


class MQTTClient:
    """MQTT client for smart home device communication."""
    
    ROOMS = ["bedroom", "bathroom", "kitchen", "livingroom"]
    
    def __init__(self, broker: str, port: int, username: str = None, password: str = None):
        self.broker = broker
        self.port = port
        self.username = username
        self.password = password
        
        self.client: Optional[mqtt.Client] = None
        self.is_connected = False
        
        # Room status cache
        self.room_status: Dict[str, Dict] = {room: {} for room in self.ROOMS}
    
    async def connect(self):
        """Connect to MQTT broker."""
        self.client = mqtt.Client()
        
        if self.username and self.password:
            self.client.username_pw_set(self.username, self.password)
        
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message
        self.client.on_disconnect = self._on_disconnect
        
        try:
            self.client.connect(self.broker, self.port, keepalive=60)
            self.client.loop_start()
            self.is_connected = True
            logger.info(f"MQTT connected to {self.broker}:{self.port}")
        except Exception as e:
            logger.error(f"MQTT connection failed: {e}")
            raise
    
    async def disconnect(self):
        """Disconnect from MQTT broker."""
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
            self.is_connected = False
            logger.info("MQTT disconnected")
    
    def _on_connect(self, client, userdata, flags, rc):
        """MQTT connection callback."""
        if rc == 0:
            logger.info("MQTT connected successfully")
            
            # Subscribe to WheelSenseMockup topics (from ESP32)
            topics = [
                "WheelSenseMockup/video",
                "WheelSenseMockup/status",
                "WheelSenseMockup/detection",
                "WheelSenseMockup/emergency"
            ]
            for topic in topics:
                client.subscribe(topic)
                logger.info(f"Subscribed to {topic}")
            
            # Subscribe to legacy room-based status topics
            for room in self.ROOMS:
                client.subscribe(f"WheelSense/{room}/status")
                logger.debug(f"Subscribed to WheelSense/{room}/status")
        else:
            logger.error(f"MQTT connection failed with code {rc}")
    
    def _on_disconnect(self, client, userdata, rc):
        """MQTT disconnection callback."""
        self.is_connected = False
        logger.warning(f"MQTT disconnected with code {rc}")
    
    def _on_message(self, client, userdata, msg):
        """MQTT message callback."""
        try:
            topic = msg.topic
            
            # Handle WheelSenseMockup topics (from ESP32)
            if topic.startswith("WheelSenseMockup/"):
                if "/status" in topic:
                    status = json.loads(msg.payload.decode("utf-8"))
                    room = status.get("room", "livingroom")
                    if room not in self.ROOMS:
                        room = "livingroom"  # Default fallback
                    self.room_status[room] = {
                        **status,
                        "last_update": datetime.now().isoformat()
                    }
                    logger.info(f"Updated status for {room} from WheelSenseMockup")
                elif "/detection" in topic:
                    detection = json.loads(msg.payload.decode("utf-8"))
                    room = detection.get("room", "livingroom")
                    if room not in self.ROOMS:
                        room = "livingroom"
                    self.room_status[room]["user_detected"] = detection.get("detected", False)
                    self.room_status[room]["last_detection"] = datetime.now().isoformat()
                    logger.info(f"Updated detection for {room}: {detection.get('detected', False)}")
                return
            
            # Handle legacy WheelSense/{room}/ topics
            for room in self.ROOMS:
                if f"WheelSense/{room}/status" in topic:
                    status = json.loads(msg.payload.decode("utf-8"))
                    self.room_status[room] = {
                        **status,
                        "last_update": datetime.now().isoformat()
                    }
                    break
        except Exception as e:
            logger.error(f"Error handling MQTT message: {e}")
    
    async def send_control(
        self,
        room: str,
        appliance: str,
        state: bool,
        value: Optional[int] = None
    ) -> bool:
        """Send control command to device."""
        if not self.client or not self.is_connected:
            logger.error("MQTT not connected")
            return False
        
        topic = f"WheelSense/{room}/control"
        command = {
            "appliance": appliance,
            "state": state,
            "timestamp": datetime.now().isoformat()
        }
        
        if value is not None:
            command["value"] = value
        
        try:
            self.client.publish(topic, json.dumps(command))
            logger.info(f"Sent control to {room}: {appliance}={state}")
            return True
        except Exception as e:
            logger.error(f"Failed to send control: {e}")
            return False
    
    async def publish_emergency(
        self,
        room: str,
        event_type: str,
        message: str = ""
    ):
        """Publish emergency alert."""
        if not self.client:
            return
        
        topic = f"WheelSense/{room}/emergency"
        alert = {
            "event_type": event_type,
            "room": room,
            "message": message,
            "severity": "critical" if event_type in ["fall", "fire", "sos"] else "medium",
            "timestamp": datetime.now().isoformat()
        }
        
        try:
            self.client.publish(topic, json.dumps(alert))
            logger.warning(f"Published emergency: {event_type} in {room}")
        except Exception as e:
            logger.error(f"Failed to publish emergency: {e}")
    
    def get_room_status(self, room: str) -> Dict:
        """Get cached room status."""
        return self.room_status.get(room, {})
    
    def get_all_room_status(self) -> Dict:
        """Get status of all rooms."""
        return {
            "rooms": self.room_status,
            "timestamp": datetime.now().isoformat()
        }
    
    def get_user_location(self) -> Dict:
        """Get current user location based on detection."""
        current_room = None
        
        for room in self.ROOMS:
            status = self.room_status.get(room, {})
            if status.get("user_detected", False):
                current_room = room
                break
        
        return {
            "current_room": current_room,
            "room_name": self._get_room_en(current_room) if current_room else None,
            "timestamp": datetime.now().isoformat(),
            "all_rooms": {
                room: self.room_status.get(room, {}).get("user_detected", False)
                for room in self.ROOMS
            }
        }
    
    @staticmethod
    def _get_room_en(room: str) -> str:
        """Get English room name."""
        names = {
            "bedroom": "Bedroom",
            "bathroom": "Bathroom",
            "kitchen": "Kitchen",
            "livingroom": "Living Room"
        }
        return names.get(room, room)

