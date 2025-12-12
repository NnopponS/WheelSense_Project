# ESP8266 Home Appliance Controller

## nodemcuBase ver2.0 - Central Controller

ระบบควบคุมอุปกรณ์ไฟฟ้าในบ้าน **ทั้ง 4 ห้อง** จากบอร์ดเดียว สำหรับ WheelSense

## 🆕 Ver 2.0 - Central Controller

เวอร์ชัน 2.0 ปรับปรุงให้ใช้ ESP8266 **ตัวเดียว** ควบคุมทุกห้อง:

| Feature | Ver 1.0 | Ver 2.0 |
|---------|---------|---------|
| จำนวนบอร์ด | 1 บอร์ด = 1 ห้อง | 1 บอร์ด = 4 ห้อง |
| MQTT Topic | `WheelSense/<room>/control` | `WheelSense/+/control` (wildcard) |
| Device ID | `APPLIANCE_001` | `APPLIANCE_CENTRAL` |

## สถาปัตยกรรม

```
┌─────────────────────────────────────────────────────────────────┐
│                      WheelSense System                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │         ESP8266 Central Appliance Controller             │   │
│  │  ┌──────────┬──────────┬──────────┬──────────┐          │   │
│  │  │ Bedroom  │ Bathroom │ Kitchen  │ Living   │          │   │
│  │  │ D1(L)    │ D0(L)    │ D5(L)    │ D6(L)    │          │   │
│  │  │ D2(AC)   │          │          │ D7(F)    │          │   │
│  │  │          │          │          │ D8(T)    │          │   │
│  │  └──────────┴──────────┴──────────┴──────────┘          │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │ MQTT (WheelSense/+/control)         │
│                           │ WebSocket                           │
│               ┌───────────▼───────────┐                         │
│               │       Backend         │                         │
│               │  (websocket_handler)  │                         │
│               └───────────┬───────────┘                         │
│                           │                                     │
│               ┌───────────▼───────────┐                         │
│               │      Dashboard        │                         │
│               │    (Admin + User)     │                         │
│               └───────────────────────┘                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## คุณสมบัติ

### ห้องที่ควบคุม (4 ห้อง)

| ห้อง | อุปกรณ์ | GPIO Pins |
|------|---------|-----------|
| **bedroom** (ห้องนอน) | ไฟ, แอร์, Alarm(SW) | D1, D2 |
| **bathroom** (ห้องน้ำ) | ไฟ | D0 |
| **kitchen** (ห้องครัว) | ไฟ, Alarm(SW) | D5 |
| **livingroom** (ห้องนั่งเล่น) | ไฟ, พัดลม, ทีวี | D6, D7, D8 |

> SW = Software-only (ไม่มี GPIO - ส่ง notification)

### การเชื่อมต่อ
- **WebSocket** - เชื่อมต่อกับ Backend สำหรับรับคำสั่งและส่ง status
- **MQTT Wildcard** - Subscribe `WheelSense/+/control` เพื่อรับคำสั่งทุกห้อง

## Hardware Setup

### Pin Configuration (NodeMCU ESP8266)

| Pin | GPIO | ห้อง | อุปกรณ์ |
|-----|------|------|---------|
| D0 | GPIO16 | bathroom | ไฟ |
| D1 | GPIO5 | bedroom | ไฟ |
| D2 | GPIO4 | bedroom | แอร์ |
| D4 | GPIO2 | - | Status LED (Built-in, Active LOW) |
| D5 | GPIO14 | kitchen | ไฟ |
| D6 | GPIO12 | livingroom | ไฟ |
| D7 | GPIO13 | livingroom | พัดลม |
| D8 | GPIO15 | livingroom | ทีวี |

### การต่อวงจร

```
NodeMCU ESP8266          Relay Module (7-channel recommended)
┌─────────────┐         ┌─────────────────────────────────┐
│     D0 ──────────────▶ IN1 (Bathroom Light)            │
│     D1 ──────────────▶ IN2 (Bedroom Light)             │
│     D2 ──────────────▶ IN3 (Bedroom Aircon)            │
│     D5 ──────────────▶ IN4 (Kitchen Light)             │
│     D6 ──────────────▶ IN5 (Livingroom Light)          │
│     D7 ──────────────▶ IN6 (Livingroom Fan)            │
│     D8 ──────────────▶ IN7 (Livingroom TV)             │
│    GND ──────────────▶ GND                             │
│    VIN ──────────────▶ VCC (5V)                        │
└─────────────┘         └─────────────────────────────────┘
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

// Device configuration - บอร์ดเดียวควบคุมทุกห้อง
#define DEVICE_ID "APPLIANCE_CENTRAL"
```

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

### เชื่อมต่อ (Central Controller)
```json
{
    "type": "connected",
    "device_type": "appliance_controller_central",
    "device_id": "APPLIANCE_CENTRAL",
    "rooms": ["bedroom", "bathroom", "kitchen", "livingroom"]
}
```

### รับคำสั่ง Control (ต้องระบุ room)
```json
{
    "type": "control",
    "room": "bedroom",
    "appliance": "light",
    "state": true
}
```

หรือพร้อมค่า:
```json
{
    "type": "control",
    "room": "livingroom",
    "appliance": "aircon",
    "state": true,
    "value": 25
}
```

### ตอบรับ Control
```json
{
    "type": "control_ack",
    "device_id": "APPLIANCE_CENTRAL",
    "room": "bedroom",
    "appliance": "light",
    "state": true,
    "status": "ok"
}
```

### ส่ง Room Status (เมื่อมีการเปลี่ยนแปลง)
```json
{
    "type": "room_status",
    "device_type": "appliance_controller_central",
    "device_id": "APPLIANCE_CENTRAL",
    "room": "bedroom",
    "appliances": {
        "light": true,
        "aircon": false,
        "fan": false,
        "tv": false,
        "alarm": false
    },
    "values": {
        "brightness": 100,
        "temperature": 25,
        "speed": 50,
        "volume": 50
    }
}
```

### ส่ง Central Status (ทุก 5 วินาที)
```json
{
    "type": "central_status",
    "device_type": "appliance_controller_central",
    "device_id": "APPLIANCE_CENTRAL",
    "num_rooms": 4,
    "rooms": [
        {
            "name": "bedroom",
            "appliances": { "light": true, "aircon": false, ... },
            "values": { "brightness": 100, "temperature": 25, ... }
        },
        ...
    ]
}
```

## MQTT Topics

| Topic | Direction | Description |
|-------|-----------|-------------|
| `WheelSense/+/control` | Subscribe | รับคำสั่งควบคุมทุกห้อง (wildcard) |
| `WheelSense/<room>/status` | Publish | ส่ง status แต่ละห้อง |
| `WheelSense/central/status` | Publish | ส่ง status รวมทุกห้อง |
| `WheelSense/central/registration` | Publish | ลงทะเบียนอุปกรณ์ |

## การใช้งานร่วมกับ TsimCam

ESP8266 Central Appliance Controller ทำงานแยกจาก TsimCam ESP32:

| Device | หน้าที่ |
|--------|---------|
| **ESP32 TsimCam** (x4) | ส่ง Video Stream สำหรับ wheelchair detection (1 ต่อห้อง) |
| **ESP8266 Central** (x1) | ควบคุมอุปกรณ์ไฟฟ้าทั้ง 4 ห้อง |

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
