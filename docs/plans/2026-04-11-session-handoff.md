# WheelSense Session Handoff - 2026-04-11

## Purpose

เอกสารนี้สรุปงานทั้งหมดที่ทำใน session นี้ เพื่อให้ agent ตัวถัดไปรับช่วงต่อได้ทันทีโดยไม่ต้องไล่อ่านทั้งแชตย้อนหลัง

- รวม original prompt/requirements จากผู้ใช้
- ระบุสิ่งที่ทำเสร็จแล้วใน session นี้
- ระบุสิ่งที่ยังไม่เสร็จและช่องว่างสำคัญ
- ระบุไฟล์ที่แก้และการตรวจสอบที่ผ่านแล้ว
- ระบุแนวทางทำงานต่อแบบประหยัด quota

---

## Original User Prompt / Requirements

ผู้ใช้ต้องการให้ WheelSense พร้อมใช้งานจริง โดยมี requirement หลักดังนี้

1. `http://localhost:3000/admin/personnel`
   - ทำ UI ให้ใช้งานง่ายขึ้น
   - มี filter ย่อยเพื่อดูและแก้ไขได้ทุก role ทั้ง Staff และ Patients
   - ปรับ `http://localhost:3000/admin/account-management`
     - มี filter แยกว่าเป็น Staff หรือ Patient
     - มี filter ตาม role
     - มี search ตาม ID หรือชื่อ

2. แต่ละ account ต้องดูหน้า user ของตัวเองได้
   - เช่น `http://localhost:3000/admin/caregivers/9`
   - เพิ่มส่วน staff ให้มีข้อมูลส่วนตัวละเอียดขึ้น
   - ให้แต่ละ account เปลี่ยนรูปและแก้ข้อมูลของตัวเองได้
   - ให้แต่ละ account มี calendar ของตัวเอง
   - งานเกี่ยวกับเวลาให้เปลี่ยนเป็น format ปฏิทินทั้งหมด
   - เชื่อม calendar กับ task ให้ครบ
   - ใช้แนวทางปฏิทินแบบ `http://localhost:3000/head-nurse/calendar`
   - `head_nurse` และ `admin` แก้ปฏิทินของทุกคนได้
   - คนอื่นดูได้อย่างเดียว
   - เพิ่มปฏิทินของผู้ป่วยที่ `http://localhost:3000/patient/schedule`

3. `http://localhost:3000/admin/devices?tab=health`
   - ย้าย health tab เข้าไปในแต่ละ device
   - ไม่ต้องมีเมนูแยก

4. `http://localhost:3000/admin/devices`
   - ทำให้ระบบรองรับข้อมูลจาก device จริง
   - realtime ของแต่ละ device ต้องใช้ schema ตาม hardware จริง
   - Hardware contracts:
     - Wheelchair (`M5StickC Plus2`): `battery`, `distance`, `velocity`, `accel`
     - Node (`Tsim-cam`): `battery`, `capture`, `snapshot`
     - Polar Sense (`Polar Verity Sense`): `battery`, `PPG`, `HR`; server รับข้อมูลพร้อม mobile phone
     - Mobile Phone:
       - `battery`
       - สถานะเชื่อมต่อ Polar Sense
       - `steps`
       - RSSI จาก Node เพื่อระบุตำแหน่ง
       - เลือกได้ว่าจะ link กับ Patient หรือ Staff คนไหน

5. `http://localhost:3000/admin/support`
   - ทุก role ต้อง report ปัญหากลับหา admin ได้
   - ต้องแนบรูปได้
   - admin ต้องสามารถเขียน ticket/self-note ให้ตัวเองได้

6. `http://localhost:3000/admin/facility-management`
   - Floor Plan Editor ตอนนี้ยังไม่โหลดห้อง
   - role อื่นเห็น floor plan ได้
   - ต้องเลือกดู room แบบ List หรือ Floorplan ได้

7. `http://localhost:3000/admin/settings` และหน้า profile ของ user อื่น
   - แก้ข้อมูลตัวเองที่เคยบันทึกไว้ใน Personnel ได้
   - Admin ต้องจัดการ AI Chat ได้ว่าใช้ model อะไร ทำอะไรได้บ้าง
   - Chat popup ห้ามแสดง provider/model ต่อผู้ใช้
   - ใช้เหมือนกันทั้งระบบ
   - คนที่แก้ได้มีแค่ Admin

8. `http://localhost:3000/admin/ml-calibration`
   - เชื่อมกับ M5StickC หรือ Mobile
   - เลือก 1 device แล้วค่อย ๆ เก็บข้อมูล
   - ให้ user เดินไปห้องจริงและกด record ค่าต่าง ๆ
   - ต้องเก็บครบทุกห้อง
   - นำ data ไป train KNN เพื่อ calibrate ตำแหน่งห้อง
   - Settings ต้องเลือกได้ว่าจะใช้ KNN หรือไม่
   - ถ้าไม่ใช้ KNN ให้ใช้ strongest RSSI room fallback

9. `http://localhost:3000/admin/demo-control`
   - ซ่อนไว้ ไม่ต้องมีเมนู
   - ปรับให้ทำงานครบขึ้น
   - ลบ scenario presets
   - ให้ admin ใช้ทดสอบเองทั้งระบบ
   - ต้องครอบคลุม feature ตาม role ต่าง ๆ

10. `http://localhost:3000/head-nurse`
   - จัดการข้อมูล Staff และ Patient ได้แบบ Admin
   - แก้ calendar ของทุก user ได้

11. `http://localhost:3000/head-nurse`
   - จัดระเบียบหน้า function และ UI ใหม่ทั้งหมด

12. `http://localhost:3000/supervisor`
   - จัดระเบียบหน้า function และ UI ใหม่ทั้งหมด

13. `http://localhost:3000/patient`
   - จัดระเบียบหน้า function และ UI ใหม่ทั้งหมด
   - เน้น UX/UI ใช้ง่ายสำหรับผู้สูงอายุและ staff อายุประมาณ 30+
   - ลดการกดเปลี่ยนหน้า
   - แต่ละเมนูต้องมีเหตุผลและทำงานจบใน surface นั้นได้

14. เอา `Skin Temp 36.6 °C` ออก
   - แสดงเฉพาะ `HR`, `SpO2`, และข้อมูล sensor ที่มีจริง
   - ถ้าเชื่อม `M5StickC` ให้เห็น `distance`, `velocity`, `accel`
   - ถ้าเป็น `Mobile` ให้เห็น `steps`
   - `http://localhost:3000/patient/schedule` ต้องมี calendar ของตัวเอง

15. ทำให้ AI popup chat ใช้ได้ทั้งระบบ
   - แยกสิทธิ์ตาม role
   - เชื่อมกับ database และฟังก์ชันต่าง ๆ ได้ทั้งระบบ
   - ทำหน้าที่เป็นผู้ช่วยได้
   - ถ้าจะ execute action แทน user ต้องมี confirm ก่อนทุกครั้ง
   - ใช้ MCP เป็นเครื่องมือช่วยทำงานแทน user ที่เรียนรู้ระบบยาก

---

## Architecture Decisions Locked During This Session

- AI runtime ยังยึด `ollama` / `copilot`
- `head_nurse` ถือเป็น `admin-lite`
  - จัดการ Staff
  - จัดการ Patient
  - จัดการ Calendar ระดับ workspace
- mobile app อนาคตจะส่ง telemetry ผ่าน REST
- firmware device ยังใช้ MQTT
- localization ใช้ `max_rssi` เป็น default จนกว่าจะมี calibration data และ admin เปิด `knn`
- AI assistant v1 ใช้ `propose -> confirm -> execute` พร้อม audit trail
- chat popup ไม่ควรแสดง provider/model แก่ผู้ใช้

---

## Work Completed In This Session

### 1. Backend Contract and Integration Work

ทำ backend foundation บางส่วนสำหรับ identity, AI actions, localization, และ runtime tables

#### Added / Updated API behavior

- เพิ่ม/ต่อสัญญา self-profile และ account self-service
- ปรับ `chat/actions` ให้ flow ตรงกับ popup UI ปัจจุบัน
  - propose
  - confirm
  - execute
- ปรับ localization config ให้ใช้ config row จริง
- เพิ่ม migration สำหรับ runtime tables ที่ระบบใหม่ใช้อยู่

#### Backend files touched in this session

- `server/app/api/endpoints/__init__.py`
- `server/app/api/router.py`
- `server/app/models/__init__.py`
- `server/app/mcp_server.py`
- `server/app/schemas/users.py`
- `server/app/schemas/chat_actions.py`
- `server/app/api/endpoints/auth.py`
- `server/app/api/endpoints/chat_actions.py`
- `server/app/api/endpoints/localization.py`
- `server/app/services/ai_chat.py`
- `server/alembic/versions/q1r2s3t4u5v6_add_device_localization_runtime_tables.py`

#### Backend verification that passed earlier in this session

- `cd server && python -m pytest tests/test_identity_support_lane.py tests/test_chat_actions.py tests/test_access_control_backend_contracts.py -q`
  - result: `12 passed`
- `python -m py_compile` on touched backend files and migration
  - passed

### 2. Frontend Stabilization Done Earlier In This Session

แก้ validation และ integration ฝั่ง frontend ที่ block งานใหญ่

#### Frontend files stabilized earlier in the session

- `frontend/app/supervisor/page.tsx`
- `frontend/components/admin/devices/DeviceDetailDrawer.tsx`
- `frontend/app/admin/page.tsx`
- `frontend/app/patient/page.tsx`
- `frontend/components/RoleShell.tsx`
- `frontend/components/RoleSidebar.tsx`
- `frontend/hooks/useNotifications.ts`

สิ่งที่ได้จากรอบก่อนหน้า

- supervisor dashboard ใช้ translation key ที่มีจริง
- device detail drawer รองรับ metric แยกตาม hardware
- ลด lint/purity/hydration errors ใน shell และ dashboard หลายจุด

### 3. Admin People Workspace Improvements Done In This Session

#### `frontend/app/admin/personnel/page.tsx`

ปรับเป็น people workspace ที่ใช้งานได้จริงขึ้น

- ทำ tab แยก:
  - `Staff`
  - `Patients`
  - `Accounts`
- เพิ่ม filter:
  - `roleFilter` สำหรับ staff/accounts
  - `patientStatusFilter` สำหรับ patients
  - `accountKindFilter` สำหรับ accounts
- เพิ่ม search ตาม ID / name / username / linked name ตาม context
- เพิ่ม CTA ต่อ row:
  - Staff -> open caregiver profile
  - Patient -> open patient profile
  - Link ไป `account-management` พร้อม prefilled `kind` + `q`

#### `frontend/app/admin/account-management/page.tsx`

ปรับให้เป็นปลายทางของ people workspace ที่ต่อเนื่องขึ้น

- initialize filter จาก query string:
  - `q`
  - `kind`
  - `role`
- sync filter กลับลง URL ด้วย `router.replace(...)`
- เพิ่ม summary cards:
  - visible accounts
  - active
  - staff accounts
  - patient accounts
- table filter ตาม:
  - kind = `staff | patient`
  - role
  - search ตาม ID / username / linked person name
- เพิ่ม quick links จาก account row ไป:
  - caregiver page
  - patient page

### 4. Facility Management Fixes Done In This Session

#### `frontend/app/admin/facility-management/page.tsx`

แก้ regression และทำให้ room hydration ใช้ได้ต่อ

- เติม `percentToCanvasUnits` กลับเข้ามา
- คง behavior:
  - ถ้ามี saved layout ให้ใช้ layout นั้น
  - ถ้าไม่มี แต่ floor มี rooms อยู่แล้ว ให้ hydrate rooms จาก room data
- คง UI `List | Floorplan`
- ทำให้ typecheck/build ผ่านอีกครั้ง

---

## Files Changed In The Final State Of This Session

แน่ชัดจากการทำงานช่วงท้าย session นี้

- `frontend/app/admin/personnel/page.tsx`
- `frontend/app/admin/account-management/page.tsx`
- `frontend/app/admin/facility-management/page.tsx`

และมี backend/frontend files ที่ถูกแก้ก่อนหน้านี้ใน session เดียวกันตามรายการในหัวข้อก่อนหน้า

---

## Validation Run In The Final Stage Of This Session

ผ่านแล้ว

- `cd frontend && npx eslint app/admin/personnel/page.tsx app/admin/account-management/page.tsx app/admin/facility-management/page.tsx`
- `cd frontend && npx tsc --noEmit`
- `cd frontend && npm run build`

ผลล่าสุด

- ESLint passed
- TypeScript passed
- Next build passed

---

## Current Status By Requirement

สถานะใช้คำว่า:

- `done in session` = มีงานที่ทำเสร็จใน session นี้และใช้งานได้ตาม scope ที่แตะ
- `partial` = เริ่มแล้วหรือมี foundation แล้ว แต่ยังไม่ครบ requirement
- `not done` = ยังไม่ได้ปิดงานนั้นใน session นี้

### 1. Admin personnel + account management

- `admin/personnel`: `partial`
  - people workspace ดีขึ้นชัดเจน
  - มี tab/filter/search/action links แล้ว
  - ยังไม่ถึงระดับ editable canonical workspace ครบทุก action ในหน้าเดียว
- `admin/account-management`: `partial`
  - filter kind/role/search ใช้งานได้แล้ว
  - sync query string แล้ว
  - ยังไม่ได้ผูก edit flows ระดับลึกทั้งหมดให้ครบ requirement

### 2. Self profile + user page + calendar unification

- `/account`: `partial`
  - self-profile foundation มีอยู่ และ backend self-profile / change-password ถูกต่อสัญญาไว้ใน session นี้
  - ยังไม่ได้ปิดงาน calendar unified surfaces และ permission matrix ทั้งหมด
- staff richer profile: `partial`
- avatar/self-edit: `partial`
- calendar format ทั้งระบบ: `not done`
- patient schedule calendar: `partial`
- admin/head nurse edit all calendars: `not done`

### 3. Move device health into device detail

- `partial`
  - device detail drawer รองรับ hardware-specific metrics มากขึ้นแล้ว
  - แต่การย้าย information architecture ของ `/admin/devices` ยังไม่ถือว่าปิดครบ

### 4. Real device telemetry contracts

- `partial`
  - backend/device drawer รองรับแยก metrics ตาม hardware มากขึ้น
  - backend runtime/migration foundation บางส่วนถูกเพิ่มแล้ว
  - แต่ ingest contract ครบสำหรับ wheelchair/node/polar/mobile ยังไม่ปิดครบทั้ง backend + UI + firmware

### 5. Support domain with attachments

- `not done`
  - มีแค่ plan และ target surface
  - ยังไม่สรุป implementation ใน session นี้

### 6. Facility management list/floorplan and room loading

- `partial`
  - room hydration ได้แล้ว
  - `List | Floorplan` UI มีอยู่
  - ยังไม่ได้ทำ review/UX polish และตรวจความครบของ role views ทั้งหมด

### 7. Admin-only AI settings + unified chat popup

- `partial`
  - backend AI action flow foundation ถูกปรับแล้ว
  - self/profile/settings บางส่วนเชื่อมแล้ว
  - ยังไม่ได้ปิดหน้า admin settings และ role restrictions ครบ

### 8. ML calibration guided room walk + KNN toggle

- `not done`
  - architecture direction ชัดแล้ว
  - ยังไม่ได้ implement guided room-walk UX และ end-to-end training flow ใน session นี้

### 9. Hidden demo-control operator console

- `not done`
  - ยังไม่ได้แปลงจาก scenario surface ไปเป็น hidden operator console ใน session นี้

### 10. Head nurse admin-lite staff/patient/calendar management

- `partial`
  - architecture lock แล้วว่า `head_nurse = admin-lite`
  - backend/UX implementation ยังไม่ครบ

### 11. Reorganize `head-nurse`

- `not done`

### 12. Reorganize `supervisor`

- `partial`
  - มี stabilization ก่อนหน้า
  - ยังไม่ถือว่า reorganize ใหม่ทั้งหมดตาม UX target

### 13. Reorganize `patient`

- `partial`
  - มี stabilization ก่อนหน้า
  - ยังไม่ถึงระดับ reorganize ใหม่ทั้งหมดตาม UX target

### 14. Remove skin temp / show only real metrics

- `partial`
  - อยู่ใน contract direction และ device drawer มีการแยก metrics มากขึ้น
  - แต่ยังไม่ควรถือว่าปิดครบทั้งทุกหน้าและทุก API

### 15. AI popup assistant with role-scoped control and confirm-before-action

- `partial`
  - backend flow `propose -> confirm -> execute` ถูกต่อสัญญาแล้ว
  - ยังไม่ปิด MCP role-scoping, UI confirmation surfaces, และ cross-system execution ครบ

---

## Remaining Work, Grouped For Next Agent

### Batch A - Calendar and Role Surfaces

ควรทำก่อน เพราะกระทบ requirement หลายข้อที่สุด

- ทำ `GET /api/calendar/events` projection ให้ครบ
- ทำหน้าปฏิทินของ:
  - admin
  - head nurse
  - supervisor
  - patient
- กำหนด permission:
  - admin/head_nurse edit all
  - คนอื่น read-only ตาม scope
- ทำให้ schedule/task/directive/shift อยู่ใน calendar surface เดียวให้มากที่สุด
- ลดการสลับ route ใน `head-nurse`, `supervisor`, `patient`

### Batch B - Device Telemetry and Device UX

- ปิด data contracts จริงสำหรับ:
  - wheelchair
  - node
  - polar
  - mobile
- ย้าย `health` ออกจาก tab แยกให้เสร็จ
- ปรับ `/admin/devices` ให้เหลือ registry + detail-driven UX
- ปิด mobile/staff/patient linking
- ลบ `skin_temperature` ออกจากทุก product surface

### Batch C - Support + Demo + ML Calibration

- implement support ticket domain
- attachments + comments + admin self-ticket
- guided room-walk calibration
- strategy toggle `knn | max_rssi`
- ซ่อน `demo-control` จาก navigation
- เปลี่ยนเป็น operator console ไม่มี scenario presets

### Batch D - AI Settings + Popup + MCP Controls

- admin-only AI settings
- popup ไม่โชว์ provider/model
- role-scoped access control สำหรับ AI tools
- explicit confirmation UI ก่อน execute action
- audit log / proposal history

---

## Recommended Execution Order For The Next Agent

1. ปิด `Calendar + role surfaces`
2. ปิด `Devices + telemetry contracts`
3. ปิด `Support + ML calibration + demo-control`
4. ปิด `AI popup + admin settings`
5. ปิด UX polish และ cross-role cleanup รอบสุดท้าย

เหตุผล:

- calendar และ role surface เป็นแกนของ requirement 2, 10, 11, 12, 13, 14
- device contracts เป็นแกนของ requirement 3, 4, 8, 14
- AI assistant ควรปิดหลัง contracts/backend role scopes ชัดแล้ว

---

## Cheap Subagent Policy Requested By User

ผู้ใช้สั่งชัดว่า quota ลดเร็วเกินไป จึงต้องใช้ subagent แบบประหยัด

นโยบายที่ตกลงไว้ใน session นี้

- default: ไม่ใช้ subagent
- ถ้าจำเป็นจริง ใช้ครั้งละ 1 agent
- explorer:
  - model: `gpt-5.4-mini`
  - reasoning: `low`
- worker:
  - model: `gpt-5.3-codex`
  - reasoning: `low`
- หลีกเลี่ยง `high` / `xhigh` เว้นแต่มี blocker ชัดเจน
- งาน critical path ให้ main agent ลงมือเองก่อน

---

## Known Constraints / Notes For The Next Agent

- repo นี้อาจมี dirty working tree อยู่แล้ว ต้องไม่ revert งานคนอื่น
- frontend runtime ผ่าน Docker image build-time compile
- หลัง frontend source change ถ้าใช้งานผ่าน compose ควร rebuild `wheelsense-platform-web`
- authorization ต้องยึด backend scope เป็น source of truth
- client ต้องไม่เป็นตัวตัดสิน workspace scope เอง
- plan documents อาจ lag กว่า code จริง

---

## Suggested Verification For The Next Agent

### Frontend

- `cd frontend && npx eslint <target files>`
- `cd frontend && npx tsc --noEmit`
- `cd frontend && npm run build`

### Backend

- `cd server && python -m pytest tests/ -q`
- ถ้างานกระทบ contracts ให้รัน targeted suites สำหรับ:
  - auth
  - chat actions
  - localization
  - devices
  - workflow
  - support

### Runtime / Compose

- rebuild `wheelsense-platform-web` เมื่อ frontend ที่ serve ผ่าน compose ถูกเปลี่ยน
- smoke test role routes สำคัญ:
  - `/admin/personnel`
  - `/admin/account-management`
  - `/admin/facility-management`
  - `/account`
  - `/head-nurse/calendar`
  - `/patient/schedule`

---

## Quick Pointers To Important Files

### Backend files already touched this session

- `server/app/api/endpoints/auth.py`
- `server/app/api/endpoints/chat_actions.py`
- `server/app/api/endpoints/localization.py`
- `server/app/services/ai_chat.py`
- `server/app/schemas/chat_actions.py`
- `server/app/schemas/users.py`
- `server/alembic/versions/q1r2s3t4u5v6_add_device_localization_runtime_tables.py`

### Frontend files already touched this session

- `frontend/app/admin/personnel/page.tsx`
- `frontend/app/admin/account-management/page.tsx`
- `frontend/app/admin/facility-management/page.tsx`
- `frontend/app/account/page.tsx`
- `frontend/components/admin/devices/DeviceDetailDrawer.tsx`
- `frontend/app/supervisor/page.tsx`
- `frontend/app/admin/page.tsx`
- `frontend/app/patient/page.tsx`
- `frontend/components/RoleShell.tsx`
- `frontend/components/RoleSidebar.tsx`
- `frontend/hooks/useNotifications.ts`

### Existing docs that remain relevant

- `ARCHITECTURE.md`
- `server/AGENTS.md`
- `frontend/README.md`
- `docs/adr/0004-configurable-localization-strategy.md`
- `docs/adr/0005-camera-photo-only-internet-independent.md`
- `docs/adr/0008-workflow-domains-for-role-operations.md`
- `docs/adr/0009-future-domains-floorplan-prescription-pharmacy.md`
- `docs/adr/0010-phase2-device-fleet-control-plane.md`
- `docs/adr/0011-phase2-map-person-presence-projection.md`

---

## Handoff Summary

สิ่งที่ session นี้ปิดได้จริงคือ

- backend foundation บางส่วนสำหรับ self-profile, chat action flow, localization config, runtime tables
- frontend stabilization ที่ทำให้ lint/build/typecheck กลับมาใช้งานได้
- admin people workspace ดีขึ้นอย่างมีนัยสำคัญ
- account management รองรับ filter/search/query sync และ deep links ดีขึ้น
- facility management room hydration regression ถูกแก้แล้ว

สิ่งที่ยังไม่ปิดคือ requirement ใหญ่ฝั่ง calendar, support, full telemetry contracts, AI settings/popup, demo-control, และ role IA reorganization หลายหน้า

เอกสารนี้ควรใช้เป็นจุดเริ่มต้นหลักของ agent ถัดไป

---

## Integration note (2026-04-12) — patient room + staff roster UX

- Patient **facility room** on detail pages: show and edit via `Patient.room_id` (`GET`/`PATCH /api/patients/{id}`). Do not infer from device localization alone; `GET /api/floorplans/presence` reflects assigned patients where the backend joins `room_id`.
- Caregiver/staff **patient responsibility** lists: `GET`/`PUT /api/caregivers/{caregiver_id}/patients`; account ↔ caregiver directory: `PUT /api/users/{user_id}` (`caregiver_id`, `role`). Cross-link admin patient and caregiver detail routes to these APIs.
- Floorplan **room drawer** (node, smart home, patient assign, capture): single implementation `FloorplansPanel` embedded on `/admin/facility-management`; monitoring `FloorMapWorkspace` assign mode must keep the same `PATCH /api/patients/{id}` `{ room_id }` semantics. See `docs/adr/0013-patient-room-assignment-ux-surface.md` and `server/AGENTS.md` subsection “Patient facility room, roster assignment, and floorplan admin surface”.
