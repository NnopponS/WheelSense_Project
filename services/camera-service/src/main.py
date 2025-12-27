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
        try:
            detector = self._get_detector(room)
        except Exception as e:
            logger.error(f"❌ Failed to get detector for {room}: {e}")
            return
        
        # Run detection on rotated frame with error handling
        try:
            detection = detector.detect(frame)
        except Exception as e:
            logger.error(f"❌ Detection failed for {room}: {e}", exc_info=True)
            # Return early but don't crash - continue processing next frame
            return
        
        # Validate detection result
        if not detection or not isinstance(detection, dict):
            logger.warning(f"⚠️ Invalid detection result for {room}, skipping")
            return
        
        # Add frame size to detection for position calculation
        if frame is not None and frame.size > 0:
            try:
                h, w = frame.shape[:2]
                detection["frame_size"] = {"width": int(w), "height": int(h)}
            except Exception as e:
                logger.warning(f"⚠️ Failed to get frame size: {e}")
        
        # Update detection state
        self.ws_client.current_detection = detection
        
        # Send detection result via WebSocket with error handling
        try:
            asyncio.create_task(self.ws_client.send_detection(detection, device_id, room))
        except Exception as e:
            logger.error(f"❌ Failed to send detection result: {e}")
            # Don't return - continue processing
        
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
        
        # Connect to WebSocket (with auto-reconnect enabled)
        try:
            self.ws_client.connect()
            logger.info("✅ Initial WebSocket connection established")
        except Exception as e:
            logger.warning(f"⚠️ Initial WebSocket connection failed: {e}")
            logger.info("🔄 Auto-reconnect is enabled, will retry automatically...")
            # Don't exit - let auto-reconnect handle it
            # The service will continue running and auto-reconnect will attempt to connect
        
        self.running = True
        
        # Main loop with health monitoring
        logger.info("Camera service started. Waiting for video frames from WebSocket...")
        
        frame_count = 0
        last_health_log = time.time()
        health_log_interval = 60  # Log health status every 60 seconds
        last_frame_time = time.time()
        no_frame_warning_time = 30  # Warn if no frames for 30 seconds
        
        try:
            while self.running:
                # Check WebSocket connection health
                if not self.ws_client.is_connected:
                    logger.warning("⚠️ WebSocket disconnected. Waiting for auto-reconnect...")
                    time.sleep(2)
                    continue
                
                # Process frames from queue
                frame_data = self.ws_client.get_frame(timeout=1.0)
                if frame_data:
                    frame, meta = frame_data
                    frame_count += 1
                    last_frame_time = time.time()
                    
                    if frame_count % 30 == 0:  # Log every 30 frames
                        logger.info(f"Processing video frames... (received {frame_count} frames so far)")
                    # Detection is handled in callback
                else:
                    # Check if no frames received for too long
                    time_since_last_frame = time.time() - last_frame_time
                    if time_since_last_frame > no_frame_warning_time and frame_count > 0:
                        logger.warning(f"⚠️ No frames received for {time_since_last_frame:.1f}s. Connection may be unstable.")
                        last_frame_time = time.time()  # Reset to avoid spam
                
                # Periodic health status log
                current_time = time.time()
                if current_time - last_health_log > health_log_interval:
                    logger.info(f"📊 Health: Connected={self.ws_client.is_connected}, "
                              f"Frames={frame_count}, Detectors={len(self.detectors)}")
                    last_health_log = current_time
                
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









