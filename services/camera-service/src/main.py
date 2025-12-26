"""
Camera Service Main Entry Point
Receive video from WebSocket, detect wheelchair, and send results back via WebSocket
"""

import asyncio
import logging
import signal
import sys
import time
from typing import Optional

import cv2
import numpy as np

from .config import settings
from .detector import WheelchairDetector
from .websocket_client import WebSocketCameraClient

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class CameraService:
    """Main camera service."""
    
    def __init__(self):
        # Use separate detector for each room to avoid state mixing
        self.detectors: dict = {}  # room -> WheelchairDetector
        self.ws_client = WebSocketCameraClient(detector_callback=self._on_frame_received)
        self.running = False
        self.last_detection_publish: dict = {}  # room -> timestamp
        # Device rotation states (device_id -> degrees: 0, 90, 180, 270)
        self.device_rotations: dict = {}  # device_id -> rotation_degrees
    
    def _get_detector(self, room: str) -> WheelchairDetector:
        """Get or create detector for a room."""
        if room not in self.detectors:
            self.detectors[room] = WheelchairDetector(
                confidence_threshold=settings.DETECTION_CONFIDENCE_THRESHOLD
            )
            logger.info(f"📹 Created new detector for room: {room}")
        return self.detectors[room]
    
    def _on_frame_received(self, frame: np.ndarray, meta: dict):
        """Callback when frame is received.
        
        Receives ORIGINAL unrotated frames from websocket_handler.
        Applies rotation before detection based on metadata.
        """
        if not self.running:
            return
        
        # Validate frame
        if frame is None or frame.size == 0:
            logger.warning("⚠️ Received empty or invalid frame, skipping")
            return
        
        # Get room from metadata
        room = meta.get("room", "livingroom")
        device_id = meta.get("device_id", settings.DEVICE_ID)
        
        # Apply rotation if set for this device
        # Rotation is applied on server side BEFORE detection
        rotation = meta.get("rotation") or self.device_rotations.get(device_id, 0)
        if rotation and rotation != 0:
            try:
                # Apply rotation using OpenCV
                if rotation == 90:
                    frame = cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
                    logger.debug(f"🔄 Rotated frame 90° clockwise for {device_id} ({room})")
                elif rotation == 180:
                    frame = cv2.rotate(frame, cv2.ROTATE_180)
                    logger.debug(f"🔄 Rotated frame 180° for {device_id} ({room})")
                elif rotation == 270:
                    frame = cv2.rotate(frame, cv2.ROTATE_90_COUNTERCLOCKWISE)
                    logger.debug(f"🔄 Rotated frame 270° for {device_id} ({room})")
                
                # Validate rotated frame
                if frame is None or frame.size == 0:
                    logger.warning(f"⚠️ Frame became invalid after rotation for {device_id}, skipping")
                    return
            except Exception as e:
                logger.error(f"❌ Failed to rotate frame for {device_id}: {e}")
                return
        
        # Check if we should run detection for this room
        now = time.time()
        last_publish = self.last_detection_publish.get(room, 0)
        if now - last_publish < settings.DETECTION_INTERVAL_SEC:
            return
        
        # Get detector for this room
        detector = self._get_detector(room)
        
        # Run detection on rotated frame
        detection = detector.detect(frame)
        
        # Add frame size to detection for position calculation
        if frame is not None and frame.size > 0:
            h, w = frame.shape[:2]
            detection["frame_size"] = {"width": int(w), "height": int(h)}
        
        # Update detection state
        self.ws_client.current_detection = detection
        
        # Send detection result via WebSocket
        asyncio.create_task(self.ws_client.send_detection(detection, device_id, room))
        
        self.last_detection_publish[room] = now
        
        # Log detection
        if detection.get("detected", False):
            bbox = detection.get("bbox")
            frame_size = detection.get("frame_size", {})
            logger.info(
                f"🦽 Wheelchair detected in {room}! Confidence: {detection.get('confidence', 0):.2f}, "
                f"Method: {detection.get('method', 'unknown')}, "
                f"Bbox: {bbox}, Frame size: {frame_size}"
            )
        else:
            logger.debug(f"No wheelchair detected in {room}")
    
    def start(self):
        """Start the camera service."""
        logger.info("=" * 60)
        logger.info("WheelSense Camera Service")
        logger.info("=" * 60)
        logger.info(f"WebSocket Backend: {settings.WEBSOCKET_BACKEND_URL}")
        logger.info(f"Device ID: {settings.DEVICE_ID}")
        logger.info(f"Detection Interval: {settings.DETECTION_INTERVAL_SEC}s")
        logger.info("=" * 60)
        
        # Connect to WebSocket
        try:
            self.ws_client.connect()
        except Exception as e:
            logger.error(f"Failed to connect to WebSocket: {e}")
            sys.exit(1)
        
        self.running = True
        
        # Main loop
        logger.info("Camera service started. Waiting for video frames from WebSocket...")
        
        frame_count = 0
        try:
            while self.running:
                # Process frames from queue
                frame_data = self.ws_client.get_frame(timeout=1.0)
                if frame_data:
                    frame, meta = frame_data
                    frame_count += 1
                    if frame_count % 30 == 0:  # Log every 30 frames
                        logger.info(f"Processing video frames... (received {frame_count} frames so far)")
                    # Detection is handled in callback
                else:
                    # Log if no frames received for a while
                    if frame_count == 0:
                        logger.debug("Waiting for video frames from WebSocket...")
                
                # Small sleep to prevent CPU spinning
                time.sleep(0.1)
                
        except KeyboardInterrupt:
            logger.info("Received interrupt signal")
        finally:
            self.stop()
    
    def stop(self):
        """Stop the camera service."""
        logger.info("Stopping camera service...")
        self.running = False
        self.ws_client.disconnect()
        logger.info("Camera service stopped")


def main():
    """Main entry point."""
    service = CameraService()
    
    # Setup signal handlers
    def signal_handler(sig, frame):
        logger.info("Received signal, shutting down...")
        service.stop()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Start service
    service.start()


if __name__ == "__main__":
    main()









