# Prompt อธิบาย UI เว็บ WheelSense Dashboard

## ภาพรวมระบบ
WheelSense เป็นระบบบ้านอัจฉริยะสำหรับผู้ใช้รถเข็น (Smart Indoor Navigation System) ที่มี Dashboard เว็บแอปพลิเคชันสำหรับการจัดการและติดตาม

---

## โครงสร้าง UI หลัก

### 1. Header/Navigation Bar (ส่วนบนสุด)
- **โลโก้และชื่อ**: แสดงโลโก้ "W" สีน้ำเงิน (#0056B3) และชื่อ "WheelSense" พร้อมคำอธิบาย "Smart Indoor Navigation"
- **View Mode Selector**: Dropdown สำหรับสลับระหว่างโหมด:
  - 👨‍💼 **Admin Mode**: โหมดสำหรับผู้ดูแลระบบ
  - 👤 **User Mode**: โหมดสำหรับผู้ใช้ทั่วไป
- **Notification Bell**: ปุ่มแจ้งเตือนพร้อม badge แสดงจำนวนการแจ้งเตือนที่ยังไม่ได้อ่าน (มี animation pulse)
- **Navigation Tabs** (แสดงเฉพาะใน Admin Mode):
  - 📊 Dashboard
  - 🗺️ Map
  - 📱 Devices
  - 👤 Patients
  - 📅 Timeline
  - 🤖 AI
  - ⚙️ Settings

### 2. หน้าจอหลัก (Admin Mode)

#### 📊 Dashboard (Monitoring Dashboard)
- **Statistics Cards**: แสดงสถิติรวม:
  - จำนวน Wheelchairs (ออนไลน์/ทั้งหมด)
  - จำนวน Nodes (ออนไลน์/ทั้งหมด)
  - จำนวน Smart Devices
  - สถานะระบบโดยรวม
- **Performance Metrics**: กราฟและตัวชี้วัดประสิทธิภาพ
- **Recent Activity Panel**: แสดงกิจกรรมล่าสุด
- **Interactive Map**: 
  - แผนที่แสดงตำแหน่ง wheelchair แบบ real-time
  - แสดงห้อง (Rooms), ทางเดิน (Corridors), อุปกรณ์ (Devices)
  - รองรับการ Zoom In/Out และ Pan
  - แสดงเส้นทางการนำทาง (Navigation Path)
  - คลิกที่ wheelchair เพื่อดูรายละเอียด
  - ปุ่มเปิดดูวิดีโอสตรีม (Video Stream)
- **Navigation Feature**: 
  - เลือกจุดเริ่มต้นและปลายทาง
  - แสดงเส้นทางที่แนะนำ
- **Device Control**: ควบคุมอุปกรณ์อัจฉริยะในแต่ละห้อง (ไฟ, แอร์, พัดลม, ทีวี)

#### 🗺️ Map Editor (Map Editor V2)
- **Building & Floor Management**: จัดการอาคารและชั้น
- **Room Creator/Editor**: สร้างและแก้ไขห้อง
- **Corridor Editor**: สร้างและแก้ไขทางเดิน
- **Map Canvas**: แผนผังแบบ interactive สำหรับวาดและจัดวางองค์ประกอบ
- **Map Controls**: เครื่องมือสำหรับ zoom, pan, และการจัดการแผนที่

#### 📱 Devices (Device Setup Screen)
- **Device List**: รายการอุปกรณ์ทั้งหมด
- **Device Configuration**: ตั้งค่าอุปกรณ์
- **Device Status**: สถานะการเชื่อมต่อของอุปกรณ์
- **Device Control**: ควบคุมอุปกรณ์แบบ manual

#### 👤 Patients (Patient Management V2)
- **Patient List**: รายชื่อผู้ป่วย/ผู้ใช้
- **Patient Profile**: ข้อมูลส่วนตัวของผู้ใช้
- **Activity Timeline**: ไทม์ไลน์กิจกรรมของผู้ใช้
- **Health Metrics**: ตัวชี้วัดสุขภาพ
- **Device Assignment**: กำหนดอุปกรณ์ให้ผู้ใช้

#### 📅 Timeline (Timeline Screen)
- **Event Timeline**: แสดงเหตุการณ์เรียงตามเวลา
- **Filter Options**: กรองตามประเภท, วันที่, ผู้ใช้
- **Event Details**: รายละเอียดของแต่ละเหตุการณ์
- **Emergency Events**: แยกแสดงเหตุการณ์ฉุกเฉิน

#### 🤖 AI (AI Assistant Chat)
- **Chat Interface**: หน้าจอแชทแบบ chat bubble
- **Message History**: ประวัติการสนทนา
- **Input Field**: ช่องพิมพ์ข้อความ
- **Send Button**: ปุ่มส่งข้อความ
- **Voice Input**: รองรับการบันทึกเสียง (Mic button)
- **Connection Status**: แสดงสถานะการเชื่อมต่อ MCP Server (Wifi/WifiOff icon)
- **Features**:
  - ตรวจสอบตำแหน่ง wheelchair
  - ควบคุมอุปกรณ์อัจฉริยะ
  - สร้างรายงานสถานะระบบ
  - ให้คำแนะนำการใช้งาน
  - ตอบคำถามทั่วไป

#### ⚙️ Settings (Settings Screen)
- **System Settings**: ตั้งค่าระบบ
- **User Preferences**: การตั้งค่าส่วนตัว
- **Language Settings**: ตั้งค่าภาษา
- **Notification Settings**: ตั้งค่าการแจ้งเตือน

### 3. หน้าจอผู้ใช้ (User Mode)

#### 👤 User Dashboard (User Page)
- **User Profile Section**: 
  - ข้อมูลผู้ใช้ (Avatar, ชื่อ, ID)
  - สถานะปัจจุบัน
- **Current Location**: แสดงห้องปัจจุบัน
- **Interactive Map**: 
  - แผนที่แบบ simplified
  - แสดงตำแหน่งปัจจุบัน
  - แสดงห้องและทางเดิน
  - รองรับ zoom และ pan
- **Device Control Panel**: 
  - ควบคุมอุปกรณ์ในห้องปัจจุบัน
  - แสดงสถานะอุปกรณ์แบบ real-time
  - ปุ่มควบคุม (เปิด/ปิด)
- **AI Assistant Chat**: 
  - แชทบอทสำหรับผู้ใช้
  - ช่วยควบคุมอุปกรณ์
  - ให้คำแนะนำ
- **Activity Timeline**: 
  - ไทม์ไลน์กิจกรรมประจำวัน
  - แสดงเวลา, ห้อง, กิจกรรม, ระยะเวลา
- **AI Analysis Dialog**: 
  - วิเคราะห์พฤติกรรมและให้คำแนะนำ
  - แสดงข้อมูลสถิติการใช้งาน

---

## Design System & UI Components

### สีหลัก (Color Scheme)
- **Primary Blue**: #0056B3
- **Background**: White/Gray-50
- **Text**: Dark Gray/Black
- **Status Colors**: 
  - Green (Online/Active)
  - Red (Offline/Error/Emergency)
  - Yellow (Warning)
  - Gray (Inactive)

### UI Components Library (shadcn/ui)
- Cards, Buttons, Badges
- Tabs, Dialogs, Dropdowns
- Inputs, Selects, Sliders
- Charts, Gauges, Progress bars
- Tables, Scroll Areas
- และอื่นๆ

### Responsive Design
- **Mobile First**: รองรับหน้าจอมือถือ
- **Tablet**: ปรับ layout สำหรับแท็บเล็ต
- **Desktop**: แสดงข้อมูลเต็มรูปแบบ
- **Adaptive Layout**: ปรับขนาดอัตโนมัติ

### Icons
- ใช้ **Lucide React** icons
- Icons ที่ใช้บ่อย:
  - 🏠 MapPin (ตำแหน่ง)
  - ⚡ Zap (พลังงาน)
  - 📹 Video (วิดีโอ)
  - 🔔 Bell (การแจ้งเตือน)
  - 👤 User (ผู้ใช้)
  - ⚙️ Settings (ตั้งค่า)
  - 🤖 Bot (AI)
  - และอื่นๆ

---

## Features หลัก

### Real-time Updates
- อัปเดตตำแหน่ง wheelchair แบบ real-time
- อัปเดตสถานะอุปกรณ์ทันที
- การแจ้งเตือนแบบ push

### Interactive Maps
- Zoom In/Out
- Pan/Drag
- Click to select
- Navigation path visualization

### Device Control
- ควบคุมอุปกรณ์อัจฉริยะผ่าน UI
- ควบคุมผ่าน AI Assistant
- สถานะแบบ real-time

### AI Integration
- AI Assistant สำหรับการสนทนา
- วิเคราะห์ข้อมูลและให้คำแนะนำ
- ควบคุมอุปกรณ์ด้วยคำสั่งเสียง/ข้อความ

### Multi-language Support
- รองรับหลายภาษา (ไทย/อังกฤษ)
- Language switcher

### Emergency Handling
- แจ้งเตือนเหตุฉุกเฉิน
- แสดงใน Timeline
- แสดงใน Dashboard

---

## Navigation Flow

### Admin Flow
1. Login → Dashboard
2. Dashboard → ดูสถานะระบบ, ตำแหน่ง wheelchair
3. Map → แก้ไขแผนที่
4. Devices → จัดการอุปกรณ์
5. Patients → จัดการผู้ใช้
6. Timeline → ดูประวัติเหตุการณ์
7. AI → สนทนากับ AI Assistant
8. Settings → ตั้งค่าระบบ

### User Flow
1. Login → User Dashboard
2. User Dashboard → ดูสถานะ, ควบคุมอุปกรณ์, สนทนากับ AI
3. Timeline → ดูกิจกรรมประจำวัน

---

## Technical Stack
- **Framework**: React + TypeScript
- **UI Library**: shadcn/ui (Tailwind CSS)
- **State Management**: Zustand (useStore)
- **Icons**: Lucide React
- **Charts**: Recharts
- **Real-time**: MQTT WebSocket
- **API**: REST API + MCP Server

---

## User Experience Highlights
1. **Clean & Professional Design**: UI สะอาด เรียบง่าย
2. **Mobile Responsive**: ใช้งานได้ดีบนทุกอุปกรณ์
3. **Real-time Updates**: ข้อมูลอัปเดตทันที
4. **Intuitive Navigation**: นำทางง่าย เข้าใจง่าย
5. **AI-Powered**: มี AI Assistant ช่วยเหลือ
6. **Accessibility**: รองรับการใช้งานสำหรับผู้ใช้รถเข็น

---

## สรุป
WheelSense Dashboard เป็นระบบจัดการบ้านอัจฉริยะที่มี UI ที่ทันสมัย ใช้งานง่าย และรองรับการใช้งานแบบ real-time สำหรับทั้งผู้ดูแลระบบ (Admin) และผู้ใช้ทั่วไป (User) โดยมีฟีเจอร์หลักคือการติดตามตำแหน่ง wheelchair, ควบคุมอุปกรณ์อัจฉริยะ, และ AI Assistant ที่ช่วยในการใช้งาน
























































