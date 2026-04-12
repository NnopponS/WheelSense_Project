## Status update 2026-04-07

- Implemented in runtime frontend:
  - `shadcn`-compatible shared primitives under `frontend/components/ui/*`
  - `clsx` + `tailwind-merge`
  - `next-themes`
  - `@tanstack/react-query`
  - `zustand`
  - `react-hook-form`
  - `zod`
  - `@tanstack/react-table`
  - `date-fns`
  - `openapi-typescript`
- First standardized admin phase completed:
  - root app providers
  - shared UI foundation
  - `/admin/patients` migrated to table/filter/form baseline
  - `/admin/alerts` migrated to summary/table baseline
  - `/admin/devices` migrated to shared filter/card baseline
- Completed follow-up migration targets:
  - `PatientEditorModal` rewritten to RHF + Zod + TanStack Query + generated API types
  - `DeviceDetailDrawer` rewritten to hardware-aware assignment flow + activity integration
  - role surfaces modernized under `/supervisor`, `/head-nurse`, `/observer`, `/patient`
- Current hardening targets:
  - supervisor/head-nurse/observer/patient smoke-test checklist pass
  - shared sidebar consolidation (`SharedSidebar.tsx`) with role navigation config
  - shared Zustand app store bootstrap (`frontend/store/useAppStore.ts`)
  - Admin **patient detail** uses **`GET/PUT /api/patients/{id}/caregivers`** for the assigned-staff roster (not the full caregiver directory); **caregiver detail** edits explicit patient access with **`patients.manage` / `caregivers.manage`** (`CaregiverDetailPane`), not only `caregivers.schedule.manage` (see ADR 0013).

🎨 1. หมวด UI Components & Styling (ตัวช่วยสร้างหน้าเว็บให้สวยเป๊ะในพริบตา)

   1. shadcn/ui (UI Library หลัก)
       * หน้าที่: เป็นชุด UI สำเร็จรูป (เช่น Button, Dialog, Select, Card) ที่สร้างทับบน Tailwind CSS v4
       * ทำไม WheelSense ต้องใช้: หน้า Dashboard ของ Admin, พยาบาล และระบบจัดการอุปกรณ์ ต้องใช้ตาราง (Table), ป๊อปอัป
         (Modal/Dialog) และฟอร์มจำนวนมาก การใช้ shadcn จะช่วยประหยัดเวลาปั้น UI เองไปได้หลายสัปดาห์
       * AI Synergy: Claude ใน Cursor พิมพ์สั่งทีเดียว มันเรียกใช้ Component ของ shadcn ได้เป๊ะมาก
   2. clsx + tailwind-merge (Utility)
       * หน้าที่: ตัวช่วยรวม Class ของ Tailwind อย่างชาญฉลาด (ป้องกัน Class ชนกันเวลาทำ UI ที่เปลี่ยนสีตาม State)
       * ทำไม WheelSense ต้องใช้: เวลาทำปุ่ม "Alert" (สีแดง) หรือ "Normal" (สีเขียว) ตามสถานะผู้ป่วย เครื่องมือนี้จะทำให้โค้ดสะอาดมาก
   3. next-themes
       * หน้าที่: จัดการระบบ Dark Mode / Light Mode
       * ทำไม WheelSense ต้องใช้: หน้าจอเฝ้าระวังของพยาบาลกะกลางคืน (Night Shift) จำเป็นต้องมี Dark Mode เพื่อถนอมสายตา

  🔄 2. หมวด Data Fetching & State Management (จัดการข้อมูลไหลลื่น ไม่กระตุก)

   4. @tanstack/react-query (TanStack Query v5)
       * หน้าที่: ตัวจัดการ API Request, Caching, และ Auto-refetch
       * ทำไม WheelSense ต้องใช้: สำคัญมากสำหรับหน้า /observer หรือ /head-nurse ที่ต้องดูสถานะ Vitals/Alert ของผู้ป่วยแบบ Real-time
         มันจะช่วยดึงข้อมูลใหม่เบื้องหลัง (Background Fetching) โดยหน้าเว็บไม่ต้องโหลดหมุนๆ ให้หงุดหงิด
   5. zustand
       * หน้าที่: Global State Management (เก็บตัวแปรข้ามหน้าเว็บ) แบบเบาหวิว
       * ทำไม WheelSense ต้องใช้: เก็บข้อมูล "สิทธิ์ของผู้ใช้งาน (Role)", "สถานะการเชื่อมต่อ MQTT ของหน้าเว็บ", หรือ "ตะกร้ายา
         (Pharmacy)" ของผู้ป่วย โดยไม่ต้องเจอปัญหา Props Drilling

  📝 3. หมวด Form & Validation (กรอกข้อมูลถูกต้อง ปลอดภัย)

   6. react-hook-form
       * หน้าที่: ตัวจัดการ Form ใน React ที่เร็วที่สุด ไม่ทำให้หน้าเว็บรีเรนเดอร์ทุกครั้งที่พิมพ์
       * ทำไม WheelSense ต้องใช้: ระบบคุณมีหน้า /admin/patients (ลงทะเบียนผู้ป่วย), /admin/devices (ตั้งค่าอุปกรณ์)
         ซึ่งฟอร์มมีความซับซ้อน ตัวนี้จะช่วยจัดการ State ของฟอร์มได้เนียนมาก
   7. zod
       * หน้าที่: ตรวจสอบความถูกต้องของข้อมูล (Schema Validation)
       * ทำไม WheelSense ต้องใช้: ป้องกันพยาบาลกรอกข้อมูลผิดพลาด (เช่น เบอร์โทรไม่ครบ, อายุติดลบ) ข้อดีคือ Zod บนหน้าบ้าน
         สามารถเขียนให้ล้อกับ Pydantic บนหลังบ้าน (FastAPI) ได้ 100% (Type Safety from End-to-End)

  📊 4. หมวด Data Display & Analytics (แสดงผลข้อมูล IoT และประวัติผู้ป่วย)

   8. @tanstack/react-table (TanStack Table)
       * หน้าที่: Headless UI สำหรับสร้างตารางข้อมูลที่ซับซ้อน (มีระบบ Sort, Filter, Pagination)
       * ทำไม WheelSense ต้องใช้: หน้าตารางรายชื่อผู้ป่วย, ประวัติการแจ้งเตือน (Alerts History), และรายการอุปกรณ์ (Devices List)
         ต้องใช้ตารางที่ค้นหาและกรองข้อมูลได้ ตัวนี้คือเบอร์ 1 ของวงการ
   9. date-fns (หรือ dayjs)
       * หน้าที่: จัดการและคำนวณวัน/เวลา
       * ทำไม WheelSense ต้องใช้: ข้อมูลจาก IoT (IMU) และประวัติผู้ป่วย (Timeline) จะมาเป็น Timestamp ตัวนี้ช่วยแปลงเป็น "5
         นาทีที่แล้ว", "14:30 น." ได้ง่ายและเบากว่า Moment.js

  🔗 5. หมวด Cross-Stack Integration (ไม้ตายเชื่อมหน้าบ้าน-หลังบ้าน)

   10. openapi-typescript หรือ orval
       * หน้าที่: อ่านไฟล์ OpenAPI (Swagger) จาก FastAPI แล้วสร้าง TypeScript Types / React Query Hooks ให้อัตโนมัติ
       * ทำไม WheelSense ต้องใช้: (นี่คือ Game Changer ที่สุด) ระบบคุณใหญ่มาก เวลา Backend เปลี่ยน API หน้าเว็บจะพังบ่อย
         ตัวนี้จะทำให้หน้าเว็บรู้ว่า API รูปแบบเปลี่ยนไป และ AI (Cursor) จะ Auto-complete โค้ดดึงข้อมูล API ได้ถูกต้อง 100%
         โดยไม่ต้องไปเปิดดูโค้ดหลังบ้านเลย

  ---

  ⚙️ หมวดแถม: ฝั่ง Backend (FastAPI) ที่ควรพิจารณาเพิ่ม

   1. uv (Package Manager) - แทนที่ pip จัดการไลบรารี Python เร็วกว่า 100 เท่า
   2. taskiq - สำหรับงานหนักๆ เช่น ถ้ามีการสั่งเทรนโมเดล ML (XGBoost) บนหลังบ้าน ให้โยนเข้า Task Queue เพื่อไม่ให้ API ค้าง (ดีกว่า
      Celery ตรงที่ออกแบบมาเพื่อ FastAPI โดยเฉพาะ)
   3. ruff - Linter ที่เร็วที่สุดสำหรับ Python (มีในโปรเจคแล้ว ควรบังคับใช้ใน VSCode/Cursor)

## Step 1 Action Plan Addendum 2026-04-07

- New Files to Create -> Frontend/platform:
  - `frontend/store/useAppStore.ts` (or similar) for shared Zustand global states (user role, MQTT connection status, and global UI toggles) to remove prop drilling.
- Refactor (in place) -> Frontend standardization scope:
  - Consider consolidating role-specific sidebars into one `SharedSidebar.tsx` powered by a central role-based navigation config.
