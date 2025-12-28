"""
Camera Service Main Entry Point
Receive video from WebSocket, detect wheelchair, and send results back via WebSocket
"""

import asyncio
import logging
import signal
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

import cv2
import numpy as np

from .config import settings
from .detector import create_detector
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
        # Use SINGLE shared detector for all rooms to save GPU memory
        # YOLO model is loaded only once instead of once per room
        self.detector = None  # Single shared detector
        self.ws_client = WebSocketCameraClient(detector_callback=None)  # No callback - we process in main loop
        self.running = False
        self.last_detection_publish: dict = {}  # room -> timestamp
        # Device rotation states (device_id -> degrees: 0, 90, 180, 270)
        self.device_rotations: dict = {}  # device_id -> rotation_degrees
        # Room-specific detection state tracking
        self.room_states: dict = {}  # room -> {stable_count, no_detection_count, state}
        
        # Thread pool for running detection in background
        self.detection_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="detection")
    
    def _get_detector(self):
        """Get or create the shared detector (single instance for all rooms)."""
        if self.detector is None:
            self.detector = create_detector(
                method=settings.DETECTION_METHOD,
                confidence_threshold=settings.DETECTION_CONFIDENCE_THRESHOLD,
                model_path=settings.YOLO_MODEL_PATH if settings.DETECTION_METHOD == "yolo" else None,
                show_preview=settings.ENABLE_PREVIEW
            )
            logger.info(f"📹 Created shared {settings.DETECTION_METHOD} detector for all rooms")
        return self.detector
    
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
        time_since_last = now - last_publish
        should_detect = time_since_last >= settings.DETECTION_INTERVAL_SEC
        
        # Always accept frames to prevent WebSocket buffer overflow
        # But only run detection at intervals to save CPU
        if not should_detect:
            # Skip detection but still consume the frame
            logger.debug(f"⏭️ Skipping detection for {room} (last detection {time_since_last:.3f}s ago, interval: {settings.DETECTION_INTERVAL_SEC}s)")
            return
        
        # Log detection timing for diagnostics (debug level)
        logger.debug(f"🔍 Running detection for {room} (interval: {time_since_last:.3f}s since last)")
        
        # Get shared detector (single instance for all rooms)
        try:
            detector = self._get_detector()
        except Exception as e:
            logger.error(f"❌ Failed to get detector: {e}")
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
        
        # Update detection state
        self.ws_client.current_detection = detection
        
        # Send detection result via WebSocket (thread-safe)
        try:
            self.ws_client.publish_detection(detection, device_id, room)
        except Exception as e:
             logger.error(f"❌ Failed to publish detection result: {e}")
        
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
    
    def _process_detection_sync(self, frame: np.ndarray, meta: dict):
        """Synchronous detection processing (runs in thread pool).
        
        This method runs in a background thread to avoid blocking frame reception.
        """
        try:
            # Call the async detection method synchronously
            self._on_frame_received(frame, meta)
        except Exception as e:
            logger.error(f"❌ Error in background detection: {e}", exc_info=True)
    
    def start(self):
        """Start the camera service."""
        logger.info("="  * 60)
        logger.info("WheelSense Camera Service")
        logger.info("=" * 60)
        logger.info(f"WebSocket Backend: {settings.WEBSOCKET_BACKEND_URL}")
        logger.info(f"Device ID: {settings.DEVICE_ID}")
        logger.info(f"Detection Interval: {settings.DETECTION_INTERVAL_SEC}s")
        logger.info(f"Preview Mode: {'ENABLED' if settings.ENABLE_PREVIEW else 'DISABLED'}")
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
                frame_data = self.ws_client.get_frame(timeout=0.1)  # Reduced timeout for faster loop
                if frame_data:
                    frame, meta = frame_data
                    frame_count += 1
                    last_frame_time = time.time()
                    
                    if frame_count % 30 == 0:  # Log every 30 frames
                        logger.info(f"Processing video frames... (received {frame_count} frames so far)")
                    
                    # Submit detection to thread pool (non-blocking)
                    # This allows main loop to continue pulling frames while detection runs in background
                    self.detection_executor.submit(self._process_detection_sync, frame.copy(), meta.copy())
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
                              f"Frames={frame_count}, Detector={'loaded' if self.detector else 'not loaded'}")
                    last_health_log = current_time
                
        except KeyboardInterrupt:
            logger.info("Received interrupt signal")
        finally:
            self.stop()
    
    def stop(self):
        """Stop the camera service."""
        logger.info("Stopping camera service...")
        self.running = False
        
        # Shutdown detection executor
        logger.info("Shutting down detection executor...")
        self.detection_executor.shutdown(wait=True, cancel_futures=True)
        
        # Cleanup detector resources (including preview window)
        if self.detector:
            try:
                self.detector.cleanup()
            except Exception as e:
                logger.error(f"Error cleaning up detector: {e}")
        
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









