"""
WheelSense Backend - WebSocket Handler for Camera Streaming
Receives video frames from ESP32 cameras via WebSocket and forwards to dashboard clients
Also forwards frames to MQTT for camera-service detection
"""

import asyncio
import base64
import json
import logging
from datetime import datetime
from typing import Dict, Set, Optional
from collections import defaultdict

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
        
        # Frame counter for throttling camera-service forwarding
        self.frame_counters: Dict[str, int] = defaultdict(int)
        
        # MQTT handler reference (set from main.py)
        self.mqtt_handler: Optional[object] = None
        
        # MQTT handler reference (for broadcasting to /ws clients)
        self.mqtt_handler: Optional[object] = None
        
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
            
            # Listen for video frames with frame dropping for low latency
            # Use a queue with maxsize=1 to always keep only the latest frame
            frame_queue = asyncio.Queue(maxsize=1)
            
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
                                    # Update device status
                                    logger.debug(f"Status from {device_id}: {data}")
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
                                # Store latest frame
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
        """Handle detection result from camera-service."""
        try:
            room = detection.get("room", "livingroom")
            detected = detection.get("detected", False)
            confidence = detection.get("confidence", 0.0)
            bbox = detection.get("bbox")
            frame_size = detection.get("frame_size")
            
            logger.info(f"🦽 Detection from camera-service ({room}): detected={detected}, confidence={confidence:.2f}")
            
            # Create detection message
            detection_message = {
                "type": "wheelchair_detection",
                "room": room,
                "device_id": detection.get("device_id", "UNKNOWN"),
                "detected": detected,
                "confidence": confidence,
                "bbox": bbox,
                "frame_size": frame_size,
                "timestamp": detection.get("timestamp", datetime.now().isoformat())
            }
            
            # Broadcast to dashboard clients via WebSocket (both /ws and /ws/stream endpoints)
            await self._broadcast_detection_to_dashboard(detection_message)
            
            # Also broadcast via mqtt_handler websockets (for /ws endpoint clients)
            if self.mqtt_handler and hasattr(self.mqtt_handler, '_broadcast_ws'):
                await self.mqtt_handler._broadcast_ws(detection_message)
                logger.debug(f"📤 Broadcasted detection to /ws clients via mqtt_handler")
            
            # Call callback if set (for updating database)
            # This will be set from main.py
            if hasattr(self, 'on_detection_callback') and self.on_detection_callback:
                await self.on_detection_callback(room, detection)
                
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
        """Forward video frame to camera-service via WebSocket."""
        if not self.camera_service_connection:
            logger.debug(f"⚠️ Camera-service not connected, skipping frame forwarding for {room}")
            return
        
        # Throttle: only send every 5th frame (for ~25 FPS, this gives ~5 FPS to detection)
        self.frame_counters[room] += 1
        if self.frame_counters[room] % 5 != 0:
            return
        
        logger.debug(f"📤 Forwarding frame {self.frame_counters[room]} to camera-service ({room})")
        
        try:
            # Send frame metadata first (required - device_id and room from ESP32)
            # Use device_id from parameter or find from room
            if not device_id:
                # Find device_id from room
                for dev_id, dev_room in self.device_rooms.items():
                    if dev_room == room:
                        device_id = dev_id
                        break
            
            # Always send metadata before frame so camera-service knows device_id and room
            # Check if it's FastAPI WebSocket or websockets library WebSocket
            if hasattr(self.camera_service_connection, 'send_text'):
                # FastAPI WebSocket
                await self.camera_service_connection.send_text(json.dumps({
                    "type": "video_frame",
                    "device_id": device_id or "UNKNOWN",
                    "room": room,
                    "timestamp": datetime.now().isoformat()
                }))
                await self.camera_service_connection.send_bytes(frame)
            else:
                # websockets library WebSocket
                await self.camera_service_connection.send(json.dumps({
                    "type": "video_frame",
                    "device_id": device_id or "UNKNOWN",
                    "room": room,
                    "timestamp": datetime.now().isoformat()
                }))
                await self.camera_service_connection.send(frame)
            logger.info(f"📤 Forwarded video frame to camera-service ({room}, device: {device_id}): {len(frame)} bytes")
            
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


# Global instance
stream_handler = WebSocketStreamHandler()

