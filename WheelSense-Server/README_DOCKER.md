# WheelSense Server with Real-time Dashboard

ระบบ WheelSense Server ที่รวม Dashboard แบบ Real-time เข้าไปใน Docker container พร้อมใช้งาน

## ✨ ฟีเจอร์ใหม่

- **Real-time Data**: แสดงข้อมูลจาก database จริง ไม่ใช่ mockup
- **Device Management**: แก้ไขชื่อ Node และ Wheel ได้
- **Map Layout Editor**: เลือกตำแหน่งห้องในแผนที่ได้เอง
- **Live Updates**: อัปเดตข้อมูลแบบ real-time ด้วย SSE
- **Responsive Design**: ใช้งานได้บนทุกอุปกรณ์

## การติดตั้งและใช้งาน

### ข้อกำหนดเบื้องต้น
- Docker และ Docker Compose
- พอร์ตที่ว่าง: 8080, 3000, 5000, 1883, 9001, 5433

### การเริ่มต้นระบบ

1. เปิด Command Prompt หรือ PowerShell ในโฟลเดอร์ `WheelSense-Server`

2. รันคำสั่ง:
```bash
docker-compose up --build -d
```

3. รอให้ระบบเริ่มต้นเสร็จสิ้น (ประมาณ 1-2 นาที)

### การเข้าถึงระบบ

- **Dashboard**: http://localhost:8080
- **REST API**: http://localhost:3000/api/
- **MQTT Broker**: localhost:1883
- **MQTT WebSocket**: ws://localhost:9001
- **PostgreSQL**: localhost:5433

### การหยุดระบบ

```bash
docker-compose down
```

### การดู Logs

```bash
# ดู logs ของทุก service
docker-compose logs

# ดู logs ของ service เฉพาะ
docker-compose logs dashboard
docker-compose logs rest_api
docker-compose logs mqtt_collector
```

## 🎯 การใช้งาน Dashboard

### 1. Dashboard Tab
- แสดงข้อมูล sensor แบบ real-time
- แผนที่แสดงตำแหน่ง wheelchair และ nodes
- สถิติการใช้งานแบบ live
- MQTT logs จากข้อมูลจริง

### 2. Timeline Tab
- ประวัติการใช้งานของระบบ
- Timeline ของ events

### 3. Devices & Routes Tab
- รายการอุปกรณ์ทั้งหมด
- แก้ไขชื่อ Node และ Wheel ได้
- MQTT routes และ topology
- สถานะการเชื่อมต่อแบบ real-time

### 4. Map Layout Tab
- แก้ไขตำแหน่งห้องในแผนที่
- เพิ่ม/ลบ/แก้ไขห้องได้
- บันทึก layout ลง database
- Preview แผนที่แบบ real-time

### 5. AI Assistant Tab
- Chatbot สำหรับช่วยเหลือผู้ใช้

## 🔧 การแก้ไขชื่ออุปกรณ์

1. ไปที่ **Devices & Routes** tab
2. คลิกปุ่ม **Edit** ข้างอุปกรณ์ที่ต้องการแก้ไข
3. ใส่ชื่อ Room/Node และ Wheelchair ใหม่
4. คลิก **Save** - การเปลี่ยนแปลงจะบันทึกลง database ทันที

## 🗺️ การแก้ไขแผนที่ห้อง

1. ไปที่ **Map Layout** tab
2. คลิก **Add Room** เพื่อเพิ่มห้องใหม่
3. หรือคลิกปุ่ม **Edit** ในแผนที่เพื่อแก้ไขห้องที่มีอยู่
4. ปรับตำแหน่งและขนาดห้องตามต้องการ
5. คลิก **Save Layout** เพื่อบันทึกลง database

## โครงสร้างระบบ

### Services

1. **dashboard** (Port 8080)
   - React/Vite application
   - Nginx web server
   - Proxy API requests ไปยัง rest_api
   - Real-time updates ด้วย SSE

2. **rest_api** (Port 3000)
   - Express.js API server
   - PostgreSQL connection
   - SSE (Server-Sent Events) support
   - CORS enabled

3. **mqtt_collector** (Port 5000)
   - MQTT message collector
   - เก็บข้อมูลลง PostgreSQL

4. **mosquitto** (Ports 1883, 9001)
   - MQTT broker
   - WebSocket support

5. **postgres** (Port 5433)
   - PostgreSQL database
   - Health check enabled

### API Endpoints

- `GET /api/sensor-data` - ข้อมูล sensor ล่าสุด
- `GET /api/sensor-data/history/:node_id/:wheel_id` - ประวัติข้อมูล sensor
- `PUT /api/labels/:node/:wheel` - อัปเดต labels
- `GET /api/map-layout` - ข้อมูล layout ของแผนที่
- `POST /api/map-layout` - บันทึก layout ของแผนที่
- `GET /api/events` - SSE endpoint สำหรับ real-time updates

## การแก้ไขปัญหา

### Dashboard ไม่แสดงผล
1. ตรวจสอบว่า container dashboard ทำงานอยู่:
   ```bash
   docker-compose ps dashboard
   ```

2. ดู logs:
   ```bash
   docker-compose logs dashboard
   ```

### API ไม่ทำงาน
1. ตรวจสอบว่า rest_api container ทำงานอยู่:
   ```bash
   docker-compose ps rest_api
   ```

2. ตรวจสอบการเชื่อมต่อ database:
   ```bash
   docker-compose logs postgres
   ```

### การรีสตาร์ท service เฉพาะ
```bash
docker-compose restart dashboard
docker-compose restart rest_api
```

## การพัฒนา

### การแก้ไข Dashboard
1. แก้ไขไฟล์ใน `WheelSense Dashboard/src/`
2. รีบิลด์ dashboard:
   ```bash
   docker-compose up --build dashboard
   ```

### การแก้ไข API
1. แก้ไขไฟล์ใน `rest_api/`
2. รีบิลด์ rest_api:
   ```bash
   docker-compose up --build rest_api
   ```

## ข้อมูลเพิ่มเติม

- Dashboard ใช้ React + TypeScript + Vite
- API ใช้ Express.js + PostgreSQL
- Real-time updates ใช้ Server-Sent Events (SSE)
- MQTT broker ใช้ Eclipse Mosquitto
- Database ใช้ PostgreSQL 16
- UI Components ใช้ Radix UI + Tailwind CSS

## 🚀 การใช้งานขั้นสูง

### การเชื่อมต่ออุปกรณ์จริง
1. ตั้งค่า MQTT broker ที่ localhost:1883
2. ส่งข้อมูล telemetry ไปยัง topic `WheelSense/data`
3. Dashboard จะแสดงข้อมูลแบบ real-time อัตโนมัติ

### การปรับแต่งแผนที่
1. ใช้ Map Layout Editor เพื่อสร้างแผนที่ตามสถานที่จริง
2. บันทึก layout เพื่อใช้ใน Dashboard
3. แผนที่จะแสดงตำแหน่ง wheelchair และ nodes แบบ real-time
