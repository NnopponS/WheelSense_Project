# WheelSense Docker Setup Instructions

## ภาพรวมระบบ

WheelSense เป็นระบบติดตาม wheelchair แบบ real-time ที่ประกอบด้วย:
- **Dashboard** (Frontend) - React + TypeScript + Vite - **🌐 Deploy แยกบน Vercel** (ดู `WheelSense-Dashboard/VERCEL_DEPLOYMENT.md`)
- **API Server** (Backend) - FastAPI + SQLite - รันผ่าน Docker
- **MQTT Collector** - รับข้อมูลจาก M5 Stick C ผ่าน MQTT - รันผ่าน Docker

> **หมายเหตุ**: Dashboard ถูกแยกออกจาก Docker แล้วเพื่อ Deploy บน Vercel
> Docker compose ตอนนี้รันเฉพาะ Backend services (API + MQTT Collector) เท่านั้น

## การติดตั้งและรัน

### วิธีที่ 1: รัน Production (แนะนำ)

```bash
# Windows
start-docker.bat

# Linux/Mac
./start-docker.sh
```

ระบบจะเริ่มทำงานที่:
- **API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

สำหรับ Dashboard:
- **Local Development**: รันแยกจาก Docker (ดูด้านล่าง)
- **Production**: Deploy บน Vercel (ดู `WheelSense-Dashboard/VERCEL_DEPLOYMENT.md`)

### วิธีที่ 2: รัน Development

```bash
# สำหรับ development (hot reload)
docker-compose -f docker-compose.dev.yml up --build
```

### หยุดระบบ

```bash
# Windows
stop-docker.bat

# Linux/Mac
./stop-docker.sh

# หรือใช้
docker-compose down
```

## การทำงานของระบบ

### 1. MQTT Data Flow
```
M5 Stick C → MQTT Broker (broker.emqx.io) → MQTT Collector → API Server → Database → Dashboard
```

### 2. Wheelchair Position Tracking
- M5 Stick C ส่งข้อมูลตำแหน่ง (node ID) ผ่าน MQTT
- MQTT Collector บันทึกลง database
- API Server ให้ข้อมูล real-time ทุก 2 วินาที
- Dashboard แสดงตำแหน่ง wheelchair บนแผนที่

### 3. Node-Room Mapping
1. ไปที่ **Map** tab
2. คลิกที่ห้องที่ต้องการแก้ไข
3. เลือก **Node** ที่ต้องการ map กับห้อง
4. กด **บันทึก**
5. เมื่อ wheelchair อยู่ที่ node นั้น จะปรากฏในห้องที่ถูก map ไว้

## โครงสร้าง Docker

### Services

#### 1. API Server
- **Image**: Built from `Dockerfile.api`
- **Port**: 8000
- **Database**: SQLite at `/app/data/wheelsense.db`
- **Environment**:
  - `DB_PATH`: path to database
  - `API_HOST`: 0.0.0.0
  - `API_PORT`: 8000
  - `STALE_THRESHOLD_SEC`: 30

#### 2. MQTT Collector
- **Image**: Built from `Dockerfile.collector`
- **Depends on**: API Server
- **Environment**:
  - `MQTT_BROKER`: broker.emqx.io
  - `MQTT_PORT`: 1883
  - `MQTT_TOPIC`: WheelSense/data
  - `API_BASE_URL`: http://api:8000/api

#### 3. Dashboard (REMOVED from Docker)
- **Status**: ✅ แยกออกจาก Docker แล้ว
- **New Location**: Deploy บน Vercel แยกต่างหาก
- **Documentation**: `WheelSense-Dashboard/VERCEL_DEPLOYMENT.md`
- **Reason**: เพื่อความยืดหยุ่นและ scalability ที่ดีกว่า

## การแก้ไขปัญหา

### ปัญหา: Dashboard ไม่แสดงข้อมูล

1. ตรวจสอบว่า API Server ทำงาน:
   ```bash
   curl http://localhost:8000/api/health
   ```

2. ตรวจสอบ logs:
   ```bash
   docker-compose logs api
   docker-compose logs collector
   ```

### ปัญหา: Wheelchair ไม่แสดงบนแผนที่

1. ตรวจสอบว่า Node ถูก map กับห้อง:
   - ไปที่ Map Editor
   - คลิกห้อง และดูว่ามี Node ที่เลือกไว้หรือไม่

2. ตรวจสอบว่า M5 Stick C ส่งข้อมูล:
   ```bash
   docker-compose logs collector
   ```

### ปัญหา: Container ไม่เริ่มทำงาน

1. ตรวจสอบ port ว่าถูกใช้งานอยู่:
   ```bash
   # Windows
   netstat -ano | findstr ":80"
   netstat -ano | findstr ":8000"
   
   # Linux/Mac
   lsof -i :80
   lsof -i :8000
   ```

2. ลบ containers และ rebuild:
   ```bash
   docker-compose down -v
   docker-compose up --build
   ```

## ข้อมูลเพิ่มเติม

### Database Schema

Database จะถูกสร้างอัตโนมัติจาก `database/schema.sql`:
- `wheelchairs`: เก็บข้อมูล wheelchair
- `nodes`: เก็บข้อมูล node
- `buildings`, `floors`, `rooms`, `corridors`: ข้อมูลแผนที่

### API Endpoints

- `GET /api/wheelchairs`: ดึงข้อมูล wheelchair ทั้งหมด
- `GET /api/nodes`: ดึงข้อมูล node ทั้งหมด
- `GET /api/rooms`: ดึงข้อมูลห้องทั้งหมด
- `PUT /api/rooms/{id}`: แก้ไขข้อมูลห้อง (รวม node mapping)
- `GET /api/health`: ตรวจสอบสถานะระบบ

### MQTT Topic

ส่งข้อมูลไปที่: `WheelSense/data`

Format:
```json
{
  "device_id": "wheelchair_01",
  "current_node": 1,
  "distance_m": 12.5,
  "speed_ms": 0.8,
  "status": 0,
  "rssi": -65,
  "timestamp": "2024-01-01T12:00:00"
}
```

## Development

### การแก้ไข Frontend (Dashboard)
```bash
# 1. Copy environment template
cd WheelSense-Dashboard
cp env.example .env.local

# 2. แก้ไข .env.local
# VITE_API_URL=http://localhost:8000/api

# 3. Install และ run
npm install
npm run dev
```

Dashboard จะรันที่ `http://localhost:3000` และเชื่อมต่อกับ Backend API ที่รันใน Docker

### การแก้ไข Backend
```bash
cd api
pip install -r requirements.txt
python main.py
```

### การ build ใหม่
```bash
# Build เฉพาะ service
docker-compose build api
docker-compose build collector

# Build ทั้งหมด
docker-compose build
```

### Full Development Workflow
```bash
# Terminal 1: Start Backend (Docker)
./start-docker.sh  # หรือ start-docker.bat

# Terminal 2: Start Dashboard (Vite)
cd WheelSense-Dashboard
npm run dev

# ตอนนี้มี:
# - Backend API: http://localhost:8000
# - Dashboard: http://localhost:3000
```

## Production Deployment

1. แก้ไข `MQTT_BROKER` ใน `docker-compose.yml` ถ้าใช้ broker ของตัวเอง
2. ตั้งค่า environment variables
3. Run:
   ```bash
   docker-compose up -d
   ```

## License

MIT License

