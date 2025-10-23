# 🗺️ WheelSense Map - Quick Start Guide

## ภาพรวมระบบ Map

ระบบ Map ใหม่สำหรับ WheelSense ที่รองรับทุกฟีเจอร์ที่ต้องการ:

✅ **Auto-create Rooms** - สร้าง Room อัตโนมัติจาก Node ที่ออนไลน์  
✅ **แก้ไขชื่อ** - เปลี่ยนชื่อ Room ได้  
✅ **แก้ไขสี** - เลือกสีของ Room  
✅ **แก้ไขขนาด** - ปรับความกว้างและความสูง  
✅ **Drag-and-Drop** - ลากวาง Room เพื่อจัดตำแหน่ง  
✅ **Building & Floor** - จัดการอาคารและชั้น  
✅ **ลบ Room** - ลบด้วยตนเอง (ไม่ลบอัตโนมัติ)

---

## 🚀 การติดตั้ง (3 ขั้นตอน)

### ขั้นตอนที่ 1: รัน Database Migration

**Windows:**
```cmd
cd WheelSense-Server
setup_map.bat
```

**Linux/Mac:**
```bash
cd WheelSense-Server
chmod +x setup_map.sh
./setup_map.sh
```

**หรือรันด้วยมือ (ถ้า script ไม่ทำงาน):**
```bash
docker exec -it wheelsense-server-postgres-1 psql -U wheeluser -d iot_log

# ใน psql prompt:
\i /docker-entrypoint-initdb.d/migrations/001_add_buildings_floors_paths.sql
\i /docker-entrypoint-initdb.d/migrations/002_add_room_properties.sql
\q
```

### ขั้นตอนที่ 2: Restart Backend

```bash
cd WheelSense-Server
docker-compose restart rest_api
```

### ขั้นตอนที่ 3: เปิดใช้งาน Dashboard

1. เปิด Dashboard: http://localhost:8080
2. คลิกเมนู **"Map"**
3. เริ่มใช้งาน! 🎉

---

## 📖 วิธีใช้งาน

### สร้าง Building และ Floor

1. เปิดหน้า **Map**
2. คลิก **[+]** ข้าง "Building" dropdown
   - ใส่ชื่อ เช่น "อาคาร 1"
   - กด **Create**
3. คลิก **[+]** ข้าง "Floor" dropdown
   - ใส่ Floor Number: `1`
   - ใส่ชื่อ เช่น "ชั้น 1"
   - กด **Create**

### Rooms จะถูกสร้างอัตโนมัติ!

- เมื่อมี **Node ออนไลน์** → Room จะถูกสร้างอัตโนมัติ
- Room จะปรากฏบน canvas ทันที
- จะได้ชื่อ default: "Room [node number]"
- จะได้สี default: น้ำเงิน (#0056B3)

### แก้ไข Room

1. **คลิก** ที่ Room บน canvas
2. แก้ไขใน Properties Panel (ขวามือ):
   - **Room Name** - เปลี่ยนชื่อห้อง
   - **X, Y Position** - ตำแหน่ง (หรือลากวาง)
   - **Width, Height** - ขนาดห้อง
   - **Color** - สีห้อง (color picker หรือ hex code)
3. กด **Save Changes**

### ลากวาง Room (Drag-and-Drop)

1. **คลิกค้าง** ที่ Room
2. **ลาก** ไปวางที่ต้องการ
3. **ปล่อย** เมาส์ → ตำแหน่งจะถูกบันทึกอัตโนมัติ

### ลบ Room

1. เลือก Room
2. กด **Delete Room** ใน Properties Panel
3. ยืนยันการลบ

> ⚠️ **หมายเหตุ**: Room จะ**ไม่ถูกลบอัตโนมัติ** แม้ Node offline  
> ต้องกดลบเองเท่านั้น

---

## 🎨 ฟีเจอร์พิเศษ

### สถานะ Real-time

- 🟢 **Active Room** - Node online
- ⚫ **Inactive Room** - Node offline  
- 🟢 **Motion** - มีการเคลื่อนไหว (ขอบเขียว + จุดกระพริบ)

### แสดง Map ใน Dashboard

- Map จะแสดงใน Dashboard หลักด้วย (compact mode)
- คลิกที่ Room เพื่อดูรายละเอียด

---

## 🗂️ โครงสร้างไฟล์

```
WheelSense-Server/
├── MAP_IMPLEMENTATION.md       # คู่มือฉบับเต็ม
├── MAP_QUICK_START.md          # คู่มือฉบับย่อ (ไฟล์นี้)
├── setup_map.sh                # Setup script (Linux/Mac)
├── setup_map.bat               # Setup script (Windows)
│
├── WheelSense Dashboard/src/
│   ├── components/
│   │   ├── system-map.tsx      # Map component (read-only)
│   │   ├── map-editor.tsx      # Map Editor (full features)
│   │   └── ...
│   └── services/
│       └── api.ts              # API functions
│
└── sql_db/migrations/
    ├── 001_add_buildings_floors_paths.sql
    └── 002_add_room_properties.sql
```

---

## 🔧 Troubleshooting

### ❓ Rooms ไม่ถูกสร้างอัตโนมัติ

**ตรวจสอบ:**
- ✓ เลือก Building และ Floor แล้วหรือยัง?
- ✓ มี Node ออนไลน์หรือไม่?
- ✓ ลอง Refresh หน้าเว็บ

### ❓ Map ไม่แสดง

**แก้ไข:**
1. ตรวจสอบว่ารัน migration แล้ว
2. เปิด Console (F12) ดู error
3. ลอง restart backend: `docker-compose restart rest_api`

### ❓ Drag-and-Drop ไม่ทำงาน

**แก้ไข:**
1. ตรวจสอบว่าอยู่ในหน้า **Map Editor**
2. ลองคลิกที่ Room ก่อนลาก
3. Refresh หน้าเว็บ

### ❓ ไม่สามารถสร้าง Building ได้

**แก้ไข:**
1. ตรวจสอบว่า backend ทำงานอยู่
2. ตรวจสอบ Console ว่า API error หรือไม่
3. ลอง restart: `docker-compose restart`

---

## 📊 Database Schema (สำหรับนักพัฒนา)

### ตาราง `buildings`
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| name | TEXT | ชื่ออาคาร |
| description | TEXT | คำอธิบาย |

### ตาราง `floors`
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| building_id | INT | FK to buildings |
| floor_number | INT | หมายเลขชั้น |
| name | TEXT | ชื่อชั้น |

### ตาราง `map_layout` (อัพเดท)
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| node | INT | - | Primary key |
| node_name | TEXT | - | ชื่อ room |
| x_pos | INT | 0 | ตำแหน่ง X |
| y_pos | INT | 0 | ตำแหน่ง Y |
| **width** | **INT** | **120** | ความกว้าง (ใหม่) |
| **height** | **INT** | **80** | ความสูง (ใหม่) |
| **color** | **TEXT** | **#0056B3** | สี (ใหม่) |
| **floor_id** | **INT** | **NULL** | FK to floors (ใหม่) |
| **building_id** | **INT** | **NULL** | FK to buildings (ใหม่) |

---

## 🎯 สรุป

### ที่ทำได้แล้ว ✅

| ฟีเจอร์ | สถานะ |
|---------|-------|
| Auto-create Rooms จาก Node | ✅ |
| แก้ไขชื่อ Room | ✅ |
| แก้ไขสี Room | ✅ |
| แก้ไขขนาด Room (width, height) | ✅ |
| Drag-and-Drop Room | ✅ |
| ลบ Room (manual) | ✅ |
| ระบบ Building | ✅ |
| ระบบ Floor | ✅ |
| Real-time status | ✅ |

### ข้อจำกัด

- Room จะไม่ถูกลบอัตโนมัติ (ต้องลบเอง)
- ต้องเลือก Building และ Floor ก่อนที่ Room จะถูกสร้าง
- Auto-create จะทำงานเฉพาะเมื่อเข้าหน้า Map Editor

---

## 📞 ต้องการความช่วยเหลือ?

- 📖 อ่านคู่มือฉบับเต็ม: `MAP_IMPLEMENTATION.md`
- 🐛 ตรวจสอบ Console (F12) หา error
- 🔄 ลอง restart backend: `docker-compose restart`

---

**เวอร์ชัน**: 1.0.0  
**วันที่**: 2025-10-23  
**สถานะ**: ✅ พร้อมใช้งาน

