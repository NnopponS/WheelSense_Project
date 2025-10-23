# 🗺️ Map Layout Editor - คู่มือการใช้งาน

## ฟีเจอร์ใหม่ทั้งหมด

### 1. 🔍 Zoom & Pan Controls
**การใช้งาน:**
- **Zoom In**: คลิกปุ่ม `+` หรือ Scroll Up
- **Zoom Out**: คลิกปุ่ม `-` หรือ Scroll Down  
- **Pan**: Click & Drag บนแผนที่
- **Reset View**: คลิกปุ่ม Maximize (⛶)
- **Zoom Range**: 50% - 500%

**ตำแหน่ง**: ปุ่มควบคุมอยู่มุมขวาบนของแผนที่

---

### 2. 🏢 Add Building (เพิ่มอาคาร)

**ขั้นตอน:**
1. ไปที่หน้า **Map** (เมนูบนสุด)
2. ดูที่แถบด้านซ้าย → ส่วน **"Building"**
3. คลิกปุ่ม **"Add Building"**
4. ใส่ชื่ออาคาร (เช่น "Building A", "อาคารผู้ป่วยใน")
5. อาคารใหม่จะปรากฏในรายการ
6. คลิกเลือกอาคารที่ต้องการแก้ไข

**หมายเหตุ**: 
- มีอาคาร "Main Building" เริ่มต้นให้แล้ว
- สามารถสร้างได้ไม่จำกัด

---

### 3. 🏗️ Add Floor (เพิ่มชั้น)

**ขั้นตอน:**
1. เลือก Building ที่ต้องการก่อน
2. ดูที่แถบด้านซ้าย → ส่วน **"Floor"**
3. คลิกปุ่ม **"Add Floor"**
4. ใส่ชื่อชั้น (เช่น "Floor 2", "ชั้น 3")
5. ชั้นใหม่จะปรากฏในรายการ
6. คลิกเลือกชั้นที่ต้องการแก้ไข

**หมายเหตุ**:
- มี Floor 1 เริ่มต้นให้แล้ว
- แต่ละ Building มีได้หลายชั้น
- แผนที่จะแสดงเฉพาะ Rooms ของชั้นที่เลือก

---

### 4. 🛤️ Pathway Editor (วาดทางเดิน)

**ขั้นตอน:**
1. เลือก Floor ที่ต้องการก่อน
2. ดูที่แถบด้านซ้าย → ส่วน **"Edit Mode"**
3. คลิกปุ่ม **"Pathways"** (จะเปลี่ยนเป็นสีส้ม)
4. คลิกบนแผนที่เพื่อวางจุดทางเดิน (อย่างน้อย 2 จุด)
5. วางจุดต่อเนื่องตามเส้นทางที่ต้องการ
6. คลิกปุ่ม **"Finish"** เมื่อเสร็จ
7. ทางเดินจะแสดงเป็นเส้นสีส้ม

**การลบทางเดิน:**
- ดูรายการ Pathways ด้านล่าง
- คลิกไอคอน 🗑️ ข้างชื่อทางเดินที่ต้องการลบ

**ประเภททางเดิน:**
- Corridor (ทางเดินในอาคาร)
- Hallway (โถงทางเดิน)
- Entrance (ทางเข้า)
- Exit (ทางออก)

---

### 5. 📦 Room Editor (จัดวาง Rooms)

**ขั้นตอน:**
1. ดูที่แถบด้านซ้าย → ส่วน **"Edit Mode"**
2. คลิกปุ่ม **"Rooms"** (จะเปลี่ยนเป็นสีเขียว)
3. **คลิกลาก** Room บนแผนที่ไปวางตำแหน่งที่ต้องการ
4. Room ที่กำลังลากจะมีกรอบสีน้ำเงิน

**หมายเหตุ**:
- Rooms จะถูกสร้างอัตโนมัติจาก Nodes ที่ออนไลน์
- แต่ละ Room จะแสดงชื่อและหมายเลข Node
- สามารถลาก Rooms ไปวางในชั้นต่างๆ ได้

---

### 6. 💾 บันทึกการเปลี่ยนแปลง

**ขั้นตอน:**
1. แก้ไขแผนที่ตามต้องการ (ย้าย Rooms, วาดทางเดิน)
2. คลิกปุ่ม **"Save All"** มุมขวาบน
3. ระบบจะบันทึก:
   - ตำแหน่ง Rooms ทั้งหมด
   - Buildings และ Floors
   - Pathways ที่วาด

**หมายเหตุ**:
- การบันทึกจะอัพเดท Dashboard ทันที
- ไม่ต้อง Refresh หน้าเว็บ

---

## 🎯 ตัวอย่างการใช้งาน

### สถานการณ์: โรงพยาบาล 3 ชั้น

```
1. สร้าง Building "Main Hospital"
   
2. สร้าง Floors:
   - Floor 1: "Ground Floor - ห้องฉุกเฉิน"
   - Floor 2: "OPD - ผู้ป่วยนอก"
   - Floor 3: "IPD - ผู้ป่วยใน"

3. จัดวาง Rooms:
   - Floor 1: Emergency, Reception, Triage
   - Floor 2: Consultation 1, 2, 3
   - Floor 3: Ward A, Ward B, Ward C

4. วาดทางเดิน:
   - Floor 1: Main Entrance → Reception → Emergency
   - Floor 2: Elevator → Consultations
   - Floor 3: Elevator → Wards

5. บันทึก: คลิก "Save All"
```

---

## 🖱️ Shortcuts และ Tips

### Keyboard Shortcuts
- **Mouse Wheel**: Zoom In/Out
- **Click + Drag**: Pan แผนที่ (ในโหมด Zoom/Pan)

### Tips
- **Zoom ก่อนวาดทางเดิน**: จะวาดได้แม่นยำขึ้น
- **ใช้ Grid**: เส้น Grid จะช่วยจัดวาง Rooms ให้เป็นระเบียบ
- **แยก Floor**: ถ้ามี Rooms เยอะ ควรแยกเป็นชั้นๆ จะดูง่ายขึ้น
- **ตั้งชื่อที่เข้าใจง่าย**: ใช้ชื่อที่สื่อความหมาย เช่น "ER-Floor1" แทน "Room 1"

---

## 🎨 UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│  ← Map Layout Editor              [Save All]                │
├──────────────┬──────────────────────────────────────────────┤
│  Controls    │  Map Canvas                                  │
│              │  ┌──────────────────────────────────┐        │
│ Building     │  │                              [🔍]│        │
│ ▶ Main       │  │                              [+]│        │
│ + Add        │  │         [Rooms]              [-]│        │
│              │  │                              [⛶]│        │
│ Floor        │  │  ┌──────┐      ┌──────┐        │        │
│ ▶ Floor 1    │  │  │Room 1│      │Room 2│        │        │
│ + Add        │  │  └──────┘      └──────┘        │        │
│              │  │                                  │        │
│ Edit Mode    │  │  ────pathway────                │        │
│ ● Rooms      │  │                                  │        │
│ ○ Pathways   │  │  ┌──────┐                       │        │
│              │  │  │Room 3│                       │        │
│              │  │  └──────┘                       │        │
│              │  └──────────────────────────────────┘        │
│              │  Floor 1 • 3 rooms • 1 paths                │
└──────────────┴──────────────────────────────────────────────┘
```

---

## 🔧 Troubleshooting

### ปัญหา: ไม่เห็นปุ่ม Zoom
**วิธีแก้**: Refresh หน้าเว็บ (F5) หรือ Clear Cache

### ปัญหา: ลาก Room ไม่ได้
**วิธีแก้**: ตรวจสอบว่าเลือกโหมด "Rooms" แล้ว (ปุ่มต้องเป็นสีเขียว)

### ปัญหา: วาดทางเดินไม่ได้
**วิธีแก้**: 
1. เลือกโหมด "Pathways" (ปุ่มต้องเป็นสีส้ม)
2. คลิกอย่างน้อย 2 จุด
3. คลิก "Finish"

### ปัญหา: บันทึกไม่ได้
**วิธีแก้**: 
1. ตรวจสอบว่า REST API ทำงาน (http://localhost:3000)
2. ดู Console (F12) เพื่อดู Error
3. ลอง Restart services: `docker-compose restart`

---

## 📊 Technical Details

### Database Tables
- `buildings` - อาคารทั้งหมด
- `floors` - ชั้นของแต่ละอาคาร
- `pathways` - ทางเดิน (JSONB points)
- `map_layout` - ตำแหน่ง Rooms (extended with floor_id, building_id)

### API Endpoints
```
GET  /api/buildings              # รายการอาคาร
POST /api/buildings              # สร้างอาคาร
GET  /api/buildings/:id/floors   # รายการชั้น
POST /api/floors                 # สร้างชั้น
GET  /api/floors/:id/pathways    # รายการทางเดิน
POST /api/pathways               # สร้างทางเดิน
DELETE /api/pathways/:id         # ลบทางเดิน
POST /api/map-layout/advanced    # บันทึก Rooms
```

---

## 🚀 Next Steps

ฟีเจอร์ที่จะเพิ่มในอนาคต:
- [ ] Auto-Routing (คำนวณเส้นทางสั้นที่สุด)
- [ ] Floor Plan Import (นำเข้าภาพแผนผัง)
- [ ] 3D View
- [ ] Accessibility Routes
- [ ] Room Templates

---

**Last Updated:** October 23, 2025  
**Version:** 1.1.0

