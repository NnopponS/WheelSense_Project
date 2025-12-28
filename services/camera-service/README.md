# Camera Service - Wheelchair Detection

Service for detecting wheelchair from video sent from T-SIM Camera via MQTT

## Features

1. **Receive Video from MQTT** - Receive video from camera controller via MQTT topic `WheelSenseMockup/video`
2. **Detect Wheelchair** - Use OpenCV to detect wheelchair in video
3. **Send Detection Results** - Send detection results back to MQTT topic `WheelSenseMockup/detection`
4. **Control LED** - Receive LED control commands from MQTT topic `WheelSenseMockup/control`

## Configuration

Configure via environment variables:

- `MQTT_BROKER` - MQTT broker address (default: `broker.emqx.io`)
- `MQTT_PORT` - MQTT port (default: `1883`)
- `MQTT_TOPIC_VIDEO` - Topic for receiving video (default: `WheelSenseMockup/video`)
- `MQTT_TOPIC_DETECTION` - Topic for sending detection results (default: `WheelSenseMockup/detection`)
- `MQTT_TOPIC_CONTROL` - Topic for receiving control commands (default: `WheelSenseMockup/control`)
- `DEVICE_ID` - Device ID (default: `TSIM_001`)
- `DETECTION_METHOD` - Detection method: `yolo` or `teachable_machine` (default: `yolo`)
- `DETECTION_CONFIDENCE_THRESHOLD` - Detection threshold (default: `0.8`)
- `DETECTION_INTERVAL_SEC` - Detection interval in seconds (default: `1.0`)
- `YOLO_MODEL_PATH` - Path to YOLOv8 model file (default: `/app/models/yolov8-model/best.pt`)

## Running

### Docker Compose

```bash
cd docker
docker-compose up camera-service
```

### Standalone

```bash
cd docker/camera-service
pip install -r requirements.txt
python -m src.main
```

## Detection Methods

The service supports two detection methods:

### 1. YOLOv8 Object Detection (Default)
- **Type**: Object detection with bounding boxes
- **Model**: Custom-trained YOLOv8 model (`best.pt`)
- **Features**:
  - Accurate bounding box coordinates
  - Can detect multiple wheelchairs in one frame
  - Per-object confidence scores
  - Real-time detection
- **Model Location**: `/app/models/yolov8-model/best.pt`

### 2. Teachable Machine Classification
- **Type**: Image classification
- **Model**: Google Teachable Machine Keras model
- **Features**:
  - Binary classification (Wheelchair vs NoWheelChair)
  - 224x224 input image size
  - TensorFlow/Keras inference
  - Simpler and faster for binary detection
- **Model Location**: `/app/models/tm-my-image-model/`

### Switching Detection Methods

Set the `DETECTION_METHOD` environment variable:
- `DETECTION_METHOD=yolo` - Use YOLOv8 (default)
- `DETECTION_METHOD=teachable_machine` - Use Teachable Machine

Example in docker-compose.yml:
```yaml
camera-service:
  environment:
    - DETECTION_METHOD=yolo
    - YOLO_MODEL_PATH=/app/models/yolov8-model/best.pt
```

## MQTT Topics

### Subscribe
- `WheelSenseMockup/video` - Receive video from camera

### Publish
- `WheelSenseMockup/detection` - Send wheelchair detection results

### Message Format

#### Detection Result
```json
{
  "device_id": "TSIM_001",
  "timestamp": "2024-01-01T12:00:00+07:00",
  "detected": true,
  "confidence": 0.75,
  "bbox": [100, 200, 300, 400],
  "method": "hog"
}
```

## Notes

- Supports two detection methods: **YOLOv8** (object detection) and **Teachable Machine** (classification)
- YOLOv8 model should be placed in `/app/models/yolov8-model/best.pt`
- Teachable Machine model should be placed in `/app/models/tm-my-image-model/`
- See `models/README.md` for model setup instructions
- Use `DETECTION_METHOD` environment variable to switch between methods
