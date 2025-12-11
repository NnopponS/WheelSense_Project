"""
Wheelchair Detection Module
ใช้ OpenCV สำหรับตรวจจับ wheelchair ในวิดีโอ
"""

import cv2
import numpy as np
import logging
from typing import Optional, Tuple, Dict

logger = logging.getLogger(__name__)


class WheelchairDetector:
    """Wheelchair detection using computer vision."""
    
    def __init__(self, confidence_threshold: float = 0.5):
        self.confidence_threshold = confidence_threshold
        self.detector = None
        self._init_detector()
    
    def _init_detector(self):
        """Initialize the detector."""
        # ใช้ OpenCV Cascade Classifier หรือ HOG detector
        # สำหรับการทดสอบ ใช้การตรวจจับแบบง่ายๆ ด้วย contour detection
        
        # สร้าง HOG descriptor สำหรับ person detection (wheelchair อาจมีลักษณะคล้าย)
        try:
            self.hog = cv2.HOGDescriptor()
            self.hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
            logger.info("HOG detector initialized")
        except Exception as e:
            logger.warning(f"Failed to initialize HOG detector: {e}")
            self.hog = None
        
        # สำหรับ wheelchair detection ที่เฉพาะเจาะจงมากขึ้น
        # สามารถใช้ YOLO model หรือ custom trained model ได้
        logger.info("Wheelchair detector initialized")
    
    def detect(self, frame: np.ndarray) -> Dict:
        """
        Detect wheelchair in frame.
        
        Returns:
            dict with keys:
                - detected: bool
                - confidence: float
                - bbox: tuple (x, y, w, h) or None
                - method: str
        """
        if frame is None or frame.size == 0:
            return {
                "detected": False,
                "confidence": 0.0,
                "bbox": None,
                "method": "none"
            }
        
        # Method 1: ใช้ HOG detector สำหรับตรวจจับ person/wheelchair
        if self.hog is not None:
            try:
                # Convert to grayscale
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                
                # Detect objects
                boxes, weights = self.hog.detectMultiScale(
                    gray,
                    winStride=(8, 8),
                    padding=(32, 32),
                    scale=1.05,
                    hitThreshold=0.5
                )
                
                if len(boxes) > 0:
                    # หา box ที่มี confidence สูงสุด
                    max_idx = np.argmax(weights)
                    x, y, w, h = boxes[max_idx]
                    confidence = float(weights[max_idx])
                    
                    if confidence >= self.confidence_threshold:
                        return {
                            "detected": True,
                            "confidence": confidence,
                            "bbox": (int(x), int(y), int(w), int(h)),
                            "method": "hog"
                        }
            except Exception as e:
                logger.error(f"HOG detection error: {e}")
        
        # Method 2: ใช้ contour detection สำหรับตรวจจับวัตถุขนาดใหญ่ (wheelchair)
        try:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            blurred = cv2.GaussianBlur(gray, (5, 5), 0)
            
            # Adaptive threshold
            thresh = cv2.adaptiveThreshold(
                blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY_INV, 11, 2
            )
            
            # Find contours
            contours, _ = cv2.findContours(
                thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )
            
            # Filter contours by size (wheelchair should be relatively large)
            h, w = frame.shape[:2]
            min_area = (w * h) * 0.05  # อย่างน้อย 5% ของภาพ
            max_area = (w * h) * 0.8   # ไม่เกิน 80% ของภาพ
            
            for contour in contours:
                area = cv2.contourArea(contour)
                if min_area <= area <= max_area:
                    x, y, w, h = cv2.boundingRect(contour)
                    aspect_ratio = w / h if h > 0 else 0
                    
                    # Wheelchair มักมี aspect ratio ประมาณ 1.0-1.5
                    if 0.8 <= aspect_ratio <= 2.0:
                        # คำนวณ confidence จากขนาดและ aspect ratio
                        confidence = min(0.7, area / max_area)
                        
                        if confidence >= self.confidence_threshold:
                            return {
                                "detected": True,
                                "confidence": confidence,
                                "bbox": (int(x), int(y), int(w), int(h)),
                                "method": "contour"
                            }
        except Exception as e:
            logger.error(f"Contour detection error: {e}")
        
        # No detection
        return {
            "detected": False,
            "confidence": 0.0,
            "bbox": None,
            "method": "none"
        }
    
    def draw_detection(self, frame: np.ndarray, detection: Dict) -> np.ndarray:
        """Draw detection result on frame."""
        if not detection.get("detected", False):
            return frame
        
        bbox = detection.get("bbox")
        if bbox is None:
            return frame
        
        x, y, w, h = bbox
        confidence = detection.get("confidence", 0.0)
        
        # Draw bounding box
        cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 0), 2)
        
        # Draw label
        label = f"Wheelchair {confidence:.2f}"
        cv2.putText(
            frame, label, (x, y - 10),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2
        )
        
        return frame















