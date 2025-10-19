# WheelSense Platform

ระบบ WheelSense คือชุดซอฟต์แวร์และเฟิร์มแวร์ครบวงจรสำหรับเก็บข้อมูลการเคลื่อนที่ของล้อ (Wheel Nodes) ผ่าน BLE → ESP32 Mesh → MQTT → Backend → Dashboard แบบเรียลไทม์ พร้อมเครื่องมือดูเส้นทางการส่งข้อมูล (Routing) และเวลาการ Recovery เมื่อโหนดใน Mesh เปลี่ยนเส้นทางใหม่ โครงการนี้พัฒนาโดย **Worapon Sangsasri**

---

## สารบัญ
1. [ภาพรวมสถาปัตยกรรม](#ภาพรวมสถาปัตยกรรม)
2. [โครงสร้างโปรเจกต์](#โครงสร้างโปรเจกต์)
3. [ความต้องการระบบ](#ความต้องการระบบ)
4. [การตั้งค่าเริ่มต้น (Backend & Dashboard)](#การตั้งค่าเริ่มต้น-backend--dashboard)
5. [การใช้งาน Backend](#การใช้งาน-backend)
6. [การใช้งาน Dashboard](#การใช้งาน-dashboard)
7. [เฟิร์มแวร์ ESP32 / XIAO nRF52840](#เฟิร์มแวร์-esp32--xiao-nrf52840)
8. [การทดสอบและปริมาณงานที่สำคัญ](#การทดสอบและปริมาณงานที่สำคัญ)
9. [Troubleshooting](#troubleshooting)
10. [Credits](#credits)

---

## ภาพรวมสถาปัตยกรรม

```
Wheel Node (XIAO nRF52840)
    ↳ ส่งค่า IMU เข้ารหัส AES ผ่าน BLE โฆษณาเป็นระยะ
Room Node (ESP32-S3)
    ↳ Scan BLE, ถอดรหัส AES, ส่ง JSON เข้า Wi-Fi Mesh
Gateway (ESP32-S3 Root)
    ↳ รับข้อความ Mesh, สร้างเส้นทางส่ง, ส่ง NDJSON ไป MQTT
MQTT Broker (EMQX)
    ↳ กระจายข้อมูลเข้า Backend
Backend (Node.js + Prisma + PostgreSQL)
    ↳ บันทึก Raw Data / Presence / MeshRouteSnapshots
Dashboard (Next.js)
    ↳ แสดง KPI, ตาราง, Routing Map แบบเรียลไทม์
```

จุดสำคัญคือ Gateway จะคอยวิเคราะห์เส้นทางใน Mesh ทุกครั้งที่ได้รับข้อมูล แล้วส่ง `route_path`, `route_latency_ms`, `route_recovery_ms` ไปยัง Backend เพื่อบันทึกและแสดงผลบน Dashboard

---

## โครงสร้างโปรเจกต์

```
WheelSense/
├─ Server_Of_WheelSense/         # Monorepo ฝั่งเซิร์ฟเวอร์ (Node.js + Next.js)
│   ├─ apps/
│   │   ├─ api/                  # Express + Socket.IO + Prisma API
│   │   ├─ web/                  # Next.js 14 Dashboard
│   │   └─ worker/               # (สำรอง) งาน Background / Redis
│   ├─ packages/shared/          # Utilities, enums, route helpers
│   ├─ scripts/setup-env.mjs     # Script ตั้งค่า environment
│   └─ docker-compose.yml        # Stack PostgreSQL + Redis + API + Web + Worker
├─ WiFiMeshAndMQTT/
│   ├─ Room_ID_Gateway_esp32s3_PlatformIO/ # เฟิร์มแวร์ ESP32-S3 Gateway Root
│   ├─ Room_ID_Node_esp32s3_PlatformIO/    # เฟิร์มแวร์ ESP32-S3 Room Node
│   └─ Room_ID_esp32s3_PlatformIO/         # โปรเจกต์ ESP32 เดิม (ตัวอย่าง)
└─ ID_Wheel_Xiao_PlatformIO/               # เฟิร์มแวร์ XIAO nRF52840 (Wheel Nodes)
```

---

## ความต้องการระบบ

| หมวด | รายละเอียด |
|------|-------------|
| OS   | Windows / macOS / Linux |
| Node.js | **>= 20** (ตรวจสอบด้วย `node -v`) |
| Yarn   | 1.22.x (Bundled มากับโปรเจกต์, เรียกด้วย `yarn`) |
| Docker & Docker Compose | สำหรับรัน Postgres/Redis/Stack เต็มระบบ |
| Python 3 & PlatformIO Core | สำหรับคอมไพล์เฟิร์มแวร์ (แนะนำใช้ VS Code + PIO extension) |
| MQTT Broker | ค่าเริ่มต้นใช้ `mqtt://broker.emqx.io:1883` หากต้องการใช้ broker ของตนเองให้แก้ใน `.env` |

---

## การตั้งค่าเริ่มต้น (Backend & Dashboard)

1. **ติดตั้ง dependencies**
   ```bash
   cd Server_Of_WheelSense
   yarn install
   ```

2. **ตั้งค่า Environment**
   - สร้างไฟล์ `.env`, `.env.local`, `.env.docker` โดยใช้สคริปต์
     ```bash
     yarn setup                 # ใช้ template local
     yarn setup --docker        # เขียน .env จาก template docker
     ```
   - แก้ค่าตามต้องการ (เช่น `DATABASE_URL`, `MQTT_URL`, `NEXT_PUBLIC_API_URL`)

3. **เตรียมฐานข้อมูล**
   - หากใช้ Docker Compose:
     ```bash
     docker compose up -d db redis
     ```
   - รัน Prisma generate และ migrations
     ```bash
     yarn workspace @wheelsense/api prisma:generate
     yarn workspace @wheelsense/api prisma:migrate
     ```

4. **รันบริการ**
   - API:
     ```bash
     yarn dev:api
     ```
   - Dashboard:
     ```bash
     yarn dev:web
     ```
   - เปิด `http://localhost:3000` เพื่อดู Dashboard และ `http://localhost:4000/healthz` ตรวจสุขภาพ API

5. **(ทางเลือก) รัน stack เต็มผ่าน Docker Compose**
   ```bash
   docker compose up -d --build
   ```

---

## การใช้งาน Backend

### Endpoints หลัก

| Method | Path | คำอธิบาย |
|--------|------|-----------|
| GET | `/healthz` | ตรวจสอบสถานะ API |
| GET | `/api/rooms` | รายการห้องทั้งหมด (มีตำแหน่งสำหรับ Map) |
| POST | `/api/rooms` | บันทึกตำแหน่งห้อง (Array ของห้อง) |
| GET | `/api/wheels` | รายการล้อ + Presence ล่าสุด |
| GET | `/api/routes/live` | เส้นทาง Mesh ล่าสุดของแต่ละล้อ |
| GET | `/api/routes/history?wheel_id&limit` | บันทึกเส้นทางย้อนหลัง |

### MQTT Ingest (`apps/api/src/mqtt.ts`)
- Subscribe Topic: `wheelsense/#` (ค่าเริ่มต้นจาก `.env`)
- รับ payload เช่น
  ```json
  {
    "room": 3,
    "wheel": 1,
    "distance": 1.42,
    "status": 0,
    "motion": 1,
    "direction": 0,
    "rssi": -58,
    "stale": false,
    "ts": "2024-10-20T10:15:30.000Z",
    "route_path": ["Room 3", "Room 2", "Gateway"],
    "route_latency_ms": 180,
    "route_recovery_ms": 450,
    "route_recovered": true
  }
  ```
- API จะบันทึกลง `RawData`, ปรับ `Presence`, และสร้าง `MeshRouteSnapshot`
- Socket.IO namespace `/rt` จะส่ง event:
  - `telemetry` — ข้อมูลล่อพร้อมเส้นทาง
  - `route` — snapshots ใหม่เมื่อเส้นทางเปลี่ยน
  - `kpi` — ค่า KPI สรุปปัจจุบัน

---

## การใช้งาน Dashboard

### เส้นทางการใช้งาน
1. เปิด `http://localhost:3000/map`
2. หน้า Map จะโหลด:
   - `/api/rooms` สำหรับตำแหน่งห้อง
   - `/api/wheels` สำหรับสถานะล้อ
   - `/api/routes/live` สำหรับเส้นทางล่าสุด
3. SocketProvider จะเชื่อมต่อ `http://localhost:4000/rt`
   - อัพเดทสถานะล้อแบบเรียลไทม์เมื่อ API ส่ง `telemetry`
   - วาด polyline เส้นทางใหม่เมื่อ API ส่ง `route`
4. สีและข้อความ:
   - วงกลมสีเขียว/เทา = ล้อ Online/Offline
   - เส้นทางสีเขียว (แบบ dash) = เส้นทางที่ผ่านการ Recovery แล้ว
   - ป้าย “Gateway” จะถูกวางไว้ที่มุมบนซ้าย (ค่าเริ่มต้น) หากไม่มีห้องชื่อ Gateway ในฐานข้อมูล

### การปรับตำแหน่งห้อง
1. เปิด `/map`
2. ใช้เครื่องมือลาก/resize ห้องใน Dashboard
3. กด **Save layout** → API จะบันทึกลงตาราง `room`

---

## เฟิร์มแวร์ ESP32 / XIAO nRF52840

### 1. Wheel Node — `ID_Wheel_Xiao_PlatformIO`
- บอร์ด: Seeed XIAO nRF52840 Sense
- ใช้เซ็นเซอร์ LSM6DS3 คำนวณมุม/ระยะ และ AES-128 CBC เข้ารหัสก่อนส่ง BLE
- คำสั่งคอมไพล์:
  ```bash
  cd ID_Wheel_Xiao_PlatformIO
  pio run
  pio run --target upload
  ```

### 2. Room Node — `WiFiMeshAndMQTT/Room_ID_Node_esp32s3_PlatformIO`
- บอร์ด: ESP32-S3
- งานหลัก:
  - Scan BLE → decrypt → ส่ง JSON เข้า Mesh
  - สนับสนุนคำสั่งสลับ Channel (`SWITCH_CH`) ผ่าน Mesh
- คำสั่ง:
  ```bash
  cd WiFiMeshAndMQTT/Room_ID_Node_esp32s3_PlatformIO
  pio run
  pio run --target upload
  ```

### 3. Gateway — `WiFiMeshAndMQTT/Room_ID_Gateway_esp32s3_PlatformIO`
- บอร์ด: ESP32-S3 (Root)
- หน้าที่:
  - Auto-discover channel จาก Wi-Fi STA
  - คำนวณ route path จาก Mesh tree (`mesh.subConnectionJson()`)
  - ส่ง MQTT NDJSON พร้อม route metadata
- คำสั่ง:
  ```bash
  cd WiFiMeshAndMQTT/Room_ID_Gateway_esp32s3_PlatformIO
  pio run
  pio run --target upload
  ```
- Serial log แสดงตัวอย่าง:
  ```
  [Gateway] room=3 wheel=1 dist=1.42 s=0 m=1 d=0 rssi=-58 stale=0 ts=2025-10-20T12:00:00+07:00 path=Room 3>Room 2>Gateway
  ```
  จากนั้น MQTT payload จะรวม `route_path`, `route_latency_ms`, `route_recovery_ms`

---

## การทดสอบและปริมาณงานที่สำคัญ

| รายการ | วิธีทดสอบ |
|--------|-----------|
| ตรวจ API | `curl http://localhost:4000/healthz` |
| ตรวจ KPI Realtime | เปิด Socket.IO devtools หรือดู log ของ API |
| ตรวจเส้นทาง | `curl http://localhost:4000/api/routes/live` |
| ตรวจฐานข้อมูล | `psql` หรือ Prisma Studio (`npx prisma studio`) |
| ตรวจ MQTT | ใช้ MQTT Explorer / mosquitto_sub listen ที่ topic `wheelsense/#` |

---

## Troubleshooting

| อาการ | แนวทางแก้ |
|--------|-----------|
| Dashboard ขึ้น error โหลดข้อมูล | ตรวจ API (`/healthz`), ตรวจ `.env` ว่าตรงกับ URL ที่ Dashboard เรียก |
| ไม่มีเส้นทางแสดงบน Map | ตรวจว่ามี room name ตรงกับข้อมูล route_path หรือ Gateway ส่งข้อมูล route_path/route_recovered แล้ว |
| Prisma error เรื่อง schema | รัน `yarn workspace @wheelsense/api prisma:generate` อีกครั้ง และตรวจ DB connection |
| MQTT ไม่เข้า API | ตรวจ log Gateway, ตรวจ Broker URL และ firewall |
| Mesh ไม่ขึ้น Gateway | ตรวจพลังงาน ESP32, ตรวจว่า Gateway เป็น root (`mesh.setRoot(true)`) และสื่อสารกับ node ได้ |

---

## Credits

พัฒนาและดูแลโดย **Worapon Sangsasri**

คำถามหรือข้อเสนอแนะเพิ่มเติมสามารถติดต่อได้ผ่านช่องทางที่ Worapon จัดเตรียมไว้ หรือเปิด Issue ใน repository นี้ได้เลยครับ 🙏
