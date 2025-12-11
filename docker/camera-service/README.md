# Camera Service - Wheelchair Detection

บริการตรวจจับ wheelchair จากวิดีโอที่ส่งมาจาก T-SIM Camera ผ่าน MQTT

## Features

1. **รับวิดีโอจาก MQTT** - รับวิดีโอจาก camera controller ผ่าน MQTT topic `WheelSenseMockup/video`
2. **ตรวจจับ Wheelchair** - ใช้ OpenCV สำหรับตรวจจับ wheelchair ในวิดีโอ
3. **ส่งผลการตรวจจับ** - ส่งผลการตรวจจับกลับไปยัง MQTT topic `WheelSenseMockup/detection`
4. **ควบคุม LED** - รับคำสั่งควบคุม LED จาก MQTT topic `WheelSenseMockup/control`

## Configuration

ตั้งค่าผ่าน environment variables:

- `MQTT_BROKER` - MQTT broker address (default: `broker.emqx.io`)
- `MQTT_PORT` - MQTT port (default: `1883`)
- `MQTT_TOPIC_VIDEO` - Topic สำหรับรับวิดีโอ (default: `WheelSenseMockup/video`)
- `MQTT_TOPIC_DETECTION` - Topic สำหรับส่งผลการตรวจจับ (default: `WheelSenseMockup/detection`)
- `MQTT_TOPIC_CONTROL` - Topic สำหรับรับคำสั่งควบคุม (default: `WheelSenseMockup/control`)
- `DEVICE_ID` - Device ID (default: `TSIM_001`)
- `DETECTION_CONFIDENCE_THRESHOLD` - Threshold สำหรับการตรวจจับ (default: `0.5`)
- `DETECTION_INTERVAL_SEC` - ตรวจจับทุกกี่วินาที (default: `1.0`)

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

1. **HOG Detector** - ใช้ HOG descriptor สำหรับตรวจจับ person/wheelchair
2. **Contour Detection** - ใช้ contour detection สำหรับตรวจจับวัตถุขนาดใหญ่

## MQTT Topics

### Subscribe
- `WheelSenseMockup/video` - รับวิดีโอจาก camera

### Publish
- `WheelSenseMockup/detection` - ส่งผลการตรวจจับ wheelchair

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

- ใช้ public MQTT broker (`broker.emqx.io`) สำหรับการทดสอบ
- สามารถเปลี่ยนเป็น local MQTT broker ได้โดยแก้ไข `MQTT_BROKER` environment variable
- สำหรับการตรวจจับที่แม่นยำมากขึ้น สามารถใช้ YOLO model ได้โดยแก้ไข `USE_YOLO` ใน config













