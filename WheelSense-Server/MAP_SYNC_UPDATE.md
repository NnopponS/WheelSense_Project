# Map System Synchronization Update

**Date:** October 23, 2025  
**Version:** 1.2.0

---

## 🎯 สรุปการเปลี่ยนแปลง

### ปัญหาเดิม
- มี Map 3 ระบบ ที่ไม่ sync กัน:
  1. **Dashboard Map** - แสดงผลแผนที่
  2. **Map Layout Editor** - แก้ไขตำแหน่ง Rooms
  3. **Advanced Map Editor** - จัดการ Buildings/Floors/Pathways

### การแก้ไข
✅ **รวมเป็นระบบเดียว** ที่ sync กัน:
- ใช้ **Map Layout Editor** เป็นหลัก (มีฟีเจอร์ครบ)
- **Dashboard** ใช้ข้อมูลเดียวกัน และ sync อัตโนมัติ
- **ลบ Advanced Map Editor** ออก (ไม่จำเป็นแล้ว)

---

## 📋 รายละเอียดการเปลี่ยนแปลง

### 1. ลบ Advanced Map Editor
```diff
- import { AdvancedMapEditor } from './components/advanced-map-editor';
- <Route path="/map-advanced" element={<AdvancedMapEditor />} />
- <Link to="/map-advanced">Advanced Map</Link>
```

**ไฟล์ที่ลบ:**
- `src/components/advanced-map-editor.tsx`

---

### 2. อัพเดท Navigation
```diff
- Map
- Advanced Map
+ Map Editor (ครบทุกฟีเจอร์)
```

**ไฟล์:** `src/App.tsx`

---

### 3. เพิ่ม Real-time Sync

#### Dashboard (รับข้อมูล)
```typescript
// Listen for map layout updates from Map Editor
useEffect(() => {
  const handleMapUpdate = () => {
    refetchMap();
  };
  
  window.addEventListener('map-layout-updated', handleMapUpdate);
  return () => window.removeEventListener('map-layout-updated', handleMapUpdate);
}, [refetchMap]);
```

#### Map Editor (ส่งข้อมูล)
```typescript
// Notify other components that map layout has been updated
window.dispatchEvent(new Event('map-layout-updated'));

toast.success('Changes saved!', {
  description: 'Dashboard will update automatically'
});
```

**ไฟล์:**
- `src/components/monitoring-dashboard.tsx`
- `src/components/map-layout-editor.tsx`

---

### 4. ปรับปรุง API

```javascript
app.post('/api/map-layout/advanced', async (req, res) => {
  const { rooms } = req.body; // Array of {node, name, floor_id, building_id, x, y}
  
  // บันทึก node_name, floor_id, building_id พร้อมกัน
  await pool.query(`
    INSERT INTO map_layout (node, node_name, floor_id, building_id, x_pos, y_pos)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (node) DO UPDATE SET
      node_name = EXCLUDED.node_name,
      floor_id = EXCLUDED.floor_id,
      building_id = EXCLUDED.building_id,
      x_pos = EXCLUDED.x_pos,
      y_pos = EXCLUDED.y_pos,
      updated_at = NOW()
  `, [room.node, room.name, room.floor_id, room.building_id, room.x, room.y]);
});
```

**ไฟล์:** `rest_api/app.js`

---

## 🎨 ฟีเจอร์ใน Map Editor (ครบทุกอย่าง)

| ฟีเจอร์ | คำอธิบาย | วิธีใช้ |
|---------|----------|---------|
| **🔍 Zoom/Pan** | ขยาย/ย่อ และเลื่อนแผนที่ | ปุ่ม +/- หรือ Scroll Wheel, Click & Drag |
| **🏢 Buildings** | จัดการอาคาร | คลิก "Add Building" ในแถบซ้าย |
| **🏗️ Floors** | จัดการชั้น | คลิก "Add Floor" ในแถบซ้าย |
| **🛤️ Pathways** | วาดทางเดิน | เลือกโหมด "Pathways" → คลิกบนแผนที่ |
| **📦 Rooms** | จัดวาง Rooms | เลือกโหมด "Rooms" → ลาก Rooms |
| **💾 Save** | บันทึกทั้งหมด | คลิกปุ่ม "Save All" |

---

## 🔄 การ Sync ระหว่าง Dashboard และ Map Editor

```
┌─────────────────┐         Save          ┌──────────────────┐
│  Map Editor     │ ───────────────────►  │  Database        │
│                 │                        │  (map_layout)    │
└─────────────────┘                        └──────────────────┘
        │                                           │
        │ dispatch('map-layout-updated')           │
        │                                           │
        ▼                                           ▼
┌─────────────────┐         Refetch        ┌──────────────────┐
│  Dashboard      │ ◄─────────────────────  │  API             │
│  (Auto-update)  │                        │  /api/map-layout │
└─────────────────┘                        └──────────────────┘
```

---

## ✅ การทดสอบ

### 1. ทดสอบ Sync
```bash
# เปิด Dashboard
http://localhost:80

# เปิด Map Editor (Tab ใหม่)
http://localhost:80/map

# ลาก Room ใน Map Editor → คลิก "Save All"
# กลับไปดู Dashboard → แผนที่จะอัพเดทอัตโนมัติ
```

### 2. ทดสอบ API
```bash
# Buildings
curl http://localhost:3000/api/buildings

# Floors
curl http://localhost:3000/api/buildings/1/floors

# Map Layout
curl http://localhost:3000/api/map-layout

# Save (ทดสอบใน Map Editor)
```

---

## 📊 Database Schema

**Table: map_layout**
```sql
node          INTEGER PRIMARY KEY
node_name     TEXT
floor_id      INTEGER REFERENCES floors(id)
building_id   INTEGER REFERENCES buildings(id)
x_pos         INTEGER NOT NULL
y_pos         INTEGER NOT NULL
updated_at    TIMESTAMPTZ DEFAULT NOW()
```

---

## 🚀 การใช้งาน

### Dashboard (ดูแผนที่)
1. เปิด http://localhost:80
2. แผนที่จะแสดงห้องทั้งหมดตาม layout ที่บันทึกไว้
3. คลิกที่ wheelchair เพื่อดูรายละเอียด
4. แผนที่จะ **อัพเดทอัตโนมัติ** เมื่อมีการเปลี่ยนแปลงจาก Map Editor

### Map Editor (แก้ไขแผนที่)
1. เปิด http://localhost:80 → คลิกเมนู "**Map Editor**"
2. เลือก Building/Floor ที่ต้องการแก้ไข
3. แก้ไขแผนที่:
   - **Zoom/Pan**: ใช้ปุ่มหรือ Scroll Wheel
   - **Add Building**: คลิก "Add Building" ในแถบซ้าย
   - **Add Floor**: คลิก "Add Floor" ในแถบซ้าย
   - **Draw Pathway**: เลือกโหมด "Pathways" → คลิกบนแผนที่
   - **Move Rooms**: เลือกโหมด "Rooms" → ลาก Rooms
4. คลิก "**Save All**" เพื่อบันทึก
5. Dashboard จะ**อัพเดททันที**

---

## 📝 Migration Guide

### สำหรับผู้ใช้เดิม

#### ข้อมูลเดิมจะยังอยู่
- ข้อมูล map_layout เดิมจะยังคงอยู่
- แต่จะไม่มี floor_id และ building_id
- ระบบจะกำหนดเป็น Building 1, Floor 1 อัตโนมัติ

#### ขั้นตอน Migration
```bash
# 1. Backup ข้อมูลเดิม
docker exec wheelsense-postgres pg_dump -U wheeluser iot_log > backup.sql

# 2. Run migration (ทำอัตโนมัติตอน restart)
docker-compose restart rest_api

# 3. ตรวจสอบข้อมูล
docker exec -it wheelsense-postgres psql -U wheeluser -d iot_log
SELECT * FROM map_layout;
```

---

## 🔧 Troubleshooting

### ปัญหา: Dashboard ไม่อัพเดท
**วิธีแก้:**
1. Refresh หน้า Dashboard (F5)
2. ตรวจสอบ Console (F12) ดู error
3. ตรวจสอบว่า event ถูกส่ง:
   ```javascript
   window.addEventListener('map-layout-updated', () => console.log('Event received!'));
   ```

### ปัญหา: Map Editor save ไม่ได้
**วิธีแก้:**
1. ตรวจสอบว่า API ทำงาน: `curl http://localhost:3000/api/map-layout`
2. ดู error ใน Console (F12)
3. Restart API: `docker-compose restart rest_api`

### ปัญหา: แผนที่ไม่แสดง Rooms
**วิธีแก้:**
1. ตรวจสอบว่ามี Nodes ออนไลน์: `/api/sensor-data`
2. ตรวจสอบว่ามี map_layout: `/api/map-layout`
3. ถ้าไม่มี ให้ไปที่ Map Editor → Save เพื่อสร้าง layout

---

## 🎯 สรุป

### ก่อนแก้ไข
- ❌ Map 3 ระบบ ที่ไม่ sync กัน
- ❌ ต้อง refresh manual
- ❌ สับสนว่าจะใช้ Map ไหน

### หลังแก้ไข
- ✅ Map ระบบเดียว ที่ sync กัน
- ✅ Auto-update อัตโนมัติ
- ✅ ใช้งานง่าย ชัดเจน
- ✅ ฟีเจอร์ครบทุกอย่างใน Map Editor

---

## 📞 Support

หากพบปัญหา:
1. ตรวจสอบ logs: `docker logs wheelsense-api`
2. ตรวจสอบ database: `docker exec -it wheelsense-postgres psql -U wheeluser -d iot_log`
3. ดู console errors ใน browser (F12)

---

**Version:** 1.2.0  
**Last Updated:** October 23, 2025

