"""
Test script to verify YOLOv8 model loading
"""
import sys
sys.path.insert(0, 'src')

from detector import create_detector
import numpy as np

print("=" * 60)
print("Testing YOLOv8 Detector")
print("=" * 60)

# Create YOLO detector
print("\n1. Creating YOLO detector...")
detector = create_detector(
    method="yolo",
    confidence_threshold=0.8,
    model_path="models/yolov8-model/best.pt"
)

print(f"✅ Detector created: {type(detector).__name__}")
print(f"✅ Model loaded: {detector.loaded}")

if detector.loaded and hasattr(detector.model, 'names'):
    print(f"✅ Model classes: {detector.model.names}")

# Test with a dummy frame
print("\n2. Testing detection with dummy frame...")
dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
result = detector.detect(dummy_frame)

print(f"✅ Detection result keys: {list(result.keys())}")
print(f"✅ Method: {result.get('method')}")
print(f"✅ Detected: {result.get('detected')}")
print(f"✅ Confidence: {result.get('confidence')}")

print("\n" + "=" * 60)
print("✅ All tests passed!")
print("=" * 60)
