"""
WheelSense Backend - WebSocket Handler for Camera Streaming
Receives video frames from ESP32 cameras via WebSocket and forwards to dashboard clients
"""

import asyncio
import json
import logging
from datetime import datetime
from typing import Dict, Set, Optional
from collections import defaultdict

import websockets
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketStreamHandler:
    """Handles WebSocket connections for camera streaming."""
    
    def __init__(self):
        # ESP32 camera connections (device_id -> websocket)
        self.camera_connections: Dict[str, websockets.WebSocketServerProtocol] = {}
        
        # Dashboard client connections (room -> set of websockets)
        self.dashboard_clients: Dict[str, Set[WebSocket]] = defaultdict(set)
        
        # Latest frame buffer per room (for new clients)
        self.latest_frames: Dict[str, bytes] = {}
        
        # Room mapping from device_id
        self.device_rooms: Dict[str, str] = {}
        
    async def handle_camera_connection(self, websocket: websockets.WebSocketServerProtocol, path: str):
        """Handle incoming WebSocket connection from ESP32 camera."""
        device_id = None
        room = None
        
        try:
            # Wait for initial connection message (text or binary)
            try:
                message = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                if isinstance(message, str):
                    try:
                        data = json.loads(message)
                        device_id = data.get("device_id") or data.get("deviceId")
                        room = data.get("room") or data.get("r")
                        
                        if device_id and room:
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
                            logger.warning(f"Invalid camera connection message: {message}")
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


# Global instance
stream_handler = WebSocketStreamHandler()

