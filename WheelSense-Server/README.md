# WheelSense Server (Docker)

ระบบ WheelSense ที่รันด้วย Docker - เริ่มใช้งานได้ทันที!

## 🚀 Quick Start

### 1. เริ่มระบบ (1 คำสั่งเดียว)

**Windows:**
```bash
start-docker.bat
```

**Linux/Mac:**
```bash
chmod +x start-docker.sh
./start-docker.sh
```

**หรือรันตรงๆ:**
```bash
docker compose up -d
```

### 2. เข้าใช้งาน

| Service | URL |
|---------|-----|
| Dashboard | http://localhost |
| API Docs | http://localhost:8000/docs |
| Health Check | http://localhost:8000/api/health |

### 3. หยุดระบบ

```bash
# Windows
stop-docker.bat

# Linux/Mac
./stop-docker.sh

# หรือ
docker compose down
```

---

## 📊 Architecture

```
M5StickC + Nodes
    ↓ (MQTT)
broker.emqx.io
    ↓
┌─────────────────────────────────┐
│   Docker Compose                │
│  ┌───────────┐  ┌────────────┐ │
│  │ Collector │→ │    API     │ │
│  └───────────┘  └────────────┘ │
│                       ↓         │
│                  ┌─────────┐   │
│                  │  SQLite │   │
│                  └─────────┘   │
│                       ↑         │
│                  ┌──────────┐  │
│                  │Dashboard │  │
│                  └──────────┘  │
└─────────────────────────────────┘
```

---

## 🐳 Docker Services

| Service | Description | Port |
|---------|-------------|------|
| **api** | FastAPI Server | 8000 |
| **collector** | MQTT Collector (Python) | - |
| **dashboard** | React Dashboard | 80 |

---

## 🗄️ Database

- **Type:** SQLite
- **Location:** `./data/wheelsense.db`
- **Backup:**
  ```bash
  cp data/wheelsense.db backups/wheelsense_$(date +%Y%m%d).db
  ```

---

## 📡 MQTT Configuration

- **Broker:** broker.emqx.io (Public)
- **Topic:** WheelSense/data
- **Format:** JSON

**ตัวอย่างข้อมูลจาก M5StickC:**
```json
{
  "device_id": "WheelSense_M5_001",
  "wheelchair": {
    "distance_m": 10.5,
    "speed_ms": 0.3,
    "status": "OK"
  },
  "selected_node": {
    "node_id": 1,
    "rssi": -45
  }
}
```

---

## 🛠️ คำสั่งที่ใช้บ่อย

```bash
# ดู logs
docker compose logs -f

# ดู logs เฉพาะ service
docker compose logs -f api
docker compose logs -f collector

# Restart
docker compose restart

# Rebuild
docker compose up -d --build

# ดูสถานะ
docker compose ps

# เข้าไปใน container
docker compose exec api bash
docker compose exec collector bash

# ดู database
docker compose exec api sqlite3 /app/data/wheelsense.db
SELECT * FROM wheelchairs;
SELECT * FROM nodes;
SELECT * FROM rooms;
.quit
```

---

## 🗺️ การใช้งาน

### 1. Map Editor (สร้างแผนที่และ Map Node)

1. เปิด Dashboard: http://localhost
2. คลิก "**Map**" tab
3. สร้าง Buildings, Floors, Rooms
4. **Mapping Node กับห้อง:**
   - คลิกที่ห้องที่ต้องการ
   - ในแท็บ "Room Info" จะมี dropdown "Node (สำหรับ Mapping ตำแหน่ง)"
   - เลือก Node ที่ต้องการ
   - กด "บันทึก"
5. เมื่อ M5 Stick C detect node นั้น → wheelchair จะแสดงในห้องที่ถูก map

### 2. Monitoring

1. Upload code ไป M5StickC
2. M5StickC detect Node → ส่งข้อมูลไป MQTT
3. Dashboard แสดงตำแหน่ง Wheelchair แบบ real-time

### 3. Node Mapping

| ห้อง | Node ID | Description |
|------|---------|-------------|
| ห้อง 101 | 1 | ห้องพักผู้ป่วย |
| ห้อง 102 | 2 | ห้องตรวจ |
| ห้อง 103 | 3 | ห้องพยาบาล |

---

## 🔧 Troubleshooting

### ❌ Port already in use

แก้ไข `docker-compose.yml`:
```yaml
ports:
  - "8080:80"    # เปลี่ยนจาก 80
  - "8001:8000"  # เปลี่ยนจาก 8000
```

### ❌ Container ไม่เริ่ม

```bash
# ดู error logs
docker compose logs

# Rebuild
docker compose down
docker compose up -d --build
```

### ❌ Database locked

```bash
docker compose restart api collector
```

---

## 📁 โครงสร้างโปรเจค

```
WheelSense-Server/
├── api/                    # FastAPI Server
│   └── main.py
├── mqtt_collector/         # MQTT Collector
│   └── collector.py
├── database/               # Database Schema
│   └── schema.sql
├── WheelSense-Dashboard/   # React Dashboard
│   └── src/
├── data/                   # SQLite Database (auto-created)
│   └── wheelsense.db
├── docker-compose.yml      # Production
├── docker-compose.dev.yml  # Development
├── Dockerfile.api
├── Dockerfile.collector
├── Dockerfile.dashboard
└── README.md
```

---

## 🎯 Requirements

- Docker & Docker Compose
- Port 80 และ 8000 ว่าง

---

## ✅ Checklist

- [ ] Docker ติดตั้งแล้ว
- [ ] Run `docker compose up -d`
- [ ] เปิด http://localhost
- [ ] ทดสอบ http://localhost:8000/docs
- [ ] สร้าง map ใน Map Editor
- [ ] Upload M5StickC code
- [ ] ทดสอบ real-time tracking

---

**Version:** 2.0.0 (Docker + FastAPI + SQL)  
**Status:** ✅ Production Ready

## 🆕 การเปลี่ยนแปลงล่าสุด (v2.0.0)

✅ **ลบ Demo Mode ทิ้งแล้ว** - ใช้ข้อมูลจริงจาก MQTT/API เท่านั้น  
✅ **Node Mapping** - เลือก Node ได้เมื่อสร้าง/แก้ไขห้อง  
✅ **Real-time Position** - Wheelchair เปลี่ยนห้องตาม Node ที่ detect อัตโนมัติ  
✅ **Device Tab** - ดึงข้อมูล Node และ Wheelchair จาก database จริง  
✅ **Production Ready** - Docker ใช้งานได้เลย ไม่มี mockup data

---

🚀 **เพียงแค่ `docker compose up -d` และเริ่มใช้งานได้เลย!**


