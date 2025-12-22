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
- `DETECTION_CONFIDENCE_THRESHOLD` - Detection threshold (default: `0.5`)
- `DETECTION_INTERVAL_SEC` - Detection interval in seconds (default: `1.0`)

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

1. **HOG Detector** - Uses HOG descriptor for detecting person/wheelchair
2. **Contour Detection** - Uses contour detection for detecting large objects

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

- Uses public MQTT broker (`broker.emqx.io`) for testing
- Can be changed to local MQTT broker by modifying `MQTT_BROKER` environment variable
- For more accurate detection, can use YOLO model by modifying `USE_YOLO` in config
