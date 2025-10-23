# Advanced Map Features

## 🗺️ ฟีเจอร์แผนที่ขั้นสูง

เวอร์ชัน 1.1 เพิ่มฟีเจอร์แผนที่ขั้นสูงที่รองรับอาคารหลายชั้น ทางเดิน และระบบ Zoom/Pan

---

## ✨ ฟีเจอร์หลัก

### 1. **Zoom & Pan Controls** 🔍
- **Zoom In/Out**: ใช้ปุ่มหรือ Mouse Scroll Wheel
- **Pan (เลื่อนแผนที่)**: คลิกลากด้วยเมาส์
- **Reset View**: กลับไปมุมมองเริ่มต้น
- **Zoom Range**: 50% - 500%

**การใช้งาน:**
```typescript
<EnhancedMapViewer width={800} height={600} showControls={true}>
  {/* SVG content */}
</EnhancedMapViewer>
```

---

### 2. **Multi-Building Support** 🏢
- สร้างและจัดการอาคารได้หลายอาคาร
- แต่ละอาคารมีชื่อและคำอธิบาย
- สลับระหว่างอาคารได้ง่าย

**Database Schema:**
```sql
CREATE TABLE buildings (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**API Endpoints:**
- `GET /api/buildings` - ดึงรายการอาคารทั้งหมด
- `POST /api/buildings` - สร้างอาคารใหม่

---

### 3. **Multi-Floor Support** 🏗️
- แต่ละอาคารมีได้หลายชั้น
- กำหนดหมายเลขชั้นและชื่อชั้น
- แสดงเฉพาะ Nodes/Rooms ของชั้นที่เลือก

**Database Schema:**
```sql
CREATE TABLE floors (
  id SERIAL PRIMARY KEY,
  building_id INTEGER REFERENCES buildings(id),
  floor_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  UNIQUE(building_id, floor_number)
);
```

**API Endpoints:**
- `GET /api/buildings/:building_id/floors` - ดึงชั้นของอาคาร
- `POST /api/floors` - สร้างชั้นใหม่

---

### 4. **Pathway Editor** 🛤️
- วาดทางเดิน/ทางเชื่อมระหว่างห้อง
- กำหนดความกว้างและประเภทของทางเดิน
- ลบและแก้ไขทางเดินได้

**ประเภททางเดิน:**
- `corridor` - ทางเดินในอาคาร
- `hallway` - โถงทางเดิน
- `entrance` - ทางเข้า
- `exit` - ทางออก

**Database Schema:**
```sql
CREATE TABLE pathways (
  id SERIAL PRIMARY KEY,
  floor_id INTEGER REFERENCES floors(id),
  name TEXT,
  points JSONB NOT NULL,  -- [{x: 100, y: 200}, ...]
  width INTEGER DEFAULT 50,
  type TEXT DEFAULT 'corridor'
);
```

**API Endpoints:**
- `GET /api/floors/:floor_id/pathways` - ดึงทางเดินของชั้น
- `POST /api/pathways` - สร้างทางเดินใหม่
- `DELETE /api/pathways/:id` - ลบทางเดิน

---

## 🎯 วิธีใช้งาน

### เข้าถึง Advanced Map Editor

1. ไปที่เมนู **"Advanced Map"** ในแถบนำทาง
2. หรือคลิกปุ่ม **"Edit"** ใน Dashboard

### สร้างอาคารและชั้น

1. คลิก **"Add Building"** เพื่อสร้างอาคารใหม่
2. เลือกอาคารที่ต้องการ
3. คลิก **"Add Floor"** เพื่อเพิ่มชั้น
4. เลือกชั้นที่ต้องการแก้ไข

### วาดทางเดิน

1. เลือกโหมด **"Pathways"**
2. คลิกบนแผนที่เพื่อวาดเส้นทางเดิน (อย่างน้อย 2 จุด)
3. คลิก **"Finish"** เมื่อเสร็จสิ้น
4. คลิก **"Save All"** เพื่อบันทึก

### จัดการ Rooms

1. เลือกโหมด **"Rooms"**
2. ลากห้องไปวางตำแหน่งที่ต้องการ
3. Rooms จะถูกบันทึกพร้อมกับข้อมูล floor_id และ building_id

---

## 🔄 การย้ายข้อมูลเดิม

ข้อมูล map_layout เดิมจะถูก migrate อัตโนมัติ:

```sql
-- ข้อมูลเดิมจะถูกกำหนดเป็น Building 1, Floor 1
UPDATE map_layout 
SET building_id = 1, floor_id = 1 
WHERE building_id IS NULL;
```

---

## 📊 Dashboard Integration

Dashboard หลักได้รับการอัพเดทให้รองรับ:

1. **Enhanced Map Viewer** พร้อม Zoom/Pan
2. แสดง Rooms ตามชั้นปัจจุบัน (ถ้าเลือก)
3. Signal strength และ heatmap ยังคงทำงานตามปกติ

---

## 🚀 Next Steps

ฟีเจอร์ที่จะเพิ่มในอนาคต:

- [ ] **Auto-Routing**: คำนวณเส้นทางสั้นที่สุดระหว่างห้อง
- [ ] **Floor Plan Import**: นำเข้าแผนผังจากไฟล์ภาพ
- [ ] **3D View**: มุมมอง 3 มิติของอาคาร
- [ ] **Collision Detection**: ตรวจจับรถเข็นที่ใกล้กันมากเกินไป
- [ ] **Occupancy Heatmap**: แสดงความหนาแน่นของการใช้งานแต่ละพื้นที่

---

## 📝 API Reference

### Buildings

```typescript
// Get all buildings
const buildings = await getBuildings();

// Create building
const newBuilding = await createBuilding({
  name: "Building A",
  description: "Main hospital building"
});
```

### Floors

```typescript
// Get floors for building
const floors = await getFloors(buildingId);

// Create floor
const newFloor = await createFloor({
  building_id: 1,
  floor_number: 2,
  name: "Floor 2",
  description: "Outpatient department"
});
```

### Pathways

```typescript
// Get pathways for floor
const pathways = await getPathways(floorId);

// Create pathway
const newPath = await createPathway({
  floor_id: 1,
  name: "Main Corridor",
  points: [
    { x: 100, y: 100 },
    { x: 300, y: 100 },
    { x: 300, y: 300 }
  ],
  width: 50,
  type: "corridor"
});

// Delete pathway
await deletePathway(pathwayId);
```

---

## 🛠️ Technical Details

### Components

- **`EnhancedMapViewer`**: Zoom/Pan container component
- **`AdvancedMapEditor`**: Full map editor with buildings/floors/pathways
- **`MonitoringDashboard`**: Updated to use EnhancedMapViewer

### Database Tables

- `buildings` - Building information
- `floors` - Floor information per building
- `pathways` - Pathway/corridor data
- `map_layout` - Extended with floor_id and building_id

### API Endpoints

All endpoints are RESTful and return JSON:

- Buildings: `/api/buildings`
- Floors: `/api/buildings/:id/floors`, `/api/floors`
- Pathways: `/api/floors/:id/pathways`, `/api/pathways`, `/api/pathways/:id`

---

## 📖 ตัวอย่างการใช้งาน

### สถานพยาบาล 3 ชั้น

```
Building: Main Hospital
  ├─ Floor 1 (Ground Floor)
  │   ├─ Room: Emergency
  │   ├─ Room: Reception
  │   └─ Pathway: Main Entrance → Emergency
  │
  ├─ Floor 2 (Outpatient)
  │   ├─ Room: Consultation 1
  │   ├─ Room: Consultation 2
  │   └─ Pathway: Elevator → Consultations
  │
  └─ Floor 3 (Inpatient)
      ├─ Room: Ward A
      ├─ Room: Ward B
      └─ Pathway: Elevator → Wards
```

---

## ⚡ Performance

- **Zoom/Pan**: Hardware-accelerated SVG transforms
- **Multi-floor**: Only renders current floor data
- **Pathways**: Cached in browser, minimal re-render
- **Database**: Indexed on floor_id and building_id

---

## 🔐 Security

- All API endpoints validate input
- CORS enabled for allowed origins
- PostgreSQL foreign key constraints protect data integrity
- No sensitive data in pathway coordinates

---

## 📞 Support

หากพบปัญหาหรือต้องการความช่วยเหลือ:
1. ตรวจสอบ logs ใน Docker: `docker logs wheelsense-api`
2. ตรวจสอบ database: `docker exec -it wheelsense-postgres psql -U wheeluser -d iot_log`
3. ดู console errors ใน browser DevTools

---

**Last Updated:** October 23, 2025  
**Version:** 1.1.0

