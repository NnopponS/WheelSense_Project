"""
WheelSense Backend - MQTT Handler
Handles MQTT communication with TsimCam devices
"""

import asyncio
import base64
import json
import logging
import threading
from datetime import datetime
from typing import Any, AsyncGenerator, Callable, Dict, List, Optional, Set

import paho.mqtt.client as mqtt
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class MQTTHandler:
    """MQTT handler for device communication."""
    
    ROOMS = ["bedroom", "bathroom", "kitchen", "livingroom"]
    
    def __init__(self, broker: str, port: int, username: str = None, password: str = None):
        self.broker = broker
        self.port = port
        self.username = username
        self.password = password
        
        self.client: Optional[mqtt.Client] = None
        self.is_connected = False
        
        # Event loop for async operations
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self.loop_thread: Optional[threading.Thread] = None
        
        # Room status cache
        self.room_status: Dict[str, Dict] = {room: {} for room in self.ROOMS}
        
        # Video frame queues per room - increased size for high FPS
        self.video_frames: Dict[str, asyncio.Queue] = {
            room: asyncio.Queue(maxsize=30) for room in self.ROOMS
        }
        
        # WebSocket connections for broadcasting
        self.websockets: Set[WebSocket] = set()
        
        # Callbacks
        self.on_detection_callback: Optional[Callable] = None
        self.on_emergency_callback: Optional[Callable] = None
        self.on_status_callback: Optional[Callable] = None
        
        # Motion detection state per room (server-side detection)
        self.last_frame_hash: Dict[str, int] = {room: 0 for room in self.ROOMS}
        self.last_frame_size: Dict[str, int] = {room: 0 for room in self.ROOMS}
        self.motion_detected: Dict[str, bool] = {room: False for room in self.ROOMS}
        self.motion_threshold = 500  # Minimum byte difference to consider motion
        
        # Device IPs for HTTP video streaming (from ESP32 status)
        self.device_ips: Dict[str, str] = {room: "" for room in self.ROOMS}
        self.stream_urls: Dict[str, str] = {room: "" for room in self.ROOMS}
    
    async def connect(self):
        """Connect to MQTT broker."""
        # Get or create event loop for async operations
        try:
            self.loop = asyncio.get_event_loop()
        except RuntimeError:
            self.loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self.loop)
        
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
            
            # Subscribe to room-based topics (primary - new architecture)
            for room in self.ROOMS:
                room_topics = [
                    f"WheelSense/{room}/video",
                    f"WheelSense/{room}/status",
                    f"WheelSense/{room}/control",
                    f"WheelSense/{room}/emergency"
                ]
                for topic in room_topics:
                    client.subscribe(topic)
                    logger.info(f"Subscribed to {topic}")
            
            # Also subscribe to legacy WheelSenseMockup topics for backward compatibility
            legacy_topics = [
                "WheelSenseMockup/video",
                "WheelSenseMockup/status",
                "WheelSenseMockup/emergency"
            ]
            for topic in legacy_topics:
                client.subscribe(topic)
                logger.debug(f"Subscribed to legacy {topic}")
        else:
            logger.error(f"MQTT connection failed with code {rc}")
    
    def _on_disconnect(self, client, userdata, rc):
        """MQTT disconnection callback."""
        self.is_connected = False
        logger.warning(f"MQTT disconnected with code {rc}")
    
    def _on_message(self, client, userdata, msg):
        """MQTT message callback."""
        topic = msg.topic
        
        try:
            # Get event loop (use current if available, otherwise use stored loop)
            try:
                loop = asyncio.get_event_loop()
            except RuntimeError:
                loop = self.loop
            
            if loop is None:
                logger.error("No event loop available for async operations")
                return
            
            # Handle room-based topics: WheelSense/{room}/video, etc.
            for room in self.ROOMS:
                if topic.startswith(f"WheelSense/{room}/"):
                    if "/video" in topic:
                        asyncio.run_coroutine_threadsafe(
                            self._handle_video_mockup(room, msg.payload), loop
                        )
                    elif "/status" in topic:
                        asyncio.run_coroutine_threadsafe(
                            self._handle_status_mockup(room, msg.payload), loop
                        )
                    elif "/emergency" in topic:
                        asyncio.run_coroutine_threadsafe(
                            self._handle_emergency(room, msg.payload), loop
                        )
                    return  # Found matching room, exit
            
            # Handle legacy WheelSenseMockup topics (backward compatibility)
            if topic.startswith("WheelSenseMockup/"):
                room = "livingroom"  # Default room for legacy topics
                
                if "/video" in topic:
                    asyncio.run_coroutine_threadsafe(
                        self._handle_video_mockup(room, msg.payload), loop
                    )
                elif "/status" in topic:
                    asyncio.run_coroutine_threadsafe(
                        self._handle_status_mockup(room, msg.payload), loop
                    )
                elif "/emergency" in topic:
                    asyncio.run_coroutine_threadsafe(
                        self._handle_emergency(room, msg.payload), loop
                    )
                    
        except Exception as e:
            logger.error(f"Error handling MQTT message: {e}", exc_info=True)
    
    async def _handle_video_mockup(self, room: str, payload: bytes):
        """Handle video frame from WheelSenseMockup device (ESP32)."""
        try:
            # ESP32 sends metadata JSON + base64 frame separated by newline
            # Find first newline to split metadata and frame
            newline_pos = payload.find(b"\n")
            if newline_pos == -1:
                logger.warning("Invalid video message format: no newline found")
                return
            
            # Parse metadata (only up to newline)
            meta_json = payload[:newline_pos].decode("utf-8").strip()
            try:
                meta = json.loads(meta_json)
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse metadata JSON: {e}, content: {meta_json[:200]}")
                return
            
            # Get base64 frame (after newline)
            frame_b64 = payload[newline_pos + 1:]
            
            # Extract room from metadata - support both old and new format
            room = meta.get("room") or meta.get("r") or room
            if room not in self.ROOMS:
                room = "livingroom"  # Default fallback
            
            frame_bytes = base64.b64decode(frame_b64)
            current_size = len(frame_bytes)
            
            # Server-side motion detection
            # Compare current frame size with last frame
            # JPEG size varies significantly with content changes
            last_size = self.last_frame_size.get(room, 0)
            size_diff = abs(current_size - last_size)
            
            # Detect motion if frame size changed significantly
            motion_detected = size_diff > self.motion_threshold and last_size > 0
            self.motion_detected[room] = motion_detected
            self.last_frame_size[room] = current_size
            
            # Update room status with motion detection result
            if room not in self.room_status:
                self.room_status[room] = {}
            self.room_status[room]["user_detected"] = motion_detected
            self.room_status[room]["last_frame_time"] = datetime.now().isoformat()
            self.room_status[room]["motion_diff"] = size_diff
            
            # Publish detection result back to ESP32 (optional feedback)
            if self.client and self.is_connected:
                detection_topic = f"WheelSense/{room}/detection"
                detection_msg = json.dumps({
                    "motion_detected": motion_detected,
                    "room": room,
                    "diff": size_diff,
                    "timestamp": datetime.now().isoformat()
                })
                self.client.publish(detection_topic, detection_msg)
            
            # Put frame in queue (non-blocking) - optimized for high FPS
            try:
                self.video_frames[room].put_nowait(frame_bytes)
            except asyncio.QueueFull:
                # Drop oldest frames when queue is full to keep up with real-time
                dropped = 0
                while not self.video_frames[room].empty() and dropped < 5:
                    try:
                        self.video_frames[room].get_nowait()
                        dropped += 1
                    except asyncio.QueueEmpty:
                        break
                try:
                    self.video_frames[room].put_nowait(frame_bytes)
                except asyncio.QueueFull:
                    pass
            
        except Exception as e:
            logger.error(f"❌ Error handling video_mockup: {e}", exc_info=True)
    
    async def _handle_video(self, room: str, payload: bytes):
        """Handle video frame from device (legacy format)."""
        try:
            # Parse metadata and frame
            parts = payload.split(b"\n", 1)
            if len(parts) != 2:
                return
            
            meta = json.loads(parts[0].decode("utf-8"))
            frame_b64 = parts[1]
            frame_bytes = base64.b64decode(frame_b64)
            
            # Update room status
            self.room_status[room]["user_detected"] = meta.get("user_detected", False)
            self.room_status[room]["last_frame_time"] = datetime.now().isoformat()
            
            # Put frame in queue (non-blocking)
            try:
                self.video_frames[room].put_nowait(frame_bytes)
            except asyncio.QueueFull:
                # Remove old frame and add new one
                try:
                    self.video_frames[room].get_nowait()
                except asyncio.QueueEmpty:
                    pass
                self.video_frames[room].put_nowait(frame_bytes)
            
            # Broadcast to WebSocket clients
            await self._broadcast_ws({
                "type": "video_frame",
                "room": room,
                "metadata": meta
            })
            
        except Exception as e:
            logger.error(f"Error handling video: {e}")
    
    async def _handle_status_mockup(self, room: str, payload: bytes):
        """Handle status update from WheelSenseMockup device (ESP32)."""
        try:
            status = json.loads(payload.decode("utf-8"))
            
            # Extract room from status
            room = status.get("room", room)
            if room not in self.ROOMS:
                room = "livingroom"  # Default fallback
            
            # Extract and store device IP for HTTP video streaming
            if "ip_address" in status:
                self.device_ips[room] = status["ip_address"]
                logger.info(f"📡 Device IP for {room}: {status['ip_address']}")
            if "stream_url" in status:
                self.stream_urls[room] = status["stream_url"]
                logger.info(f"📹 Stream URL for {room}: {status['stream_url']}")
            
            # Update room status
            if room not in self.room_status:
                self.room_status[room] = {}
            self.room_status[room] = {
                **self.room_status.get(room, {}),
                **status,
                "last_update": datetime.now().isoformat()
            }
            
            # Broadcast to WebSocket clients
            await self._broadcast_ws({
                "type": "status_update",
                "room": room,
                "status": status
            })
            
            # Call callback if set
            if self.on_status_callback:
                await self.on_status_callback(room, status)
                
        except Exception as e:
            logger.error(f"Error handling status_mockup: {e}", exc_info=True)
    
    async def _handle_status(self, room: str, payload: bytes):
        """Handle status update from device (legacy format)."""
        try:
            status = json.loads(payload.decode("utf-8"))
            self.room_status[room] = {
                **self.room_status.get(room, {}),
                **status,
                "last_update": datetime.now().isoformat()
            }
            
            # Broadcast to WebSocket clients
            await self._broadcast_ws({
                "type": "status_update",
                "room": room,
                "status": status
            })
            
            # Call callback if set
            if self.on_status_callback:
                await self.on_status_callback(room, status)
                
        except Exception as e:
            logger.error(f"Error handling status: {e}")
    
    async def _handle_detection(self, room: str, payload: bytes):
        """Handle detection event from device."""
        try:
            detection = json.loads(payload.decode("utf-8"))
            
            # Broadcast to WebSocket clients
            await self._broadcast_ws({
                "type": "detection",
                "room": room,
                "detection": detection
            })
            
            # Call callback if set
            if self.on_detection_callback:
                await self.on_detection_callback(room, detection)
                
        except Exception as e:
            logger.error(f"Error handling detection: {e}")
    
    async def _handle_emergency(self, room: str, payload: bytes):
        """Handle emergency alert from device."""
        try:
            emergency = json.loads(payload.decode("utf-8"))
            logger.warning(f"EMERGENCY from {room}: {emergency}")
            
            # Broadcast to WebSocket clients
            await self._broadcast_ws({
                "type": "emergency",
                "room": room,
                "emergency": emergency
            })
            
            # Call callback if set
            if self.on_emergency_callback:
                await self.on_emergency_callback(room, emergency)
                
        except Exception as e:
            logger.error(f"Error handling emergency: {e}")
    
    async def _broadcast_ws(self, message: Dict):
        """Broadcast message to all WebSocket clients."""
        if not self.websockets:
            return
        
        message_json = json.dumps(message)
        disconnected = set()
        
        for ws in self.websockets:
            try:
                await ws.send_text(message_json)
            except Exception:
                disconnected.add(ws)
        
        # Remove disconnected clients
        self.websockets -= disconnected
    
    # ==================== Public Methods ====================
    
    def get_room_status(self, room: str) -> Dict:
        """Get current status of a room."""
        return self.room_status.get(room, {})
    
    def get_stream_url(self, room: str) -> str:
        """Get HTTP stream URL for a room's camera."""
        return self.stream_urls.get(room, "")
    
    def get_device_ip(self, room: str) -> str:
        """Get device IP address for a room."""
        return self.device_ips.get(room, "")
    
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
            "room_name_th": self._get_room_name_th(current_room) if current_room else None,
            "timestamp": datetime.now().isoformat(),
            "all_rooms": {
                room: self.room_status.get(room, {}).get("user_detected", False)
                for room in self.ROOMS
            }
        }
    
    async def send_control_command(
        self,
        room: str,
        appliance: str,
        state: bool,
        value: Optional[int] = None
    ) -> bool:
        """Send control command to a device."""
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
            logger.error(f"Failed to send control command: {e}")
            return False
    
    async def get_video_stream(self, room: str) -> AsyncGenerator[bytes, None]:
        """Get video stream generator for a room."""
        # Minimal valid JPEG placeholder (1x1 pixel)
        # This is a valid minimal JPEG that browsers can display
        placeholder_jpeg = bytes([
            0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
            0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
            0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
            0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20,
            0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27,
            0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x00, 0x01,
            0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xFF, 0xC4, 0x00, 0x14,
            0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x08, 0xFF, 0xC4, 0x00, 0x14, 0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00,
            0x3F, 0x00, 0xAA, 0xFF, 0xD9
        ])
        
        while True:
            try:
                frame = await asyncio.wait_for(
                    self.video_frames[room].get(),
                    timeout=0.1  # Reduced timeout for faster response
                )
                yield frame
            except asyncio.TimeoutError:
                # Send placeholder frame if no video
                yield placeholder_jpeg
            except Exception:
                yield placeholder_jpeg
    
    def add_websocket(self, ws: WebSocket):
        """Add WebSocket client."""
        self.websockets.add(ws)
        logger.info(f"WebSocket client added. Total: {len(self.websockets)}")
    
    def remove_websocket(self, ws: WebSocket):
        """Remove WebSocket client."""
        self.websockets.discard(ws)
        logger.info(f"WebSocket client removed. Total: {len(self.websockets)}")
    
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

