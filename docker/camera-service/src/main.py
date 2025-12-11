"""
Camera Service Main Entry Point
รับวิดีโอจาก WebSocket, ตรวจจับ wheelchair, และส่งผลกลับไปผ่าน WebSocket
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
        self.detector = WheelchairDetector(
            confidence_threshold=settings.DETECTION_CONFIDENCE_THRESHOLD
        )
        self.ws_client = WebSocketCameraClient(detector_callback=self._on_frame_received)
        self.running = False
        self.last_detection_publish = 0
    
    def _on_frame_received(self, frame: np.ndarray, meta: dict):
        """Callback when frame is received."""
        if not self.running:
            return
        
        # Check if we should run detection
        now = time.time()
        if now - self.last_detection_publish < settings.DETECTION_INTERVAL_SEC:
            return
        
        # Run detection
        detection = self.detector.detect(frame)
        
        # Add frame size to detection for position calculation
        if frame is not None and frame.size > 0:
            h, w = frame.shape[:2]
            detection["frame_size"] = {"width": int(w), "height": int(h)}
        
        # Update detection state
        self.ws_client.current_detection = detection
        
        # Send detection result via WebSocket
        device_id = meta.get("device_id", settings.DEVICE_ID)
        room = meta.get("room", "livingroom")
        asyncio.create_task(self.ws_client.send_detection(detection, device_id, room))
        
        self.last_detection_publish = now
        
        # Log detection
        if detection.get("detected", False):
            bbox = detection.get("bbox")
            frame_size = detection.get("frame_size", {})
            logger.info(
                f"🦽 Wheelchair detected! Confidence: {detection.get('confidence', 0):.2f}, "
                f"Method: {detection.get('method', 'unknown')}, "
                f"Bbox: {bbox}, Frame size: {frame_size}"
            )
        else:
            logger.debug("No wheelchair detected")
    
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









