# Simple Map System - Rollback Complete

**Date:** October 23, 2025  
**Version:** 1.0 (Simple)

---

## 🔙 ย้อนกลับเป็นระบบง่าย

ตามคำขอของผู้ใช้ ระบบ Map ได้ถูกย้อนกลับไปเป็นเวอร์ชันง่าย **ก่อนที่จะมีฟีเจอร์ขั้นสูง**

---

## ❌ ฟีเจอร์ที่ลบออก

| ฟีเจอร์ | สถานะ |
|---------|-------|
| Zoom In/Out | ❌ ลบออก |
| Pan (เลื่อนแผนที่) | ❌ ลบออก |
| Buildings Management | ❌ ลบออก |
| Floors Management | ❌ ลบออก |
| Pathways Editor | ❌ ลบออก |

---

## ✅ ฟีเจอร์ที่เหลือ (Simple Version)

### Dashboard Map
- ✅ แสดงแผนที่แบบง่าย
- ✅ แสดง Rooms (จาก Nodes ที่ออนไลน์)
- ✅ แสดง Wheelchairs (แบบ Real-time)
- ✅ คลิก Wheelchair ดูรายละเอียด
- ✅ แสดงจำนวน Rooms และ Devices

### Map Editor
- ✅ **Drag Rooms** - ลาก Rooms ไปวางตำแหน่ง
- ✅ **Rename Rooms** - เปลี่ยนชื่อ Room
- ✅ **Auto Layout** - จัดเรียงอัตโนมัติ (Grid 3 คอลัมน์)
- ✅ **Save** - บันทึกตำแหน่ง Rooms
- ✅ **Auto-sync** - Dashboard อัพเดททันที

---

## 📁 ไฟล์ที่เปลี่ยนแปลง

### Modified Files
```
src/components/
├── map-editor.tsx          (Simplified - ลบ Zoom/Pan, Buildings, Floors, Pathways)
└── system-map.tsx          (Simplified - ลบ Zoom/Pan)
```

### Deleted Files
```
- simple-map-viewer.tsx     (ไม่ใช้แล้ว)
- ADVANCED_MAP_FEATURES.md  (เอกสารของฟีเจอร์ขั้นสูง)
- MAP_EDITOR_GUIDE.md       (เอกสารของ Editor ขั้นสูง)
- MAP_SYNC_UPDATE.md        (เอกสารอัพเดท)
- MAP_REBUILD_v2.md         (เอกสาร Rebuild)
- MAP_EDITOR_FIX.md         (เอกสาร Fix)
- RESTRUCTURE_SUMMARY.md    (เอกสารสรุปการปรับโครงสร้าง)
```

---

## 🚀 วิธีใช้งาน

### Dashboard (ดูแผนที่)

1. **เปิด Dashboard:**
   ```
   http://localhost:80
   ```

2. **ดูแผนที่:**
   - แผนที่จะแสดง Rooms อัตโนมัติ
   - Wheelchairs จะแสดงใน Room ที่สังกัด
   - Motion indicator (วงสีเขียว) แสดงว่ากำลังเคลื่อนที่

3. **ดูรายละเอียด:**
   - คลิกที่ Wheelchair เพื่อดูข้อมูลเต็ม
   - แสดง Distance, RSSI, Motion, Direction

---

### Map Editor (แก้ไขแผนที่)

1. **เปิด Map Editor:**
   ```
   http://localhost:80/map
   ```

2. **Drag Rooms:**
   - คลิกลาก Room ไปตำแหน่งที่ต้องการ
   - Room ที่กำลังลากจะมีกรอบสีน้ำเงิน
   - ปล่อยเมาส์เพื่อวาง

3. **Rename Room:**
   - คลิกปุ่ม "Rename" ข้าง Room ในรายการด้านซ้าย
   - ใส่ชื่อใหม่
   - คลิก OK

4. **Auto Layout:**
   - คลิกปุ่ม "Auto Layout" มุมขวาบน
   - Rooms จะถูกจัดเรียงแบบ Grid อัตโนมัติ (3 คอลัมน์)

5. **Save:**
   - คลิกปุ่ม "Save" มุมขวาบน
   - รอ Toast notification
   - กลับไป Dashboard → จะเห็นตำแหน่งใหม่ทันที!

---

## 🎯 ตัวอย่างการใช้งาน

### Scenario: จัดเรียงห้องในโรงพยาบาล

```
1. เปิด Map Editor (http://localhost:80/map)

2. Rename Rooms:
   - Node 1 → "ER (Emergency Room)"
   - Node 2 → "Reception"
   - Node 3 → "Ward A"
   - Node 4 → "Ward B"

3. Drag Rooms:
   - ER → วางด้านซ้ายบน
   - Reception → วางตรงกลาง
   - Ward A → วางด้านขวาบน
   - Ward B → วางด้านขวาล่าง

4. Save:
   - คลิก "Save"
   - จะเห็น "Saved 4 rooms"

5. ตรวจสอบ:
   - กลับไป Dashboard
   - แผนที่จะแสดงตามตำแหน่งที่จัด
```

---

## 📊 Database Schema

ไม่มีการเปลี่ยนแปลง Database Schema:

```sql
-- Map Layout (เดิม)
CREATE TABLE map_layout (
  node INTEGER PRIMARY KEY,
  node_name TEXT,
  x_pos INTEGER NOT NULL,
  y_pos INTEGER NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Note:** ฟิลด์ `floor_id` และ `building_id` (ถ้ามี) จะไม่ถูกใช้ใน Simple Version

---

## 🔌 API Endpoints

### Simple Version ใช้แค่:

```bash
# Get map layout
GET /api/map-layout

# Update map layout
POST /api/map-layout
Body: [
  {
    "node": 1,
    "node_name": "Room 1",
    "x_pos": 100,
    "y_pos": 100
  }
]
```

### API ที่ไม่ใช้แล้ว:
```bash
❌ GET  /api/buildings
❌ POST /api/buildings
❌ GET  /api/buildings/:id/floors
❌ POST /api/floors
❌ GET  /api/floors/:id/pathways
❌ POST /api/pathways
❌ DELETE /api/pathways/:id
❌ POST /api/map-layout/advanced
```

---

## 🎨 UI/UX

### Dashboard
- **Simple & Clean** - ไม่มีปุ่ม Zoom/Pan
- **Grid Background** - เพื่อให้ดูตำแหน่งง่าย
- **Clear Labels** - ชื่อ Room และ Device ชัดเจน
- **Motion Indicator** - วงสีเขียวแสดง Motion

### Map Editor
- **Room List** - รายการ Rooms ทางซ้าย
- **Drag & Drop** - ลาก Rooms ได้ง่าย
- **Visual Feedback** - กรอบสีน้ำเงินตอนลาก
- **Coordinate Display** - แสดงตำแหน่ง (x, y)

---

## ✅ Testing Checklist

- [x] Dashboard แสดงแผนที่ได้
- [x] แสดง Rooms ถูกต้อง
- [x] แสดง Wheelchairs ถูกต้อง
- [x] คลิก Wheelchair ดูรายละเอียดได้
- [x] Map Editor เปิดได้
- [x] Drag Rooms ได้
- [x] Rename Rooms ได้
- [x] Auto Layout ได้
- [x] Save ได้
- [x] Dashboard อัพเดทอัตโนมัติ

---

## 🐛 Troubleshooting

### ปัญหา: แผนที่ไม่แสดง

**วิธีแก้:**
1. Refresh หน้า (F5)
2. ตรวจสอบว่ามี Nodes ออนไลน์
3. ดู Console (F12) หา errors

### ปัญหา: Drag Rooms ไม่ได้

**วิธีแก้:**
1. Refresh หน้า (F5)
2. ลองคลิกลากใหม่อีกครั้ง
3. ดู Console หา errors

### ปัญหา: Save ไม่ได้

**วิธีแก้:**
1. ตรวจสอบ API: `curl http://localhost:3000/api/map-layout`
2. Restart API: `docker-compose restart rest_api`
3. ลอง Save อีกครั้ง

### ปัญหา: Dashboard ไม่อัพเดท

**วิธีแก้:**
1. Refresh หน้า Dashboard (F5)
2. ตรวจสอบว่า Save สำเร็จแล้ว (ดู Toast)
3. Hard refresh: Ctrl+Shift+R

---

## 📝 Code Examples

### Simple Map (Dashboard)

```tsx
// แสดงแผนที่แบบง่าย
<SystemMap 
  sensorData={sensorData}
  mapLayout={mapLayout}
  onWheelchairClick={(sensor) => {
    setSelectedSensor(sensor);
    setDetailOpen(true);
  }}
  onEditClick={() => {
    navigate('/map');
  }}
/>
```

### Map Editor (Drag & Save)

```tsx
// Drag Room
const handleRoomMouseDown = (e, node) => {
  const coords = getSVGCoords(e);
  setDraggingRoom(node);
  setDragStart({ x: coords.x - room.x, y: coords.y - room.y });
};

// Save
const handleSave = async () => {
  const layoutData = rooms.map(room => ({
    node: room.node,
    node_name: room.name,
    x_pos: Math.round(room.x),
    y_pos: Math.round(room.y),
  }));

  await updateLayout(layoutData);
  window.dispatchEvent(new Event('map-layout-updated'));
};
```

---

## 🔄 Sync System

ระบบ Sync ยังคงทำงานเหมือนเดิม:

```
Map Editor (Save)
    ↓
Database (map_layout table)
    ↓
Event: 'map-layout-updated'
    ↓
Dashboard (Refetch & Update)
```

---

## 📈 Performance

### Simple Version:
- ✅ รวดเร็วกว่า (ไม่มี Zoom/Pan calculations)
- ✅ Code น้อยกว่า (ง่ายต่อการ maintain)
- ✅ Memory usage ต่ำกว่า

---

## 💡 Tips

1. **ใช้ Auto Layout ก่อน** - จะจัดเรียง Rooms ให้เป็นระเบียบ
2. **Rename ให้มีความหมาย** - จะหาง่ายขึ้น
3. **Save บ่อยๆ** - เพื่อไม่เสียงาน
4. **Refresh Dashboard** - ถ้าไม่อัพเดทอัตโนมัติ

---

## 📖 Summary

**Before (Complex):**
- ❌ Zoom/Pan
- ❌ Buildings/Floors
- ❌ Pathways
- ❌ Code ซับซ้อน

**After (Simple):**
- ✅ แผนที่แบบง่าย
- ✅ Drag & Drop Rooms
- ✅ Rename & Auto Layout
- ✅ Save & Sync
- ✅ Code สะอาด เข้าใจง่าย

---

**ระบบย้อนกลับสำเร็จ!** ตอนนี้เป็นระบบ Map แบบง่าย ก่อนที่จะมีฟีเจอร์ขั้นสูง

---

**Version:** 1.0 (Simple)  
**Last Updated:** October 23, 2025  
**Status:** ✅ Ready to use

