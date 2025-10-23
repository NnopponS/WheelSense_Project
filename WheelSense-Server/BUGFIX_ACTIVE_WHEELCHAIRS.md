# Bug Fix: Active Wheelchairs Count

## ปัญหา (Problem)

**Active Wheelchairs** แสดงค่า `0` ทั้งๆ ที่มีข้อมูลรถเข็นเข้ามาในระบบ

### ข้อมูลที่เข้ามา:
```json
{
  "node": 4,
  "node_label": "Node 4",
  "wheel": 2,
  "distance": 1.32,
  "status": 0,
  "motion": 0,        ← รถเข็นไม่ได้เคลื่อนที่
  "direction": 0,
  "rssi": -58,
  "stale": false,     ← รถเข็นออนไลน์อยู่
  "ts": "2025-10-23T16:27:33+07:00"
}
```

### สถิติที่แสดง (เดิม):
- Connected Nodes: **1** ✅
- Active Wheelchairs: **0** ❌ (ควรเป็น 1)
- Online Devices: **1** ✅
- Signal Alerts: **0** ✅

## สาเหตุ (Root Cause)

Logic การนับ **Active Wheelchairs** เดิมใช้เงื่อนไข:

```typescript
activeWheelchairs: sensorData.filter(d => d.motion === 1).length
```

ซึ่งนับเฉพาะรถเข็นที่ `motion === 1` (กำลังเคลื่อนที่) เท่านั้น

แต่จากข้อมูลตัวอย่าง: `motion: 0` = รถเข็นหยุดนิ่ง
- ดังนั้นรถเข็นที่หยุดนิ่งจะไม่ถูกนับเป็น "Active"

### ปัญหาของการตีความ:
- **"Active Wheelchairs"** ควรหมายถึง **"รถเข็นที่ออนไลน์/พร้อมใช้งาน"**
- ไม่ใช่ **"รถเข็นที่กำลังเคลื่อนที่"**

## การแก้ไข (Solution)

### 1. เปลี่ยน Logic การนับ

**ก่อนแก้:**
```typescript
activeWheelchairs: sensorData.filter(d => d.motion === 1).length
```

**หลังแก้:**
```typescript
activeWheelchairs: sensorData.filter(d => !d.stale).length  // นับรถเข็นที่ออนไลน์
movingWheelchairs: sensorData.filter(d => d.motion === 1).length  // เพิ่มการนับรถเข็นที่เคลื่อนที่
```

### 2. อัพเดท UI

**ก่อนแก้:**
```tsx
<div>{stats.activeWheelchairs}</div>
<p>รถเข็นที่ใช้งาน</p>
```

**หลังแก้:**
```tsx
<div>{stats.activeWheelchairs}</div>
<p>รถเข็นออนไลน์</p>
{stats.movingWheelchairs > 0 && (
  <p className="text-xs text-[#00945E] flex items-center gap-1">
    <Activity className="h-3 w-3" />
    {stats.movingWheelchairs} กำลังเคลื่อนที่
  </p>
)}
```

## ผลลัพธ์ (Result)

### สถิติที่แสดง (ใหม่):
- Connected Nodes: **1** ✅
- Active Wheelchairs: **1** ✅ (แสดงถูกต้อง!)
  - รถเข็นออนไลน์
  - (ถ้ามีการเคลื่อนที่จะแสดง: "X กำลังเคลื่อนที่")
- Online Devices: **1** ✅
- Signal Alerts: **0** ✅

### กรณีทดสอบ:

#### กรณีที่ 1: รถเข็นหยุดนิ่ง (ตามตัวอย่าง)
```json
{ "motion": 0, "stale": false }
```
- ✅ Active Wheelchairs = 1
- Moving indicator ไม่แสดง

#### กรณีที่ 2: รถเข็นกำลังเคลื่อนที่
```json
{ "motion": 1, "stale": false }
```
- ✅ Active Wheelchairs = 1
- ✅ แสดง "1 กำลังเคลื่อนที่"

#### กรณีที่ 3: รถเข็น offline
```json
{ "motion": 0, "stale": true }
```
- ❌ Active Wheelchairs = 0 (ไม่นับเพราะ stale)

#### กรณีที่ 4: หลายรถเข็น
```json
[
  { "wheel_id": 1, "motion": 1, "stale": false },  // เคลื่อนที่
  { "wheel_id": 2, "motion": 0, "stale": false },  // หยุดนิ่ง
  { "wheel_id": 3, "motion": 1, "stale": false }   // เคลื่อนที่
]
```
- ✅ Active Wheelchairs = 3
- ✅ แสดง "2 กำลังเคลื่อนที่"

## ไฟล์ที่แก้ไข

### 1. `WheelSense Dashboard/src/hooks/useApi.ts`
- แก้ไข `useDeviceStats()` function
- เปลี่ยน logic การนับ activeWheelchairs
- เพิ่ม movingWheelchairs stat

### 2. `WheelSense Dashboard/src/components/monitoring-dashboard.tsx`
- อัพเดท UI ของ Active Wheelchairs card
- เปลี่ยนข้อความเป็น "รถเข็นออนไลน์"
- เพิ่มการแสดง moving wheelchairs indicator

## ประโยชน์ (Benefits)

1. ✅ **ข้อมูลถูกต้องแม่นยำ**: แสดงจำนวนรถเข็นที่ออนไลน์จริง
2. ✅ **ข้อมูลครบถ้วน**: ยังคงแสดงจำนวนรถเข็นที่กำลังเคลื่อนที่ด้วย
3. ✅ **UI ชัดเจน**: ผู้ใช้เห็นทั้งข้อมูลออนไลน์และการเคลื่อนที่
4. ✅ **Backward Compatible**: ไม่กระทบกับ code อื่นๆ

## การทดสอบ (Testing)

### ขั้นตอนการทดสอบ:

1. **ส่งข้อมูล MQTT ของรถเข็นที่หยุดนิ่ง:**
   ```json
   { "motion": 0, "stale": false }
   ```
   - ตรวจสอบ: Active Wheelchairs ควรเป็น 1

2. **ส่งข้อมูล MQTT ของรถเข็นที่เคลื่อนที่:**
   ```json
   { "motion": 1, "stale": false }
   ```
   - ตรวจสอบ: Active Wheelchairs ควรเป็น 1
   - ตรวจสอบ: ควรแสดง "1 กำลังเคลื่อนที่"

3. **ทดสอบ stale data:**
   - ปิด sensor นาน > timeout
   - ตรวจสอบ: Active Wheelchairs ควรลดลง

## สรุป

แก้ไขปัญหาการนับ Active Wheelchairs ให้นับจาก **online status** (`!stale`) แทนการนับจาก **motion status** (`motion === 1`)

ผลลัพธ์:
- ✅ Active Wheelchairs นับถูกต้อง
- ✅ เพิ่มข้อมูล moving wheelchairs 
- ✅ UI แสดงผลชัดเจนขึ้น

---

**Fixed by:** AI Assistant
**Date:** 2025-10-23
**Files Modified:** 2 files

