# WheelSense Real-time Dashboard Features

## ภาพรวม (Overview)
ระบบ Dashboard ได้รับการปรับปรุงให้รองรับการแสดงข้อมูลแบบ Real-time โดยใช้ Server-Sent Events (SSE) และ Polling fallback

## คุณสมบัติที่เพิ่มเข้ามา (Features Added)

### 1. **Real-time Data Updates** ✅
- **SSE Connection**: เชื่อมต่อกับ `/api/events` เพื่อรับข้อมูลแบบ real-time
- **Auto Reconnect**: ระบบจะพยายามเชื่อมต่อใหม่อัตโนมัติเมื่อการเชื่อมต่อขาดหาย
- **Polling Fallback**: ดึงข้อมูลทุก 10 วินาทีหากการเชื่อมต่อ SSE ล้มเหลว
- **Connection Status Tracking**: ติดตามสถานะการเชื่อมต่อแบบ real-time

### 2. **Visual Indicators** 🎨

#### Connection Status Badge
- 🟢 **Live**: เชื่อมต่อ Real-time สำเร็จ (สีเขียว + animation pulse)
- 🔴 **Offline**: ไม่มีการเชื่อมต่อ (สีแดง)

#### Update Indicators
- **Updating Spinner**: แสดง "Updating..." พร้อม spinner เมื่อกำลังดึงข้อมูล
- **Last Update Time**: แสดงเวลาที่อัพเดทข้อมูลล่าสุด
- **Pulse Animation**: Stats cards จะมี pulse effect เมื่อข้อมูลเปลี่ยน

### 3. **Notifications** 🔔
- **Connection Established**: แจ้งเตือนเมื่อเชื่อมต่อ Real-time สำเร็จ
- **Connection Lost**: แจ้งเตือนเมื่อการเชื่อมต่อขาดหาย
- **Data Updated**: แจ้งเตือนเมื่อมีข้อมูลใหม่เข้ามา

### 4. **Animated Stats Cards** ✨
เมื่อข้อมูลอัพเดท Stats Cards จะ:
- **Scale up**: ขยายขนาดเล็กน้อย
- **Ring effect**: แสดง ring รอบการ์ดตามสีของการ์ด
- **Smooth transition**: animation ที่นุ่มนวล 1 วินาที

### 5. **Real-time Map Updates** 🗺️

#### Wheelchair Indicators
- **Motion Detection**: รถเข็นที่กำลังเคลื่อนที่จะมี pulsing circle สีเขียว
- **Color Coding**: 
  - สีเขียว = กำลังเคลื่อนที่
  - สีน้ำเงิน = หยุดนิ่ง
- **Pulse Animation**: แสดง animation เมื่อข้อมูลกำลังอัพเดท

#### Node Indicators
- **RSSI Color Coding**:
  - เขียว: RSSI ≥ -60 dBm (สัญญาณดี)
  - เหลือง: -75 dBm ≤ RSSI < -60 dBm (สัญญาณปานกลาง)
  - แดง: RSSI < -75 dBm (สัญญาณอ่อน)

### 6. **Enhanced Hooks** 🎣

#### `useSensorData()`
```typescript
{
  data: SensorData[]
  loading: boolean
  error: string | null
  lastUpdate: Date | null
  isConnected: boolean     // ✨ NEW
  isUpdating: boolean      // ✨ NEW
  refetch: () => void
}
```

#### `useMapLayout()`
- เพิ่ม SSE listener สำหรับการอัพเดท layout แบบ real-time

## การทำงานของระบบ (How It Works)

### 1. Initial Load
```
Dashboard → fetchData() → Display initial data
         → connectSSE() → Establish real-time connection
         → startPolling() → Start fallback polling
```

### 2. Real-time Updates
```
Backend MQTT Collector → PostgreSQL → pg_notify('sensor_update')
                                    ↓
                            REST API SSE endpoint
                                    ↓
                            Frontend EventSource
                                    ↓
                            fetchData(false) → Update UI
```

### 3. Update Flow
```
New MQTT Message → Database → Trigger notify
                             ↓
                    SSE broadcasts to all clients
                             ↓
                    Clients auto-refresh data
                             ↓
                    UI updates with animations
```

## Components ที่สร้างขึ้นใหม่

### `realtime-indicator.tsx`
Component สำหรับแสดงสถานะการเชื่อมต่อ Real-time:
- `RealtimeIndicator`: แสดงสถานะแบบละเอียด
- `RealtimeBadge`: แสดงสถานะแบบ badge

## การใช้งาน (Usage)

### ติดตั้ง Dependencies
```bash
npm install sonner  # สำหรับ toast notifications
```

### Import Components
```typescript
import { useSensorData, useMapLayout } from '../hooks/useApi';
import { RealtimeBadge } from './realtime-indicator';
import { toast } from 'sonner';
```

### ใช้งาน Hook
```typescript
const { 
  data, 
  loading, 
  error, 
  isConnected,    // สถานะการเชื่อมต่อ
  isUpdating,     // กำลังอัพเดทหรือไม่
  refetch 
} = useSensorData();
```

## Performance Optimizations

1. **Smart Fetching**: ใช้ `fetchData(false)` เพื่อไม่แสดง loading state เมื่อ refresh
2. **Debounced Animations**: Animation ทำงาน 1 วินาทีแล้วหยุด
3. **Conditional Re-renders**: อัพเดทเฉพาะเมื่อข้อมูลเปลี่ยนจริงๆ
4. **Event Source Management**: ปิดการเชื่อมต่อเมื่อ component unmount

## Browser Compatibility

✅ Chrome/Edge (ทุก version ที่รองรับ ES6)
✅ Firefox (ทุก version ที่รองรับ ES6)
✅ Safari (ทุก version ที่รองรับ ES6)
✅ Mobile browsers (iOS Safari, Chrome Mobile)

## การทดสอบ (Testing)

### ทดสอบ SSE Connection
1. เปิด DevTools → Network tab
2. มองหา request ไปที่ `/api/events`
3. ควรเห็น status `200 (EventStream)`
4. ควรเห็น messages ที่ส่งมาอย่างต่อเนื่อง

### ทดสอบ Real-time Updates
1. ส่งข้อมูล MQTT ใหม่ไปที่ broker
2. Dashboard ควรอัพเดทอัตโนมัติภายใน 1-2 วินาที
3. ควรเห็น notification "Dashboard updated"
4. Stats cards ควรมี animation

### ทดสอบ Fallback Polling
1. ปิด SSE endpoint ชั่วคราว
2. ระบบควรแสดงสถานะ "Offline"
3. ควรมีการ polling ทุก 10 วินาที
4. เมื่อ SSE กลับมา ควร reconnect อัตโนมัติ

## Troubleshooting

### ไม่มี Real-time Updates
1. ตรวจสอบ SSE connection ใน Network tab
2. ตรวจสอบว่า REST API `/api/events` ทำงานปกติ
3. ตรวจสอบ PostgreSQL `pg_notify` configuration
4. ตรวจสอบ MQTT Collector กำลังส่งข้อมูลหรือไม่

### การเชื่อมต่อขาดบ่อย
1. ตรวจสอบ network stability
2. เพิ่ม SSE keepalive interval
3. ตรวจสอบ reverse proxy timeout settings
4. ดู error logs ใน browser console

### Performance Issues
1. ลด polling interval (ปัจจุบัน 10 วินาที)
2. ลด SSE keepalive frequency
3. ลด animation duration
4. ใช้ React.memo สำหรับ heavy components

## สรุป

ระบบ Dashboard ตอนนี้รองรับการแสดงข้อมูลแบบ **Real-time** เต็มรูปแบบ ด้วย:
- ✅ SSE connection พร้อม auto-reconnect
- ✅ Visual indicators และ animations
- ✅ Toast notifications
- ✅ Fallback polling
- ✅ Connection status tracking
- ✅ Performance optimizations

ข้อมูลจะอัพเดทอัตโนมัติทันทีที่มีการเปลี่ยนแปลง โดยไม่ต้อง refresh หน้าเว็บ! 🎉

