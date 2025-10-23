# 🛞 WheelSense - Wheelchair Location Tracking

## ภาพรวม

ระบบแสดงตำแหน่งของรถเข็นบน Map แบบ Real-time โดยใช้วิธีการหาตำแหน่งจาก **RSSI ที่แรงที่สุด**

### หลักการทำงาน

รถเข็นแต่ละคันจะถูกกำหนดตำแหน่งว่าอยู่ใน Room ไหนโดยดูจาก:
1. **RSSI ที่สูงที่สุด** (สัญญาณแรงที่สุด)
   - -50 dBm ดีกว่า -70 dBm (ใกล้ 0 = แรงกว่า)
2. **Timestamp ล่าสุด** (ถ้า RSSI เท่ากัน)
   - ใช้ข้อมูลที่อัพเดทล่าสุด

---

## 🎯 ฟีเจอร์

### 1. แสดง Wheelchair Icons บน Map

- **แสดงไอคอน ♿** ในห้องที่มี Wheelchair อยู่
- แสดงหมายเลข Wheelchair (W1, W2, ...)
- รองรับหลาย Wheelchair ในห้องเดียวกัน
- อัพเดทแบบ Real-time

### 2. ข้อมูล Wheelchair ใน Properties Panel

เมื่อเลือก Room จะแสดง:
- จำนวน Wheelchair ในห้อง
- รายชื่อ Wheelchair แต่ละคัน
- ค่า RSSI ของแต่ละคัน
- คำอธิบายว่าใช้ RSSI ในการหาตำแหน่ง

### 3. Wheelchair Location Summary

ในหน้า Map หลัก (SystemMap) จะแสดง:
- รายการ Wheelchair ทั้งหมด
- ห้องที่แต่ละคันอยู่
- ค่า RSSI
- อัพเดทแบบ Real-time

---

## 💻 การทำงานของระบบ

### Algorithm: Strongest RSSI

```typescript
function getWheelchairLocations(sensorData: SensorData[]) {
  // 1. จัดกลุ่มข้อมูลตาม wheelchair
  // 2. สำหรับแต่ละ wheelchair:
  //    - หา node ที่มี RSSI สูงสุด (ใกล้ 0 มากที่สุด)
  //    - ถ้า RSSI เท่ากัน → ใช้ timestamp ล่าสุด
  // 3. Return: wheelchair ID → room location
}
```

### ตัวอย่างการทำงาน

**สถานการณ์:**
- Wheelchair W1 ส่งสัญญาณไปยัง:
  - Room A: RSSI = -55 dBm
  - Room B: RSSI = -72 dBm
  - Room C: RSSI = -68 dBm

**ผลลัพธ์:**
- W1 อยู่ที่ **Room A** (เพราะ -55 dBm แรงที่สุด)

---

## 📍 UI Elements

### 1. บน Map Canvas

```
┌─────────────────────┐
│  Room A (Node 1)    │
│                     │
│  ┌───────────────┐  │
│  │ ♿ W1  ♿ W2  │  │ ← Wheelchair badge
│  └───────────────┘  │
└─────────────────────┘
```

### 2. ใน Properties Panel

```
┌─────────────────────────────┐
│ Room Properties             │
├─────────────────────────────┤
│ [Active] [Motion] [♿ 2]    │ ← Status badges
│                             │
│ Wheelchairs in this Room    │
│ ┌─────────────────────────┐ │
│ │ ♿ Wheel 1  RSSI: -55 dBm│ │
│ │ ♿ Wheel 2  RSSI: -62 dBm│ │
│ └─────────────────────────┘ │
│ * Determined by RSSI        │
└─────────────────────────────┘
```

### 3. Location Summary (Map หลัก)

```
┌─────────────────────────────────────┐
│ Current Wheelchair Locations        │
├─────────────────────────────────────┤
│ ♿ Wheel 1 → Room A (-55 dBm)       │
│ ♿ Wheel 2 → Room A (-62 dBm)       │
│ ♿ Wheel 3 → Room B (-58 dBm)       │
└─────────────────────────────────────┘
```

---

## 🔍 การใช้งาน

### ดูตำแหน่ง Wheelchair

1. **ในหน้า Dashboard หลัก**
   - Map จะแสดงไอคอน ♿ ในห้องที่มี wheelchair
   - ดู summary ด้านล่าง map

2. **ในหน้า Map Editor**
   - แสดงไอคอน ♿ บน canvas
   - คลิกที่ room เพื่อดูรายละเอียด
   - ดูข้อมูล RSSI ของแต่ละคัน

### ตัวอย่าง Scenario

**Scenario 1: Wheelchair เดินทางระหว่างห้อง**

```
Time 10:00 → W1 ที่ Room A (-55 dBm)
Time 10:01 → W1 เดินทาง
Time 10:02 → W1 ที่ Room B (-52 dBm) ← อัพเดทอัตโนมัติ
```

**Scenario 2: หลาย Wheelchair ในห้องเดียวกัน**

```
Room A:
  ♿ W1 (RSSI: -55 dBm)
  ♿ W2 (RSSI: -62 dBm)
  ♿ W3 (RSSI: -58 dBm)
```

---

## 🛠️ Technical Details

### Data Flow

```
Sensor Data (Node, Wheel, RSSI)
         ↓
getWheelchairLocations()
         ↓
Group by Room
         ↓
Display on Map
```

### Code Structure

#### 1. Helper Function
```typescript
// src/components/system-map.tsx
// src/components/map-editor.tsx

function getWheelchairLocations(sensorData: SensorData[])
  → Map<wheel_id, location_info>
```

#### 2. Wheelchair Grouping
```typescript
const wheelchairsInRoom = new Map<node, wheelchair[]>();
wheelchairLocations.forEach((location, wheel) => {
  wheelchairsInRoom.get(location.node).push({
    wheel, label, rssi
  });
});
```

#### 3. SVG Rendering
```typescript
{wheelchairsInRoom.get(room.node)?.map((wc) => (
  <text>♿</text>
  <text>W{wc.wheel}</text>
))}
```

---

## 📊 RSSI Reference

### Signal Strength Guide

| RSSI (dBm) | Quality | Distance (approx) |
|------------|---------|-------------------|
| -30 to -50 | Excellent | Very close (1-2m) |
| -50 to -60 | Good | Close (2-5m) |
| -60 to -70 | Fair | Medium (5-10m) |
| -70 to -80 | Poor | Far (10-15m) |
| < -80 | Very Poor | Very far (>15m) |

### ตัวอย่าง

- **-45 dBm**: Wheelchair อยู่ใกล้มาก (น่าจะอยู่ในห้องนี้)
- **-75 dBm**: Wheelchair อยู่ไกล (อาจอยู่ห้องติดกัน)

---

## ⚡ Real-time Updates

### Auto-Refresh

- ข้อมูลอัพเดทผ่าน **SSE (Server-Sent Events)**
- ตำแหน่ง wheelchair อัพเดททันทีที่มีข้อมูลใหม่
- ไม่ต้อง refresh หน้าเว็บ

### Performance

- คำนวณ location ทุกครั้งที่มีข้อมูลใหม่
- Efficient grouping algorithm
- Minimal re-renders

---

## 🎨 Customization

### เปลี่ยนสีของ Wheelchair Badge

```tsx
// ใน system-map.tsx หรือ map-editor.tsx
<rect
  fill="rgba(255, 255, 255, 0.95)"  // พื้นหลัง
  stroke="#3b82f6"                   // ขอบ (สีน้ำเงิน)
/>

<text fill="#3b82f6">♿</text>        // ไอคอน
<text fill="#1e40af">W{wc.wheel}</text> // ข้อความ
```

### เปลี่ยนขนาด Icon

```tsx
fontSize="12"  // ขนาดไอคอน ♿
fontSize="10"  // ขนาดข้อความ W1
```

---

## 🐛 Troubleshooting

### ❓ Wheelchair ไม่แสดงบน Map

**เช็คลิสต์:**
1. ✓ Node ออนไลน์หรือไม่? (ต้องไม่ `stale`)
2. ✓ มีข้อมูล RSSI หรือไม่?
3. ✓ เลือก Floor ที่ถูกต้องหรือไม่?
4. ✓ ดู Console หา error

### ❓ ตำแหน่งไม่ถูกต้อง

**แก้ไข:**
- ตรวจสอบค่า RSSI ว่าถูกต้อง
- ดูว่า Node ทุกตัวทำงานปกติ
- เช็ค timestamp ว่าเป็นปัจจุบัน

### ❓ Wheelchair กระโดดห้อง

**สาเหตุ:**
- RSSI ใกล้เคียงกัน (อาจอยู่ตรงกลางระหว่าง 2 ห้อง)
- สัญญาณรบกวน

**แก้ไข:**
- เพิ่มระยะห่างระหว่าง Node
- ปรับตำแหน่ง Node

---

## 📈 Future Enhancements

### Possible Improvements

1. **RSSI Filtering**
   - ใช้ค่าเฉลี่ย RSSI แทนค่าทันที
   - กรองสัญญาณรบกวน

2. **Hysteresis**
   - ป้องกันการกระโดดห้องบ่อย
   - ต้องการ RSSI ต่างกัน threshold จึงจะเปลี่ยน

3. **Multi-node Triangulation**
   - ใช้หลาย node คำนวณตำแหน่ง
   - แม่นยำกว่า RSSI เดียว

4. **History Tracking**
   - บันทึกเส้นทางการเดินทาง
   - แสดง heatmap

---

## 📝 Summary

### ที่ทำแล้ว ✅

| Feature | Status | Description |
|---------|--------|-------------|
| RSSI-based Location | ✅ | หาตำแหน่งจาก RSSI แรงสุด |
| Wheelchair Icons | ✅ | แสดง ♿ บน map |
| Location Info | ✅ | แสดงข้อมูล RSSI ใน UI |
| Real-time Update | ✅ | อัพเดทอัตโนมัติ |
| Multi-wheelchair | ✅ | รองรับหลายคันในห้องเดียว |

### ไฟล์ที่แก้ไข

- ✅ `system-map.tsx` - เพิ่มฟังก์ชันและ UI
- ✅ `map-editor.tsx` - เพิ่มฟังก์ชันและ UI
- ✅ ไม่ต้องแก้ Backend (ใช้ข้อมูลที่มีอยู่)

---

**Version**: 1.0  
**Date**: 2025-10-23  
**Status**: ✅ Production Ready

เพิ่มเติม: อ่าน `MAP_IMPLEMENTATION.md` สำหรับรายละเอียดระบบ Map ทั้งหมด

