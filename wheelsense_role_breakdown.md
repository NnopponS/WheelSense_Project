# WheelSense Frontend — Role & Page Breakdown

> **Tech Stack:** Next.js App Router · Role-based routing · `useQuery` + `api` client → FastAPI backend
> **Design System:** "Empathetic Sentinel" — Material Design 3 tokens, bilingual EN/TH

---

## Role Routing Map

| Role | Base Route | Layout Sidebar |
|---|---|---|
| Admin | `/admin` | `AdminSidebar.tsx` |
| Head Nurse | `/head-nurse` | `HeadNurseSidebar.tsx` |
| Supervisor | `/supervisor` | `SupervisorSidebar.tsx` |
| Observer | `/observer` | `ObserverSidebar.tsx` |
| Patient | `/patient` | `PatientSidebar.tsx` |

---

## 1. Admin Role

**เป้าหมาย:** ควบคุมระบบทั้งหมด — จัดการ workspace, users, devices, ML models, และ monitoring

### Menu Structure (AdminSidebar)

```
Care
  ├── Dashboard              /admin
  ├── Patients               /admin/patients
  ├── Vital Signs            /admin/vitals
  └── Alert Feed             /admin/alerts

Operations
  ├── Monitoring & Floorplan /admin/monitoring     ← floorplans merged here (?tab=floorplans)
  ├── Timeline               /admin/timeline
  ├── Caregivers             /admin/caregivers
  ├── Facilities & Rooms     /admin/facilities
  └── Devices (HA/MQTT)      /admin/devices

Admin
  ├── Users & Roles          /admin/users
  ├── Audit Logs             /admin/audit
  ├── ML Calibration         /admin/settings?tab=ml  ← redirect from /admin/ml-calibration
  └── Settings               /admin/settings
```

### Pages & Capabilities

#### `/admin` — Dashboard (page.tsx ~7 KB)
- Summary stats: จำนวน patients, active alerts, critical alerts, on-duty caregivers
- Quick links ครบทุก section

#### `/admin/patients` — Patient Management
- CRUD ข้อมูลผู้ป่วยทั้งหมดใน workspace
- กด View ดู patient detail แบบ full

#### `/admin/vitals` — Vital Signs
- ดู vital readings รวมทุก patient
- ค้นหากรองตาม patient/time

#### `/admin/alerts` — Alert Feed
- ดู alert ทั้งหมด (active + resolved)
- Resolve/acknowledge alerts

#### `/admin/monitoring` — Monitoring & Floorplan
- Tab: Floorplan viewer (รวม `/admin/floorplans` redirect ไปที่นี่)
- แสดง room occupancy และ device location แบบ real-time

#### `/admin/timeline` — Event Timeline
- Audit trail ของ events ทุกประเภทใน workspace

#### `/admin/caregivers` — Caregiver Management
- รายชื่อ caregivers, is_active status, shift management

#### `/admin/facilities` — Facilities & Rooms
- จัดการห้อง/สถานที่ใน workspace (CRUD)

#### `/admin/devices` — Smart Devices (HA/MQTT)
- รายการ HomeAssistant devices, สถานะ online/offline
- ควบคุม on/off

#### `/admin/users` — Users & Roles (~5.7 KB)
- รายการ users ทั้งหมด
- เปลี่ยน role, deactivate/activate account
- Invite users ใหม่

#### `/admin/audit` — Audit Logs
- บันทึก security/audit events

#### `/admin/settings?tab=ml` — ML Calibration
- ตั้งค่า KNN localization model (fingerprint data)
- ตั้งค่า XGBoost motion classifier

#### `/admin/settings` — System Settings
- Workspace settings, API keys, general config

---

## 2. Head Nurse Role

**เป้าหมาย:** Ward management — ภาพรวม census, staff, alerts, clinical workflow ระดับผู้จัดการ

### Menu Structure (HeadNurseSidebar)

```
Care
  ├── Ward Overview          /head-nurse
  ├── Patients               /head-nurse/patients
  └── Active Alerts          /head-nurse/alerts

Staff & Communications
  ├── Staff Directory        /head-nurse/staff
  ├── Specialist Referrals   /head-nurse/specialists
  └── Messages               /head-nurse/messages

Reports
  └── Clinical Reports       /head-nurse/reports
```

### Pages & Capabilities

#### `/head-nurse` — Ward Overview Dashboard
**API calls:** `/analytics/wards/summary`, `/analytics/alerts/summary`, `/analytics/vitals/averages?hours=24`, `/alerts`, `/caregivers`, `/timeline?limit=8`, `/workflow/tasks?status=pending`, `/workflow/schedules?status=scheduled`, `/patients`

**Dashboard Widgets (4 stat cards):**
- Total patients → link `/head-nurse/patients`
- Active alerts (สีแดงถ้ามี critical) → link `/head-nurse/alerts`
- Critical patients → link `/head-nurse/patients`
- On-duty staff → link `/head-nurse/staff`

**3 Panel row:**
1. **Alert severity mix** — นับ critical/warning/info/resolved แยกประเภท
2. **24h vitals average** — HR avg, SpO2 avg, Skin temp avg
3. **Current load** — Active schedules, open tasks, alert types tracked

**2 Bottom panels:**
- Latest active alerts (top 6) พร้อม severity badge
- Recent event feed (top 7 timeline events) พร้อม timestamp

#### `/head-nurse/patients` — Patient List
- รายชื่อผู้ป่วยทั้งหมด, care level, room assignment

#### `/head-nurse/alerts` — Alert Management
- จัดการ alerts — resolve, filter by severity/type

#### `/head-nurse/staff` — Staff Directory
- รายชื่อ caregivers ทั้งหมด, on-duty status

#### `/head-nurse/specialists` — Specialist Referrals
- บันทึก/ติดตาม specialist consultations

#### `/head-nurse/messages` — Messaging
- Internal messaging ระหว่าง staff

#### `/head-nurse/reports` — Clinical Reports
- Analytics reports, audit logs ที่ Head Nurse ดูได้

---

## 3. Supervisor Role

**เป้าหมาย:** ดูแลเชิง operational — จัดการ care tasks, directives, prescriptions, emergency

### Menu Structure (SupervisorSidebar)

```
Emergency
  ├── Command Center (Home)  /supervisor
  └── Emergency Map          /supervisor/emergency

Workflow
  ├── Directives & Tasks     /supervisor/directives
  └── Prescriptions          /supervisor/prescriptions

Patients
  └── Patient List           /supervisor/patients
```

### Pages & Capabilities

#### `/supervisor` — Command Center Dashboard
**API calls:** `/patients`, `/alerts`, `/vitals/readings?limit=120`, `/workflow/tasks?limit=80`, `/workflow/directives?limit=80`, `/workflow/schedules?status=scheduled&limit=80`

**4 Stat cards (กดเพื่อ navigate):**
- Critical alerts → `/supervisor/emergency`
- Open care tasks → `/supervisor/directives`
- Patients needing review → `/supervisor/patients`
- Next 12h schedules → `/supervisor/directives`

**FloorplanRoleViewer** — แผนผังห้อง real-time (embedded component)

**2 Action panels:**
- **Immediate Task Queue** — แสดง pending tasks (top 6) พร้อมปุ่ม "Mark completed" (PATCH `/workflow/tasks/:id`)
- **Directives Awaiting Acknowledgement** — แสดง active directives (top 5) พร้อมปุ่ม "Acknowledge" (POST `/workflow/directives/:id/acknowledge`)

**Patient Insight Priority List** — ผู้ป่วยที่มี alerts หรือ vital risk (SpO2 < 92%, HR > 120) เรียกจาก critical count ลงมา → link ไป `/supervisor/patients/:id`

#### `/supervisor/emergency` — Emergency Map
- FloorplanRoleViewer พร้อม emergency overlay
- แสดง critical alerts ตาม room

#### `/supervisor/directives` — Directives & Tasks Board
- CRUD care tasks (สร้าง, แก้ไข, mark complete)
- CRUD care directives (ออกคำสั่ง, acknowledge, close)
- Care schedules management

#### `/supervisor/prescriptions` — Prescriptions
- บันทึก prescription orders สำหรับผู้ป่วย

#### `/supervisor/patients` — Patient List
- รายชื่อผู้ป่วย + quick link ไป patient detail
- `/supervisor/patients/[id]` — patient detail page

---

## 4. Observer Role

**เป้าหมาย:** Read-only monitoring — ดู zone/room status, alerts, device locations แบบ passive

### Menu Structure (ObserverSidebar)

```
  ├── Zone Dashboard         /observer
  ├── Active Alerts          /observer/alerts
  ├── Patient Overview       /observer/patients
  ├── Device Status          /observer/devices
  └── Prescriptions (view)   /observer/prescriptions
```

### Pages & Capabilities

#### `/observer` — Zone Dashboard
**API calls:** `/rooms`, `/patients`, `/alerts?status=active`, `/localization/predictions?limit=120`

**FloorplanRoleViewer** — แผนผังอาคารแบบ real-time

**4 Stat cards:**
- Rooms monitored
- Active alerts
- Located devices (จากจำนวน unique device IDs ใน predictions)
- High-confidence predictions (confidence ≥ 80%)

**2 Main panels:**
1. **Room Watchlist** — ทุกห้องแสดง: patients count, alerts count, tracked devices, avg localization confidence
2. **Active Alerts** (top 8) — แสดง title, description, timestamp → link ไป `/observer/alerts`

#### `/observer/alerts` — Alert Monitor
- ดู active alerts แบบ read-only (ไม่สามารถ resolve ได้)

#### `/observer/patients` — Patient Overview
- ดูรายชื่อ patient + สถานะ (read-only)

#### `/observer/devices` — Device Status
- ดูสถานะ smart devices ทุกตัว (read-only)

#### `/observer/prescriptions` — Prescriptions (view only)
- ดู prescription records (read-only)

> **สิทธิ์สำคัญ:** Observer ไม่มีปุ่มสร้าง/แก้ไข/ลบ — ทุกอย่างเป็น display only

---

## 5. Patient Role

**เป้าหมาย:** Self-service ผู้ป่วย — ดู vitals ตัวเอง, ส่ง SOS/assistance, ควบคุม room devices

### Menu Structure (PatientSidebar)

```
  ├── My Dashboard           /patient
  ├── Messages               /patient/messages
  └── Pharmacy               /patient/pharmacy
```

### Pages & Capabilities

#### `/patient` — Personal Dashboard
**API calls:** `/patients/:id`, `/vitals/readings?patient_id=:id&limit=24`, `/alerts?status=active&limit=8`, `/workflow/messages?inbox_only=true&limit=5`, `/ha/devices`, `/workflow/tasks?limit=5`

**Header:** ทักทายชื่อ patient พร้อม room + care level

**3 Vital metric cards:**
- Heart Rate (bpm)
- SpO2 (%)
- Skin Temperature (°C)

**My Vitals Trend** — bar chart แสดง heart rate 8 ค่าล่าสุด

**4 Action/Info sections:**
1. **Assistance and SOS**
   - "Request Assistance" button → POST `/alerts` (severity: warning, type: zone_violation)
   - "Emergency SOS" button → POST `/alerts` (severity: critical, type: fall)
   - มี confirm dialog ก่อนส่ง
2. **Active Alerts** — แสดง alerts ที่ยังเปิดอยู่ (read-only)
3. **Room Control** — toggle smart devices ใน room ของตัวเอง (POST `/ha/devices/:id/control`)
4. **Tasks and Messages**
   - Care tasks ที่ assign มาให้ (read-only status)
   - Latest inbox messages → link ไป `/patient/messages`

#### `/patient/messages` — Messages
- รับ/อ่าน messages จาก care team

#### `/patient/pharmacy` — Pharmacy
- ดู prescription ยาของตัวเอง

> **Privacy note:** Patient เห็นเฉพาะข้อมูลตัวเอง (`user.patient_id`) ไม่สามารถเข้าถึงข้อมูล patient คนอื่นได้

---

## Cross-Role Components

| Component | Roles ที่ใช้ | ฟังก์ชัน |
|---|---|---|
| `FloorplanRoleViewer` | Supervisor, Observer | แผนผังอาคาร real-time พร้อม patient/device locations |
| `AIChatPopup` | ทุก Role | AI chat ลอยมุมขวาล่างทุก page |
| Role Layout (`layout.tsx`) | ทุก Role | Sidebar + topbar + auth guard |

---

## Permission Summary

| Feature | Admin | Head Nurse | Supervisor | Observer | Patient |
|---|:---:|:---:|:---:|:---:|:---:|
| Manage Users | ✅ | — | — | — | — |
| Manage Devices & ML | ✅ | — | — | — | — |
| View Audit Logs | ✅ | ✅ | — | — | — |
| Create/Edit Patients | ✅ | — | — | — | — |
| Manage Staff | ✅ | ✅ | — | — | — |
| Issue Directives/Tasks | ✅ | ✅ | ✅ | — | — |
| Prescriptions | ✅ | ✅ | ✅ | 👁 Read | 👁 Self |
| Resolve Alerts | ✅ | ✅ | ✅ | — | — |
| Floorplan Viewer | ✅ | — | ✅ | ✅ | — |
| Zone Monitoring | ✅ | — | ✅ | ✅ | — |
| View Own Vitals | — | — | — | — | ✅ |
| Send SOS/Assistance | — | — | — | — | ✅ |
| Control Room Devices | ✅ | — | — | — | ✅ (self room) |
