# MQTT Telemetry Logs - Real-time Streaming

## ปัญหาเดิม (Previous Issue)

MQTT Logs แสดงเฉพาะ 5 รายการแรกและไม่ได้อัพเดทแบบ real-time:
- ❌ แสดงเฉพาะ 5 รายการ
- ❌ Replace ข้อมูลทั้งหมดทุกครั้งที่อัพเดท
- ❌ ไม่ได้เพิ่มข้อมูลใหม่เข้ามาเรื่อยๆ
- ❌ ไม่มี indicator สำหรับข้อมูลใหม่

### Code เดิม:
```typescript
useEffect(() => {
  if (sensorData.length > 0) {
    const newLogs = sensorData.slice(0, 5).map(sensor => ({
      // ... map ข้อมูล
    }));
    setMqttLogs(newLogs); // ❌ Replace ทั้งหมด
  }
}, [sensorData]);
```

## การแก้ไข (Solution)

### 1. **Change Detection System**

ใช้ `useRef` เพื่อเก็บข้อมูล sensor ก่อนหน้า และตรวจสอบการเปลี่ยนแปลง:

```typescript
const previousSensorData = useRef<Map<string, string>>(new Map());
const MAX_LOGS = 50; // จำกัดจำนวน logs

useEffect(() => {
  if (sensorData.length === 0) return;

  const newLogsToAdd: any[] = [];

  // ตรวจสอบแต่ละ sensor ว่ามีการเปลี่ยนแปลงหรือไม่
  sensorData.forEach(sensor => {
    const sensorKey = `${sensor.node_id}-${sensor.wheel_id}`;
    const currentValue = JSON.stringify({
      rssi: sensor.rssi,
      distance: sensor.distance,
      motion: sensor.motion,
      direction: sensor.direction,
      status: sensor.status,
      ts: sensor.ts,
    });

    const previousValue = previousSensorData.current.get(sensorKey);

    // ถ้าข้อมูลเปลี่ยน ให้เพิ่ม log ใหม่
    if (previousValue !== currentValue) {
      previousSensorData.current.set(sensorKey, currentValue);
      newLogsToAdd.push(createLogEntry(sensor));
    }
  });

  // เพิ่ม logs ใหม่ไปด้านบน (ล่าสุดอยู่บนสุด)
  if (newLogsToAdd.length > 0) {
    setMqttLogs(prevLogs => {
      const updatedLogs = [...newLogsToAdd, ...prevLogs];
      return updatedLogs.slice(0, MAX_LOGS); // จำกัดจำนวน
    });
  }
}, [sensorData, MAX_LOGS]);
```

### 2. **Unique Log IDs**

แต่ละ log มี unique ID เพื่อการ render ที่ถูกต้อง:

```typescript
const newLog = {
  id: `${sensorKey}-${Date.now()}-${Math.random()}`,
  topic: `wheelsense/wheelchair/...`,
  payload: { ... },
  timestamp: currentTime.toLocaleTimeString('en-US', { hour12: false }),
  receivedAt: currentTime.toISOString(),
};
```

### 3. **Visual Indicators**

#### LIVE Badge
```tsx
{isConnected && (
  <span className="px-2 py-0.5 bg-green-500 text-white text-[10px] rounded-full animate-pulse">
    LIVE
  </span>
)}
```

#### NEW Indicator สำหรับ Log ใหม่
```tsx
{idx === 0 && (
  <span className="text-[10px] text-green-400 animate-pulse">NEW</span>
)}
```

#### Log Counter
```tsx
<p>บันทึก Telemetry ({mqttLogs.length}/{MAX_LOGS})</p>
```

### 4. **Clear Button**

ปุ่มล้าง logs และ reset tracking:

```tsx
<button
  onClick={() => {
    setMqttLogs([]);
    previousSensorData.current.clear();
    toast.info('Cleared MQTT logs');
  }}
>
  Clear
</button>
```

### 5. **Auto-scroll**

Scroll ไปด้านบนอัตโนมัติเมื่อมี log ใหม่:

```typescript
useEffect(() => {
  if (mqttLogs.length > 0 && mqttLogsRef.current) {
    const scrollContainer = mqttLogsRef.current.closest('[data-radix-scroll-area-viewport]');
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
}, [mqttLogs.length]);
```

### 6. **Empty State**

แสดงข้อความเมื่อยังไม่มี logs:

```tsx
{mqttLogs.length === 0 ? (
  <div className="flex flex-col items-center justify-center h-[200px]">
    <Activity className="h-8 w-8 mb-2 opacity-50" />
    <p>Waiting for telemetry data...</p>
    <p className="text-xs">รอข้อมูล telemetry</p>
  </div>
) : (
  // แสดง logs
)}
```

### 7. **Enhanced Styling**

Log ใหม่มี visual effects:
- ✅ Green border-left สำหรับ log ล่าสุด
- ✅ Pulse animation
- ✅ "NEW" badge
- ✅ Color-coded text (topic สีฟ้า, timestamp สีเหลือง, payload สีเขียว)

```tsx
<div
  className={`bg-[#1a1a1a] text-[#00ff00] p-3 rounded-lg text-xs font-mono border-l-2 ${
    idx === 0 ? 'border-l-green-400 animate-pulse' : 'border-l-transparent'
  } transition-all`}
>
```

## คุณสมบัติใหม่ (New Features)

### ✅ Real-time Streaming
- Logs เพิ่มทีละรายการเมื่อมีข้อมูลใหม่
- ไม่ replace ข้อมูลเดิม
- เก็บ history ได้สูงสุด 50 รายการ

### ✅ Change Detection
- ตรวจจับการเปลี่ยนแปลงของ: rssi, distance, motion, direction, status, ts
- เพิ่ม log เฉพาะเมื่อมีการเปลี่ยนแปลงจริงๆ
- ป้องกัน duplicate logs

### ✅ Visual Feedback
- 🟢 "LIVE" badge เมื่อเชื่อมต่อ
- 🆕 "NEW" indicator บน log ล่าสุด
- 📊 Log counter (X/50)
- 🎨 Green border + pulse animation

### ✅ User Controls
- 🗑️ Clear button เพื่อล้าง logs
- 📜 Auto-scroll to top
- 🔄 Smooth transitions

### ✅ Better UX
- Empty state message
- Unique IDs สำหรับ React keys
- Responsive layout
- Syntax highlighting

## การทำงาน (How It Works)

### Data Flow:

```
MQTT Sensor → Database → REST API → SSE
                                     ↓
                              Frontend receives
                                     ↓
                          Compare with previous data
                                     ↓
                         If changed → Add new log
                                     ↓
                            Update UI + Auto-scroll
```

### Change Detection:

```
Previous State: { rssi: -58, distance: 1.32, ... }
Current State:  { rssi: -63, distance: 6.32, ... }
                         ↓
                  Detected change!
                         ↓
              Add new log to top of list
```

## ตัวอย่างการใช้งาน (Usage Examples)

### ตัวอย่าง Log Entry:

```
[16:30:18] NEW
topic: "wheelsense/wheelchair/Node 4-Wheel 2/telemetry"
payload: {
  "rssi": -63,
  "direction": 0,
  "motion": false,
  "distance": 6.32,
  "status": 0,
  "stale": false,
  "ts": "2025-10-23T09:30:15.000Z"
}
```

### Scenario 1: รถเข็นเคลื่อนที่

```
[16:30:20] NEW - distance: 7.50, motion: true
[16:30:18]     - distance: 6.32, motion: false
[16:30:15]     - distance: 5.10, motion: false
```

### Scenario 2: RSSI เปลี่ยน

```
[16:30:25] NEW - rssi: -65
[16:30:20]     - rssi: -63
[16:30:18]     - rssi: -58
```

## Performance

### Optimizations:
- ✅ **Change Detection**: เพิ่ม log เฉพาะเมื่อมีการเปลี่ยนแปลง
- ✅ **Limited History**: เก็บสูงสุด 50 logs (configurable)
- ✅ **Efficient Comparison**: ใช้ JSON.stringify สำหรับ shallow comparison
- ✅ **React Keys**: ใช้ unique IDs แทน index

### Memory Usage:
- เก็บ map ของ previous values (~10-20 sensors = ~1-2KB)
- เก็บ log history สูงสุด 50 รายการ (~5-10KB)
- Total: < 15KB memory overhead

## Configuration

### Adjustable Parameters:

```typescript
const MAX_LOGS = 50; // จำนวน logs สูงสุด (ปรับได้)

// Fields to track for changes:
const currentValue = JSON.stringify({
  rssi: sensor.rssi,
  distance: sensor.distance,
  motion: sensor.motion,
  direction: sensor.direction,
  status: sensor.status,
  ts: sensor.ts,
});
```

## Testing

### Test Cases:

1. **ส่งข้อมูล MQTT ใหม่**
   - ✅ Log ใหม่ปรากฏด้านบน
   - ✅ "NEW" badge แสดง
   - ✅ Auto-scroll to top

2. **ส่งข้อมูลซ้ำ (ไม่เปลี่ยนแปลง)**
   - ✅ ไม่มี log ใหม่เพิ่ม
   - ✅ ป้องกัน duplicates

3. **ส่งข้อมูลหลายตัว**
   - ✅ แต่ละ sensor แสดงแยกกัน
   - ✅ Logs เรียงลำดับเวลา

4. **กด Clear button**
   - ✅ Logs ถูกล้างหมด
   - ✅ Empty state แสดง
   - ✅ Toast notification

5. **เกิน MAX_LOGS**
   - ✅ Logs เก่าถูกลบอัตโนมัติ
   - ✅ เก็บเฉพาะ 50 ล่าสุด

## ไฟล์ที่แก้ไข

### `monitoring-dashboard.tsx`
- เพิ่ม `previousSensorData` ref
- เพิ่ม `mqttLogsRef` ref
- เพิ่ม `MAX_LOGS` constant
- อัพเดท MQTT logs useEffect
- เพิ่ม auto-scroll useEffect
- ปรับปรุง UI ของ MQTT logs section

## สรุป

### Before (เดิม):
```
[16:30:18] Log 1
[16:30:18] Log 2
[16:30:18] Log 3
[16:30:18] Log 4
[16:30:18] Log 5
```
❌ แสดงเฉพาะ 5 รายการ  
❌ Replace ทุกครั้ง  
❌ Timestamp เหมือนกัน

### After (ใหม่):
```
[16:30:25] NEW - Node 4 Wheel 2 (rssi: -65)
[16:30:20]     - Node 4 Wheel 2 (rssi: -63)
[16:30:18]     - Node 4 Wheel 2 (rssi: -58)
[16:30:15]     - Node 3 Wheel 1 (distance: 5.2)
...
```
✅ เพิ่มทีละรายการแบบ real-time  
✅ เก็บ history 50 รายการ  
✅ Timestamp แม่นยำ  
✅ Visual indicators  
✅ Auto-scroll

---

**Updated by:** AI Assistant  
**Date:** 2025-10-23  
**Impact:** MQTT Logs now stream in real-time! 🚀

