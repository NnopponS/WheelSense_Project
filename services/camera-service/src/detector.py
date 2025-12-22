"""
Wheelchair Detection Module - Background Subtraction Based
Uses Background Subtraction (MOG2) to separate objects from background
and detects only when object changes position
"""

import cv2
import numpy as np
import logging
from typing import Optional, Tuple, Dict, List

logger = logging.getLogger(__name__)


class WheelchairDetector:
    """Wheelchair detection using background subtraction.
    
    Logic: 
    1. Use MOG2 Background Subtractor to separate foreground objects from background
    2. Filter noise with morphological operations
    3. Track object position and detect only when object changes position
    """
    
    def __init__(self, confidence_threshold: float = 0.5):
        self.confidence_threshold = confidence_threshold
        
        # Background Subtractor (MOG2 - Mixture of Gaussians)
        # history=500: number of frames used to build background model
        # varThreshold=50: threshold for separating foreground (higher = less sensitive to noise)
        # detectShadows=False: don't detect shadows
        self.bg_subtractor = cv2.createBackgroundSubtractorMOG2(
            history=300,
            varThreshold=25,  # Lower = more sensitive to changes
            detectShadows=False
        )
        
        # Morphological kernel for noise reduction
        self.kernel_noise = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        self.kernel_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (20, 20))
        
        # Object tracking settings
        self.min_object_area = 500  # Minimum area in pixels (lowered for sensitivity)
        self.max_object_area_percent = 70  # Maximum % of frame (filter out too large objects)
        
        # Debug settings
        self.debug_interval = 30  # Log debug info every N frames
        
        # Position tracking
        self.last_object_center: Optional[Tuple[int, int]] = None
        self.position_change_threshold = 30  # Pixels - minimum distance to consider as "moved"
        
        # State management
        self.stable_object_count = 0  # Counter for stable object detection
        self.no_object_count = 0
        self.detection_state = False
        self.current_room_has_wheelchair = False
        
        # Frame counter for background learning
        self.frame_count = 0
        self.learning_frames = 30  # Frames needed to learn background
        
        logger.info("Background Subtraction wheelchair detector initialized")
        logger.info(f"  Min object area: {self.min_object_area} px")
        logger.info(f"  Position change threshold: {self.position_change_threshold} px")
        logger.info(f"  Background learning frames: {self.learning_frames}")
    
    def detect(self, frame: np.ndarray) -> Dict:
        """
        Detect objects using background subtraction.
        Only triggers when a significant object is detected and has moved.
        
        Returns:
            dict with keys:
                - detected: bool (True if wheelchair detected in this room)
                - confidence: float (based on object size and stability)
                - bbox: tuple (x, y, w, h) of object or None
                - method: str ("background_subtraction")
                - object_area: float (area of detected object)
                - position_changed: bool (whether object moved significantly)
        """
        if frame is None or frame.size == 0:
            return self._create_result(False, 0.0, None, 0.0, False)
        
        self.frame_count += 1
        frame_height, frame_width = frame.shape[:2]
        frame_area = frame_height * frame_width
        
        # Apply background subtraction
        # learningRate: -1 = auto, smaller = slower learning (more stable background)
        learning_rate = 0.01 if self.frame_count > self.learning_frames else 0.1
        fg_mask = self.bg_subtractor.apply(frame, learningRate=learning_rate)
        
        # Still learning background
        if self.frame_count < self.learning_frames:
            logger.debug(f"Learning background... ({self.frame_count}/{self.learning_frames})")
            return self._create_result(False, 0.0, None, 0.0, False)
        
        # Apply morphological operations to reduce noise
        # 1. Opening: remove small noise (erode then dilate)
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, self.kernel_noise)
        
        # 2. Closing: fill holes in objects (dilate then erode)
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_CLOSE, self.kernel_close)
        
        # 3. Additional threshold to remove gray areas
        _, fg_mask = cv2.threshold(fg_mask, 200, 255, cv2.THRESH_BINARY)
        
        # Find contours of foreground objects
        contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Calculate foreground coverage for debugging
        fg_pixels = cv2.countNonZero(fg_mask)
        fg_percent = (fg_pixels / frame_area) * 100
        
        # Debug log every N frames
        if self.frame_count % self.debug_interval == 0:
            logger.info(f"📊 Frame {self.frame_count}: FG={fg_percent:.1f}%, Contours={len(contours)}")
        
        # Filter and find significant objects
        valid_objects: List[Tuple[np.ndarray, float, Tuple[int, int, int, int]]] = []
        
        for contour in contours:
            area = cv2.contourArea(contour)
            area_percent = (area / frame_area) * 100
            
            # Filter by area
            if area < self.min_object_area:
                continue  # Too small, probably noise
            
            if area_percent > self.max_object_area_percent:
                continue  # Too large, probably lighting change or camera movement
            
            x, y, w, h = cv2.boundingRect(contour)
            
            # Filter by aspect ratio (wheelchair-like objects are roughly square-ish)
            aspect_ratio = w / h if h > 0 else 0
            if aspect_ratio < 0.3 or aspect_ratio > 3.0:
                continue  # Too narrow or too wide
            
            valid_objects.append((contour, area, (x, y, w, h)))
        
        # No valid objects detected
        if not valid_objects:
            self.no_object_count += 1
            self.stable_object_count = 0
            
            # After many frames without detection, reset state
            if self.no_object_count >= 10:
                self.detection_state = False
                self.last_object_center = None
            
            return self._create_result(
                self.detection_state, 
                0.0 if not self.detection_state else 0.5, 
                None, 0.0, False
            )
        
        # Get the largest valid object
        largest_object = max(valid_objects, key=lambda x: x[1])
        contour, area, bbox = largest_object
        x, y, w, h = bbox
        
        # Calculate object center
        current_center = (x + w // 2, y + h // 2)
        
        # Check if position changed significantly
        position_changed = False
        if self.last_object_center is not None:
            distance = np.sqrt(
                (current_center[0] - self.last_object_center[0]) ** 2 +
                (current_center[1] - self.last_object_center[1]) ** 2
            )
            position_changed = distance >= self.position_change_threshold
            
            if position_changed:
                logger.info(f"🚀 Object moved! Distance: {distance:.1f}px, New position: {current_center}")
        else:
            # First time seeing an object
            position_changed = True
            logger.info(f"🆕 New object detected at position: {current_center}")
        
        # Update tracking
        self.last_object_center = current_center
        self.no_object_count = 0
        self.stable_object_count += 1
        
        # Calculate confidence
        area_percent = (area / frame_area) * 100
        confidence = min(1.0, area_percent / 20.0)  # Max confidence at 20% of frame
        
        # Update detection state
        # Immediately confirm when we see an object (even if not moved)
        if self.stable_object_count >= 1:
            if not self.detection_state or position_changed:
                self.detection_state = True
                self.current_room_has_wheelchair = True
                logger.info(f"✅ Wheelchair confirmed! Area: {area_percent:.1f}%, Confidence: {confidence:.2f}, Room will be updated")
        
        return self._create_result(
            self.detection_state,
            confidence if self.detection_state else 0.0,
            bbox,
            area_percent,
            position_changed
        )
    
    def _create_result(self, detected: bool, confidence: float, bbox: Optional[Tuple], 
                       object_area: float, position_changed: bool) -> Dict:
        """Create a detection result dictionary."""
        return {
            "detected": detected,
            "confidence": round(confidence, 2),
            "bbox": bbox,
            "method": "background_subtraction",
            "object_area": round(object_area, 2),
            "position_changed": position_changed
        }
    
    def draw_detection(self, frame: np.ndarray, detection: Dict) -> np.ndarray:
        """Draw detection result on frame."""
        bbox = detection.get("bbox")
        object_area = detection.get("object_area", 0.0)
        detected = detection.get("detected", False)
        
        if bbox is not None:
            x, y, w, h = bbox
            color = (0, 255, 0) if detected else (0, 255, 255)  # Green if detected, yellow otherwise
            cv2.rectangle(frame, (x, y), (x + w, y + h), color, 2)
            
            # Draw center point
            center_x, center_y = x + w // 2, y + h // 2
            cv2.circle(frame, (center_x, center_y), 5, (0, 0, 255), -1)
        
        # Draw status
        status_color = (0, 255, 0) if detected else (0, 0, 255)
        status_text = "WHEELCHAIR IN ROOM" if detected else "NO WHEELCHAIR"
        cv2.putText(frame, status_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, status_color, 2)
        
        # Draw object area
        if object_area > 0:
            cv2.putText(frame, f"Object: {object_area:.1f}%", (10, 60), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        
        # Draw learning status
        if self.frame_count < self.learning_frames:
            cv2.putText(frame, f"Learning BG: {self.frame_count}/{self.learning_frames}", 
                       (10, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 165, 0), 2)
        
        return frame
    
    def reset(self):
        """Reset detector state and background model."""
        self.bg_subtractor = cv2.createBackgroundSubtractorMOG2(
            history=500,
            varThreshold=50,
            detectShadows=False
        )
        self.last_object_center = None
        self.stable_object_count = 0
        self.no_object_count = 0
        self.detection_state = False
        self.current_room_has_wheelchair = False
        self.frame_count = 0
        logger.info("Detector reset - background model cleared")
    
    def get_background_mask(self, frame: np.ndarray) -> np.ndarray:
        """Get the current foreground mask for debugging."""
        if frame is None:
            return np.zeros((100, 100), dtype=np.uint8)
        
        fg_mask = self.bg_subtractor.apply(frame, learningRate=0)
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, self.kernel_noise)
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_CLOSE, self.kernel_close)
        return fg_mask















