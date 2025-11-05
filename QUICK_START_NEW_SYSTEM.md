# WheelSense New System - Quick Start Guide

🎉 **ระบบใหม่แบบ Simplified - ไม่มี Encryption, ง่าย รวดเร็ว!**

---

## 📋 ภาพรวมระบบ

```
┌─────────────────────────────────────────────────────────────┐
│                    WheelSense System                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   [Node 1]  [Node 2]  [Node 3]                            │
│   ESP32-S3  ESP32-S3  ESP32-S3                            │
│   BLE Beacon BLE Beacon BLE Beacon                        │
│      │          │          │                               │
│      └──────────┴──────────┘                               │
│                 │                                          │
│                 │ (BLE Scan + RSSI)                       │
│                 ▼                                          │
│          ┌──────────────┐                                 │
│          │  M5StickC    │ ◄── คำนวณทั้งหมด!              │
│          │  Gateway     │     - Distance                   │
│          │  (IMU)       │     - Speed                      │
│          └──────────────┘     - Motion                     │
│                 │             - Direction                  │
│                 │ (WiFi + MQTT)                           │
│                 ▼                                          │
│          ┌──────────────┐                                 │
│          │ MQTT Broker  │                                 │
│          └──────────────┘                                 │
│                 │                                          │
│                 ▼                                          │
│          ┌──────────────┐                                 │
│          │  Dashboard   │                                 │
│          │  / Database  │                                 │
│          └──────────────┘                                 │
└─────────────────────────────────────────────────────────────┘
```

## 🎯 จุดเด่นของระบบใหม่

| Feature | Old System | New System |
|---------|-----------|------------|
| **Encryption** | ✅ AES-128 | ❌ ไม่มี (ลบออก) |
| **Node Complexity** | สูง (IMU + Encrypt) | ต่ำมาก (แค่ BLE) |
| **Calculation** | แยกกัน (Node + M5) | รวม (M5 เท่านั้น) |
| **Power** | ~80-100mA | ~30-50mA |
| **Setup Time** | 15 นาที | 5 นาที |
| **ความซับซ้อน** | ⭐⭐⭐⭐⭐ | ⭐⭐ |

## 🚀 Quick Start (5 นาที!)

### Step 1: เตรียม Hardware

**สิ่งที่ต้องมี:**
- [ ] **M5StickC** x 1 (Gateway)
- [ ] **ESP32-S3** x N (Nodes - ติดที่ล้อ/ห้อง)
- [ ] **MQTT Broker** (Mosquitto, EMQX, HiveMQ)

### Step 2: Upload Node (ESP32-S3)

```bash
cd New_System/Node_Advertise_esp32s3

# แก้ NODE_ID ใน src/main.cpp
# #define NODE_ID 1  // <-- แก้เป็น 1, 2, 3, ...

pio run -t upload
pio device monitor
```

**ควรเห็น:**
```
WheelSense Node #1 (ESP32-S3)
[Setup] BLE advertising started!
[Setup] Device Name: WheelSense_1
[Setup] Ready!
```

✅ **Node พร้อมใช้งาน!** (แค่ advertise ชื่อ)

### Step 3: Upload M5StickC (Gateway)

```bash
cd New_System/ID_Wheel_M5StickC

# แก้ค่าใน src/main.cpp
# #define DEVICE_ID "M5_001"
# const char* MQTT_SERVER = "192.168.1.100";

pio run -t upload
pio device monitor
```

**Setup WiFi:**
1. M5 จะเปิด AP ชื่อ `WheelSense_M5_001-Setup`
2. เชื่อมต่อด้วยมือถือ (รหัส: `12345678`)
3. เปิด browser: `http://192.168.4.1`
4. เลือก WiFi + ใส่รหัสผ่าน
5. Done!

✅ **M5StickC พร้อมใช้งาน!**

### Step 4: ทดสอบระบบ

**ดู Serial Monitor ของ M5StickC:**
```
[BLE] Scanning...
[BLE] Found Node 1 (RSSI: -45 dBm)
[BLE] Found Node 2 (RSSI: -60 dBm)
[MQTT] ✓ Published
```

**ดู MQTT Broker:**
```bash
mosquitto_sub -h localhost -t "WheelSense/data" -v
```

**ควรเห็น JSON:**
```json
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
  }
}
```

✅ **ระบบทำงานสมบูรณ์!**

---

## 🔧 Configuration

### M5StickC Gateway

**ไฟล์:** `New_System/ID_Wheel_M5StickC/src/main.cpp`

```cpp
// Device ID (แก้ตามเครื่อง)
#define DEVICE_ID "M5_001"  // M5_001, M5_002, ...

// MQTT Broker
const char* MQTT_SERVER = "192.168.1.100";
const int MQTT_PORT = 1883;
const char* MQTT_TOPIC = "WheelSense/data";

// BLE Scanning
#define BLE_SCAN_TIME 3          // 3 วินาที
#define BLE_SCAN_INTERVAL 5000   // สแกนทุก 5 วิ
#define RSSI_THRESHOLD -100      // กรองสัญญาณที่แย่

// IMU (สำหรับคำนวณ)
static const float WHEEL_RADIUS_M = 0.30f;  // 30cm
```

### ESP32-S3 Node

**ไฟล์:** `New_System/Node_Advertise_esp32s3/src/main.cpp`

```cpp
// Node ID (สำคัญ! ต้องไม่ซ้ำกัน)
#define NODE_ID 1  // 1, 2, 3, 4, ...

// BLE Advertising Interval
#define BLE_ADV_INTERVAL_MIN 160  // 100ms
#define BLE_ADV_INTERVAL_MAX 320  // 200ms
```

---

## 📊 ข้อมูลที่ส่งไป MQTT

### Topic
```
WheelSense/data
```

### Payload Structure
```json
{
  "device_id": "WheelSense_M5_001",
  "timestamp": "2025-11-03T20:00:00+07:00",
  "uptime_ms": 123456,
  
  "wheelchair": {
    "distance_m": 10.5,
    "speed_ms": 0.3,
    "motion": 1,           // 0=STOP, 1=FORWARD, 2=BACKWARD
    "direction": 0,        // 0=STRAIGHT, 1=LEFT, 2=RIGHT
    "motion_str": "FORWARD",
    "direction_str": "STRAIGHT"
  },
  
  "selected_node": {
    "node_id": 1,
    "rssi": -45,
    "last_seen_ms": 1234
  },
  
  "nearby_nodes": [
    {"node_id": 1, "rssi": -45, "last_seen_ms": 1234},
    {"node_id": 2, "rssi": -60, "last_seen_ms": 2345}
  ]
}
```

---

## 🔍 การทำงานของระบบ

### 1. Node (ESP32-S3)
- ✅ Advertise ชื่อ `WheelSense_<NODE_ID>` ผ่าน BLE
- ✅ ประหยัดพลังงานสูงสุด (~30-50mA)
- ❌ ไม่คำนวณอะไร ไม่มี sensor

### 2. Gateway (M5StickC)
- ✅ สแกน BLE หา `WheelSense_X` ทุก 5 วิ
- ✅ เลือก Node ที่มี **RSSI สูงสุด** (ใกล้ที่สุด)
- ✅ คำนวณ Distance, Speed, Motion, Direction จาก **IMU ของ M5** เท่านั้น
- ✅ ส่งข้อมูลไป MQTT ทุก 2 วิ

### 3. MQTT Broker
- รับข้อมูลจาก M5StickC
- Forward ไปยัง Dashboard / Database

---

## 🛠️ Troubleshooting

### ❌ Node ไม่เจอ
**สาเหตุ:**
- Node ไม่เปิด
- ระยะทางไกลเกินไป (>10m)
- RSSI_THRESHOLD ต่ำเกินไป

**วิธีแก้:**
```bash
# ตรวจสอบ Node
pio device monitor  # ดู Serial

# ทดสอบด้วย nRF Connect (มือถือ)
# ควรเห็น "WheelSense_1"
```

### ❌ WiFi ไม่เชื่อมต่อ
**วิธีแก้:**
```cpp
// กดปุ่ม A ค้างไว้ 3 วิ เพื่อ Reset WiFi
// หรือ กดปุ่ม B ขณะ Boot
```

### ❌ MQTT ไม่เชื่อมต่อ
**วิธีแก้:**
```bash
# ตรวจสอบ Broker
docker ps
mosquitto_sub -h localhost -t "WheelSense/data" -v

# แก้ไข MQTT_SERVER ใน code
const char* MQTT_SERVER = "192.168.1.100";
```

### ❌ ระยะทางไม่ถูกต้อง
**วิธีแก้:**
```cpp
// ปรับรัศมีล้อให้ตรง
static const float WHEEL_RADIUS_M = 0.30f;  // แก้เป็น cm จริง
```

---

## 🔋 Power Consumption

| Device | Mode | Current | Battery Life |
|--------|------|---------|--------------|
| **Node (ESP32-S3)** | BLE Only | ~30-50mA | 10-20 ชม (500mAh) |
| **M5StickC** | Full Active | ~150-200mA | 30-45 นาที (80mAh) |

**คำแนะนำ:**
- **Node**: ใช้ LiPo 500-1000mAh → อึด 10-20 ชั่วโมง
- **M5StickC**: ใช้ USB Power Bank → ใช้งานได้ทั้งวัน

---

## 📱 M5StickC Display

```
┌─────────────────────┐
│ WheelSense M5      │
│ WiFi: OK           │
│ MQTT: OK           │
│ ---                │
│ Dist: 10.5m        │ ← จาก M5 IMU
│ Spd: 0.3m/s        │ ← จาก M5 IMU
│ Mov: FORWARD       │ ← จาก M5 IMU
│ ---                │
│ Nodes: 3           │ ← จำนวน Node ที่เจอ
│ Best: N1           │ ← Node ที่ RSSI แรงสุด
│ RSSI: -45dBm       │
└─────────────────────┘
```

---

## 🎓 วิธีการคำนวณ

### Distance & Speed (จาก M5 IMU)
1. อ่าน Accelerometer (ax, ay, az)
2. คำนวณ theta = atan2(ay, ax)
3. ติดตาม delta_theta
4. Distance = delta_theta × WHEEL_RADIUS_M
5. Speed = Distance / Time

### Motion Detection
- `delta_theta > threshold` → **FORWARD**
- `delta_theta < -threshold` → **BACKWARD**
- อื่นๆ → **STOP**

### Direction Detection (จาก Gyroscope)
- Integrate Gyro Y
- มุมหมุนมาก → **LEFT** / **RIGHT**
- มุมหมุนน้อย → **STRAIGHT**

### Node Selection (จาก BLE RSSI)
- สแกนหา `WheelSense_X`
- เลือก Node ที่ **RSSI สูงสุด** (ใกล้ที่สุด)
- กรอง Node ที่ offline (>10 วิไม่ตอบสนอง)

---

## 🆚 Comparison: Old vs New System

| Aspect | Old System | New System |
|--------|-----------|------------|
| **Encryption** | AES-128 | None |
| **Node IMU** | Required (LSM6DS3) | Not required |
| **Calculation** | Node + M5 | M5 only |
| **BLE Data** | Encrypted IMU | Name only |
| **Setup** | ซับซ้อน | ง่ายมาก |
| **Code Size** | ~25KB | ~15KB |
| **Power (Node)** | ~80-100mA | ~30-50mA |
| **Battery Life** | 5-10 ชม | 10-20 ชม |
| **Security** | ✅ High | ❌ None |
| **Simplicity** | ❌ Complex | ✅ Very Simple |

**ข้อสรุป:**
- ใช้ **New System** ถ้าต้องการ: ง่าย, เร็ว, ประหยัดแบต
- ใช้ **Old System** ถ้าต้องการ: Security, Multiple sensors

---

## 🔐 Security Note

⚠️ **ระบบนี้ไม่มีการเข้ารหัส!**

**ไม่เหมาะสำหรับ:**
- โรงพยาบาล (ข้อมูลผู้ป่วย)
- สถานที่สาธารณะที่มีความเสี่ยง

**เหมาะสำหรับ:**
- ทดสอบในห้องแล็บ
- ใช้งานภายในบ้าน/สถานที่ควบคุมได้
- Prototype / Demo

**วิธีเพิ่ม Security:**
- ใช้ VPN
- ใช้ MQTT over TLS
- หรือใช้ Old System ที่มี AES encryption

---

## 📚 Documentation

### Hardware & Firmware
- **M5StickC Gateway**: `ID_Wheel_M5StickC/README.md`
- **ESP32-S3 Node**: `Node_Advertise_esp32s3/README.md`
- **API Reference**: ดู MQTT Message Format ด้านบน

### Dashboard & Backend
- **Dashboard Overview**: `DASHBOARD_DEPLOYMENT_UPDATE.md` ⭐ เริ่มที่นี่
- **Quick Deploy**: `WheelSense-Server/WheelSense-Dashboard/QUICK_DEPLOY.md`
- **Detailed Guide**: `WheelSense-Server/WheelSense-Dashboard/VERCEL_DEPLOYMENT.md`
- **Setup Guide**: `WheelSense-Server/WheelSense-Dashboard/STANDALONE_SETUP.md`
- **Docker Instructions**: `WheelSense-Server/DOCKER_INSTRUCTIONS.md`
- **Separation Summary**: `WheelSense-Server/DASHBOARD_SEPARATION_SUMMARY.md`

---

## 🆘 Need Help?

1. **ดู Serial Monitor** - ข้อมูล debug มีครบ
2. **ตรวจสอบ LED** - Node กระพริบทุก 2 วิ = ทำงานปกติ
3. **ใช้ nRF Connect** - ทดสอบ BLE
4. **ใช้ MQTT Explorer** - ทดสอบ MQTT

---

## ✅ Checklist

**ก่อนเริ่มใช้งาน:**
- [ ] Node advertise `WheelSense_X` แล้ว
- [ ] M5StickC เชื่อมต่อ WiFi แล้ว
- [ ] M5StickC เชื่อมต่อ MQTT แล้ว
- [ ] M5StickC เจอ Node แล้ว (ดู Display)
- [ ] MQTT Broker รับข้อมูลแล้ว
- [ ] ทดสอบเดินระยะสั้นๆ แล้ว

---

## 🎉 Success!

ถ้าทุกอย่างทำงาน คุณควรเห็น:
1. ✅ Node LED กระพริบ
2. ✅ M5 Display แสดง "Nodes: X"
3. ✅ Serial Monitor แสดง "[MQTT] ✓ Published"
4. ✅ MQTT Broker รับข้อมูล JSON

**ยินดีด้วย! ระบบพร้อมใช้งาน! 🎊**

---

## 📌 Next Steps

### 1. ติดตั้ง Dashboard

**🌐 WheelSense Dashboard (React + Vite) - พร้อม Deploy บน Vercel!**

```bash
cd WheelSense-Server/WheelSense-Dashboard

# Development (รันแยกจาก Docker)
cp env.example .env.local
npm install
npm run dev  # http://localhost:3000

# Production (Deploy บน Vercel)
npm install -g vercel
vercel --prod
```

**📚 อ่านเพิ่มเติม:**
- `DASHBOARD_DEPLOYMENT_UPDATE.md` - ภาพรวมการแยก Dashboard
- `WheelSense-Dashboard/QUICK_DEPLOY.md` - คู่มือ deploy อย่างรวดเร็ว
- `WheelSense-Dashboard/VERCEL_DEPLOYMENT.md` - คู่มือละเอียด

**✨ Features:**
- 📊 Real-time monitoring
- 🗺️ Interactive map editor
- 📱 Device management
- 👤 Patient management
- 🤖 AI assistant

### 2. เริ่มใช้งาน Backend

```bash
cd WheelSense-Server

# รัน Backend (Docker)
./start-docker.sh  # Linux/Mac
# หรือ
start-docker.bat   # Windows

# API จะรันที่:
# - API: http://localhost:8000
# - API Docs: http://localhost:8000/docs
```

### 3. เก็บข้อมูล
- **SQLite** (Built-in) - มีมาพร้อม FastAPI Backend
- **InfluxDB** - สำหรับ time-series data
- **MongoDB** - สำหรับ NoSQL
- **PostgreSQL** - สำหรับ production

### 4. Calibrate IMU
- เดินระยะทางที่รู้แล้วปรับค่า `WHEEL_RADIUS_M`
- ทดสอบและปรับ threshold

### 5. เพิ่ม Node
- Upload firmware ไปยัง ESP32-S3 เพิ่ม
- แก้ `NODE_ID` ให้ไม่ซ้ำกัน
- ติดตามหลายห้อม/หลายโซน

---

**Status**: ✅ Production Ready  
**Version**: 2.1 (Simplified + Dashboard Separated)  
**Last Updated**: November 5, 2025  
**Author**: WheelSense Team

**🆕 What's New in v2.1:**
- ✅ Dashboard แยกออกจาก Docker แล้ว
- ✅ พร้อม Deploy บน Vercel
- ✅ Backend ยังคงอยู่ใน Docker
- ✅ เอกสารครบถ้วน

💡 **Tip**: เริ่มจาก 1 Node ก่อน ถ้าใช้ได้ค่อยเพิ่ม Node อื่นๆ
