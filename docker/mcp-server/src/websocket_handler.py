"""
WheelSense Backend - WebSocket Handler for Camera Streaming
Receives video frames from ESP32 cameras via WebSocket and forwards to dashboard clients
Also forwards frames to MQTT for camera-service detection
"""

import asyncio
import base64
import json
import logging
import time
from datetime import datetime
from typing import Dict, Set, Optional
from collections import defaultdict
import cv2
import numpy as np

import websockets
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


class WebSocketStreamHandler:
    """Handles WebSocket connections for camera streaming and appliance control."""
    
    def __init__(self):
        # ESP32 camera connections (device_id -> websocket)
        self.camera_connections: Dict[str, websockets.WebSocketServerProtocol] = {}
        
        # ESP8266 appliance controller connections (device_id -> websocket)
        self.appliance_connections: Dict[str, websockets.WebSocketServerProtocol] = {}
        
        # Camera-service connection (for detection) - can be either FastAPI WebSocket or websockets library
        self.camera_service_connection: Optional[object] = None
        
        # Dashboard client connections (room -> set of websockets)
        self.dashboard_clients: Dict[str, Set[WebSocket]] = defaultdict(set)
        
        # Latest frame buffer per room (for new clients)
        self.latest_frames: Dict[str, bytes] = {}
        
        # Room mapping from device_id
        self.device_rooms: Dict[str, str] = {}
        
        # Appliance room mapping (device_id -> room)
        self.appliance_rooms: Dict[str, str] = {}
        
        # Time-based throttling for camera-service forwarding (room -> last_forward_timestamp)
        self.last_forward_time: Dict[str, float] = {}
        
        # Device rotation cache (device_id -> rotation_degrees: 0, 90, 180, 270)
        self.device_rotations: Dict[str, int] = {}
        
        # Connection activity tracking for cleanup (device_id -> last_activity_timestamp)
        self.connection_last_activity: Dict[str, float] = {}
        
        # MQTT handler reference (set from main.py)
        self.mqtt_handler: Optional[object] = None
        
        # Database reference (set from main.py)
        self.db: Optional[object] = None
        
        # Device status tracking for Dashboard
        # device_id -> {type, room, ip, rssi, frames_sent, uptime, last_seen, online}
        self.device_status: Dict[str, dict] = {}
        
        # Frame counters for debugging (room -> frame_count)
        self.frame_counters: Dict[str, int] = defaultdict(int)
        
        # === Auto-detection processing (replaces detection-test page) ===
        # Confidence threshold (80%)
        self.detection_confidence_threshold: float = 0.80
        # Throttle interval in seconds (2 seconds)
        self.detection_throttle_seconds: float = 2.0
        # Last notify time for throttling
        self.last_detection_notify_time: float = 0.0
        # Last detected room (for tracking room changes)
        self.last_detected_room: Optional[str] = None
        # All known rooms for sending false notifications
        self.known_rooms: Set[str] = {"bedroom", "bathroom", "kitchen", "livingroom"}
        
    def get_all_device_status(self) -> list:
        """Get status of all connected devices for Dashboard."""
        now = datetime.now()
        devices = []
        
        for device_id, status in self.device_status.items():
            # Check if device is still connected
            last_seen = status.get("last_seen", now)
            if isinstance(last_seen, str):
                try:
                    last_seen = datetime.fromisoformat(last_seen)
                except:
                    last_seen = now
            
            # Device is online if seen within last 30 seconds
            time_diff = (now - last_seen).total_seconds()
            online = time_diff < 30
            
            devices.append({
                "device_id": device_id,
                "type": status.get("type", "camera"),
                "room": status.get("room", "unknown"),
                "ip": status.get("ip", ""),
                "rssi": status.get("rssi", 0),
                "frames_sent": status.get("frames_sent", 0),
                "uptime": status.get("uptime", 0),
                "online": online,
                "rotation": self.device_rotations.get(device_id, 0),
                "last_seen": last_seen.isoformat() if hasattr(last_seen, 'isoformat') else str(last_seen)
            })
        
        return devices
        
        
    async def handle_camera_connection(self, websocket: websockets.WebSocketServerProtocol, path: str):
        """Handle incoming WebSocket connection from ESP32 camera, ESP8266 appliance controller, or camera-service."""
        # Check if this is camera-service connection
        if path and "/camera-service" in path:
            await self._handle_camera_service_connection(websocket)
            return
        
        # Otherwise, handle ESP32 camera or ESP8266 appliance controller connection
        device_id = None
        room = None
        device_type = "camera"  # Default to camera
        
        try:
            # Wait for initial connection message (text or binary)
            try:
                message = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                if isinstance(message, str):
                    try:
                        data = json.loads(message)
                        device_id = data.get("device_id") or data.get("deviceId")
                        room = data.get("room") or data.get("r")
                        device_type = data.get("device_type", "camera")
                        
                        if device_id and room:
                            if device_type == "appliance_controller":
                                # Handle ESP8266 appliance controller
                                self.appliance_connections[device_id] = websocket
                                self.appliance_rooms[device_id] = room
                                logger.info(f"🔌 Appliance controller connected: {device_id} ({room})")
                                
                                # Send confirmation
                                await websocket.send(json.dumps({
                                    "type": "connected",
                                    "status": "ok",
                                    "device_id": device_id,
                                    "device_type": "appliance_controller",
                                    "room": room
                                }))
                                
                                # Handle appliance controller messages
                                await self._handle_appliance_controller(websocket, device_id, room)
                                return
                            else:
                                # Handle ESP32 camera
                                self.camera_connections[device_id] = websocket
                                self.device_rooms[device_id] = room
                                logger.info(f"📹 Camera connected: {device_id} ({room})")
                                
                                # Send confirmation
                                await websocket.send(json.dumps({
                                    "type": "connected",
                                    "status": "ok",
                                    "device_id": device_id,
                                    "room": room
                                }))
                        else:
                            logger.warning(f"Invalid connection message: {message}")
                            # Try to use defaults
                            device_id = device_id or "UNKNOWN"
                            room = room or "livingroom"
                            self.camera_connections[device_id] = websocket
                            self.device_rooms[device_id] = room
                            logger.info(f"📹 Camera connected (partial info): {device_id} ({room})")
                    except json.JSONDecodeError:
                        logger.warning(f"Invalid JSON from camera: {message}")
                        # Use defaults
                        device_id = "UNKNOWN"
                        room = "livingroom"
                        self.camera_connections[device_id] = websocket
                        self.device_rooms[device_id] = room
                        logger.info(f"📹 Camera connected (default): {device_id} ({room})")
                elif isinstance(message, bytes):
                    # First message is binary (JPEG frame) - use defaults
                    device_id = "UNKNOWN"
                    room = "livingroom"
                    self.camera_connections[device_id] = websocket
                    self.device_rooms[device_id] = room
                    logger.info(f"📹 Camera connected (binary first): {device_id} ({room})")
                    
                    # Process this first frame
                    self.latest_frames[room] = message
                    await self._broadcast_to_dashboard(room, message)
            except asyncio.TimeoutError:
                logger.warning("Camera connection timeout - no initial message, using defaults")
                device_id = "UNKNOWN"
                room = "livingroom"
                self.camera_connections[device_id] = websocket
                self.device_rooms[device_id] = room
                logger.info(f"📹 Camera connected (timeout): {device_id} ({room})")
            
            # Listen for video frames with frame buffering
            # Increased queue size from 1 to 10 to prevent ESP32 buffer overflow
            # This allows server to absorb burst traffic without dropping frames
            frame_queue = asyncio.Queue(maxsize=10)  # Buffer up to 10 frames (~0.6s at 15 FPS)
            
            async def frame_reader():
                """Read frames from camera and put in queue (drop old frames)."""
                nonlocal device_id, room
                try:
                    async for message in websocket:
                        if isinstance(message, bytes):
                            # Put frame in queue, drop old frame if queue is full
                            try:
                                frame_queue.put_nowait(message)
                            except asyncio.QueueFull:
                                # Drop oldest frame and add new one
                                try:
                                    frame_queue.get_nowait()
                                    frame_queue.put_nowait(message)
                                except:
                                    pass
                        elif isinstance(message, str):
                            # Text message = status/metadata
                            try:
                                data = json.loads(message)
                                msg_type = data.get("type", "")
                                
                                if msg_type == "status":
                                    # Update device status for Dashboard tracking
                                    self.device_status[device_id] = {
                                        "type": data.get("device_type", "camera"),
                                        "room": data.get("room", room),
                                        "ip": data.get("ip_address", ""),
                                        "rssi": data.get("rssi", 0),
                                        "frames_sent": data.get("frames_sent", 0),
                                        "uptime": data.get("uptime_seconds", 0),
                                        "last_seen": datetime.now(),
                                        "target_fps": data.get("target_fps", 30)
                                    }
                                    logger.debug(f"Status from {device_id}: online, fps={data.get('target_fps', 30)}")
                                    
                                    # Persist status to database
                                    if self.db:
                                        asyncio.create_task(self.db.update_device_status(device_id, self.device_status[device_id]))
                                elif msg_type == "frame_info":
                                    # Frame metadata
                                    logger.debug(f"Frame info from {device_id}: {data}")
                                elif msg_type == "connected":
                                    # Update device info if received after connection
                                    new_device_id = data.get("device_id") or data.get("deviceId")
                                    new_room = data.get("room") or data.get("r")
                                    if new_device_id and new_device_id != device_id:
                                        # Update device mapping
                                        if device_id in self.camera_connections:
                                            self.camera_connections.pop(device_id)
                                        device_id = new_device_id
                                        self.camera_connections[device_id] = websocket
                                    if new_room and new_room != room:
                                        if device_id in self.device_rooms:
                                            old_room = self.device_rooms[device_id]
                                            # Move frames if room changed
                                            if old_room in self.latest_frames:
                                                self.latest_frames[new_room] = self.latest_frames.pop(old_room, None)
                                        room = new_room
                                        self.device_rooms[device_id] = room
                                        logger.info(f"📹 Camera {device_id} room updated to {room}")
                            except json.JSONDecodeError:
                                logger.warning(f"Invalid JSON from camera {device_id}: {message}")
                except asyncio.CancelledError:
                    pass
            
            async def frame_processor():
                """Process frames from queue and broadcast."""
                try:
                    while True:
                        try:
                            frame = await asyncio.wait_for(frame_queue.get(), timeout=1.0)
                            if room:
                                # PERFORMANCE FIX: Removed all synchronous validation
                                # Validation was blocking the async event loop causing FPS degradation
                                # Dashboard and camera-service will handle invalid frames gracefully
                                
                                # Store latest frame (original, unrotated)
                                self.latest_frames[room] = frame
                                
                                # Broadcast to all dashboard clients (non-blocking)
                                asyncio.create_task(self._broadcast_to_dashboard(room, frame))
                                
                                # Forward to camera-service via WebSocket (throttled)
                                asyncio.create_task(self._forward_to_camera_service(room, frame, device_id))
                        except asyncio.TimeoutError:
                            continue
                except asyncio.CancelledError:
                    pass
            
            # Run frame reader and processor concurrently
            reader_task = asyncio.create_task(frame_reader())
            processor_task = asyncio.create_task(frame_processor())
            
            try:
                await asyncio.gather(reader_task, processor_task, return_exceptions=True)
            finally:
                reader_task.cancel()
                processor_task.cancel()
                        
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"📹 Camera disconnected: {device_id} ({room})")
        except Exception as e:
            logger.error(f"Error handling camera connection: {e}", exc_info=True)
        finally:
            # Cleanup
            if device_id:
                self.camera_connections.pop(device_id, None)
                if room:
                    # Clear latest frame if no cameras for this room
                    if not any(r == room for r in self.device_rooms.values()):
                        self.latest_frames.pop(room, None)
    
    async def _apply_rotation_if_needed(self, frame_bytes: bytes, device_id: str) -> bytes:
        """Apply rotation to frame if device has rotation set.
        
        ⚠️ DEPRECATED: This method is no longer used in the main frame processing pipeline
        due to severe performance issues. It was causing FPS to drop from 15 to 1-5 FPS
        because the synchronous JPEG decode/rotate/encode operations blocked the async event loop.
        
        Kept for reference and potential future use with proper async handling (thread pool executor).
        
        Dashboard now shows original frames. Camera-service handles rotation before detection.
        """
        try:
            # Validate JPEG frame first
            if len(frame_bytes) < 2 or frame_bytes[0:2] != b'\xff\xd8':
                logger.warning(f"⚠️ Invalid JPEG frame for device {device_id} (missing JPEG header)")
                return frame_bytes
            
            if len(frame_bytes) < 100:  # Too small
                logger.warning(f"⚠️ Frame too small for device {device_id} ({len(frame_bytes)} bytes)")
                return frame_bytes
            
            # Get rotation from cache
            rotation = self.device_rotations.get(device_id, 0)
            
            # If not in cache, try to load from database
            if not rotation and self.db:
                try:
                    device_doc = await self.db.db.devices.find_one({
                        "$or": [{"id": device_id}, {"deviceId": device_id}]
                    })
                    if device_doc:
                        rotation = device_doc.get("rotation", 0)
                        self.device_rotations[device_id] = rotation
                        if rotation:
                            logger.info(f"Loaded rotation {rotation}° for device {device_id} from database")
                except Exception as e:
                    logger.debug(f"Could not get rotation for device {device_id}: {e}")
            
            if not rotation or rotation == 0:
                return frame_bytes
            
            # Decode JPEG with error handling
            frame_array = np.frombuffer(frame_bytes, dtype=np.uint8)
            frame = cv2.imdecode(frame_array, cv2.IMREAD_COLOR)
            
            if frame is None:
                logger.warning(f"⚠️ Failed to decode JPEG for device {device_id} (corrupt frame)")
                return frame_bytes
            
            # Apply rotation
            if rotation == 90:
                frame = cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
            elif rotation == 180:
                frame = cv2.rotate(frame, cv2.ROTATE_180)
            elif rotation == 270:
                frame = cv2.rotate(frame, cv2.ROTATE_90_COUNTERCLOCKWISE)
            
            # Encode back to JPEG
            success, encoded = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if not success:
                logger.warning(f"⚠️ Failed to encode rotated frame for device {device_id}")
                return frame_bytes
            
            return encoded.tobytes()
        except Exception as e:
            logger.warning(f"⚠️ Error applying rotation to frame for device {device_id}: {e}")
            return frame_bytes
    
    async def _broadcast_to_dashboard(self, room: str, frame: bytes):
        """Broadcast frame to all dashboard clients for a room."""
        if room not in self.dashboard_clients or not self.dashboard_clients[room]:
            return
        
        # Send to all clients in parallel for better performance
        disconnected = set()
        tasks = []
        
        for client in self.dashboard_clients[room]:
            async def send_to_client(client_ws):
                try:
                    await client_ws.send_bytes(frame)
                except Exception as e:
                    logger.debug(f"Error sending to dashboard client: {e}")
                    disconnected.add(client_ws)
            
            tasks.append(send_to_client(client))
        
        # Send to all clients concurrently
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        
        # Remove disconnected clients
        self.dashboard_clients[room] -= disconnected
    
    def add_dashboard_client(self, room: str, websocket: WebSocket):
        """Add a dashboard client for a room."""
        self.dashboard_clients[room].add(websocket)
        logger.info(f"📺 Dashboard client connected for {room} (total: {len(self.dashboard_clients[room])})")
        
        # Send latest frame if available
        if room in self.latest_frames:
            asyncio.create_task(self._send_latest_frame(websocket, room))
    
    def remove_dashboard_client(self, room: str, websocket: WebSocket):
        """Remove a dashboard client."""
        self.dashboard_clients[room].discard(websocket)
        logger.info(f"📺 Dashboard client disconnected for {room} (total: {len(self.dashboard_clients[room])})")
    
    async def _send_latest_frame(self, websocket: WebSocket, room: str):
        """Send latest frame to a newly connected client."""
        try:
            if room in self.latest_frames:
                await websocket.send_bytes(self.latest_frames[room])
        except Exception as e:
            logger.debug(f"Error sending latest frame: {e}")
    
    def get_connected_cameras(self) -> Dict[str, str]:
        """Get list of connected cameras (device_id -> room)."""
        return self.device_rooms.copy()
    
    def is_room_available(self, room: str) -> bool:
        """Check if there's a camera connected for a room."""
        return room in self.device_rooms.values()
    
    async def _handle_camera_service_connection_fastapi(self, websocket: WebSocket):
        """Handle WebSocket connection from camera-service (FastAPI WebSocket)."""
        try:
            logger.info("📹 Camera-service connecting...")
            
            # Wait for registration message
            message = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
            if isinstance(message, str):
                data = json.loads(message)
                if data.get("type") == "register" and data.get("service") == "camera-service":
                    self.camera_service_connection = websocket
                    logger.info("✅ Camera-service connected")
                    
                    # Send confirmation
                    await websocket.send_text(json.dumps({
                        "type": "registered",
                        "status": "ok"
                    }))
                else:
                    logger.warning(f"Invalid camera-service registration: {message}")
                    await websocket.close()
                    return
            
            # Listen for detection messages
            while True:
                try:
                    message = await websocket.receive()
                    if "text" in message:
                        try:
                            data = json.loads(message["text"])
                            if data.get("type") == "detection":
                                await self._handle_detection_from_service(data)
                        except json.JSONDecodeError:
                            logger.warning(f"Invalid JSON from camera-service: {message['text']}")
                    elif "bytes" in message:
                        # Binary message = video frame (shouldn't happen from camera-service)
                        logger.debug("Received binary message from camera-service")
                except Exception as e:
                    logger.error(f"Error receiving message: {e}")
                    break
                        
        except WebSocketDisconnect:
            logger.info("📹 Camera-service disconnected")
        except Exception as e:
            logger.error(f"Error handling camera-service connection: {e}", exc_info=True)
        finally:
            self.camera_service_connection = None
    
    async def _handle_camera_service_connection(self, websocket: websockets.WebSocketServerProtocol):
        """Handle WebSocket connection from camera-service (websockets library)."""
        try:
            logger.info("📹 Camera-service connecting...")
            
            # Wait for registration message
            message = await asyncio.wait_for(websocket.recv(), timeout=5.0)
            if isinstance(message, str):
                data = json.loads(message)
                if data.get("type") == "register" and data.get("service") == "camera-service":
                    self.camera_service_connection = websocket
                    logger.info("✅ Camera-service connected")
                    
                    # Send confirmation
                    await websocket.send(json.dumps({
                        "type": "registered",
                        "status": "ok"
                    }))
                else:
                    logger.warning(f"Invalid camera-service registration: {message}")
                    await websocket.close()
                    return
            
            # Listen for detection messages
            async for message in websocket:
                if isinstance(message, str):
                    try:
                        data = json.loads(message)
                        if data.get("type") == "detection":
                            await self._handle_detection_from_service(data)
                    except json.JSONDecodeError:
                        logger.warning(f"Invalid JSON from camera-service: {message}")
                        
        except websockets.exceptions.ConnectionClosed:
            logger.info("📹 Camera-service disconnected")
        except Exception as e:
            logger.error(f"Error handling camera-service connection: {e}", exc_info=True)
        finally:
            self.camera_service_connection = None
    
    async def _handle_detection_from_service(self, detection: dict):
        """Handle detection result from camera-service.
        
        This now implements the same logic as detection-test page:
        - Apply confidence threshold (80%)
        - Throttle notifications to every 2 seconds
        - Send detected=false for all other rooms when wheelchair is detected in a new room
        - Call on_detection_callback to update wheelchair position
        """
        try:
            room = detection.get("room", "livingroom")
            detected = detection.get("detected", False)
            confidence = detection.get("confidence", 0.0)
            bbox = detection.get("bbox")
            frame_size = detection.get("frame_size")
            device_id = detection.get("device_id", "UNKNOWN")
            
            # Add this room to known rooms
            self.known_rooms.add(room)
            
            # Apply confidence threshold (like detection-test page)
            is_detected = detected and confidence >= self.detection_confidence_threshold
            
            # Check if we should process this detection (throttle + room change logic)
            now = time.time()
            time_since_last_notify = now - self.last_detection_notify_time
            room_changed = self.last_detected_room != room
            
            # Only process if detected AND (room changed OR throttle interval passed)
            if is_detected and (room_changed or time_since_last_notify >= self.detection_throttle_seconds):
                logger.info(f"🦽 AUTO-PROCESSING detection: room={room}, confidence={confidence:.2f}, device={device_id} "
                          f"({'room changed' if room_changed else 'throttle interval'})")
                
                # Send detected=false for ALL other rooms
                for other_room in self.known_rooms:
                    if other_room != room:
                        false_message = {
                            "type": "wheelchair_detection",
                            "room": other_room,
                            "detected": False,
                            "confidence": 0,
                            "bbox": None,
                            "frame_size": frame_size,
                            "timestamp": datetime.now().isoformat(),
                            "source": "detection-test"  # Use detection-test source for dashboard to accept
                        }
                        await self._broadcast_detection_to_dashboard(false_message)
                        if self.mqtt_handler and hasattr(self.mqtt_handler, '_broadcast_ws'):
                            await self.mqtt_handler._broadcast_ws(false_message)
                
                # Send detected=true for the current room
                detection_message = {
                    "type": "wheelchair_detection",
                    "room": room,
                    "device_id": device_id,
                    "detected": True,
                    "confidence": confidence,
                    "bbox": bbox,
                    "frame_size": frame_size,
                    "method": detection.get("method", "yolo"),
                    "timestamp": datetime.now().isoformat(),
                    "source": "detection-test"  # Use detection-test source for dashboard to accept
                }
                
                await self._broadcast_detection_to_dashboard(detection_message)
                if self.mqtt_handler and hasattr(self.mqtt_handler, '_broadcast_ws'):
                    await self.mqtt_handler._broadcast_ws(detection_message)
                
                logger.info(f"📤 Broadcasted: {room}=true, {len(self.known_rooms) - 1} other rooms=false")
                
                # Call the callback to update wheelchair position in database
                if hasattr(self, 'on_detection_callback') and self.on_detection_callback:
                    await self.on_detection_callback(room, detection)
                    logger.info(f"✅ Called on_detection_callback for room: {room}")
                
                # Update tracking variables
                self.last_detected_room = room
                self.last_detection_notify_time = now
            else:
                # Just log for debugging (no action taken)
                if is_detected:
                    remaining = self.detection_throttle_seconds - time_since_last_notify
                    logger.debug(f"🔇 Throttled: {room} (wait {remaining:.1f}s more)")
                    
        except Exception as e:
            logger.error(f"Error handling detection from service: {e}", exc_info=True)
    
    async def _broadcast_detection_to_dashboard(self, message: dict):
        """Broadcast detection message to all dashboard clients."""
        message_json = json.dumps(message)
        
        # Send to all dashboard clients (all rooms) - video stream clients
        for room_clients in self.dashboard_clients.values():
            disconnected = set()
            for client in room_clients:
                try:
                    await client.send_text(message_json)
                except Exception:
                    disconnected.add(client)
            room_clients -= disconnected
        
        # Also send to main WebSocket clients (if we track them separately)
        # This will be handled by the /ws endpoint in main.py
    
    async def _forward_to_camera_service(self, room: str, frame: bytes, device_id: str = None):
        """Forward video frame to camera-service via WebSocket.
        
        IMPORTANT: Send ORIGINAL unrotated frames to camera-service.
        Camera-service will apply rotation before detection using the rotation metadata.
        """
        if not self.camera_service_connection:
            logger.debug(f"⚠️ Camera-service not connected, skipping frame forwarding for {room}")
            return
        
        # Time-based throttling: Allow 20 FPS forwarding (2x the detection rate)
        # Camera-service throttles at DETECTION_INTERVAL_SEC (0.1s = 10 FPS)
        # This ensures camera-service always has fresh frames for detection
        import time
        now = time.time()
        last_forward = self.last_forward_time.get(room, 0)
        if now - last_forward < 0.05:  # 50ms = 20 FPS (2x detection rate for buffer)
            return
        self.last_forward_time[room] = now
        
        # Validate JPEG frame before forwarding
        try:
            # Quick validation: check JPEG header
            if len(frame) < 2 or frame[0:2] != b'\xff\xd8':
                logger.warning(f"⚠️ Invalid JPEG frame for {room} (missing JPEG header), skipping")
                return
            # Check for JPEG end marker (optional but helps catch incomplete frames)
            if len(frame) < 100:  # Too small to be a valid frame
                logger.warning(f"⚠️ Frame too small for {room} ({len(frame)} bytes), skipping")
                return
        except Exception as e:
            logger.warning(f"⚠️ Frame validation failed for {room}: {e}")
            return
        
        # Increment frame counter for this room
        self.frame_counters[room] += 1
        logger.debug(f"📤 Forwarding frame #{self.frame_counters[room]} to camera-service ({room})")
        
        try:
            # Send frame metadata first (required - device_id and room from ESP32)
            # Use device_id from parameter or find from room
            if not device_id:
                # Find device_id from room
                for dev_id, dev_room in self.device_rooms.items():
                    if dev_room == room:
                        device_id = dev_id
                        break
            
            # Get rotation from cache or database
            rotation = self.device_rotations.get(device_id, 0)
            if not rotation and self.db:
                try:
                    device_doc = await self.db.db.devices.find_one({
                        "$or": [{"id": device_id}, {"deviceId": device_id}]
                    })
                    if device_doc:
                        rotation = device_doc.get("rotation", 0)
                        self.device_rotations[device_id] = rotation
                except Exception as e:
                    logger.debug(f"Could not get rotation for device {device_id}: {e}")
            
            # Always send metadata before frame so camera-service knows device_id, room, and rotation
            # Check if it's FastAPI WebSocket or websockets library WebSocket
            if hasattr(self.camera_service_connection, 'send_text'):
                # FastAPI WebSocket
                await self.camera_service_connection.send_text(json.dumps({
                    "type": "video_frame",
                    "device_id": device_id or "UNKNOWN",
                    "room": room,
                    "rotation": rotation,
                    "timestamp": datetime.now().isoformat()
                }))
                await self.camera_service_connection.send_bytes(frame)
            else:
                # websockets library WebSocket
                await self.camera_service_connection.send(json.dumps({
                    "type": "video_frame",
                    "device_id": device_id or "UNKNOWN",
                    "room": room,
                    "rotation": rotation,
                    "timestamp": datetime.now().isoformat()
                }))
                await self.camera_service_connection.send(frame)
            logger.info(f"📤 Forwarded ORIGINAL frame to camera-service ({room}, device: {device_id}, rotation: {rotation}°): {len(frame)} bytes")
            
        except Exception as e:
            logger.error(f"Error forwarding frame to camera-service: {e}", exc_info=True)
            # Mark connection as lost
            self.camera_service_connection = None
    
    async def _handle_appliance_controller(self, websocket: websockets.WebSocketServerProtocol, device_id: str, room: str):
        """Handle ESP8266 appliance controller connection and messages."""
        try:
            async for message in websocket:
                if isinstance(message, str):
                    try:
                        data = json.loads(message)
                        msg_type = data.get("type", "")
                        
                        if msg_type == "status":
                            # Broadcast status to dashboard clients
                            status_message = {
                                "type": "appliance_status",
                                "device_id": device_id,
                                "room": room,
                                **data
                            }
                            # Broadcast via mqtt_handler if available
                            if self.mqtt_handler and hasattr(self.mqtt_handler, '_broadcast_ws'):
                                await self.mqtt_handler._broadcast_ws(status_message)
                            logger.debug(f"🔌 Appliance status from {device_id}: {data}")
                        
                        elif msg_type == "control_ack":
                            # Broadcast control acknowledgment
                            ack_message = {
                                "type": "appliance_control_ack",
                                "device_id": device_id,
                                "room": room,
                                **data
                            }
                            if self.mqtt_handler and hasattr(self.mqtt_handler, '_broadcast_ws'):
                                await self.mqtt_handler._broadcast_ws(ack_message)
                            logger.info(f"🔌 Appliance ACK from {device_id}: {data.get('appliance')} = {data.get('state')}")
                        
                        elif msg_type == "pong":
                            # Ping-pong keepalive
                            pass
                        
                    except json.JSONDecodeError:
                        logger.warning(f"Invalid JSON from appliance controller {device_id}: {message}")
                        
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"🔌 Appliance controller disconnected: {device_id} ({room})")
        except Exception as e:
            logger.error(f"Error handling appliance controller: {e}", exc_info=True)
        finally:
            # Cleanup
            self.appliance_connections.pop(device_id, None)
            self.appliance_rooms.pop(device_id, None)
    
    async def control_appliance(self, room: str, appliance: str, state: bool = None, value: int = None) -> bool:
        """Send control command to ESP8266 appliance controller for a room."""
        # Find appliance controller for this room
        device_id = None
        for dev_id, dev_room in self.appliance_rooms.items():
            if dev_room.lower() == room.lower():
                device_id = dev_id
                break
        
        if not device_id or device_id not in self.appliance_connections:
            logger.warning(f"No appliance controller found for room: {room}")
            return False
        
        websocket = self.appliance_connections[device_id]
        
        try:
            command = {
                "type": "control",
                "appliance": appliance,
            }
            if state is not None:
                command["state"] = state
            if value is not None:
                command["value"] = value
            
            await websocket.send(json.dumps(command))
            logger.info(f"🔌 Sent control to {device_id}: {appliance} = {state if state is not None else value}")
            return True
            
        except Exception as e:
            logger.error(f"Error sending control to appliance controller: {e}")
            return False
    
    def get_connected_appliance_controllers(self) -> Dict[str, str]:
        """Get list of connected appliance controllers (device_id -> room)."""
        return self.appliance_rooms.copy()
    
    async def cleanup_stale_connections(self, timeout_seconds: int = 60):
        """Remove stale connections that haven't sent data recently.
        
        Args:
            timeout_seconds: Time in seconds after which a connection is considered stale
        """
        import time
        now = time.time()
        stale_cameras = []
        stale_appliances = []
        
        # Find stale camera connections
        for device_id in list(self.camera_connections.keys()):
            last_activity = self.connection_last_activity.get(device_id, now)
            if now - last_activity > timeout_seconds:
                stale_cameras.append(device_id)
        
        # Find stale appliance connections
        for device_id in list(self.appliance_connections.keys()):
            last_activity = self.connection_last_activity.get(device_id, now)
            if now - last_activity > timeout_seconds:
                stale_appliances.append(device_id)
        
        # Cleanup stale cameras
        for device_id in stale_cameras:
            logger.info(f"🧹 Cleaning up stale camera connection: {device_id}")
            self.camera_connections.pop(device_id, None)
            room = self.device_rooms.pop(device_id, None)
            self.connection_last_activity.pop(device_id, None)
            
            # Clear latest frame if no cameras for this room
            if room and not any(r == room for r in self.device_rooms.values()):
                self.latest_frames.pop(room, None)
        
        # Cleanup stale appliances
        for device_id in stale_appliances:
            logger.info(f"🧹 Cleaning up stale appliance connection: {device_id}")
            self.appliance_connections.pop(device_id, None)
            self.appliance_rooms.pop(device_id, None)
            self.connection_last_activity.pop(device_id, None)
        
        if stale_cameras or stale_appliances:
            logger.info(f"🧹 Cleaned up {len(stale_cameras)} camera(s) and {len(stale_appliances)} appliance(s)")


# Global instance
stream_handler = WebSocketStreamHandler()

