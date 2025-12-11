"""
MQTT Client for Camera Service
รับวิดีโอจาก camera และส่งผลการตรวจจับกลับไป
"""

import asyncio
import base64
import binascii
import json
import logging
import threading
import time
from datetime import datetime
from queue import Queue
from typing import Callable, Optional

import cv2
import numpy as np
import paho.mqtt.client as mqtt

from .config import settings

logger = logging.getLogger(__name__)


class MQTTCameraClient:
    """MQTT client for camera video streaming and detection."""
    
    def __init__(self, detector_callback: Optional[Callable] = None):
        self.detector_callback = detector_callback
        self.client: Optional[mqtt.Client] = None
        self.is_connected = False
        
        # Video frame queue
        self.video_queue: Queue = Queue(maxsize=10)
        
        # Detection state
        self.last_detection_time = 0
        self.current_detection = {
            "detected": False,
            "confidence": 0.0,
            "timestamp": None
        }
    
    def connect(self):
        """Connect to MQTT broker."""
        self.client = mqtt.Client()
        
        if settings.MQTT_USER and settings.MQTT_PASS:
            self.client.username_pw_set(settings.MQTT_USER, settings.MQTT_PASS)
        
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message
        self.client.on_disconnect = self._on_disconnect
        
        try:
            self.client.connect(settings.MQTT_BROKER, settings.MQTT_PORT, keepalive=60)
            self.client.loop_start()
            logger.info(f"MQTT connected to {settings.MQTT_BROKER}:{settings.MQTT_PORT}")
        except Exception as e:
            logger.error(f"MQTT connection failed: {e}")
            raise
    
    def disconnect(self):
        """Disconnect from MQTT broker."""
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
            self.is_connected = False
            logger.info("MQTT disconnected")
    
    def _on_connect(self, client, userdata, flags, rc):
        """MQTT connection callback."""
        if rc == 0:
            self.is_connected = True
            logger.info("MQTT connected successfully")
            
            # Subscribe to video topic
            client.subscribe(settings.MQTT_TOPIC_VIDEO)
            logger.info(f"Subscribed to {settings.MQTT_TOPIC_VIDEO}")
        else:
            logger.error(f"MQTT connection failed with code {rc}")
    
    def _on_disconnect(self, client, userdata, rc):
        """MQTT disconnection callback."""
        self.is_connected = False
        logger.warning(f"MQTT disconnected with code {rc}")
    
    def _on_message(self, client, userdata, msg):
        """MQTT message callback."""
        if msg.topic == settings.MQTT_TOPIC_VIDEO:
            self._handle_video_message(msg.payload)
    
    def _handle_video_message(self, payload: bytes):
        """Handle video frame message."""
        try:
            # Parse metadata and frame
            # ESP32 sends metadata JSON + base64 frame separated by newline
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
            
            try:
                frame_bytes = base64.b64decode(frame_b64, validate=True)
            except binascii.Error as e:
                logger.error(f"Base64 decode error: {e}")
                return
            
            # Decode JPEG frame
            frame_array = np.frombuffer(frame_bytes, dtype=np.uint8)
            frame = cv2.imdecode(frame_array, cv2.IMREAD_COLOR)
            
            if frame is None:
                logger.warning("Failed to decode JPEG frame")
                return
            
            logger.debug(f"Received video frame: {len(frame_bytes)} bytes, shape: {frame.shape if frame is not None else 'None'}")
            
            # Put frame in queue (non-blocking)
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
            logger.error(f"Error handling video message: {e}", exc_info=True)
    
    def publish_detection(self, detection: dict, device_id: str = None):
        """Publish detection result to MQTT (room-based topic)."""
        if not self.client or not self.is_connected:
            return
        
        # Extract room from device_id or use default
        # Device ID format: TSIM_001 -> room: livingroom (default)
        room = "livingroom"  # Default room, can be extracted from device_id if needed
        
        detection_msg = {
            "device_id": device_id or settings.DEVICE_ID,
            "room": room,
            "timestamp": datetime.now().isoformat(),
            "detected": detection.get("detected", False),
            "confidence": detection.get("confidence", 0.0),
            "bbox": detection.get("bbox"),
            "method": detection.get("method", "unknown")
        }
        
        try:
            payload = json.dumps(detection_msg)
            # Publish to room-based topic: WheelSense/{room}/detection
            topic = f"WheelSense/{room}/detection"
            self.client.publish(topic, payload)
            logger.debug(f"Published detection to {topic}: detected={detection_msg['detected']}, confidence={detection_msg['confidence']:.2f}")
        except Exception as e:
            logger.error(f"Failed to publish detection: {e}")
    
    def get_frame(self, timeout: float = 1.0) -> Optional[tuple]:
        """Get frame from queue."""
        try:
            return self.video_queue.get(timeout=timeout)
        except:
            return None









