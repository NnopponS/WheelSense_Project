"""
Wheelchair Detection Module - Teachable Machine Based
Uses Google Teachable Machine Keras model to detect wheelchairs in video frames
"""

import cv2
import numpy as np
import logging
import os
import json
from typing import Optional, Tuple, Dict

logger = logging.getLogger(__name__)

# Try to import TensorFlow
try:
    os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'  # Suppress TF warnings
    import tensorflow as tf
    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False
    logger.warning("TensorFlow not installed. Please install with: pip install tensorflow")


class WheelchairDetector:
    """Wheelchair detection using Teachable Machine.
    
    Uses Teachable Machine Keras model to classify images:
    - 'Wheelchair' class: wheelchair detected
    - 'NoWheelChair' class: no wheelchair
    
    Logic:
    1. Preprocess frame to 224x224, normalize to [-1, 1]
    2. Run TensorFlow inference
    3. Check if 'Wheelchair' class has highest confidence above threshold
    """
    
    # Model paths
    MODEL_PATH = '/app/models/tm-my-image-model'
    FALLBACK_MODEL_PATH = 'tm-my-image-model'  # For local development
    
    def __init__(self, confidence_threshold: float = 0.5, model_path: str = None):
        self.confidence_threshold = confidence_threshold
        self.model = None
        self.labels = []
        self.image_size = 224
        self.loaded = False
        
        # Load model
        if TF_AVAILABLE:
            self._load_model(model_path)
        else:
            logger.error("❌ TensorFlow not available - detection disabled")
        
        # Position tracking
        self.last_detection_result = None
        self.stable_detection_count = 0
        self.no_detection_count = 0
        self.detection_state = False
        self.current_room_has_wheelchair = False
        
        # Frame counter
        self.frame_count = 0
        self.debug_interval = 30  # Log debug info every N frames
        
        logger.info("Teachable Machine Wheelchair Detector initialized")
        logger.info(f"  Confidence threshold: {self.confidence_threshold}")
        logger.info(f"  Model available: {self.loaded}")
        if self.loaded:
            logger.info(f"  Labels: {self.labels}")
            logger.info(f"  Image size: {self.image_size}x{self.image_size}")
    
    def _load_model(self, model_path: str = None):
        """Load Teachable Machine Keras model."""
        # Determine model path
        paths_to_try = []
        if model_path:
            paths_to_try.append(model_path)
        paths_to_try.extend([self.MODEL_PATH, self.FALLBACK_MODEL_PATH])
        
        model_dir = None
        for path in paths_to_try:
            if os.path.isdir(path):
                keras_path = os.path.join(path, "keras_model.h5")
                if os.path.exists(keras_path):
                    model_dir = path
                    break
        
        if not model_dir:
            logger.error(f"❌ No valid model directory found. Tried: {paths_to_try}")
            return
        
        try:
            # Load labels
            labels_path = os.path.join(model_dir, "labels.txt")
            metadata_path = os.path.join(model_dir, "metadata.json")
            
            if os.path.exists(metadata_path):
                with open(metadata_path) as f:
                    metadata = json.load(f)
                    self.labels = metadata.get("labels", [])
                    self.image_size = metadata.get("imageSize", 224)
            
            if os.path.exists(labels_path) and not self.labels:
                with open(labels_path) as f:
                    # Parse labels.txt format: "0 Wheelchair" or just "Wheelchair"
                    for line in f:
                        parts = line.strip().split(' ', 1)
                        if len(parts) == 2:
                            self.labels.append(parts[1])
                        else:
                            self.labels.append(parts[0])
            
            # Load Keras model
            keras_path = os.path.join(model_dir, "keras_model.h5")
            logger.info(f"📥 Loading Teachable Machine model: {keras_path}")
            
            self.model = tf.keras.models.load_model(keras_path, compile=False)
            self.loaded = True
            logger.info(f"✅ Model loaded successfully!")
            
        except Exception as e:
            logger.error(f"❌ Failed to load model: {e}")
            self.model = None
            self.loaded = False
    
    def detect(self, frame: np.ndarray) -> Dict:
        """
        Detect wheelchair using Teachable Machine.
        
        Returns:
            dict with keys:
                - detected: bool (True if wheelchair detected)
                - confidence: float (detection confidence)
                - bbox: tuple (x, y, w, h) - full frame bbox when detected
                - method: str ("teachable_machine")
                - class_name: str (detected class name)
                - position_changed: bool (whether detection state changed)
                - all_probs: dict (all class probabilities)
        """
        if frame is None or frame.size == 0:
            return self._create_result(False, 0.0, None, None, False, {})
        
        self.frame_count += 1
        
        # If model not available, return no detection
        if not self.loaded or self.model is None:
            if self.frame_count % self.debug_interval == 0:
                logger.warning("Teachable Machine model not available, detection disabled")
            return self._create_result(False, 0.0, None, None, False, {})
        
        try:
            # Preprocess image for Teachable Machine
            img = cv2.resize(frame, (self.image_size, self.image_size))
            img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            img = img.astype(np.float32) / 255.0
            img = (img - 0.5) / 0.5  # Normalize to [-1, 1]
            img = np.expand_dims(img, axis=0)
            
            # Run inference
            predictions = self.model.predict(img, verbose=0)[0]
            
            # Get results
            all_probs = {}
            for i, label in enumerate(self.labels):
                all_probs[label] = float(predictions[i])
            
            best_idx = np.argmax(predictions)
            best_label = self.labels[best_idx] if self.labels else str(best_idx)
            best_conf = float(predictions[best_idx])
            
            # Check for wheelchair detection
            # Look for "Wheelchair" in label name (case insensitive)
            # But NOT "NoWheelChair"
            is_wheelchair = (
                "wheelchair" in best_label.lower() and 
                "no" not in best_label.lower() and
                best_conf >= self.confidence_threshold
            )
            
            # State tracking
            prev_state = self.detection_state
            
            if is_wheelchair:
                self.stable_detection_count += 1
                self.no_detection_count = 0
                
                if self.stable_detection_count >= 2:
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
            
            # Teachable Machine is image classification, not object detection
            # It cannot provide accurate bounding box coordinates
            # So we return None for bbox - the UI should not draw bbox for classification models
            bbox = None
            
            # Log periodic status
            if self.frame_count % self.debug_interval == 0:
                logger.debug(f"📊 Frame {self.frame_count}: {best_label} ({best_conf:.2f}), "
                           f"detected={self.detection_state}")
            
            # Log state changes
            if state_changed:
                if self.detection_state:
                    logger.info(f"✅ Wheelchair DETECTED! {best_label} ({best_conf:.2f})")
                else:
                    logger.info(f"❌ Wheelchair LOST. Now: {best_label} ({best_conf:.2f})")
            
            return self._create_result(
                self.detection_state,
                best_conf,
                bbox,
                best_label,
                state_changed,
                all_probs
            )
            
        except Exception as e:
            logger.error(f"Detection error: {e}")
            return self._create_result(False, 0.0, None, None, False, {})
    
    def _create_result(self, detected: bool, confidence: float, bbox: Optional[Tuple],
                       class_name: Optional[str], position_changed: bool, 
                       all_probs: Dict) -> Dict:
        """Create a detection result dictionary."""
        return {
            "detected": detected,
            "confidence": round(confidence, 3),
            "bbox": bbox,
            "method": "teachable_machine",
            "class_name": class_name,
            "position_changed": position_changed,
            "all_probs": all_probs
        }
    
    def draw_detection(self, frame: np.ndarray, detection: Dict) -> np.ndarray:
        """Draw detection result on frame."""
        output = frame.copy()
        
        detected = detection.get("detected", False)
        confidence = detection.get("confidence", 0.0)
        class_name = detection.get("class_name", "unknown")
        all_probs = detection.get("all_probs", {})
        
        # Draw status
        if detected:
            color = (0, 255, 0)  # Green
            text = f"WHEELCHAIR ({confidence:.0%})"
        else:
            color = (0, 0, 255)  # Red
            text = f"{class_name} ({confidence:.0%})"
        
        cv2.putText(output, text, (10, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, color, 2)
        
        # Draw probability bars
        y = 80
        for label, prob in all_probs.items():
            bar_len = int(prob * 200)
            bar_color = (0, 255, 0) if "wheelchair" in label.lower() and "no" not in label.lower() else (100, 100, 255)
            cv2.rectangle(output, (10, y-15), (10+bar_len, y+5), bar_color, -1)
            cv2.putText(output, f"{label}: {prob:.0%}", (15, y), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
            y += 30
        
        # Draw method
        cv2.putText(output, "Method: Teachable Machine", (10, y + 10), 
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
    
    def get_background_mask(self, frame: np.ndarray) -> np.ndarray:
        """Get a detection visualization mask (for compatibility)."""
        if frame is None:
            return np.zeros((100, 100), dtype=np.uint8)
        
        # Run detection and create a mask
        detection = self.detect(frame)
        mask = np.zeros(frame.shape[:2], dtype=np.uint8)
        
        bbox = detection.get("bbox")
        if bbox is not None:
            x, y, w, h = bbox
            mask[y:y+h, x:x+w] = 255
        
        return mask
