# WheelSense Map Implementation Guide

## Overview
ระบบ Map ใหม่สำหรับ WheelSense Dashboard พร้อมฟีเจอร์ครบถ้วน:
- แสดง Map แบบ real-time
- Map Editor พร้อม drag-and-drop
- ระบบ Building และ Floor
- Auto-create rooms จาก online nodes
- แก้ไขคุณสมบัติ room (ชื่อ, สี, ขนาด)

## Features Implemented

### 1. ระบบ Map หลัก
✅ **SystemMap Component** (`src/components/system-map.tsx`)
- แสดง map แบบ read-only
- แสดงสถานะ room (active/inactive)
- แสดง motion indicator
- รองรับ Building และ Floor filtering
- คลิกที่ room เพื่อดูรายละเอียด

### 2. Map Editor
✅ **MapEditor Component** (`src/components/map-editor.tsx`)
- **Drag-and-Drop**: ลากวาง room เพื่อจัดตำแหน่ง
- **แก้ไขชื่อ**: เปลี่ยนชื่อ room ได้
- **แก้ไขสี**: เลือกสีของ room
- **แก้ไขขนาด**: ปรับ width และ height
- **Auto-create Rooms**: สร้าง room อัตโนมัติจาก node ที่ online
- **ลบ Room**: กดลบ room ได้ (จะไม่ลบอัตโนมัติ)

### 3. Building & Floor Management
✅ **ระบบ Building และ Floor**
- สร้าง Building ใหม่ได้
- สร้าง Floor ในแต่ละ Building
- เลือก Building และ Floor เพื่อแสดง room
- Room สามารถกำหนด Building และ Floor ได้

### 4. API Endpoints

#### Buildings
- `GET /api/buildings` - ดึงรายการ building ทั้งหมด
- `POST /api/buildings` - สร้าง building ใหม่

#### Floors
- `GET /api/buildings/:building_id/floors` - ดึง floor ของ building
- `POST /api/floors` - สร้าง floor ใหม่

#### Rooms (Map Layout)
- `GET /api/map-layout` - ดึงข้อมูล room ทั้งหมด
- `POST /api/map-layout/advanced` - บันทึก room (support: name, x, y, width, height, color, floor_id, building_id)
- `DELETE /api/map-layout/:node` - ลบ room

### 5. Database Schema

#### ตาราง Buildings
```sql
CREATE TABLE buildings (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### ตาราง Floors
```sql
CREATE TABLE floors (
  id SERIAL PRIMARY KEY,
  building_id INTEGER REFERENCES buildings(id),
  floor_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### ตาราง map_layout (อัพเดท)
เพิ่มฟิลด์ใหม่:
- `width` - ความกว้างของ room (default: 120)
- `height` - ความสูงของ room (default: 80)
- `color` - สีของ room (default: #0056B3)
- `floor_id` - FK to floors table
- `building_id` - FK to buildings table

## การติดตั้งและใช้งาน

### 1. รัน Database Migrations

```bash
# เข้าไปที่ PostgreSQL container
docker exec -it wheelsense-server-postgres-1 psql -U wheeluser -d iot_log

# รัน migration ที่ 1 (Buildings, Floors, Pathways)
\i /docker-entrypoint-initdb.d/migrations/001_add_buildings_floors_paths.sql

# รัน migration ที่ 2 (Room Properties)
\i /docker-entrypoint-initdb.d/migrations/002_add_room_properties.sql
```

หรือถ้ารัน compose ใหม่:
```bash
cd WheelSense-Server
docker-compose down
docker-compose up --build
```

### 2. เข้าใช้งาน Dashboard

1. เปิด Dashboard: `http://localhost:8080`
2. ไปที่เมนู **"Map"** เพื่อเข้า Map Editor
3. Dashboard หลักจะแสดง map แบบ compact

### 3. สร้าง Building และ Floor

1. ในหน้า Map Editor
2. คลิก **"+"** ข้าง Building dropdown
3. ใส่ชื่อ Building และกด Create
4. คลิก **"+"** ข้าง Floor dropdown
5. ใส่ Floor Number และ Name แล้วกด Create

### 4. จัดการ Rooms

#### Auto-create Rooms
- Rooms จะถูกสร้างอัตโนมัติเมื่อมี Node ออนไลน์
- จะถูกวางในตำแหน่ง grid อัตโนมัติ
- ได้รับ default color เป็น #0056B3

#### แก้ไข Room
1. คลิกที่ room บน canvas
2. แก้ไขใน Properties Panel ทางขวา:
   - **Room Name**: ชื่อของห้อง
   - **X, Y Position**: ตำแหน่ง
   - **Width, Height**: ขนาด
   - **Color**: สี (ใช้ color picker หรือใส่ hex code)
3. กด **"Save Changes"** เพื่อบันทึก

#### Drag-and-Drop
- คลิกค้างที่ room แล้วลากไปวางที่ต้องการ
- ปล่อยเมาส์เพื่อบันทึกตำแหน่งใหม่

#### ลบ Room
- เลือก room แล้วกด **"Delete Room"** ใน Properties Panel
- Room จะไม่ถูกลบอัตโนมัติ ต้องกดลบเอง

## File Structure

```
WheelSense-Server/
├── WheelSense Dashboard/
│   └── src/
│       ├── components/
│       │   ├── system-map.tsx          # Map component (read-only)
│       │   ├── map-editor.tsx          # Map Editor (full features)
│       │   └── monitoring-dashboard.tsx # อัพเดทให้แสดง map
│       └── services/
│           └── api.ts                   # เพิ่ม Room, Building, Floor APIs
│
├── rest_api/
│   └── app.js                          # เพิ่ม endpoints สำหรับ map
│
└── sql_db/
    └── migrations/
        ├── 001_add_buildings_floors_paths.sql
        └── 002_add_room_properties.sql
```

## API Usage Examples

### สร้าง Building
```javascript
import { createBuilding } from '../services/api';

const building = await createBuilding({
  name: 'Main Building',
  description: 'อาคารหลัก'
});
```

### สร้าง Floor
```javascript
import { createFloor } from '../services/api';

const floor = await createFloor({
  building_id: 1,
  floor_number: 1,
  name: 'Ground Floor'
});
```

### ดึงข้อมูล Rooms
```javascript
import { getRooms } from '../services/api';

const rooms = await getRooms();
// Returns: Room[]
```

### อัพเดท Room
```javascript
import { updateRoom } from '../services/api';

await updateRoom({
  node: 1,
  name: 'Meeting Room A',
  x: 150,
  y: 200,
  width: 150,
  height: 100,
  color: '#10b981',
  floor_id: 1,
  building_id: 1
});
```

### ลบ Room
```javascript
import { deleteRoom } from '../services/api';

await deleteRoom(1); // ลบ room ของ node 1
```

## Features Summary

| Feature | Status | Description |
|---------|--------|-------------|
| แสดง Map | ✅ | แสดง map พร้อมสถานะ real-time |
| Auto-create Rooms | ✅ | สร้าง room อัตโนมัติจาก online nodes |
| Drag-and-Drop | ✅ | ลากวาง room เพื่อจัดตำแหน่ง |
| แก้ไขชื่อ | ✅ | เปลี่ยนชื่อ room |
| แก้ไขสี | ✅ | เลือกสีของ room |
| แก้ไขขนาด | ✅ | ปรับ width และ height |
| ลบ Room | ✅ | ลบ room ได้ (manual) |
| Building Management | ✅ | สร้างและจัดการ building |
| Floor Management | ✅ | สร้างและจัดการ floor |
| Real-time Updates | ✅ | แสดงสถานะ active/motion แบบ real-time |

## Troubleshooting

### Rooms ไม่ถูกสร้างอัตโนมัติ
- ตรวจสอบว่าเลือก Building และ Floor แล้ว
- ตรวจสอบว่ามี Node ออนไลน์
- ลอง Refresh หน้าเว็บ

### Map ไม่แสดง
- ตรวจสอบว่ารัน migration แล้ว
- ตรวจสอบ Console ใน DevTools
- ลองสร้าง Building และ Floor ใหม่

### Drag-and-Drop ไม่ทำงาน
- ตรวจสอบว่าอยู่ในหน้า Map Editor
- ลองคลิกที่ room ก่อนลาก
- Refresh หน้าเว็บ

## Next Steps (Optional)

- เพิ่ม Pathway/Corridor drawing
- เพิ่มระบบ Zoom และ Pan
- เพิ่ม Room templates
- Export/Import map layout
- Multi-select และ bulk edit
- Undo/Redo functionality

---

**สร้างเมื่อ**: 2025-10-23  
**เวอร์ชัน**: 1.0.0  
**สถานะ**: ✅ พร้อมใช้งาน

