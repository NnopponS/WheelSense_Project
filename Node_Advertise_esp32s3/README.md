# WheelSense Node - ESP32-S3 Simple BLE Beacon

## Description
Node แบบ Simple สำหรับระบบ WheelSense - แค่ Advertise ชื่อผ่าน BLE เท่านั้น!

**ไม่มี:**
- ❌ IMU sensor
- ❌ การคำนวณระยะทาง
- ❌ AES encryption
- ❌ Sensor อื่นๆ

**มีเพียง:**
- ✅ BLE Advertiser ชื่อ "WheelSense_<NODE_ID>"
- ✅ LED กระพริบเพื่อแสดงสถานะ
- ✅ Serial output สำหรับ debug

## Hardware
- **ESP32-S3 DevKit C-1** (หรือ ESP32 ทั่วไป)
- **ไม่ต้องมี sensor ใดๆ!**
- (Optional) LED built-in GPIO2

## วิธีการทำงาน

```
1. เปิดเครื่อง ESP32-S3
2. เริ่ม BLE advertising ชื่อ "WheelSense_<NODE_ID>"
3. M5StickC จะสแกนหาและใช้ RSSI เพื่อประมาณตำแหน่ง
4. M5StickC จะทำการคำนวณทั้งหมด
```

## Configuration

### Node ID (สำคัญมาก!)
แต่ละ Node ต้องมี ID **ไม่ซ้ำกัน**

แก้ไขใน `src/main.cpp`:
```cpp
#define NODE_ID 1  // <-- แก้เป็น 1, 2, 3, ... ตามล้อ/ห้อง
```

### BLE Advertising Interval
```cpp
#define BLE_ADV_INTERVAL_MIN 160  // 100ms
#define BLE_ADV_INTERVAL_MAX 320  // 200ms
```

## Build & Upload
```bash
# เข้าโฟลเดอร์โปรเจ็กต์
cd New_System/Node_Advertise_esp32s3

# Build
pio run

# Upload
pio run -t upload

# Monitor
pio device monitor
```

## Serial Output
```
========================================
  WheelSense Node #1 (ESP32-S3)
  Simple BLE Beacon
========================================
Build: Nov  3 2025 20:00:00

[Setup] Initializing BLE as 'WheelSense_1'...
[Setup] BLE advertising started!
[Setup] Device Name: WheelSense_1
[Setup] Advertising Interval: 100-200 ms
[Setup] Ready!
========================================

===== Node Status =====
Node ID: 1
Uptime: 10 seconds
Free Heap: 300000 bytes
Status: Advertising...
======================
```

## BLE Advertisement

### Device Name
```
WheelSense_<NODE_ID>
```
ตัวอย่าง: `WheelSense_1`, `WheelSense_2`, `WheelSense_3`

### Advertising Data
- **Flags**: 0x06 (BR_EDR_NOT_SUPPORTED | GENERAL_DISC_MODE)
- **Complete Local Name**: "WheelSense_X"
- **Service UUID**: 0x180F (Battery Service - dummy)

**ไม่มีการเข้ารหัส! ไม่มี manufacturer data!**

## LED Status
- **กระพริบทุก 2 วินาที**: ทำงานปกติ
- **กระพริบเร็ว 5 ครั้ง**: เริ่มต้นระบบสำเร็จ

## Power Consumption
- **Active (BLE advertising)**: ~30-50mA
- **แบตเตอรี่อึดมาก**: ไม่มี WiFi, ไม่มี sensor, แค่ BLE!

## ใช้งานกับ M5StickC
M5StickC จะ:
1. สแกนหา "WheelSense_X"
2. ดู RSSI เพื่อเลือก Node ที่ใกล้ที่สุด
3. คำนวณระยะทาง ความเร็ว จาก IMU ของตัวเอง
4. ส่งข้อมูลไป MQTT

## Troubleshooting

### ไม่เห็น BLE
1. ตรวจสอบ antenna (บางบอร์ดต้องต่อ antenna ภายนอก)
2. เช็ค Serial Monitor ว่า advertising เริ่มแล้วหรือยัง
3. ลองใช้ BLE scanner app บนมือถือ (nRF Connect)

### M5StickC ไม่เจอ Node
1. ตรวจสอบ NODE_ID ว่าถูกต้อง
2. ตรวจสอบระยะทาง (<10m แนะนำ)
3. ตรวจสอบ RSSI threshold บน M5StickC

### Serial Monitor ไม่แสดงอะไร
1. ตรวจสอบ baud rate (115200)
2. ตรวจสอบ USB port
3. บางบอร์ด ESP32-S3 ต้องกด BOOT button ขณะ upload

## การใช้แบตเตอรี่

### แนะนำ
- **LiPo 3.7V**: 500-1000mAh (ใช้ได้ 10-20 ชั่วโมง)
- **Power Bank**: ใช้ได้หลายวัน

### Tips ประหยัดแบต
```cpp
// เปลี่ยน advertising interval ให้ช้าลง
#define BLE_ADV_INTERVAL_MIN 320   // 200ms
#define BLE_ADV_INTERVAL_MAX 640   // 400ms
```

## Advanced: Deep Sleep
ถ้าต้องการประหยัดแบตมากกว่านี้ สามารถใส่ Deep Sleep ได้:

```cpp
// ใน loop()
delay(10000);  // Advertise 10 วิ
esp_deep_sleep(50000000);  // Sleep 50 วิ (50,000,000 microseconds)
```

## Testing
### ใช้ nRF Connect (มือถือ)
1. เปิด app nRF Connect
2. กด Scan
3. ควรเห็น "WheelSense_X" ในรายการ
4. ดู RSSI value

### ใช้ M5StickC
1. Upload code ไปที่ M5StickC
2. ดู Serial Monitor
3. ควรเห็น "[BLE] Found Node X (RSSI: -XX dBm)"

## Notes
- **ไม่ต้อง config อะไรเลยนอกจาก NODE_ID**
- **แบตเตอรี่อึดมาก เพราะไม่มี WiFi และ sensor**
- **เหมาะสำหรับติดตามตำแหน่งห้อง/โซน**
- **M5StickC จะเป็นคนคำนวณทั้งหมด**

## Comparison กับ Version เก่า

| Feature | Version เก่า | Version ใหม่ (นี่) |
|---------|-------------|-------------------|
| IMU | ✅ LSM6DS3 | ❌ ไม่มี |
| Distance Calculation | ✅ บน Node | ❌ ไม่มี (M5 คำนวณ) |
| AES Encryption | ✅ | ❌ ไม่มี |
| Manufacturer Data | ✅ Encrypted | ❌ ไม่มี |
| Power Consumption | ~80-100mA | ~30-50mA |
| Complexity | สูง | ต่ำมาก |
| Setup Time | 15 นาที | 2 นาที |

---

**Status**: ✅ Production Ready  
**Complexity**: ⭐ Very Simple (1/5)  
**Power**: ⚡ Very Low  
**Recommended**: ✅ Yes

ง่ายที่สุด ประหยัดแบตที่สุด!
