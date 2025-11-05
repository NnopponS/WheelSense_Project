# WheelSense M5StickC Gateway (Simplified)

## Description
M5StickC Gateway สำหรับระบบ WheelSense แบบใหม่
- สแกน BLE หา Node ที่ชื่อ "WheelSense_<node_id>"
- เลือก Node ที่มี RSSI แรงที่สุด
- **คำนวณระยะทาง ความเร็ว จาก IMU ของ M5StickC ทั้งหมด**
- ส่งข้อมูลไปยัง MQTT Broker พร้อม timestamp

## ความเปลี่ยนแปลง (จากเวอร์ชันเก่า)
- ❌ ลบ AES encryption (ไม่จำเป็น)
- ❌ ไม่ decrypt manufacturer data
- ✅ คำนวณทุกอย่างจาก M5StickC
- ✅ Node แค่ advertise ชื่อ (ประหยัดพลังงาน)
- ✅ ใช้ RSSI เพื่อเลือก Node ที่ใกล้ที่สุด

## Hardware
- **M5StickC** (ESP32-PICO-D4)
- IMU: MPU6886 (built-in) - ใช้สำหรับคำนวณทั้งหมด
- Display: ST7735S 80x160 (built-in)

## Configuration

### Device ID
แก้ไขใน `src/main.cpp`:
```cpp
#define DEVICE_ID "M5_001"  // แก้ตาม device ของคุณ (ตัวอย่าง: M5_001, M5_002)
```

### MQTT Settings
แก้ไขใน `src/main.cpp`:
```cpp
const char* MQTT_SERVER = "192.168.1.100";  // แก้เป็น IP ของ MQTT broker
const int MQTT_PORT = 1883;
const char* MQTT_TOPIC = "WheelSense/data";
```

### BLE Configuration
```cpp
#define BLE_SCAN_TIME 3          // สแกน 3 วินาที
#define BLE_SCAN_INTERVAL 5000   // สแกนทุก 5 วินาที
#define RSSI_THRESHOLD -80       // กรองสัญญาณที่แย่เกินไป
```

### Wheel Parameters (สำหรับคำนวณระยะทาง)
```cpp
static const float WHEEL_RADIUS_M = 0.30f;  // 30 cm
```

## WiFi Setup
1. **ครั้งแรก**: เปิด M5StickC จะเปิด WiFi Access Point
   - SSID: `WheelSense_M5_001-Setup` (ตามค่า DEVICE_ID)
   - Password: `12345678`
2. เชื่อมต่อด้วยมือถือ/คอมพิวเตอร์
3. **เปิด browser แล้วพิมพ์**: `http://192.168.4.1`
   - (Captive Portal อาจไม่ auto-open บน M5StickC)
4. เลือก WiFi ที่ต้องการเชื่อมต่อ
5. ใส่รหัสผ่าน WiFi
6. กด Save
7. เสร็จ!

### Reset WiFi
กดปุ่ม A ค้างไว้ **3 วินาที** เพื่อ Reset WiFi settings

### Troubleshooting WiFi Setup
- ถ้า browser ไม่เปิดหน้าอัตโนมัติ → พิมพ์ `http://192.168.4.1` เอง
- ถ้าหน้าเว็บไม่โหลด → ลอง disconnect/reconnect WiFi
- ถ้ายังไม่ได้ → Restart M5StickC แล้วลองใหม่

## Build & Upload
```bash
cd New_System/ID_Wheel_M5StickC

# Build
pio run

# Upload
pio run -t upload

# Monitor
pio device monitor
```

## Display

```
WheelSense M5
WiFi: OK
MQTT: OK
---
Dist: 10.5m      ← คำนวณจาก M5 IMU
Spd: 0.3m/s      ← คำนวณจาก M5 IMU
Mov: FORWARD     ← คำนวณจาก M5 IMU
---
Nodes: 3
Best: N1         ← Node ที่ RSSI แรงสุด
RSSI: -45dBm
```

## MQTT Message Format

```json
{
  "device_id": "WheelSense_M5_001",
  "timestamp": "2025-11-03T20:00:00+07:00",
  "uptime_ms": 123456,
  
  "wheelchair": {
    "distance_m": 10.5,      // คำนวณจาก M5 IMU
    "speed_ms": 0.3,         // คำนวณจาก M5 IMU
    "motion": 1,             // 0=STOP, 1=FORWARD, 2=BACKWARD
    "direction": 0,          // 0=STRAIGHT, 1=LEFT, 2=RIGHT
    "motion_str": "FORWARD",
    "direction_str": "STRAIGHT"
  },
  
  "selected_node": {
    "node_id": 1,
    "rssi": -45,
    "last_seen_ms": 1234
  },
  
  "nearby_nodes": [
    {
      "node_id": 1,
      "rssi": -45,
      "last_seen_ms": 1234
    },
    {
      "node_id": 2,
      "rssi": -60,
      "last_seen_ms": 2345
    }
  ]
}
```

## คำอธิบาย

### การคำนวณระยะทาง
M5StickC ใช้ IMU (MPU6886) คำนวณ:
1. อ่านค่า Accelerometer และ Gyroscope
2. คำนวณมุมการเอียง (theta)
3. ติดตาม delta theta เพื่อหาการเคลื่อนที่
4. คำนวณระยะทาง = delta_theta × รัศมีล้อ
5. คำนวณความเร็ว = ระยะทาง / เวลา

### การเลือก Node
- สแกน BLE หา "WheelSense_X" ทุกๆ 5 วินาที
- เก็บ RSSI ของแต่ละ Node
- **เลือก Node ที่มี RSSI สูงสุด** (ใกล้ที่สุด)
- แสดงรายการ Node ทั้งหมดที่เจอ

### Motion Detection
จากการคำนวณ delta theta:
- ถ้า > threshold → **FORWARD**
- ถ้า < -threshold → **BACKWARD**
- อื่นๆ → **STOP**

### Direction Detection
จากการ integrate Gyroscope Y:
- หมุนมาก → **LEFT** / **RIGHT**
- ไม่หมุน → **STRAIGHT**

## Troubleshooting

### ระบบ Crash/Reboot ตลอด (abort() error)

**ปัญหา #1: Memory overflow**
- สาเหตุ: WiFiManager + BLE + MQTT ใช้ memory มากเกินไป
- วิธีแก้: ✅ Init BLE ก่อน WiFi, ลด buffer, optimize flags

**ปัญหา #2: WiFi + BLE coexistence**
```
E (xxxx) wifi:Error! Should enable WiFi modem sleep when both WiFi and Bluetooth are enabled!!!!!!
```
- สาเหตุ: ESP32 ต้องการ WiFi modem sleep เมื่อใช้ WiFi+BLE พร้อมกัน
- วิธีแก้: ✅ ใช้ `WIFI_PS_MIN_MODEM` (minimum modem sleep)
- **สำคัญ**: ต้องตั้งค่า **ก่อน** WiFi connect!

### WiFi ไม่เชื่อมต่อ
1. กดปุ่ม A ค้างไว้ 3 วิเพื่อ reset
2. ตรวจสอบ WiFi credentials
3. ตรวจสอบ router

### MQTT ไม่เชื่อมต่อ
1. ตรวจสอบ `MQTT_SERVER` และ `MQTT_PORT`
2. ตรวจสอบว่า MQTT broker ทำงานอยู่:
   ```bash
   docker ps
   mosquitto_sub -h localhost -t "WheelSense/data" -v
   ```

### ไม่เจอ Node
1. ตรวจสอบ Node ว่าเปิดอยู่ (ดู Serial Monitor)
2. ตรวจสอบระยะทาง (<10m แนะนำ)
3. ดู Serial Monitor ของ M5StickC:
   ```
   [BLE] Scanning for 3 seconds...
   [BLE] Found Node 1 (RSSI: -45 dBm)
   [BLE] Scan complete. Found 1 devices
   ```

### Display ไม่แสดง
1. ตรวจสอบ M5StickC ว่าเปิดอยู่
2. กดปุ่ม Power (ด้านข้าง)
3. Reset เครื่อง

### ระยะทางไม่ถูกต้อง
1. ปรับ `WHEEL_RADIUS_M` ให้ตรงกับล้อจริง
2. ตรวจสอบ IMU calibration
3. ทดสอบเดินระยะทางที่รู้แล้วเทียบ

## Performance

| Metric | Value |
|--------|-------|
| BLE Scan Interval | 5 seconds |
| MQTT Publish | 2 seconds |
| IMU Sampling | 20Hz (50ms) |
| Display Update | 1 second |
| Max Nodes | Unlimited |
| BLE Range | ~10-50m |

## Power Consumption
- **Active**: ~150-200mA (WiFi + BLE scan + Display)
- **แบตในตัว M5StickC**: 80-95mAh (ใช้ได้ ~30-45 นาที)
- **แนะนำ**: ใช้ USB power หรือ Power Bank

## Serial Monitor Output
```
=================================
  WheelSense M5StickC Gateway
  (Simplified - No Encryption)
=================================

[Setup] Starting WiFi Manager...
[Setup] WiFi connected!
[Setup] IP: 192.168.1.100
[Setup] Time: 2025-11-03T20:00:00+07:00
[Setup] MQTT server: 192.168.1.100:1883
[Setup] Initializing BLE...
[Setup] BLE initialized
[Setup] Initializing Watchdog Timer (30 seconds)...
[Setup] Watchdog Timer initialized
[Setup] System ready!

=== System Running ===

[BLE] Scanning for 3 seconds...
[BLE] Found Node 1 (RSSI: -45 dBm)
[BLE] Found Node 2 (RSSI: -60 dBm)
[BLE] Scan complete. Found 2 devices

[MQTT] Connecting... OK!
[MQTT] Published:
{
  "device_id": "WheelSense_M5_001",
  "wheelchair": {
    "distance_m": 0.50,
    "speed_ms": 0.05,
    "motion": 1,
    "direction": 0
  },
  "selected_node": {
    "node_id": 1,
    "rssi": -45
  },
  "nearby_nodes": [...]
}
```

## Comparison กับ Version เก่า

| Feature | Version เก่า | Version ใหม่ (นี่) |
|---------|-------------|-------------------|
| AES Encryption | ✅ | ❌ ลบออก |
| Manufacturer Data | ✅ Decrypt | ❌ ไม่ใช้ |
| IMU Calculation | ❌ จาก Node | ✅ จาก M5 เท่านั้น |
| Node Data | ✅ Distance, Motion, Dir | ❌ แค่ RSSI |
| Complexity | สูง | ต่ำ |
| Setup Time | 10 นาที | 5 นาที |

## Tips

1. **ทดสอบ IMU ก่อน**: เดินระยะทางที่รู้แล้วเทียบ
2. **RSSI คือทุกอย่าง**: Node ที่ใกล้มี RSSI สูง
3. **WiFi Manager สะดวก**: ไม่ต้อง hard-code credentials
4. **Serial Monitor เป็นเพื่อน**: ใช้ debug
5. **NTP จำเป็น**: ต้องมี timestamp ที่ถูกต้อง

## Watchdog Timer
ระบบมี Watchdog Timer (WDT) เพื่อ auto-restart เมื่อค้าง:
- **Timeout**: 30 วินาที
- **Auto-restart**: ถ้าโปรแกรมค้างเกิน 30 วิ จะ restart อัตโนมัติ
- **ป้องกัน**: WiFi timeout, BLE scan hang, MQTT connection hang

## Known Limitations

1. **แบตหมดเร็ว**: M5StickC มีแบตน้อย ควรใช้ USB power
2. **BLE Range**: จำกัดอยู่ที่ ~10-50m
3. **IMU Drift**: ระยะทางอาจคลาดเคลื่อนเมื่อใช้นาน (ต้อง calibrate)
4. **WiFi Required**: ต้องมี WiFi เพื่อส่ง MQTT

## Future Improvements
- [x] Watchdog Timer (auto-restart)
- [ ] Battery level monitoring
- [ ] SD card logging
- [ ] Multiple M5 support
- [ ] Advanced IMU calibration
- [ ] Deep sleep mode (ประหยัดแบต)

---

**Status**: ✅ Production Ready  
**Complexity**: ⭐⭐ Simple (2/5)  
**Power**: ⚡⚡ Medium  
**Recommended**: ✅ Yes

M5StickC ทำงานหนัก คำนวณทั้งหมด!
