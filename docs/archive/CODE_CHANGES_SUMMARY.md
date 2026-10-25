# 📋 WheelSense - สรุปการแก้ไขและพัฒนาโค้ด (Code Changes Summary)

เอกสารนี้สรุปการเปรียบเทียบการแก้ไขโค้ดของโปรเจกต์ปัจจุบันเทียบกับต้นฉบับทั้ง 2 แหล่ง:
1. **ต้นฉบับที่ 1:** [`WheelSense_Project (Branch: main)`](https://github.com/NnopponS/WheelSense_Project)
2. **ต้นฉบับที่ 2:** [`WheelSense_Project (Branch: archive/legacy-smart-home-prototype)`](https://github.com/NnopponS/WheelSense_Project/tree/archive/legacy-smart-home-prototype)

---

## 🏗️ 1. ภาพรวมสถาปัตยกรรม (Architecture Evolution)

```
[ ต้นฉบับที่ 1: main ]                   [ ต้นฉบับที่ 2: legacy-smart-home-prototype ]
• Frontend Next.js (Modern UI)           • Backend FastAPI + SQLite
• Backend PostgreSQL + HomeAssistant     • Dashboard เก่า (Vite React)
• ไม่มีโค้ดกล้อง TsimCam / CucumberRS   • มีบอร์ดกล้อง ESP32 + บอร์ดไฟ ESP8266 + YOLOv8
                      │                                      │
                      └──────────────────┬───────────────────┘
                                         ▼
                         [ โค้ดปัจจุบันในโปรเจกต์นี้ ]
                         (Hybrid Working Hardware Setup)
         ✅ ยก Frontend Next.js จาก main มาใช้งานแทน Dashboard เก่า
         ✅ สร้าง Bridge API (frontend_v2_compat.py) เชื่อม Next.js กับ SQLite + ฮาร์ดแวร์
         ✅ ปรับจูน Firmware กล้อง TsimCam ให้มี Auto-Discovery เชื่อมต่อผ่าน Hotspot ได้
         ✅ ปรับจูน Firmware CucumberRS ให้เปิด/ปิดไฟ 4 ห้องตรงกับขา GPIO จริง
         ✅ ปรับ Backend & start_all.bat ให้ดึง IP Wi-Fi จริง อุปกรณ์หาเซิร์ฟเวอร์เจอ 100%
```

---

## 📂 2. รายละเอียดการแก้ไขแยกตามโฟลเดอร์และไฟล์

### 1) การเชื่อมต่อระหว่าง Next.js Frontend กับ Hardware Backend (ไฟล์ที่สร้างขึ้นใหม่)
* **[`docker/backend/src/api/frontend_v2_compat.py`](file:///d:/Wheel_Demo/docker/backend/src/api/frontend_v2_compat.py)** *(สร้างขึ้นใหม่ +2,268 บรรทัด)*
  * สร้าง REST API จำลองเพื่อให้ Frontend Next.js ตัวใหม่ สามารถคุยกับ Backend SQLite ได้ทันที โดยไม่ต้องรันฐานข้อมูล PostgreSQL หรือ HomeAssistant
  * รองรับ API:
    * `/api/v1/auth/me`, `/api/v1/workspaces`, `/api/v1/staff` (ระบบล็อกอินและสิทธิ์)
    * `/api/v1/patients` (ข้อมูลผู้ป่วย สมชาย ใจดี และรถเข็น)
    * `/api/v1/floorplans`, `/api/v1/rooms` (ข้อมูลผังบ้าน 4 ห้อง)
    * `/api/v1/devices` (ดึงสถานะกล้อง TSIM, เซนเซอร์ล้อ Xiao BLE, และบอร์ดไฟ CucumberRS)
    * `/api/v1/alerts`, `/api/v1/tasks` (การแจ้งเตือนและการจัดการงาน)
    * สตรีมภาพวิดีโอจากกล้องแบบสดเข้า Next.js
* **[`frontend/app/api/[[...path]]/route.ts`](file:///d:/Wheel_Demo/frontend/app/api/[[...path]]/route.ts)** *(Next.js API Proxy)*
  * ทำหน้าที่เป็น Reverse Proxy จากฝั่ง Next.js ไปยัง FastAPI Backend (`http://127.0.0.1:8000`)
  * มีระบบ Fallback ป้องกันหน้าเว็บ Crash หาก Backend ปิดอยู่

---

### 2) ฮาร์ดแวร์บอร์ดกล้อง (TsimCam Controller - ESP32-S3)
* **[`TsimCam-Controller/src/main.cpp`](file:///d:/Wheel_Demo/TsimCam-Controller/src/main.cpp)**
  * **ระบบ Auto-Discovery แบบ 4 ลำดับชั้น:**
    1. ตรวจสอบ Gateway IP (สำหรับกรณีต่อผ่าน Windows Mobile Hotspot)
    2. ส่ง Directed UDP Broadcast ไปยัง Subnet (`IP | ~SubnetMask`) และ `255.255.255.255` พอร์ต `5555`
    3. กรอง IP ไม่ให้เชื่อมต่อไปยัง IP จำลองของ Docker (`192.168.65.x`, `172.28.x`)
    4. Fast Subnet Scan พอร์ต `8765` อัตโนมัติ (แก้ปัญหามือถือเปิด Client Isolation แล้วยิง UDP ไม่ถึง)
  * **Auto-Reconnect & Server Re-Discovery:** หาก WebSocket หลุดเกิน 4 ครั้ง จะทำการสแกนหา Server ใหม่ทันที
  * **Frame Buffering & Rate Limiting:** ปรับลดการบล็อกลูปส่งภาพ เพื่อให้คำสั่ง Ping/Pong Heartbeat ทำงานได้ต่อเนื่อง กล้องไม่หลุดง่าย

---

### 3) ฮาร์ดแวร์บอร์ดควบคุมไฟและอุปกรณ์ (CucumberRS Controller - ESP32-S2 / ESP8266)
* **[`CucumberRS-Controller/src/main.cpp`](file:///d:/Wheel_Demo/CucumberRS-Controller/src/main.cpp)**
  * **อัปเดตการแมปขา GPIO จริง:**
    * ห้องนอน (Bedroom): ไฟ `GPIO17`, แอร์ `GPIO34`, ทีวี `GPIO18`, สัญญาณเตือน `GPIO38`
    * ห้องน้ำ (Bathroom): ไฟ `GPIO14`
    * ห้องครัว (Kitchen): ไฟ `GPIO5`, สัญญาณเตือน `GPIO7`
    * ห้องนั่งเล่น (Living Room): ไฟ `GPIO4`, พัดลม `GPIO6`, ทีวี `GPIO15`
  * **เพิ่ม Case-Insensitive Matching (`strcasecmp`):** สั่งเปิด/ปิดอุปกรณ์ได้ทั้ง `light`, `Light`, `AC`, `aircon`, `fan`, `tv`
  * **เพิ่ม Auto-Discovery สำหรับ MQTT Broker:** มีฟังก์ชัน `checkMQTTServer()` สแกนหา Broker พอร์ต `1883` ในวงแลนโดยอัตโนมัติ

---

### 4) ระบบ Backend (Docker Backend - FastAPI)
* **[`docker/backend/src/main.py`](file:///d:/Wheel_Demo/docker/backend/src/main.py)**
  * รวม `frontend_v2_compat` router เข้ากับแอปหลัก
  * ปรับฟังก์ชัน `get_host_ip()` ให้ฉลาดขึ้น: ตรวจจับ IP ของการ์ด Wi-Fi จริงบนคอมพิวเตอร์ โดยข้าม IP จำลองของ Docker Desktop (`172.x` และ `192.168.65.x`) เพื่อส่ง IP ที่ถูกต้องให้ฮาร์ดแวร์
* **[`docker/backend/src/core/websocket_handler.py`](file:///d:/Wheel_Demo/docker/backend/src/core/websocket_handler.py)**
  * จัดการคิวภาพวิดีโอ (Frame Buffer) ลดอาการแลค และรองรับการหมุนภาพกล้องตามการตั้งค่าจากหน้าเว็บ
* **[`docker/backend/src/core/mqtt_handler.py`](file:///d:/Wheel_Demo/docker/backend/src/core/mqtt_handler.py)**
  * ปรับแต่งการกระจายสถานะเครื่องใช้ไฟฟ้าระหว่าง Dashboard และบอร์ด CucumberRS ผ่าน Topic `WheelSense/+/control`
* **[`docker/backend/src/services/command_parser.py`](file:///d:/Wheel_Demo/docker/backend/src/services/command_parser.py)**
  * รองรับการสั่งงานหลายอุปกรณ์พร้อมกันในประโยคเดียว
  * เพิ่มคีย์เวิร์ดคำสั่งภาษาไทย/อังกฤษ (เช่น 'air', 'แอร์', 'ไฟ', 'light', 'fan')
* **[`docker/backend/src/init_data.py`](file:///d:/Wheel_Demo/docker/backend/src/init_data.py)**
  * ปรับแต่งค่าเริ่มต้นของอุปกรณ์ ให้ตรงกับบอร์ด `APPLIANCE_CENTRAL` และกล้อง 4 ห้อง

---

### 5) ระบบตรวจจับภาพ (Camera Service - YOLOv8)
* **[`docker/services/camera-service/src/detector.py`](file:///d:/Wheel_Demo/docker/services/camera-service/src/detector.py)**
  * ปรับแต่งการ Tracking คนนั่งรถเข็น ลด False Positive
  * ปรับเกณฑ์ความมั่นใจ (Confidence Threshold) และส่งพิกัดห้องไปยัง Backend เพื่ออัปเดตตำแหน่งรถเข็น
* **[`docker/services/camera-service/src/websocket_client.py`](file:///d:/Wheel_Demo/docker/services/camera-service/src/websocket_client.py)**
  * เพิ่มระบบ Auto-reconnect อัตโนมัติเมื่อ Backend รีสตาร์ท

---

### 6) ระบบ Nginx Reverse Proxy & Scripts
* **[`docker/services/nginx/nginx.conf`](file:///d:/Wheel_Demo/docker/services/nginx/nginx.conf)**
  * เพิ่ม HTTP 301 Redirect สำหรับ URL แบบเก่า:
    * `/Admin/...` ➡️ `/admin`
    * `/User/...` ➡️ `/patient`
* **[`start_all.bat`](file:///d:/Wheel_Demo/start_all.bat)**
  * สคริปต์ PowerShell ภายใน bat ตรวจจับ IP ของการ์ด Wi-Fi เครื่อง Host อัตโนมัติ
  * เขียนค่าเข้าไฟล์ `docker/.env` เพื่อส่ง `HOST_IP` เข้า Container ทันที
  * สั่งเปิด Docker Services และ Xiao BLE Sensor Service พร้อมกัน

---

## 📊 3. ตารางเปรียบเทียบเชิงลึก (Comparison Matrix)

| หัวข้อ | ต้นฉบับ 1 (Branch `main`) | ต้นฉบับ 2 (`legacy-smart-home-prototype`) | โค้ดปัจจุบันในโปรเจกต์นี้ |
|---|---|---|---|
| **หน้าตา Dashboard** | Next.js (Admin/Staff/Patient) | React เก่า (Vite) | **Next.js (ปรับให้ต่อกับ Hardware Backend ได้)** |
| **ฐานข้อมูล** | PostgreSQL + pgvector | SQLite | **SQLite (เบา ทำงานเร็ว เหมาะกับ Demo)** |
| **การเชื่อมต่ออุปกรณ์** | HomeAssistant / จำลอง | MQTT + WebSocket | **MQTT + WebSocket + Live Bridge API** |
| **การค้นหา Server ของกล้อง** | ไม่มีกล้องจริง | ระบุ IP เอง / UDP พื้นฐาน | **Auto-Discovery 4 ชั้น (สแกน Subnet + Gateway)** |
| **การควบคุมไฟจริง** | ไม่มีบอร์ดไฟ | บอร์ด 4 ห้องเดิม | **ปรับ Pin GPIO ใหม่ตรงกับบอร์ดจริง + strcasecmp** |
| **การตรวจจับรถเข็น** | จำลองผ่าน API | YOLOv8 Service | **YOLOv8 เชื่อมต่อสดกับภาพจากบอร์ด TSIM** |
| **การรันทั้งระบบ** | สคริปต์หลายขั้นตอน | `start_all.bat` พื้นฐาน | **`start_all.bat` อัตโนมัติ ตรวจจับ IP Wi-Fi พร้อมใช้งาน** |
