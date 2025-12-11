"""
WebSocket Client for Camera Service
รับวิดีโอจาก backend ผ่าน WebSocket และส่งผลการตรวจจับกลับไป
"""

import asyncio
import base64
import json
import logging
import threading
from datetime import datetime
from queue import Queue
from typing import Callable, Optional

import cv2
import numpy as np
import websockets

from .config import settings

logger = logging.getLogger(__name__)


class WebSocketCameraClient:
    """WebSocket client for camera video streaming and detection."""
    
    def __init__(self, detector_callback: Optional[Callable] = None):
        self.detector_callback = detector_callback
        self.websocket: Optional[websockets.WebSocketClientProtocol] = None
        self.is_connected = False
        self.running = False
        
        # Video frame queue
        self.video_queue: Queue = Queue(maxsize=10)
        
        # Detection state
        self.last_detection_time = 0
        self.current_detection = {
            "detected": False,
            "confidence": 0.0,
            "timestamp": None
        }
        
        # Room mapping (device_id -> room)
        self.device_rooms: dict = {}
        
        # Latest metadata for current frame (device_id, room)
        self.current_metadata: Optional[dict] = None
        
        # Event loop for async operations
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self.loop_thread: Optional[threading.Thread] = None
    
    def _run_event_loop(self):
        """Run asyncio event loop in a separate thread."""
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        self.loop.run_forever()
    
    def connect(self):
        """Connect to WebSocket server."""
        # Start event loop in separate thread
        self.loop_thread = threading.Thread(target=self._run_event_loop, daemon=True)
        self.loop_thread.start()
        
        # Wait for loop to be ready
        while self.loop is None:
            threading.Event().wait(0.1)
        
        # Connect to WebSocket server
        future = asyncio.run_coroutine_threadsafe(
            self._connect_async(),
            self.loop
        )
        future.result(timeout=10)
    
    async def _connect_async(self):
        """Async WebSocket connection."""
        try:
            ws_url = settings.WEBSOCKET_BACKEND_URL
            logger.info(f"Connecting to WebSocket: {ws_url}")
            
            self.websocket = await websockets.connect(ws_url)
            self.is_connected = True
            logger.info("✅ WebSocket connected to backend")
            
            # Send registration message
            await self.websocket.send(json.dumps({
                "type": "register",
                "service": "camera-service",
                "device_id": settings.DEVICE_ID
            }))
            
            # Start receiving messages
            asyncio.create_task(self._receive_messages())
            
        except Exception as e:
            logger.error(f"Failed to connect to WebSocket: {e}")
            self.is_connected = False
            raise
    
    async def _receive_messages(self):
        """Receive messages from WebSocket."""
        try:
            async for message in self.websocket:
                if isinstance(message, bytes):
                    # Binary message = video frame (JPEG)
                    # Use current_metadata that was set from previous text message
                    await self._handle_video_frame(message, self.current_metadata)
                elif isinstance(message, str):
                    # Text message = metadata (device_id, room) or control/status
                    try:
                        data = json.loads(message)
                        # Store metadata for next frame
                        if data.get("type") == "video_frame":
                            self.current_metadata = data
                        await self._handle_text_message(data)
                    except json.JSONDecodeError:
                        logger.warning(f"Invalid JSON message: {message}")
        except websockets.exceptions.ConnectionClosed:
            logger.warning("WebSocket connection closed")
            self.is_connected = False
        except Exception as e:
            logger.error(f"Error receiving messages: {e}", exc_info=True)
            self.is_connected = False
    
    async def _handle_video_frame(self, frame_bytes: bytes, metadata: dict = None):
        """Handle incoming video frame."""
        try:
            logger.debug(f"📥 Received video frame: {len(frame_bytes)} bytes, metadata: {metadata}")
            
            # Decode JPEG frame
            frame_array = np.frombuffer(frame_bytes, dtype=np.uint8)
            frame = cv2.imdecode(frame_array, cv2.IMREAD_COLOR)
            
            if frame is None:
                logger.warning("Failed to decode JPEG frame")
                return
            
            logger.debug(f"📥 Decoded frame: {frame.shape if frame is not None else 'None'}")
            
            # Extract metadata from backend message (device_id and room from ESP32)
            if metadata:
                device_id = metadata.get("device_id", "UNKNOWN")
                room = metadata.get("room", "livingroom")
                # Update device_rooms mapping
                self.device_rooms[device_id] = room
            else:
                # Fallback if no metadata (shouldn't happen)
                device_id = "UNKNOWN"
                room = "livingroom"
                logger.warning("Received video frame without metadata")
            
            meta = {
                "device_id": device_id,
                "room": room,
                "timestamp": metadata.get("timestamp", datetime.now().isoformat()) if metadata else datetime.now().isoformat()
            }
            
            # Put frame in queue
            try:
                self.video_queue.put_nowait((frame, meta))
            except:
                # Remove old frame and add new one
                try:
                    self.video_queue.get_nowait()
                except:
                    pass
                try:
                    self.video_queue.put_nowait((frame, meta))
                except:
                    pass
            
            # Call detector callback if set
            if self.detector_callback:
                self.detector_callback(frame, meta)
                
        except Exception as e:
            logger.error(f"Error handling video frame: {e}", exc_info=True)
    
    async def _handle_text_message(self, data: dict):
        """Handle text message from WebSocket."""
        msg_type = data.get("type", "")
        
        if msg_type == "video_frame":
            # Video frame metadata (if sent separately)
            meta = data.get("metadata", {})
            logger.debug(f"Received video frame metadata: {meta}")
        elif msg_type == "room_update" or msg_type == "video_frame":
            # Room information update or video frame metadata
            room = data.get("room")
            device_id = data.get("device_id") or settings.DEVICE_ID
            if room:
                self.device_rooms[device_id] = room
                logger.info(f"Room updated for {device_id}: {room}")
        else:
            logger.debug(f"Received text message: {data}")
    
    async def send_detection(self, detection: dict, device_id: str = None, room: str = None):
        """Send detection result to backend via WebSocket."""
        if not self.websocket or not self.is_connected:
            return
        
        try:
            detection_msg = {
                "type": "detection",
                "device_id": device_id or settings.DEVICE_ID,
                "room": room or "livingroom",
                "timestamp": datetime.now().isoformat(),
                "detected": detection.get("detected", False),
                "confidence": detection.get("confidence", 0.0),
                "bbox": detection.get("bbox"),
                "frame_size": detection.get("frame_size"),
                "method": detection.get("method", "unknown")
            }
            
            await self.websocket.send(json.dumps(detection_msg))
            logger.debug(f"Sent detection to backend: detected={detection_msg['detected']}, confidence={detection_msg['confidence']:.2f}")
            
        except Exception as e:
            logger.error(f"Failed to send detection: {e}", exc_info=True)
    
    def publish_detection(self, detection: dict, device_id: str = None):
        """Publish detection result (wrapper for async method)."""
        if not self.loop or not self.is_connected:
            return
        
        # Use device_id from parameter or from current_metadata
        if not device_id and self.current_metadata:
            device_id = self.current_metadata.get("device_id")
        
        # Extract room from device_rooms mapping (set from backend metadata)
        if device_id and device_id in self.device_rooms:
            room = self.device_rooms[device_id]
        else:
            # Fallback
            device_id = device_id or "UNKNOWN"
            room = "livingroom"
            logger.warning(f"Device {device_id} not found in device_rooms, using default room")
        
        # Run async method in event loop
        asyncio.run_coroutine_threadsafe(
            self.send_detection(detection, device_id, room),
            self.loop
        )
    
    def get_frame(self, timeout: float = 1.0) -> Optional[tuple]:
        """Get frame from queue."""
        try:
            return self.video_queue.get(timeout=timeout)
        except:
            return None
    
    def disconnect(self):
        """Disconnect from WebSocket server."""
        self.running = False
        self.is_connected = False
        
        if self.loop:
            # Close WebSocket connection
            if self.websocket:
                asyncio.run_coroutine_threadsafe(
                    self.websocket.close(),
                    self.loop
                )
            
            # Stop event loop
            self.loop.call_soon_threadsafe(self.loop.stop)
        
        if self.loop_thread:
            self.loop_thread.join(timeout=5)
        
        logger.info("WebSocket disconnected")

