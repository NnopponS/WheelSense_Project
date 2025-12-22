# 🚀 ขั้นตอนการ Deploy หลังแก้ไข AV -> AC

## 📋 สรุปการเปลี่ยนแปลง

1. **ESP32 Controller** (`CucumberRS-Controller/src/main.cpp`)
   - ลบ normalization code (AV -> AC)
   - ใช้ "AC" โดยตรง

2. **Backend** (`docker/backend/src/main.py`)
   - เพิ่มการ fix AV -> AC อัตโนมัติเมื่อ start
   - เพิ่ม endpoint `/appliances/fix-av-to-ac`

3. **Frontend** (`docker/dashboard/src/`)
   - ลบ normalization code
   - ใช้ "AC" โดยตรง

---

## 🔧 ขั้นตอนการ Deploy

### 1️⃣ Flash ESP32 Controller (บอร์ด)

```bash
# 1. เปิด Arduino IDE หรือ PlatformIO
# 2. เปิดไฟล์: CucumberRS-Controller/src/main.cpp
# 3. Compile และ Upload ลงบอร์ด ESP32-S2

# หรือใช้ PlatformIO CLI:
cd CucumberRS-Controller
pio run --target upload
```

**หมายเหตุ:** ต้อง flash ใหม่เพราะมีการแก้ไขโค้ดใน `main.cpp`

---

### 2️⃣ Rebuild Docker Containers

#### 2.1 Rebuild Backend Container

```bash
cd docker

# Rebuild backend container
docker-compose build backend

# Restart backend
docker-compose up -d backend
```

#### 2.2 Rebuild Frontend (Dashboard) Container

```bash
# Rebuild dashboard container
docker-compose build dashboard

# Restart dashboard
docker-compose up -d dashboard
```

#### 2.3 Rebuild ทั้งหมดพร้อมกัน (แนะนำ)

```bash
cd docker

# Rebuild containers ที่เปลี่ยนแปลง
docker-compose build backend dashboard

# Restart services
docker-compose up -d backend dashboard nginx
```

---

### 3️⃣ ตรวจสอบการทำงาน

#### 3.1 ตรวจสอบ Backend Logs

```bash
docker-compose logs -f backend
```

**สิ่งที่ต้องเห็น:**
```
✅ Database connected
✅ Fixed X appliances from AV to AC  (ถ้ามีข้อมูล AV ใน database)
```

#### 3.2 ตรวจสอบ Frontend

เปิดเบราว์เซอร์ไปที่: `http://localhost` หรือ `http://localhost:3000`

ตรวจสอบว่า:
- แอร์ในห้องนั่งเล่นแสดงเป็น "AC" ไม่ใช่ "AV"
- สามารถเปิด/ปิดแอร์ได้ปกติ

#### 3.3 ตรวจสอบ ESP32 Controller

ดู Serial Monitor:
- ควรเห็น log: `[MQTT] Control: livingroom/AC = ON/OFF`
- ไม่ควรเห็น normalization message

---

### 4️⃣ Fix ข้อมูลใน Database (ถ้ายังมี AV อยู่)

#### วิธีที่ 1: ใช้ Endpoint (อัตโนมัติ)

Backend จะ fix อัตโนมัติเมื่อ start แต่ถ้าต้องการ fix ใหม่:

```bash
curl -X POST http://localhost:8000/appliances/fix-av-to-ac
```

#### วิธีที่ 2: ใช้ MongoDB Shell

```bash
# เข้า MongoDB container
docker exec -it wheelsense-mongodb mongosh -u admin -p wheelsense123 --authenticationDatabase admin

# ใช้ database
use wheelsense

# Update AV -> AC
db.appliances.updateMany(
  { type: { $in: ["AV", "av"] } },
  { $set: { type: "AC" } }
)

# ตรวจสอบผลลัพธ์
db.appliances.find({ type: "AC" })
```

---

## 🔄 Quick Deploy Script

สร้างไฟล์ `redeploy.sh`:

```bash
#!/bin/bash

echo "🚀 Starting redeployment..."

# 1. Rebuild containers
echo "📦 Rebuilding containers..."
cd docker
docker-compose build backend dashboard

# 2. Restart services
echo "🔄 Restarting services..."
docker-compose up -d backend dashboard nginx

# 3. Check logs
echo "📋 Checking backend logs..."
sleep 5
docker-compose logs --tail=20 backend

echo "✅ Deployment complete!"
echo "🌐 Frontend: http://localhost"
echo "🔧 Backend API: http://localhost:8000"
```

รันด้วย:
```bash
chmod +x redeploy.sh
./redeploy.sh
```

---

## ⚠️ สิ่งที่ต้องระวัง

1. **ESP32 Controller ต้อง Flash ใหม่** - ถ้าไม่ flash โค้ดเก่าจะยังทำงานอยู่
2. **Database จะถูก fix อัตโนมัติ** - เมื่อ backend start ครั้งแรก
3. **Frontend Cache** - อาจต้อง clear browser cache หรือ hard refresh (Ctrl+Shift+R)

---

## ✅ Checklist

- [ ] Flash ESP32 Controller ใหม่
- [ ] Rebuild Backend container
- [ ] Rebuild Dashboard container
- [ ] Restart services
- [ ] ตรวจสอบ Backend logs
- [ ] ตรวจสอบ Frontend ทำงานถูกต้อง
- [ ] ตรวจสอบ ESP32 รับคำสั่งได้
- [ ] ทดสอบเปิด/ปิดแอร์ในห้องนั่งเล่น

---

## 🆘 Troubleshooting

### Backend ไม่ start
```bash
docker-compose logs backend
docker-compose restart backend
```

### Frontend ไม่แสดงผล
```bash
docker-compose logs dashboard
docker-compose restart dashboard nginx
```

### ESP32 ไม่รับคำสั่ง
- ตรวจสอบ Serial Monitor
- ตรวจสอบ MQTT connection
- ตรวจสอบว่า flash สำเร็จแล้ว

### ข้อมูลยังเป็น AV
```bash
# Fix manual
curl -X POST http://localhost:8000/appliances/fix-av-to-ac
```


