# E2E Test Matrix — Phase 11

**Date:** 2026-04-20  
**Scope:** Subagent-driven E2E with simulated hardware (5 patients from redesign seed)

---

## Test Users (จาก redesign seed)

| Role | Username | Password | คำอธิบาย |
|------|----------|----------|---------|
| admin | admin | demo1234 | ผู้ดูแลระบบ |
| head_nurse | headnurse | demo1234 | หัวหน้าพยาบาล |
| supervisor | supervisor | demo1234 | หัวหน้าเวร |
| observer | observer1 | demo1234 | ผู้สังเกตการณ์ #1 |
| observer | observer2 | demo1234 | ผู้สังเกตการณ์ #2 |
| patient | emika | demo1234 | ผู้ป่วย Emika |
| patient | somchai | demo1234 | ผู้ป่วย Somchai |
| patient | rattana | demo1234 | ผู้ป่วย Rattana |
| patient | krit | demo1234 | ผู้ป่วย Krit |
| patient | wichai | demo1234 | ผู้ป่วย Wichai |

---

## 5 Patients จาก Seed

| ชื่อ | Care Level | Room | อุปกรณ์ |
|------|------------|------|---------|
| Emika | critical | ICU-101 | wheelchair + Polar H10 |
| Somchai | special | Ward-A | wheelchair + Polar H10 |
| Rattana | normal | Ward-B | wheelchair |
| Krit | normal | Ward-C | wheelchair |
| Wichai | normal | Garden-1 | wheelchair |

---

## Test Cases

### 1. Login Happy Path (ทุก Role)
- **Given:** ไม่มี session
- **When:** login ด้วย credentials ที่ถูกต้อง
- **Then:** redirect ไปยัง role-specific home
- **Screenshot:** `screenshots/{role}-login-success.png`

### 2. Patient Dashboard + SOS
- **Given:** ผู้ป่วย logged in
- **When:** เปิดหน้า /patient
- **Then:** เห็น Care Roadmap + SOS Hero button
- **Screenshot:** `screenshots/patient-dashboard.png`

### 3. Observer Elder UX
- **Given:** observer logged in
- **When:** เปิดหน้า /observer
- **Then:** เห็น NextActionHero (ใหญ่ อ่านง่าย)
- **Screenshot:** `screenshots/observer-dashboard.png`

### 4. Head Nurse Situation Banner
- **Given:** head_nurse logged in มี alerts/tasks
- **When:** เปิดหน้า /head-nurse
- **Then:** เห็น 4 tiles (alerts/on-duty/at-risk/unassigned)
- **Screenshot:** `screenshots/headnurse-dashboard.png`

### 5. Supervisor Health Queue
- **Given:** supervisor logged in
- **When:** เปิดหน้า /supervisor
- **Then:** เห็น queue card ด้วย assigned tasks
- **Screenshot:** `screenshots/supervisor-dashboard.png`

### 6. Sidebar "More" Menu (ทุก non-admin role)
- **Given:** logged in เป็น head_nurse/observer/supervisor/patient
- **When:** กด "More" ใน sidebar
- **Then:** secondary nav items แสดง
- **Screenshot:** `screenshots/{role}-more-menu.png`

### 7. i18n TH Toggle
- **Given:** logged in เป็นใดก็ได้
- **When:** เพิ่ม `?ws_locale=th` ใน URL
- **Then:** UI แสดงภาษาไทย
- **Screenshot:** `screenshots/{role}-thai-locale.png`

### 8. EaseAI FAB (Patient + Observer)
- **Given:** patient หรือ observer logged in
- **When:** เปิด dashboard
- **Then:** เห็น floating EaseAI button
- **Screenshot:** `screenshots/{role}-easeai-fab.png`

### 9. Access Control — Cross Role
- **Given:** observer logged in
- **When:** ไปที่ `/admin/users`
- **Then:** redirect ไปหน้าของตัวเอง (ไม่เห็น admin UI)

### 10. Simulated Hardware — Vitals Flow
- **Given:** simulator รัน + 5 patients active
- **When:** รอ 30 วินาที
- **Then:** vitals แสดงในหน้า floorplan/monitoring
- **Screenshot:** `screenshots/vitals-live.png`

---

## Simulator Events

ใช้ `sim_controller.py` ผ่าน MQTT:

```bash
docker compose -f docker-compose.sim.yml exec wheelsense-simulator \
  python sim_controller.py --routine --workspace-id 1
```

หรือ inject เฉพาะเหตุการณ์:
```bash
# Inject fall event for patient Emika (id=1)
docker compose -f docker-compose.sim.yml exec wheelsense-simulator \
  python -c "
import paho.mqtt.publish as publish
import json
payload = json.dumps({
    'workspace_id': 1,
    'command': 'inject_fall',
    'patient_id': 1
})
publish.single('WheelSense/sim/control', payload, hostname='mosquitto')
"
```

---

## Automation Strategy

1. **Pre-test:** ตรวจสอบ simulator service running
2. **Each test:**
   - login → screenshot → logout
3. **Post-test:** รวม screenshots เป็น artifact

## Commands

```bash
# รัน E2E ทั้งหมด
cd e2e && npx playwright test redesign.spec.ts --headed

# รันเฉพาะบทบาทหนึ่ง
npx playwright test redesign.spec.ts --grep "Head Nurse"

# อัปเดต snapshots
npx playwright test redesign.spec.ts --update-snapshots
```

---

## Artifacts

- Screenshots: `e2e/screenshots/`
- Test reports: `e2e/test-results/`
- Trace files: `e2e/test-results/*/trace.zip`
