"""
Wheelchair Detection Module - YOLO GPU Accelerated
Uses YOLOv8 with GPU acceleration for real-time wheelchair detection
"""

import cv2
import numpy as np
import logging
import os
from typing import Optional, Tuple, Dict

logger = logging.getLogger(__name__)

# Try to import YOLO
try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    logger.warning("Ultralytics not installed. Please install with: pip install ultralytics")

# Try to import torch for GPU detection
try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    logger.warning("PyTorch not installed - GPU acceleration disabled")


class YOLODetector:
    """Wheelchair detection using YOLOv8 with GPU acceleration.
    
    Uses YOLOv8 model to detect wheelchairs with bounding boxes:
    - Provides accurate bounding box coordinates
    - Can detect multiple wheelchairs in one frame
    - Returns per-object confidence scores
    - GPU accelerated for real-time performance
    
    Logic:
    1. Load YOLOv8 model from .pt file
    2. Move model to GPU if available
    3. Run inference on frame
    4. Filter detections by confidence threshold
    5. Return detections with bounding boxes
    """
    
    # Model paths
    MODEL_PATH = '/app/models/yolov8-model/best.pt'
    FALLBACK_MODEL_PATH = 'models/yolov8-model/best.pt'  # For local development
    
    def __init__(self, confidence_threshold: float = 0.5, model_path: str = None, show_preview: bool = False):
        self.confidence_threshold = confidence_threshold
        self.model = None
        self.loaded = False
        self.device = 'cpu'
        self.show_preview = show_preview
        self.preview_window_name = "WheelSense YOLO Detection"
        
        # Detect GPU
        if TORCH_AVAILABLE:
            if torch.cuda.is_available():
                self.device = 'cuda'
                gpu_name = torch.cuda.get_device_name(0)
                vram_total = torch.cuda.get_device_properties(0).total_memory / 1024**3
                logger.info(f"🚀 GPU detected: {gpu_name} ({vram_total:.1f} GB VRAM)")
            else:
                logger.warning("⚠️ CUDA not available - using CPU (slower)")
        else:
            logger.warning("⚠️ PyTorch not available - using CPU")
        
        # Load model
        if YOLO_AVAILABLE:
            self._load_model(model_path)
        else:
            logger.error("❌ Ultralytics not available - YOLO detection disabled")
        
        # Position tracking
        self.last_detection_result = None
        self.stable_detection_count = 0
        self.no_detection_count = 0
        self.detection_state = False
        self.current_room_has_wheelchair = False
        
        # Frame counter
        self.frame_count = 0
        self.debug_interval = 30  # Log debug info every N frames
        
        logger.info("YOLOv8 Wheelchair Detector initialized")
        logger.info(f"  Device: {self.device.upper()}")
        logger.info(f"  Confidence threshold: {self.confidence_threshold}")
        logger.info(f"  Model available: {self.loaded}")
        logger.info(f"  Preview mode: {self.show_preview}")
        
        # Initialize preview window if enabled
        if self.show_preview:
            try:
                cv2.namedWindow(self.preview_window_name, cv2.WINDOW_NORMAL)
                cv2.resizeWindow(self.preview_window_name, 800, 600)
                logger.info(f"📺 Preview window created: {self.preview_window_name}")
                logger.info("   Press 'q' to close preview, 's' to save screenshot")
            except cv2.error as e:
                logger.warning(f"⚠️ OpenCV GUI not available: {e}")
                logger.warning("⚠️ Preview mode disabled - OpenCV was built without GUI support")
                logger.info("💡 To enable preview, install opencv-python with GUI support:")
                logger.info("   pip uninstall opencv-python opencv-python-headless")
                logger.info("   pip install opencv-contrib-python")
                self.show_preview = False
    
    def _load_model(self, model_path: str = None):
        """Load YOLOv8 model and move to GPU if available."""
        # Determine model path
        paths_to_try = []
        if model_path:
            paths_to_try.append(model_path)
        paths_to_try.extend([self.MODEL_PATH, self.FALLBACK_MODEL_PATH])
        
        model_file = None
        for path in paths_to_try:
            if os.path.exists(path):
                model_file = path
                break
        
        if not model_file:
            logger.error(f"❌ No valid YOLO model file found. Tried: {paths_to_try}")
            return
        
        try:
            logger.info(f"📥 Loading YOLOv8 model: {model_file}")
            self.model = YOLO(model_file)
            
            # Move model to GPU
            if self.device == 'cuda':
                self.model.to(self.device)
                logger.info(f"✅ Model moved to GPU ({self.device})")
            
            self.loaded = True
            logger.info(f"✅ YOLOv8 model loaded successfully!")
            
            # Log model info
            if hasattr(self.model, 'names'):
                logger.info(f"  Classes: {self.model.names}")
            
        except Exception as e:
            logger.error(f"❌ Failed to load YOLO model: {e}")
            self.model = None
            self.loaded = False
    
    def detect(self, frame: np.ndarray) -> Dict:
        """
        Detect wheelchair using YOLOv8 on GPU.
        
        Returns:
            dict with keys:
                - detected: bool (True if wheelchair detected)
                - confidence: float (highest detection confidence)
                - bbox: tuple (x, y, w, h) - bounding box of highest confidence detection
                - method: str ("yolo")
                - class_name: str (detected class name)
                - position_changed: bool (whether detection state changed)
                - all_probs: dict (class probabilities)
                - detections: list (all detections with bbox and confidence)
        """
        if frame is None or frame.size == 0:
            return self._create_result(False, 0.0, None, None, False, {}, [])
        
        self.frame_count += 1
        
        # If model not available, return no detection
        if not self.loaded or self.model is None:
            if self.frame_count % self.debug_interval == 0:
                logger.warning("YOLOv8 model not available, detection disabled")
            return self._create_result(False, 0.0, None, None, False, {}, [])
        
        try:
            # Run YOLOv8 inference on GPU
            results = self.model(frame, conf=self.confidence_threshold, verbose=False, device=self.device)
            
            # Parse detections
            detections = []
            best_conf = 0.0
            best_bbox = None
            best_class = None
            
            if len(results) > 0:
                result = results[0]
                boxes = result.boxes
                
                for box in boxes:
                    # Get bounding box coordinates (xyxy format)
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                    
                    # Convert to xywh format
                    x, y, w, h = int(x1), int(y1), int(x2 - x1), int(y2 - y1)
                    
                    # Get confidence and class
                    conf = float(box.conf[0].cpu().numpy())
                    cls = int(box.cls[0].cpu().numpy())
                    class_name = self.model.names[cls] if hasattr(self.model, 'names') else str(cls)
                    
                    # Store detection
                    detections.append({
                        'bbox': (x, y, w, h),
                        'confidence': conf,
                        'class': class_name
                    })
                    
                    # Track best detection
                    if conf > best_conf:
                        best_conf = conf
                        best_bbox = (x, y, w, h)
                        best_class = class_name
            
            # Determine detection state
            prev_state = self.detection_state
            is_detected = len(detections) > 0
            
            if is_detected:
                self.stable_detection_count += 1
                self.no_detection_count = 0
                
                # Immediate detection (changed from >= 2 to >= 1)
                # This allows instant detection when YOLO finds wheelchair above threshold
                if self.stable_detection_count >= 1:
                    self.detection_state = True
                    self.current_room_has_wheelchair = True
            else:
                self.no_detection_count += 1
                self.stable_detection_count = 0
                
                if self.no_detection_count >= 5:
                    self.detection_state = False
                    self.current_room_has_wheelchair = False
            
            # Determine if state changed
            state_changed = self.detection_state != prev_state
            
            # Create probability dict
            all_probs = {}
            if best_class:
                all_probs[best_class] = best_conf
            
            # Log periodic status
            if self.frame_count % self.debug_interval == 0:
                logger.debug(f"📊 Frame {self.frame_count}: {len(detections)} detections, "
                           f"detected={self.detection_state}, device={self.device}")
            
            # Log state changes
            if state_changed:
                if self.detection_state:
                    logger.info(f"✅ Wheelchair DETECTED! {len(detections)} object(s), "
                              f"best: {best_class} ({best_conf:.2f})")
                else:
                    logger.info(f"❌ Wheelchair LOST. No detections above threshold.")
            
            # Show preview window if enabled
            if self.show_preview:
                self._show_preview(frame, detections, self.detection_state, best_conf)
            
            return self._create_result(
                self.detection_state,
                best_conf,
                best_bbox,
                best_class,
                state_changed,
                all_probs,
                detections
            )
            
        except Exception as e:
            logger.error(f"Detection error: {e}")
            return self._create_result(False, 0.0, None, None, False, {}, [])
    
    def _show_preview(self, frame: np.ndarray, detections: list, detected: bool, confidence: float):
        """Show preview window with detection visualization."""
        try:
            display_frame = frame.copy()
            
            # Draw all detections
            for det in detections:
                bbox = det['bbox']
                conf = det['confidence']
                cls = det['class']
                
                x, y, w, h = bbox
                
                # Draw bounding box
                color = (0, 255, 0)  # Green
                cv2.rectangle(display_frame, (x, y), (x + w, y + h), color, 3)
                
                # Draw label with background
                label = f"{cls}: {conf:.0%}"
                label_size, _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
                cv2.rectangle(display_frame, (x, y - label_size[1] - 15), 
                             (x + label_size[0] + 10, y), color, -1)
                cv2.putText(display_frame, label, (x + 5, y - 8), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2)
            
            # Draw status banner
            banner_height = 60
            overlay = display_frame.copy()
            if detected:
                status_color = (0, 200, 0)  # Green
                status_text = f"WHEELCHAIR DETECTED ({len(detections)} object(s))"
            else:
                status_color = (0, 0, 200)  # Red
                status_text = "NO WHEELCHAIR"
            
            cv2.rectangle(overlay, (0, 0), (display_frame.shape[1], banner_height), (0, 0, 0), -1)
            cv2.addWeighted(overlay, 0.6, display_frame, 0.4, 0, display_frame)
            
            cv2.putText(display_frame, status_text, (15, 35), 
                       cv2.FONT_HERSHEY_SIMPLEX, 1.0, status_color, 2)
            
            # Draw method and device info
            info_text = f"YOLOv8 ({self.device.upper()}) | Threshold: {self.confidence_threshold:.0%} | Frame: {self.frame_count}"
            cv2.putText(display_frame, info_text, (15, display_frame.shape[0] - 15), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
            
            # Show frame
            cv2.imshow(self.preview_window_name, display_frame)
            
            # Handle keyboard input (non-blocking)
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                logger.info("Preview window closed by user (q pressed)")
                cv2.destroyWindow(self.preview_window_name)
                self.show_preview = False
            elif key == ord('s'):
                # Save screenshot
                import time
                filename = f"screenshot_{int(time.time())}.jpg"
                cv2.imwrite(filename, display_frame)
                logger.info(f"📸 Screenshot saved: {filename}")
                
        except Exception as e:
            logger.error(f"Error showing preview: {e}")
            # Disable preview on error to prevent spam
            self.show_preview = False
    
    def _create_result(self, detected: bool, confidence: float, bbox: Optional[Tuple],
                       class_name: Optional[str], position_changed: bool, 
                       all_probs: Dict, detections: list) -> Dict:
        """Create a detection result dictionary."""
        return {
            "detected": detected,
            "confidence": round(confidence, 3),
            "bbox": bbox,
            "method": "yolo",
            "class_name": class_name,
            "position_changed": position_changed,
            "all_probs": all_probs,
            "detections": detections
        }
    
    def draw_detection(self, frame: np.ndarray, detection: Dict) -> np.ndarray:
        """Draw detection result on frame."""
        output = frame.copy()
        
        detected = detection.get("detected", False)
        confidence = detection.get("confidence", 0.0)
        detections = detection.get("detections", [])
        
        # Draw all detections
        for det in detections:
            bbox = det['bbox']
            conf = det['confidence']
            cls = det['class']
            
            x, y, w, h = bbox
            
            # Draw bounding box
            color = (0, 255, 0)  # Green
            cv2.rectangle(output, (x, y), (x + w, y + h), color, 2)
            
            # Draw label
            label = f"{cls}: {conf:.0%}"
            label_size, _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            cv2.rectangle(output, (x, y - label_size[1] - 10), 
                         (x + label_size[0], y), color, -1)
            cv2.putText(output, label, (x, y - 5), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)
        
        # Draw status
        if detected:
            status_color = (0, 255, 0)  # Green
            status_text = f"WHEELCHAIR DETECTED ({len(detections)} object(s))"
        else:
            status_color = (0, 0, 255)  # Red
            status_text = "NO WHEELCHAIR"
        
        cv2.putText(output, status_text, (10, 40), 
                   cv2.FONT_HERSHEY_SIMPLEX, 1.0, status_color, 2)
        
        # Draw method and device
        cv2.putText(output, f"Method: YOLOv8 ({self.device.upper()})", (10, 80), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        
        return output
    
    def reset(self):
        """Reset detector state."""
        self.stable_detection_count = 0
        self.no_detection_count = 0
        self.detection_state = False
        self.current_room_has_wheelchair = False
        self.frame_count = 0
        self.last_detection_result = None
        logger.info("Detector reset")
    
    def cleanup(self):
        """Cleanup resources including preview window."""
        if self.show_preview:
            try:
                cv2.destroyWindow(self.preview_window_name)
                logger.info("Preview window closed")
            except Exception as e:
                logger.error(f"Error closing preview window: {e}")
        self.show_preview = False
    
    def get_background_mask(self, frame: np.ndarray) -> np.ndarray:
        """Get a detection visualization mask."""
        if frame is None:
            return np.zeros((100, 100), dtype=np.uint8)
        
        # Run detection and create a mask
        detection = self.detect(frame)
        mask = np.zeros(frame.shape[:2], dtype=np.uint8)
        
        # Draw all detections on mask
        for det in detection.get("detections", []):
            x, y, w, h = det['bbox']
            mask[y:y+h, x:x+w] = 255
        
        return mask


def create_detector(method: str = "yolo", confidence_threshold: float = 0.5, 
                   model_path: str = None, show_preview: bool = False):
    """
    Factory function to create the YOLO detector.
    
    Args:
        method: Detection method (only "yolo" supported now)
        confidence_threshold: Confidence threshold for detections
        model_path: Optional custom model path
        show_preview: Enable OpenCV preview window for debugging
    
    Returns:
        YOLODetector instance
    """
    method = method.lower()
    
    if method != "yolo":
        logger.warning(f"Unknown detection method '{method}', defaulting to YOLO")
    
    logger.info("🚀 Creating YOLOv8 detector with GPU acceleration")
    return YOLODetector(confidence_threshold, model_path, show_preview)
