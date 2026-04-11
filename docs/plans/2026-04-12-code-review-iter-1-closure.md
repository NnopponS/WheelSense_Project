# Code Review iter-1 — closure log (2026-04-12)

## Purpose

บันทึกว่างานจากแผน **Code review closure (iter-1)** ดำเนินแล้ว และเชื่อมกับรายงานต้นทางใน `Code_Review/iter-1/` เพื่อให้ทีม/agent รุ่นถัดไปไม่ต้องไล่ diff ย้อนหลังทั้งหมด

รายงานอ้างอิง:

- [Code_Review/iter-1/Patient-code-review](../../Code_Review/iter-1/Patient-code-review)
- [Code_Review/iter-1/Observer-code-review](../../Code_Review/iter-1/Observer-code-review)
- [Code_Review/iter-1/headnurse-code-review](../../Code_Review/iter-1/headnurse-code-review)
- [Code_Review/iter-1/Supervisor-code-review](../../Code_Review/iter-1/Supervisor-code-review)

**Iter-2 audit docs (reconciled 2026-04-12):** route tables and outdated “outstanding” text were aligned to the current `frontend/app/*` tree and this closure log — see [Code_Review/iter-2/README.md](../../Code_Review/iter-2/README.md).

---

## Implemented (aligned with closure plan)

### 1) Observer dashboard — preview cards i18n

- **Issue (audit):** การ์ดล่าง (My Tasks / My Patients) ใช้สตริงอังกฤษตรงๆ
- **Change:** แทนที่ด้วย `t()` + คีย์ใหม่ใน `frontend/lib/i18n.tsx` (รวม priority/care level และสรุป alerts)
- **Files:** `frontend/app/observer/page.tsx`, `frontend/lib/i18n.tsx`

### 2) Observer Tasks — mutation error feedback

- **Issue (audit):** ล้มเหลวแล้วไม่มี feedback บนหน้า (เคยใช้ `void err`)
- **Change:** state `taskActionError` + `Alert` (destructive), แมป `ApiError` รวม HTTP 403 ไปข้อความแปล
- **Files:** `frontend/app/observer/tasks/page.tsx`, `frontend/lib/i18n.tsx`
- **UI primitive:** เพิ่ม `AlertTitle` ใน `frontend/components/ui/alert.tsx` (export ให้สอดคล้อง shadcn pattern)

### 3) Patient — Pharmacy ใน sidebar

- **Issue (audit):** มี route `/patient/pharmacy` และคีย์ `nav.pharmacy` แต่ไม่มีใน `ROLE_NAV_CONFIGS.patient`
- **Change:** เพิ่มรายการนำทางไป `/patient/pharmacy` (ไอคอน `Pill`)
- **Files:** `frontend/lib/sidebarConfig.ts`

### 4) Observer patient detail — column / error copy i18n

- **Issue (audit):** ข้อความ fallback ของ mutation, หัวตาราง, default subject, ปุ่มตาราง ฯลฯ ยัง hardcode
- **Change:** `errorText` ใช้ `observer.patientDetail.forbidden` + คีย์ fallback; ตารางและปุ่มใช้คีย์ `observer.patientDetail.*`
- **Files:** `frontend/app/observer/patients/[id]/page.tsx`, `frontend/lib/i18n.tsx`

---

## Already satisfied before this closure (no code change in this wave)

จากการตรวจซ้ำก่อนปิดแผน — ไม่ต้องทำซ้ำใน wave นี้:

- Sidebar ครบสำหรับ `observer`, `head_nurse`, `supervisor` (รวมหน้าที่เคย “ซ่อน” ใน audit)
- Observer Tasks แก่นหลัง: TanStack Query + `api.updateWorkflowTask` + `invalidateQueries`
- Patient Services + `service_requests` API
- Patient room-controls เชื่อม smart devices (เกินขอบเขต audit เดิมที่เป็น placeholder)

---

## Deferred / optional (not required for iter-1 closure)

### ReportIssueForm — `useState` vs RHF + zod

- **Audit severity:** ต่ำ (ความสม่ำเสมอกับ Pharmacy)
- **Status:** ยังไม่ refactor — ทำได้ภายหลังถ้าต้องการมาตรฐานฟอร์มเดียวกันทั้งแอป

---

## Verification

รันบน working tree หลังรวมการเปลี่ยนแปลง:

- `cd frontend && npx tsc --noEmit`
- `npm run build`

ผลล่าสุดที่บันทึกไว้: **ผ่าน** (Next.js production build สำเร็จ)

---

## Manual smoke (recommended)

- Observer dashboard: สลับ EN/TH แล้วตรวจการ์ดล่าง
- Observer Tasks: จำลองความล้มเหลว (เช่น ตัด network) แล้วกด complete/start — ต้องเห็น `Alert`
- Patient: sidebar มีลิงก์ **Pharmacy**

---

## Related plan document

- แผนเชิงปฏิบัติการ (ไม่แก้ไฟล์แผนใน repo นี้หลังยืนยัน): `.cursor/plans/code_review_closure_a24ccfa6.plan.md` (ถ้ามีในเครื่องผู้พัฒนา)
