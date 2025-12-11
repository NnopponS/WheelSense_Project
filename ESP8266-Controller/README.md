# ESP8266 Home Appliance Controller

## nodemcuBase ver1.0

ระบบควบคุมอุปกรณ์ไฟฟ้าในบ้านสำหรับ WheelSense ทำงานร่วมกับ ESP32 TsimCam

## สถาปัตยกรรม

```
┌─────────────────────────────────────────────────────────────────┐
│                      WheelSense System                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐       ┌─────────────────────────────┐     │
│  │  ESP32 TsimCam  │       │   ESP8266 Appliance Ctrl    │     │
│  │  (Video Only)   │       │   (Control Appliances)      │     │
│  └────────┬────────┘       └─────────────┬───────────────┘     │
│           │                              │                      │
│           │ WebSocket                    │ WebSocket            │
│           │ (Video Stream)               │ (Control Commands)   │
│           │                              │                      │
│           └──────────────┬───────────────┘                      │
│                          │                                      │
│               ┌──────────▼──────────┐                          │
│               │      Backend        │                          │
│               │  (websocket_handler)│                          │
│               └──────────┬──────────┘                          │
│                          │                                      │
│               ┌──────────▼──────────┐                          │
│               │     Dashboard       │                          │
│               │   (Admin + User)    │                          │
│               └─────────────────────┘                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## คุณสมบัติ

### อุปกรณ์ที่ควบคุมได้
- **ไฟ (Light)** - เปิด/ปิด + ปรับความสว่าง (0-100%)
- **แอร์ (Aircon)** - เปิด/ปิด + ปรับอุณหภูมิ (16-30°C)
- **พัดลม (Fan)** - เปิด/ปิด + ปรับความเร็ว (0-100%)
- **ทีวี (TV)** - เปิด/ปิด + ปรับเสียง (0-100%)

### การเชื่อมต่อ
- **WebSocket** - เชื่อมต่อกับ Backend สำหรับรับคำสั่งและส่ง status
- **MQTT** - สำรองสำหรับ registration และ fallback

## Hardware Setup

### Pin ที่ใช้ (NodeMCU ESP8266)

| Pin | GPIO | อุปกรณ์ | หมายเหตุ |
|-----|------|---------|----------|
| D1 | GPIO5 | ไฟห้อง | Relay หรือ LED |
| D2 | GPIO4 | แอร์ | Relay |
| D5 | GPIO14 | พัดลม | Relay หรือ PWM |
| D6 | GPIO12 | ทีวี | Relay หรือ IR |
| D4 | GPIO2 | Status LED | Built-in LED (Active LOW) |

### การต่อวงจร

```
NodeMCU ESP8266          Relay Module (4-channel)
┌─────────────┐         ┌─────────────────────┐
│     D1 ──────────────▶ IN1 (Light)         │
│     D2 ──────────────▶ IN2 (Aircon)        │
│     D5 ──────────────▶ IN3 (Fan)           │
│     D6 ──────────────▶ IN4 (TV)            │
│    GND ──────────────▶ GND                 │
│    VIN ──────────────▶ VCC (5V)            │
└─────────────┘         └─────────────────────┘
```

## Configuration

### แก้ไข WiFi และ Server ในไฟล์ `src/main.cpp`:

```cpp
// WiFi
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Server (Gateway IP of host running Docker)
const char* STATIC_MQTT_SERVER = "192.168.1.100";
const char* STATIC_WEBSOCKET_SERVER = "192.168.1.100";

// Device configuration
#define DEVICE_ID "APPLIANCE_001"
#define ROOM_TYPE "livingroom"  // เปลี่ยนตามห้อง
```

### ห้องที่รองรับ
- `livingroom` - ห้องนั่งเล่น
- `bedroom` - ห้องนอน
- `kitchen` - ห้องครัว
- `bathroom` - ห้องน้ำ

## การติดตั้ง

### ด้วย PlatformIO

1. เปิด project ด้วย PlatformIO IDE (VS Code + PlatformIO Extension)
2. แก้ไข configuration ตามต้องการ
3. Build และ Upload:

```bash
pio run --target upload
```

4. Monitor Serial:

```bash
pio device monitor
```

### ด้วย Arduino IDE

1. ติดตั้ง ESP8266 Board:
   - File > Preferences > Additional Boards Manager URLs
   - เพิ่ม: `http://arduino.esp8266.com/stable/package_esp8266com_index.json`
   - Tools > Board > Boards Manager > ค้นหา "esp8266" และติดตั้ง

2. ติดตั้ง Libraries:
   - WebSockets by Links2004
   - PubSubClient by Nick O'Leary
   - ArduinoJson by Benoit Blanchon

3. เลือก Board: NodeMCU 1.0 (ESP-12E Module)

4. Upload!

## WebSocket Protocol

### เชื่อมต่อ
```json
{
    "type": "connected",
    "device_type": "appliance_controller",
    "device_id": "APPLIANCE_001",
    "room": "livingroom"
}
```

### รับคำสั่ง Control
```json
{
    "type": "control",
    "appliance": "light",
    "state": true
}
```

หรือพร้อมค่า:
```json
{
    "type": "control",
    "appliance": "aircon",
    "state": true,
    "value": 25
}
```

### ตอบรับ Control
```json
{
    "type": "control_ack",
    "device_id": "APPLIANCE_001",
    "room": "livingroom",
    "appliance": "light",
    "state": true,
    "status": "ok"
}
```

### ส่ง Status
```json
{
    "type": "status",
    "device_type": "appliance_controller",
    "device_id": "APPLIANCE_001",
    "room": "livingroom",
    "appliances": {
        "light": true,
        "aircon": false,
        "fan": false,
        "tv": true
    },
    "values": {
        "brightness": 100,
        "temperature": 25,
        "speed": 50,
        "volume": 50
    }
}
```

## การใช้งานร่วมกับ TsimCam

ESP8266 Appliance Controller ทำงานแยกจาก TsimCam ESP32:

| Device | หน้าที่ |
|--------|---------|
| **ESP32 TsimCam** | ส่ง Video Stream สำหรับ wheelchair detection |
| **ESP8266 Appliance** | ควบคุมอุปกรณ์ไฟฟ้าในแต่ละห้อง |

ทั้งสองอุปกรณ์เชื่อมต่อกับ Backend ผ่าน WebSocket พร้อมกัน

## Troubleshooting

### ไม่เชื่อมต่อ WiFi
- ตรวจสอบ SSID และ Password
- ตรวจสอบ WiFi Router ว่าเปิดอยู่
- Serial Monitor จะแสดง "." ระหว่างเชื่อมต่อ

### ไม่เชื่อมต่อ WebSocket
- ตรวจสอบ IP ของ Server
- ตรวจสอบว่า Docker backend running อยู่
- ตรวจสอบ Port 8765 ว่าเปิดอยู่

### อุปกรณ์ไม่ทำงาน
- ตรวจสอบการต่อสาย Relay
- ตรวจสอบว่า Relay เป็น Active HIGH หรือ Active LOW
- Serial Monitor จะแสดง log เมื่อได้รับคำสั่ง

## License

MIT License - WheelSense Project
