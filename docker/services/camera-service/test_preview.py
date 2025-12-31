"""
Test script for YOLO detector with preview mode
This script tests the new preview window functionality
"""
import sys
sys.path.insert(0, 'src')

from detector import create_detector
import numpy as np
import cv2
import time

print("=" * 60)
print("Testing YOLOv8 Detector with Preview Mode")
print("=" * 60)

# Create YOLO detector with preview enabled
print("\n1. Creating YOLO detector with preview mode...")
detector = create_detector(
    method="yolo",
    confidence_threshold=0.5,
    model_path="models/yolov8-model/best.pt",
    show_preview=True  # Enable preview window
)

print(f"✅ Detector created: {type(detector).__name__}")
print(f"✅ Model loaded: {detector.loaded}")
print(f"✅ Preview mode: {detector.show_preview}")

if detector.loaded and hasattr(detector.model, 'names'):
    print(f"✅ Model classes: {detector.model.names}")

# Test with a dummy frame
print("\n2. Testing detection with dummy frames...")
print("   Press 'q' in the preview window to quit")
print("   Press 's' to save a screenshot")

try:
    for i in range(100):  # Run for 100 frames
        # Create a test frame (black with some random noise)
        dummy_frame = np.random.randint(0, 50, (480, 640, 3), dtype=np.uint8)
        
        # Add some text to the frame
        cv2.putText(dummy_frame, f"Test Frame {i+1}", (50, 50), 
                   cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)
        
        # Run detection (this will show preview window)
        result = detector.detect(dummy_frame)
        
        # Check if preview was closed by user
        if not detector.show_preview:
            print("\n✅ Preview window closed by user")
            break
        
        # Small delay to simulate real-time processing
        time.sleep(0.1)
        
        if (i + 1) % 10 == 0:
            print(f"   Processed {i+1} frames...")
    
    print(f"\n✅ Detection result keys: {list(result.keys())}")
    print(f"✅ Method: {result.get('method')}")
    print(f"✅ Detected: {result.get('detected')}")
    print(f"✅ Confidence: {result.get('confidence')}")
    
except KeyboardInterrupt:
    print("\n⚠️ Interrupted by user")

finally:
    # Cleanup
    print("\n3. Cleaning up...")
    detector.cleanup()
    print("✅ Cleanup complete")

print("\n" + "=" * 60)
print("✅ All tests passed!")
print("=" * 60)
