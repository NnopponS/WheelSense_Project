# T-SIM Camera Controller with MQTT Streaming

## Description
T-SIM Camera Controller สำหรับระบบ WheelSense ที่สามารถ:
- **WiFi Manager** - เชื่อมต่อ WiFi ผ่าน Web Portal
- **Video Streaming** - ส่งวิดีโอแบบ real-time ไปยัง MQTT broker
- **Audio Streaming** - ส่งเสียงแบบ real-time ไปยัง MQTT broker
- **LED Control** - รับคำสั่งควบคุม LED (ตัวแทนเครื่องใช้ไฟฟ้า) ผ่าน MQTT
- **Wheelchair Detection** - รองรับการตรวจจับ wheelchair จากวิดีโอ (ผ่าน camera-service)

## Hardware
- **T-SIM Camera** (ESP32-S3)
- Camera: OV2640/OV3660
- Microphone: I2S MEMS microphone
- PSRAM: Required for video streaming

## Features

### 1. WiFi Manager
- เปิด Access Point อัตโนมัติเมื่อไม่พบ WiFi
- SSID: `TSIM_<DEVICE_ID>-Setup`
- Password: `12345678`
- Web Portal: http://192.168.4.1

### 2. Video Streaming
- ส่งวิดีโอแบบ real-time ผ่าน MQTT
- Format: JPEG
- Resolution: QVGA (320x240) หรือ VGA (640x480) ขึ้นอยู่กับ PSRAM
- Frame rate: ~10 fps (ปรับได้ที่ `VIDEO_FRAME_INTERVAL_MS`)
- Encoding: Base64 สำหรับ JSON payload

### 3. Audio Streaming
- ส่งเสียงแบบ real-time ผ่าน MQTT
- Format: PCM 16-bit
- Sample rate: 16 kHz
- Channels: Mono
- Encoding: Base64 สำหรับ JSON payload

### 4. LED Control
- รับคำสั่งควบคุม LED ผ่าน MQTT topic `WheelSenseMockup/control`
- LED pin: GPIO 21
- รองรับคำสั่งเปิด/ปิด LED (ตัวแทนเครื่องใช้ไฟฟ้า)
- ส่ง confirmation กลับไปยัง status topic

### 5. Wheelchair Detection Support
- รองรับการตรวจจับ wheelchair จากวิดีโอ
- Camera service จะตรวจจับและส่งผลกลับมาผ่าน MQTT topic `WheelSenseMockup/detection`

## Configuration

### Device ID
แก้ไขใน `src/main.cpp`:
```cpp
#define DEVICE_ID "TSIM_001"  // แก้ตาม device ของคุณ
```

### MQTT Settings
แก้ไขใน `src/main.cpp`:
```cpp
const char* MQTT_SERVER = "broker.emqx.io";
const int MQTT_PORT = 1883;
const char* MQTT_TOPIC_VIDEO = "WheelSenseMockup/video";
const char* MQTT_TOPIC_AUDIO = "WheelSenseMockup/audio";
const char* MQTT_TOPIC_STATUS = "WheelSenseMockup/status";
const char* MQTT_TOPIC_CONTROL = "WheelSenseMockup/control";  // สำหรับรับคำสั่งควบคุม LED
const char* MQTT_TOPIC_DETECTION = "WheelSenseMockup/detection";  // สำหรับรับผลการตรวจจับ
```

### Video/Audio Settings
```cpp
#define VIDEO_FRAME_INTERVAL_MS 100  // ส่งวิดีโอทุก 100ms (10 fps)
#define AUDIO_SAMPLE_RATE 16000      // 16kHz sample rate
#define VIDEO_JPEG_QUALITY 12        // JPEG quality (10-63)
```

## MQTT Message Format

### Video Frame (Start)
```json
{
  "device_id": "TSIM_001",
  "timestamp": "2024-01-01T12:00:00+07:00",
  "type": "video_start",
  "format": "jpeg",
  "width": 320,
  "height": 240,
  "total_size": 15000,
  "total_chunks": 8
}
```

### Video Frame (Chunk)
```json
{
  "device_id": "TSIM_001",
  "timestamp": "2024-01-01T12:00:00+07:00",
  "type": "video_chunk",
  "chunk": 0,
  "total_chunks": 8,
  "data": "base64_encoded_jpeg_data..."
}
```

### Audio Data
```json
{
  "device_id": "TSIM_001",
  "timestamp": "2024-01-01T12:00:00+07:00",
  "type": "audio",
  "format": "pcm",
  "sample_rate": 16000,
  "bits_per_sample": 16,
  "channels": 1,
  "size": 4096,
  "data": "base64_encoded_pcm_data..."
}
```

## Building & Uploading

### Prerequisites
- PlatformIO
- ESP32-S3 board support

### Build
```bash
cd TsimCam-Controller
pio run -e t-camera-sim
```

### Upload
```bash
pio run -e t-camera-sim -t upload
```

### Monitor
```bash
pio device monitor
```

## Usage

1. **First Boot**: 
   - เปิด T-SIM Camera
   - เชื่อมต่อ WiFi กับ Access Point `TSIM_<DEVICE_ID>-Setup`
   - เปิดเบราว์เซอร์ไปที่ http://192.168.4.1
   - เลือก WiFi network และใส่ password
   - รอให้เชื่อมต่อสำเร็จ

2. **Normal Operation**:
   - ระบบจะเชื่อมต่อ MQTT broker อัตโนมัติ
   - วิดีโอและเสียงจะถูกส่งไปยัง topic `WheelSenseMockup/data` อัตโนมัติ
   - ตรวจสอบ Serial Monitor เพื่อดูสถานะ

3. **Reset WiFi**:
   - กดปุ่ม Reset บนบอร์ด หรือ
   - ลบ WiFi credentials จาก flash memory

## Troubleshooting

### Camera ไม่ทำงาน
- ตรวจสอบว่า camera module ต่อถูกต้อง
- ตรวจสอบ pin definitions ใน `src/main.cpp`
- ตรวจสอบ Serial Monitor สำหรับ error messages

### Microphone ไม่ทำงาน
- ตรวจสอบว่า microphone ต่อถูกต้อง
- ตรวจสอบ I2S pin definitions
- Audio streaming จะถูก disable อัตโนมัติถ้า init ล้มเหลว

### MQTT ไม่เชื่อมต่อ
- ตรวจสอบ WiFi connection
- ตรวจสอบ MQTT broker address และ port
- ตรวจสอบ firewall/network settings
- ดู error code ใน Serial Monitor

### Memory Issues
- ลด `VIDEO_JPEG_QUALITY` (เพิ่มค่า = ลดคุณภาพ)
- ลด `VIDEO_FRAME_INTERVAL_MS` (ส่งช้าลง)
- ใช้ resolution ต่ำกว่า (QVGA แทน VGA)

## Testing

### Test LED Control
```bash
python test_led_control.py
```

### Test Detection Subscriber
```bash
python test_detection_subscriber.py
```

## Integration with Docker System

ระบบนี้ทำงานร่วมกับ Docker system:
- ใช้ public MQTT broker (`broker.emqx.io`) สำหรับการทดสอบ
- Camera service ใน Docker จะตรวจจับ wheelchair จากวิดีโอ
- Backend service สามารถส่งคำสั่งควบคุม LED ผ่าน MQTT

## Notes

- MQTT message size มีข้อจำกัด (~256KB) ดังนั้นวิดีโอจะถูกแบ่งเป็น chunks
- Base64 encoding เพิ่มขนาดข้อมูล ~33%
- สำหรับ real-time streaming แนะนำให้ใช้ resolution และ quality ต่ำ
- Audio sample rate 16kHz เพียงพอสำหรับ voice communication
- LED pin (GPIO 21) ใช้เป็นตัวแทนเครื่องใช้ไฟฟ้า สามารถเปลี่ยนได้ตามต้องการ

## License
MIT License
