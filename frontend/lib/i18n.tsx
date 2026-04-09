"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   WheelSense i18n — lightweight EN/TH translation system
   ═══════════════════════════════════════════════════════════════════════════ */

export type Locale = "en" | "th";

const STORAGE_KEY = "ws_locale";

function maybeRepairMojibake(input: string): string {
  if (!input || !/(?:Ã|Â|â|à)/.test(input)) return input;
  try {
    const bytes = Uint8Array.from(
      Array.from(input, (ch) => ch.charCodeAt(0) & 0xff),
    );
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    if (!decoded || decoded.includes("\uFFFD")) return input;
    const before = (input.match(/(?:Ã|Â|â|à)/g) ?? []).length;
    const after = (decoded.match(/(?:Ã|Â|â|à)/g) ?? []).length;
    if (after >= before && !/[ก-๙…—•·]/.test(decoded)) return input;
    return decoded;
  } catch {
    return input;
  }
}

/* ── Translation dictionary ──────────────────────────────────────────────── */

const translations = {
  // ── Navigation ────────────────────────────────────────────────────────
  "nav.dashboard": { en: "Dashboard", th: "แดชบอร์ด" },
  "nav.patients": { en: "Patients", th: "ผู้ป่วย" },
  "nav.devices": { en: "Devices", th: "อุปกรณ์" },
  "nav.monitoring": { en: "Monitoring", th: "ติดตามตำแหน่ง" },
  "nav.vitals": { en: "Vitals", th: "สัญญาณชีพ" },
  "nav.alerts": { en: "Alerts", th: "การแจ้งเตือน" },
  "nav.timeline": { en: "Timeline", th: "ไทม์ไลน์" },
  "nav.caregivers": { en: "Staff", th: "บุคคลากร" },
  "nav.facilities": { en: "Facilities", th: "สถานที่" },
  "nav.profile": { en: "Profile", th: "โปรไฟล์" },
  "nav.messages": { en: "Messages", th: "ข้อความ" },
  "nav.staff": { en: "Staff", th: "บุคลากร" },
  "nav.reports": { en: "Reports", th: "รายงาน" },
  "nav.floorplans": { en: "Floorplans", th: "ผังอาคาร" },
  "nav.users": { en: "Users & roles", th: "ผู้ใช้และสิทธิ์" },
  "nav.auditLog": { en: "Audit log", th: "บันทึกการตรวจสอบ" },
  "nav.mlCalibration": { en: "ML calibration", th: "ปรับเทียบ ML" },
  "nav.specialists": { en: "Specialists", th: "แพทย์เฉพาะทาง" },
  "nav.prescriptions": { en: "Prescriptions", th: "ใบสั่งยา" },
  "nav.pharmacy": { en: "Pharmacy", th: "เภสัชกรรม" },
  "nav.roomsMap": { en: "Rooms & Map", th: "ห้องและแผนที่" },
  "nav.settings": { en: "Settings", th: "การตั้งค่า" },
  "nav.myAccount": { en: "Account Management", th: "จัดการบัญชี" },
  "nav.emergencyMap": { en: "Emergency Map", th: "แผนที่ฉุกเฉิน" },
  "nav.tasksDirectives": { en: "Tasks & Directives", th: "งานและคำสั่ง" },
  "nav.observer.zone": { en: "Zone dashboard", th: "แดชบอร์ดโซน" },
  "nav.observer.myPatients": { en: "My patients", th: "ผู้ป่วยของฉัน" },
  "nav.observer.deviceStatus": { en: "Device status", th: "สถานะอุปกรณ์" },

  // ── Sidebar categories ────────────────────────────────────────────────
  "nav.category.care": { en: "CARE MANAGEMENT", th: "การดูแลผู้ป่วย" },
  "nav.category.operations": { en: "OPERATIONS", th: "การดำเนินงาน" },
  "nav.category.admin": { en: "ADMINISTRATION", th: "การจัดการ" },

  // ── Auth ──────────────────────────────────────────────────────────────
  "auth.signIn": { en: "Sign In", th: "เข้าสู่ระบบ" },
  "auth.signInDesc": {
    en: "Enter your credentials to access the platform",
    th: "กรอกชื่อผู้ใช้และรหัสผ่านเพื่อเข้าสู่ระบบ",
  },
  "auth.username": { en: "Username", th: "ชื่อผู้ใช้" },
  "auth.password": { en: "Password", th: "รหัสผ่าน" },
  "auth.submit": { en: "Sign In", th: "เข้าสู่ระบบ" },
  "auth.submitting": { en: "Signing in...", th: "กำลังเข้าสู่ระบบ..." },
  "auth.required": {
    en: "Please enter username and password",
    th: "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน",
  },
  "auth.failed": { en: "Login failed", th: "เข้าสู่ระบบไม่สำเร็จ" },
  "auth.logout": { en: "Sign Out", th: "ออกจากระบบ" },
  "shell.navigation": { en: "Navigation", th: "การนำทาง" },
  "shell.openNavigation": { en: "Open navigation", th: "เปิดเมนูนำทาง" },
  "shell.navigationSheetDescription": {
    en: "Workspace navigation links and account actions.",
    th: "ลิงก์นำทางในระบบและการดำเนินการบัญชี",
  },
  "shell.search": { en: "Search...", th: "ค้นหา..." },
  "shell.viewMode": { en: "View mode", th: "โหมดมุมมอง" },
  "shell.platformSubtitle": { en: "Smart Care Platform", th: "แพลตฟอร์มดูแลอัจฉริยะ" },
  "shell.roleAdmin": { en: "Admin", th: "ผู้ดูแลระบบ" },
  "shell.roleHeadNurse": { en: "Head nurse", th: "หัวหน้าพยาบาล" },
  "shell.roleSupervisor": { en: "Supervisor", th: "ผู้เชี่ยวชาญ" },
  "shell.roleObserver": { en: "Observer", th: "ผู้ดูแล" },
  "shell.rolePatient": { en: "Patient", th: "ผู้ป่วย" },
  "shell.actAsAllRoles": { en: "All roles", th: "ทุกบทบาท" },
  "shell.actAsPanelTitle": { en: "Admin act-as", th: "แอดมินรับบทเป็น" },
  "shell.actAsPanelHint": {
    en: "Optionally filter by role, search, then pick an account to act as.",
    th: "เลือกกรองตามบทบาทได้ ค้นหา แล้วเลือกบัญชีที่ต้องการรับบทเป็น",
  },
  "shell.actAsSearchPlaceholder": { en: "Search users", th: "ค้นหาผู้ใช้" },
  "shell.actAsLoading": { en: "Loading users...", th: "กำลังโหลดผู้ใช้..." },
  "shell.actAsEmpty": { en: "No active users found.", th: "ไม่พบผู้ใช้ที่ใช้งานอยู่" },
  "shell.actAsAct": { en: "Act", th: "รับบท" },
  "shell.actAsStarting": { en: "Starting", th: "กำลังเริ่ม" },
  "shell.actAsButtonLabel": { en: "Act as", th: "รับบทเป็น" },
  "shell.notifications": { en: "Notifications", th: "การแจ้งเตือน" },
  "table.noRows": { en: "No rows.", th: "ไม่มีข้อมูล" },
  "table.row": { en: "row", th: "แถว" },
  "table.rows": { en: "rows", th: "แถว" },
  "table.previous": { en: "Previous", th: "ก่อนหน้า" },
  "table.next": { en: "Next", th: "ถัดไป" },

  // ── Dashboard ────────────────────────────────────────────────────────
  "dash.title": { en: "Dashboard", th: "แดชบอร์ด" },
  "dash.subtitle": {
    en: "WheelSense system overview",
    th: "ภาพรวมระบบ WheelSense",
  },
  "dash.totalPatients": { en: "Total Patients", th: "ผู้ป่วยทั้งหมด" },
  "dash.activeAlerts": { en: "Active Alerts", th: "การแจ้งเตือนที่ใช้งานอยู่" },
  "dash.totalDevices": { en: "Total Devices", th: "อุปกรณ์ทั้งหมด" },
  "dash.vitals": { en: "Vitals", th: "สัญญาณชีพ" },
  "dash.deviceFleetByType": {
    en: "Devices by hardware",
    th: "อุปกรณ์ตามประเภทฮาร์ดแวร์",
  },
  "dash.fleetTotal": { en: "Total", th: "ทั้งหมด" },
  "dash.recentAlerts": { en: "Recent Alerts", th: "การแจ้งเตือนล่าสุด" },
  "dash.recentPatients": { en: "Recent Patients", th: "ผู้ป่วยล่าสุด" },
  "dash.viewAll": { en: "View All", th: "ดูทั้งหมด" },
  "dash.noAlerts": { en: "No active alerts", th: "ไม่มีการแจ้งเตือนที่ใช้งานอยู่" },
  "dash.noPatients": { en: "No patient data yet", th: "ยังไม่มีข้อมูลผู้ป่วย" },
  "dash.patientsCardHint": {
    en: "Residents and care profiles in this workspace.",
    th: "ผู้พักอาศัยและโปรไฟล์การดูแลในเวิร์กสเปซนี้",
  },
  "dash.devicesCardHint": {
    en: "Open the fleet to filter by hardware type or smart devices. Each row below opens that filter.",
    th: "เปิดฟลีตเพื่อกรองตามประเภทฮาร์ดแวร์หรืออุปกรณ์อัจฉริยะ แต่ละแถวด้านล่างเปิดตัวกรองนั้น",
  },
  "dash.smartDevicesReachable": {
    en: "Reachable",
    th: "ใช้งานได้",
  },
  "dash.smartDevicesNotReachable": {
    en: "Not reachable",
    th: "เชื่อมต่อไม่ได้",
  },
  "dash.deviceActivity": {
    en: "Device activity",
    th: "กิจกรรมอุปกรณ์",
  },
  "dash.deviceActivityHint": {
    en: "Recent changes to devices, pairing, and smart-home links.",
    th: "การเปลี่ยนแปลงล่าสุดของอุปกรณ์ การจับคู่ และลิงก์บ้านอัจฉริยะ",
  },
  "dash.deviceActivityEmpty": {
    en: "No device activity recorded yet.",
    th: "ยังไม่มีบันทึกกิจกรรมอุปกรณ์",
  },
  "dash.activity.registry_created": { en: "Device added", th: "เพิ่มอุปกรณ์" },
  "dash.activity.registry_updated": { en: "Device updated", th: "อัปเดตอุปกรณ์" },
  "dash.activity.command_dispatched": { en: "Command sent", th: "ส่งคำสั่ง" },
  "dash.activity.smart_created": { en: "Smart device linked", th: "เชื่อมอุปกรณ์อัจฉริยะ" },
  "dash.activity.smart_updated": { en: "Smart device updated", th: "อัปเดตอุปกรณ์อัจฉริยะ" },
  "dash.activity.smart_deleted": { en: "Smart device removed", th: "ลบอุปกรณ์อัจฉริยะ" },
  "dash.activity.device_paired": { en: "Device paired to patient", th: "จับคู่อุปกรณ์กับผู้ป่วย" },
  "dash.activity.other": { en: "Activity", th: "กิจกรรม" },

  // ── Admin dashboard ────────────────────────────────────────────────
  "admin.dashboardBadge": { en: "Operations console", th: "ศูนย์ควบคุมงาน" },
  "admin.dashboardTitle": { en: "Admin dashboard", th: "แดชบอร์ดผู้ดูแลระบบ" },
  "admin.dashboardSubtitle": {
    en: "A compact operational view for alerts, fleet health, workflow load, access links, and Copilot status.",
    th: "มุมมองปฏิบัติการแบบกระชับสำหรับการแจ้งเตือน สุขภาพอุปกรณ์ งาน ระบบเชื่อมบัญชี และสถานะ Copilot",
  },
  "admin.openPatients": { en: "Patients", th: "ผู้ป่วย" },
  "admin.openDevices": { en: "Devices", th: "อุปกรณ์" },
  "admin.openWorkflow": { en: "Workflow", th: "เวิร์กโฟลว์" },
  "admin.openSettings": { en: "Settings", th: "การตั้งค่า" },
  "admin.openAlerts": { en: "Alerts", th: "การแจ้งเตือน" },
  "admin.urgentAlerts": { en: "Urgent alerts", th: "การแจ้งเตือนเร่งด่วน" },
  "admin.urgentAlertsHint": { en: "Highest priority items that need attention now.", th: "รายการสำคัญที่สุดที่ต้องจัดการทันที" },
  "admin.noUrgentAlerts": { en: "No urgent alerts right now.", th: "ตอนนี้ไม่มีการแจ้งเตือนเร่งด่วน" },
  "admin.unlinkedPatient": { en: "Unlinked patient", th: "ผู้ป่วยที่ยังไม่เชื่อม" },
  "admin.workflowQueue": { en: "Workflow queue", th: "คิวงาน" },
  "admin.workflowQueueHint": { en: "Open tasks, active directives, and upcoming schedules.", th: "งานค้าง คำสั่งที่ใช้งานอยู่ และตารางที่กำลังจะถึง" },
  "admin.noWorkflowItems": { en: "No workflow items in the current queue.", th: "ไม่มีรายการงานในคิวปัจจุบัน" },
  "admin.noDescription": { en: "No description", th: "ไม่มีรายละเอียด" },
  "admin.fleetHealth": { en: "Fleet health", th: "สถานะอุปกรณ์" },
  "admin.fleetHealthHint": { en: "Online vs offline devices, grouped by hardware type.", th: "อุปกรณ์ออนไลน์เทียบออฟไลน์ แยกตามประเภทฮาร์ดแวร์" },
  "admin.smartFleet": { en: "Smart devices", th: "อุปกรณ์อัจฉริยะ" },
  "admin.devicesOnline": { en: "online", th: "ออนไลน์" },
  "admin.devicesOffline": { en: "offline", th: "ออฟไลน์" },
  "admin.patientCoverage": { en: "Patient coverage", th: "ความครอบคลุมผู้ป่วย" },
  "admin.roomLinkedPatients": { en: "linked to rooms", th: "เชื่อมกับห้องแล้ว" },
  "admin.coverageHint": { en: "Patient coverage is loading.", th: "กำลังโหลดความครอบคลุมผู้ป่วย" },
  "admin.criticalPatients": { en: "critical patients", th: "ผู้ป่วยวิกฤต" },
  "admin.accountLinkStatus": { en: "Account links", th: "การเชื่อมบัญชี" },
  "admin.accountLinkStatusHint": { en: "Active users, linked accounts, and inactive gaps.", th: "ผู้ใช้ที่ยังใช้งาน บัญชีที่เชื่อมแล้ว และช่องว่างที่ยังไม่ได้เชื่อม" },
  "admin.activeAccounts": { en: "Active accounts", th: "บัญชีที่ใช้งาน" },
  "admin.unlinkedAccounts": { en: "Unlinked accounts", th: "บัญชีที่ยังไม่เชื่อม" },
  "admin.caregiverLinkedAccounts": { en: "Caregiver-linked", th: "เชื่อมกับผู้ดูแล" },
  "admin.patientLinkedAccounts": { en: "Patient-linked", th: "เชื่อมกับผู้ป่วย" },
  "admin.caregiverAccessSnapshot": { en: "Accounts tied to caregiver profiles.", th: "บัญชีที่ผูกกับโปรไฟล์ผู้ดูแล" },
  "admin.patientLinkSnapshot": { en: "Accounts tied to patient profiles.", th: "บัญชีที่ผูกกับโปรไฟล์ผู้ป่วย" },
  "admin.alertsActive": { en: "active", th: "ใช้งานอยู่" },
  "admin.alertsResolved": { en: "resolved", th: "ปิดแล้ว" },
  "admin.accountLinkFallback": { en: "Account-link summary will appear after users load.", th: "สรุปการเชื่อมบัญชีจะแสดงเมื่อโหลดผู้ใช้เสร็จ" },
  "admin.aiShortcutTitle": { en: "AI / Copilot", th: "AI / Copilot" },
  "admin.aiShortcutHint": { en: "Connection status and the live model count.", th: "สถานะการเชื่อมต่อและจำนวนโมเดลที่ใช้งานได้" },
  "admin.copilotStatus": { en: "Copilot status", th: "สถานะ Copilot" },
  "admin.copilotModels": { en: "models", th: "โมเดล" },
  "admin.copilotModelHint": { en: "Model status will appear after Copilot connects.", th: "สถานะโมเดลจะแสดงหลัง Copilot เชื่อมต่อ" },
  "admin.connected": { en: "Connected", th: "เชื่อมต่อแล้ว" },
  "admin.notConnected": { en: "Not connected", th: "ยังไม่เชื่อมต่อ" },
  "admin.connectedButModelsUnavailable": {
    en: "Connected, but no models are available.",
    th: "เชื่อมต่อแล้ว แต่ยังไม่มีโมเดลให้ใช้งาน",
  },
  "admin.copilotModelCountHint": { en: "Open AI settings to reconnect or refresh models.", th: "เปิดการตั้งค่า AI เพื่อเชื่อมใหม่หรือรีเฟรชโมเดล" },
  "admin.openAiSettings": { en: "Open AI settings", th: "เปิดการตั้งค่า AI" },
  "admin.recentPatients": { en: "Recent patients", th: "ผู้ป่วยล่าสุด" },
  "admin.recentPatientsHint": { en: "The latest records in this workspace.", th: "รายการล่าสุดในพื้นที่ทำงานนี้" },
  "admin.roomLinked": { en: "room linked", th: "เชื่อมกับห้องแล้ว" },
  "admin.noPatients": { en: "No patient data yet.", th: "ยังไม่มีข้อมูลผู้ป่วย" },
  "admin.activityFeed": { en: "Activity feed", th: "ฟีดกิจกรรม" },
  "admin.activityFeedHint": { en: "Latest device events and pairing changes.", th: "เหตุการณ์อุปกรณ์และการจับคู่ล่าสุด" },
  "admin.noActivity": { en: "No recent device activity.", th: "ยังไม่มีกิจกรรมอุปกรณ์ล่าสุด" },
  "admin.loadingDashboard": { en: "Dashboard data is still loading.", th: "ข้อมูลแดชบอร์ดยังโหลดอยู่" },

  // ── Head nurse dashboard ────────────────────────────────────────────
  "headNurse.title": { en: "Head nurse dashboard", th: "แดชบอร์ดหัวหน้าพยาบาล" },
  "headNurse.subtitle": {
    en: "A compact ward view with the highest-priority alerts, tasks, schedules, and timeline activity.",
    th: "มุมมองวอร์ดแบบกระชับที่รวมการแจ้งเตือน งาน ตาราง และไทม์ไลน์ที่สำคัญที่สุด",
  },
  "headNurse.today": { en: "Today", th: "วันนี้" },
  "headNurse.alerts": { en: "Alerts", th: "การแจ้งเตือน" },
  "headNurse.tasks": { en: "Tasks", th: "งาน" },
  "headNurse.timeline": { en: "Timeline", th: "ไทม์ไลน์" },
  "headNurse.totalPatients": { en: "Patients", th: "ผู้ป่วย" },
  "headNurse.onDutyHint": { en: "care staff on duty", th: "เจ้าหน้าที่เวร" },
  "headNurse.activeAlerts": { en: "Active alerts", th: "การแจ้งเตือนที่ใช้งาน" },
  "headNurse.criticalAlerts": { en: "critical", th: "วิกฤต" },
  "headNurse.openTasks": { en: "Open tasks", th: "งานค้าง" },
  "headNurse.activeDirectives": { en: "active directives", th: "คำสั่งที่ใช้งานอยู่" },
  "headNurse.upcomingSchedules": { en: "Upcoming schedules", th: "ตารางถัดไป" },
  "headNurse.noVitals": { en: "No vitals", th: "ไม่มีสัญญาณชีพ" },
  "headNurse.priorityAlerts": { en: "Priority alerts", th: "การแจ้งเตือนสำคัญ" },
  "headNurse.priorityAlertsHint": { en: "The first issues to resolve.", th: "ประเด็นแรกที่ควรจัดการ" },
  "headNurse.priorityTasks": { en: "Priority tasks", th: "งานสำคัญ" },
  "headNurse.priorityTasksHint": { en: "Tasks sorted by urgency and due time.", th: "งานเรียงตามความเร่งด่วนและเวลาครบกำหนด" },
  "headNurse.scheduleSnapshot": { en: "Schedule snapshot", th: "ภาพรวมตาราง" },
  "headNurse.scheduleSnapshotHint": { en: "The next rounds and scheduled activities.", th: "รอบและกิจกรรมที่กำลังจะถึง" },
  "headNurse.timelineSnapshot": { en: "Timeline snapshot", th: "ภาพรวมไทม์ไลน์" },
  "headNurse.timelineSnapshotHint": { en: "Recent ward activity at a glance.", th: "กิจกรรมล่าสุดของวอร์ดแบบรวบรัด" },
  "headNurse.noAlerts": { en: "No alerts in the current view.", th: "ไม่มีการแจ้งเตือนในมุมมองนี้" },
  "headNurse.noTasks": { en: "No tasks in the current view.", th: "ไม่มีงานในมุมมองนี้" },
  "headNurse.noSchedules": { en: "No schedules in the current view.", th: "ไม่มีตารางในมุมมองนี้" },
  "headNurse.noTimeline": { en: "No timeline events in the current view.", th: "ไม่มีเหตุการณ์ในมุมมองนี้" },
  "headNurse.unitWide": { en: "Unit-wide", th: "ทั้งหน่วย" },
  "headNurse.alertsHint": { en: "Active alert list.", th: "รายการแจ้งเตือนที่ใช้งาน" },
  "headNurse.tasksHint": { en: "Open task list.", th: "รายการงานค้าง" },
  "headNurse.timelineHint": { en: "Latest recorded events.", th: "เหตุการณ์ล่าสุดที่บันทึกไว้" },
  "headNurse.noDetails": { en: "No details", th: "ไม่มีรายละเอียด" },
  "headNurse.noDueDate": { en: "No due time", th: "ยังไม่กำหนดเวลา" },
  "headNurse.loadingFallback": { en: "Ward data is still loading.", th: "ข้อมูลวอร์ดยังโหลดอยู่" },

  // ── Patients ─────────────────────────────────────────────────────────
  "patients.title": { en: "Patient Directory", th: "รายชื่อผู้ป่วย" },
  "patients.directorySubtitle": {
    en: "Use quick-find to jump to a record; filter the list below by name or patient ID.",
    th: "ใช้ค้นหาแบบด่วนเพื่อเปิดบันทึก กรองรายการด้านล่างด้วยชื่อหรือรหัสผู้ป่วย",
  },
  "patients.gridFilterHint": {
    en: "Filter the patient list",
    th: "กรองรายชื่อผู้ป่วย",
  },
  "patients.gridSearchPlaceholder": {
    en: "Filter list by name or patient ID…",
    th: "กรองรายการด้วยชื่อหรือรหัสผู้ป่วย…",
  },
  "patients.search": {
    en: "Search patients by name or ID…",
    th: "ค้นหาผู้ป่วยด้วยชื่อหรือรหัส…",
  },
  "patients.quickFindHint": {
    en: "Search by name or ID, select a patient, then open their record.",
    th: "ค้นหาด้วยชื่อหรือรหัส เลือกผู้ป่วย แล้วกดเปิดบันทึก",
  },
  "patients.quickFindPlaceholder": {
    en: "Search by name or ID…",
    th: "ค้นหาด้วยชื่อหรือรหัส…",
  },
  "patients.quickFindListLabel": {
    en: "Choose a patient",
    th: "เลือกผู้ป่วย",
  },
  "patients.quickFindNoMatch": {
    en: "No patients match this search.",
    th: "ไม่พบผู้ป่วยที่ตรงกับการค้นหา",
  },
  "patients.quickFindClear": {
    en: "Clear search",
    th: "ล้างการค้นหา",
  },
  "patients.openPatientRecord": {
    en: "Open Profile",
    th: "เปิดหน้าโปรไฟล์"
  },
  "patients.listNoMatches": {
    en: "No patients match your filter.",
    th: "ไม่มีผู้ป่วยที่ตรงกับตัวกรอง",
  },
  "patients.allPatients": {
    en: "All patients",
    th: "ผู้ป่วยทั้งหมด",
  },
  "patients.addNew": { en: "Add Patient", th: "เพิ่มผู้ป่วย" },
  "patients.empty": {
    en: "No patients found",
    th: "ไม่พบข้อมูลผู้ป่วย",
  },
  "patients.age": { en: "Age", th: "อายุ" },
  "patients.years": { en: "years", th: "ปี" },
  "patients.careLevel": { en: "Care Level", th: "ระดับการดูแล" },
  "patients.createTitle": { en: "New patient", th: "เพิ่มผู้ป่วยใหม่" },
  "patients.firstName": { en: "First name", th: "ชื่อ" },
  "patients.lastName": { en: "Last name", th: "นามสกุล" },
  "patients.nickname": { en: "Nickname", th: "ชื่อเล่น" },
  "patients.createSubmit": { en: "Create", th: "สร้าง" },
  "patients.createCancel": { en: "Cancel", th: "ยกเลิก" },
  "patients.createError": {
    en: "Could not create patient",
    th: "ไม่สามารถสร้างผู้ป่วยได้",
  },
  "patients.nameRequired": {
    en: "First and last name are required",
    th: "กรุณากรอกชื่อและนามสกุล",
  },
  "patients.formSectionIdentity": { en: "Identity", th: "ข้อมูลตัวตน" },
  "patients.formSectionPhysical": { en: "Physical metrics", th: "ข้อมูลร่างกาย" },
  "patients.formSectionMedical": { en: "Medical history", th: "ประวัติทางการแพทย์" },
  "patients.formSectionSurgeries": { en: "Past surgeries", th: "ประวัติการผ่าตัด" },
  "patients.formSectionMedications": { en: "Medications", th: "ยาที่ใช้" },
  "patients.formSectionEmergency": { en: "Emergency contact", th: "ผู้ติดต่อฉุกเฉิน" },
  "patients.formSectionNotes": { en: "Clinical notes", th: "บันทึกเพิ่มเติม" },
  "patients.dateOfBirth": { en: "Date of birth", th: "วันเกิด" },
  "patients.gender": { en: "Gender", th: "เพศ" },
  "patients.genderUnset": { en: "Not specified", th: "ไม่ระบุ" },
  "patients.genderMale": { en: "Male", th: "ชาย" },
  "patients.genderFemale": { en: "Female", th: "หญิง" },
  "patients.genderOther": { en: "Other", th: "อื่นๆ" },
  "patients.mobilityType": { en: "Mobility", th: "การเคลื่อนไหว" },
  "patients.heightCm": { en: "Height (cm)", th: "ส่วนสูง (ซม.)" },
  "patients.weightKg": { en: "Weight (kg)", th: "น้ำหนัก (กก.)" },
  "patients.bloodType": { en: "Blood type", th: "หมู่เลือด" },
  "patients.chronicConditionsHint": {
    en: "Chronic conditions (comma or newline separated)",
    th: "โรคเรื้อรัง (คั่นด้วยจุลภาคหรือขึ้นบรรทัดใหม่)",
  },
  "patients.chronicPlaceholder": {
    en: "e.g. Hypertension, Type 2 Diabetes",
    th: "เช่น ความดันโลหิตสูง เบาหวานชนิดที่ 2",
  },
  "patients.allergiesHint": {
    en: "Allergies (comma or newline separated)",
    th: "แพ้ยา/อาหาร (คั่นด้วยจุลภาคหรือขึ้นบรรทัดใหม่)",
  },
  "patients.allergiesPlaceholder": {
    en: "e.g. Penicillin",
    th: "เช่น เพนิซิลลิน",
  },
  "patients.surgeryProcedure": { en: "Procedure", th: "หัตถการ" },
  "patients.surgeryFacility": { en: "Hospital / facility", th: "โรงพยาบาล / สถานที่" },
  "patients.surgeryYear": { en: "Year", th: "ปี" },
  "patients.addSurgeryRow": { en: "Add surgery", th: "เพิ่มการผ่าตัด" },
  "patients.medName": { en: "Medication", th: "ชื่อยา" },
  "patients.medDosage": { en: "Dosage", th: "ขนาดยา" },
  "patients.medFrequency": { en: "Frequency", th: "ความถี่" },
  "patients.medInstructions": { en: "Schedule / instructions", th: "เวลา / คำแนะนำ" },
  "patients.medInstructionsPlaceholder": {
    en: "e.g. 8:00 AM with meals",
    th: "เช่น 8:00 น. หลังอาหาร",
  },
  "patients.addMedicationRow": { en: "Add medication", th: "เพิ่มรายการยา" },
  "patients.removeRow": { en: "Remove", th: "ลบ" },
  "patients.ecName": { en: "Contact name", th: "ชื่อผู้ติดต่อ" },
  "patients.ecRelationship": { en: "Relationship", th: "ความสัมพันธ์" },
  "patients.ecRelationshipPlaceholder": { en: "e.g. Daughter", th: "เช่น บุตรสาว" },
  "patients.ecPhone": { en: "Phone", th: "โทรศัพท์" },
  "patients.detailAbout": { en: "About", th: "เกี่ยวกับ" },
  "patients.detailPatientId": { en: "Patient ID", th: "รหัสผู้ป่วย" },
  "patients.detailDob": { en: "Date of birth", th: "วันเกิด" },
  "patients.detailBmi": { en: "BMI", th: "ดัชนีมวลกาย" },
  "patients.bmiNormal": { en: "Normal", th: "ปกติ" },
  "patients.bmiUnderweight": { en: "Underweight", th: "น้ำหนักต่ำ" },
  "patients.bmiOverweight": { en: "Overweight", th: "น้ำหนักเกิน" },
  "patients.bmiObese": { en: "Obese", th: "อ้วน" },
  "patients.sectionChronic": { en: "Chronic conditions", th: "โรคเรื้อรัง" },
  "patients.sectionAllergies": { en: "Allergies", th: "การแพ้" },
  "patients.sectionSurgeries": { en: "Past surgeries", th: "ประวัติการผ่าตัด" },
  "patients.sectionLinkedAccounts": {
    en: "Linked portal accounts",
    th: "บัญชีผู้ใช้ที่ผูกกับผู้ป่วย",
  },
  "patients.linkedAccountsEmpty": {
    en: "No login account linked to this patient record.",
    th: "ยังไม่มีบัญชีเข้าระบบที่ผูกกับผู้ป่วยรายนี้",
  },
  "patientPortal.previewBanner": {
    en: "Admin preview — viewing the patient app as this record.",
    th: "โหมดดูตัวอย่าง (แอดมิน) — แสดงหน้าผู้ป่วยแบบเรคคอร์ดนี้",
  },
  "patientPortal.previewClear": { en: "Exit preview", th: "ออกจากโหมดดูตัวอย่าง" },
  "patientPortal.choosePatient": {
    en: "Choose a patient to preview the portal",
    th: "เลือกผู้ป่วยเพื่อดูหน้าพอร์ทัล",
  },
  "patientPortal.adminPickHint": {
    en: "Select a patient below or add ?previewAs= and the patient ID to the URL.",
    th: "เลือกผู้ป่วยด้านล่าง หรือเพิ่ม ?previewAs= ตามด้วยรหัสผู้ป่วยใน URL",
  },
  "patients.sectionMeds": { en: "Current medications", th: "ยาปัจจุบัน" },
  "patients.activeMedsBadge": { en: "active", th: "รายการ" },
  "patients.room": { en: "Room", th: "ห้อง" },
  "patients.callContact": { en: "Call contact", th: "โทรหาผู้ติดต่อ" },
  "patients.noEmergencyContact": {
    en: "No emergency contact on file",
    th: "ยังไม่มีผู้ติดต่อฉุกเฉิน",
  },
  "patients.backToList": { en: "Back to patient list", th: "กลับไปรายชื่อผู้ป่วย" },
  "patients.latestVitals": { en: "Latest vitals", th: "สัญญาณชีพล่าสุด" },
  "patients.alertsSection": { en: "Alerts", th: "การแจ้งเตือน" },
  "patients.timelineSection": { en: "Activity timeline", th: "ไทม์ไลน์กิจกรรม" },
  "patients.devicesSection": { en: "Linked devices", th: "อุปกรณ์ที่เชื่อม" },
  "patients.editPatient": { en: "Edit patient", th: "แก้ไขผู้ป่วย" },
  "patients.editTitle": { en: "Edit patient record", th: "แก้ไขข้อมูลผู้ป่วย" },
  "patients.editRoomDevices": { en: "Room & devices", th: "ห้องและอุปกรณ์" },
  "patients.noRoom": { en: "No room assigned", th: "ยังไม่ระบุห้อง" },
  "patients.searchRoomsByNameFloorOrId": {
    en: "Search rooms by name, floor, or ID…",
    th: "ค้นหาห้องด้วยชื่อ ชั้น หรือรหัส…",
  },
  "patients.selectRoom": { en: "Select room…", th: "เลือกห้อง…" },
  "patients.noRoomMatches": {
    en: "No rooms match this search.",
    th: "ไม่พบห้องที่ตรงกับการค้นหานี้",
  },
  "patients.roomSelected": { en: "Selected room", th: "ห้องที่เลือก" },
  "patients.accountStatus": { en: "Record status", th: "สถานะบันทึก" },
  "patients.activePatient": { en: "Patient is active", th: "ผู้ป่วยใช้งานอยู่" },
  "patients.unlinkDevice": { en: "Unlink", th: "ยกเลิกการเชื่อม" },
  "patients.unlinkConfirm": {
    en: "Remove this device link from the patient?",
    th: "ยกเลิกการเชื่อมอุปกรณ์นี้กับผู้ป่วยหรือไม่?",
  },
  "patients.selectDevice": { en: "Select device…", th: "เลือกอุปกรณ์…" },
  "patients.deviceLinkHint": {
    en: "Search by name, ID, or type; select a row, choose a role, then link.",
    th: "ค้นด้วยชื่อ รหัส หรือประเภท เลือกแถว เลือกบทบาท แล้วกดเชื่อม",
  },
  "patients.deviceLinkHintTwoStep": {
    en: "1) Choose sensor type. 2) Search by name or ID, pick from the list, then link.",
    th: "1) เลือกประเภทเซนเซอร์ 2) ค้นด้วยชื่อหรือรหัส เลือกจากรายการ แล้วกดเชื่อม",
  },
  "patients.sensorTypeStep": { en: "1. Sensor type", th: "1. ประเภทเซนเซอร์" },
  "patients.sensorTypeLabel": { en: "Sensor type", th: "ประเภทเซนเซอร์" },
  "patients.sensorWheelchair": { en: "Wheelchair", th: "รถเข็น" },
  "patients.sensorPolar": { en: "Polar", th: "Polar" },
  "patients.sensorMobile": { en: "Mobile", th: "มือถือ" },
  "patients.sensorSearchStep": { en: "2. Find device", th: "2. ค้นหาอุปกรณ์" },
  "patients.searchDevicesByNameOrId": {
    en: "Search devices by name or ID…",
    th: "ค้นหาอุปกรณ์ด้วยชื่อหรือรหัส…",
  },
  "patients.noDevicesInSensorCategory": {
    en: "No unlinked devices of this type in the workspace. Try another sensor type.",
    th: "ไม่มีอุปกรณ์ประเภทนี้ที่ยังไม่เชื่อม ลองเปลี่ยนประเภทเซนเซอร์",
  },
  "patients.deviceRoleLinksAs": { en: "API role", th: "บทบาทที่ส่งไป API" },
  "patients.searchDevices": {
    en: "Search devices to link…",
    th: "ค้นหาอุปกรณ์ที่จะเชื่อม…",
  },
  "patients.noDeviceMatches": {
    en: "No devices match this search.",
    th: "ไม่พบอุปกรณ์ที่ตรงกับการค้นหานี้",
  },
  "patients.allDevicesLinked": {
    en: "All workspace devices are already linked to this patient.",
    th: "อุปกรณ์ในพื้นที่นี้เชื่อมกับผู้ป่วยนี้ครบแล้ว",
  },
  "patients.deviceRole": { en: "Role", th: "บทบาท" },
  "patients.deviceSelected": { en: "Selected device", th: "อุปกรณ์ที่เลือก" },
  "patients.clearDeviceSelection": { en: "Clear selection", th: "ล้างการเลือก" },
  "patients.addDeviceLink": { en: "Link device", th: "เชื่อมอุปกรณ์" },
  "patients.saveChanges": { en: "Save changes", th: "บันทึกการแก้ไข" },
  "patients.saveError": {
    en: "Could not save patient. Check fields and try again.",
    th: "บันทึกไม่สำเร็จ ตรวจสอบข้อมูลแล้วลองอีกครั้ง",
  },
  "patients.deviceUnlinkError": {
    en: "Could not unlink device.",
    th: "ยกเลิกการเชื่อมอุปกรณ์ไม่สำเร็จ",
  },
  "patients.deviceLinkError": {
    en: "Could not link device.",
    th: "เชื่อมอุปกรณ์ไม่สำเร็จ",
  },
  "patients.contactType": { en: "Contact type", th: "ประเภทผู้ติดต่อ" },
  "patients.ecEmail": { en: "Email", th: "อีเมล" },
  "patients.contactNotes": { en: "Contact notes", th: "บันทึกผู้ติดต่อ" },
  "patients.statusActive": { en: "Active", th: "ใช้งาน" },
  "patients.statusInactive": { en: "Inactive", th: "ไม่ใช้งาน" },
  "patients.ecRequiredForSave": {
    en: "Primary contact requires both name and phone.",
    th: "ผู้ติดต่อหลักต้องมีทั้งชื่อและเบอร์โทร",
  },

  // ── Devices ──────────────────────────────────────────────────────────
  "devices.title": { en: "Device Fleet", th: "อุปกรณ์ทั้งหมด" },
  "devices.subtitle": {
    en: "Filter by type, search by name or ID. URLs support ?tab= for bookmarks.",
    th: "กรองตามประเภท ค้นหาตามชื่อหรือรหัส ใช้ ?tab= ใน URL เพื่อบุ๊กมาร์ก",
  },
  "devices.search": { en: "Search devices...", th: "ค้นหาอุปกรณ์..." },
  "devices.searchSmartDevice": {
    en: "Search smart device name, entity id, or type…",
    th: "ค้นหาชื่ออุปกรณ์อัจฉริยะ รหัสเอนทิตี หรือประเภท…",
  },
  "devices.online": { en: "Online", th: "ออนไลน์" },
  "devices.offline": { en: "Offline", th: "ออฟไลน์" },
  "devices.lastSeen": { en: "Last seen", th: "เห็นล่าสุด" },
  "devices.empty": { en: "No devices found", th: "ไม่พบอุปกรณ์" },

  "smartDevices.title": {
    en: "Smart device mappings",
    th: "การแมปอุปกรณ์อัจฉริยะ",
  },
  "smartDevices.subtitle": {
    en: "Read-only list of Home Assistant entities linked to this workspace. Changes are made in Settings or via the API.",
    th: "รายการแบบอ่านอย่างเดียวของเอนทิตี Home Assistant ที่เชื่อมกับเวิร์กสเปซนี้",
  },
  "smartDevices.empty": {
    en: "No smart devices linked yet.",
    th: "ยังไม่มีอุปกรณ์อัจฉริยะที่เชื่อมไว้",
  },
  "smartDevices.name": { en: "Name", th: "ชื่อ" },
  "smartDevices.entity": { en: "HA entity", th: "เอนทิตี HA" },
  "smartDevices.type": { en: "Type", th: "ประเภท" },
  "smartDevices.room": { en: "Room ID", th: "รหัสห้อง" },
  "smartDevices.status": { en: "Status", th: "สถานะ" },
  "smartDevices.active": { en: "Active", th: "ใช้งาน" },
  "smartDevices.inactive": { en: "Inactive", th: "ปิดใช้งาน" },
  "devicesDetail.tabAll": { en: "All", th: "ทั้งหมด" },
  "devicesDetail.tabWheelchair": { en: "Wheelchair", th: "รถเข็น" },
  "devicesDetail.tabNode": { en: "Node", th: "โหนด" },
  "devicesDetail.tabPolar": { en: "Polar / Sense", th: "Polar / Sense" },
  "devicesDetail.tabMobile": { en: "Mobile phone", th: "มือถือ" },
  "devicesDetail.tabSmartDevice": { en: "Smart device", th: "อุปกรณ์อัจฉริยะ" },
  "devicesDetail.hardware": { en: "Hardware", th: "ฮาร์ดแวร์" },
  "devicesDetail.legacyType": { en: "Registry type", th: "ประเภทในระบบ" },
  "devicesDetail.identity": { en: "Identity", th: "ตัวตน" },
  "devicesDetail.displayName": { en: "Display name", th: "ชื่อที่แสดง" },
  "devicesDetail.mapRoom": { en: "Map & room", th: "แผนที่และห้อง" },
  "devicesDetail.noRoom": { en: "No room linked (set node on a room)", th: "ยังไม่ผูกห้อง" },
  "devicesDetail.predicted": { en: "Predicted", th: "คาดตำแหน่ง" },
  "devicesDetail.openMonitoring": { en: "Open monitoring & maps", th: "เปิดการติดตามและแผนที่" },
  "devicesDetail.realtime": { en: "Realtime", th: "เรียลไทม์" },
  "devicesDetail.battery": { en: "Battery", th: "แบตเตอรี่" },
  "devicesDetail.patient": { en: "Linked patient", th: "ผู้ป่วยที่ผูก" },
  "devicesDetail.noPatient": { en: "No patient linked", th: "ยังไม่ผูกผู้ป่วย" },
  "devicesDetail.caregiver": { en: "Linked caregiver", th: "ผู้ดูแลที่ผูก" },
  "devicesDetail.noCaregiver": { en: "No caregiver linked", th: "ยังไม่ผูกผู้ดูแล" },
  "devicesDetail.networkConfig": { en: "Network config (saved + MQTT push)", th: "ค่าเครือข่าย (บันทึก + ส่ง MQTT)" },
  "devicesDetail.searchPatient": {
    en: "Search patients by name or ID…",
    th: "ค้นหาผู้ป่วยด้วยชื่อหรือรหัส…",
  },
  "devicesDetail.linkPatientHint": {
    en: "Search by name or ID, select a patient, then link.",
    th: "ค้นด้วยชื่อหรือรหัส เลือกผู้ป่วย แล้วกดเชื่อม",
  },
  "devicesDetail.noPatientsMatchSearch": {
    en: "No patients match this search.",
    th: "ไม่พบผู้ป่วยที่ตรงกับการค้นหานี้",
  },
  "devicesDetail.patientLinkError": {
    en: "Could not link patient.",
    th: "เชื่อมผู้ป่วยไม่สำเร็จ",
  },
  "devicesDetail.patientUnlinkError": {
    en: "Could not unlink patient.",
    th: "ยกเลิกการเชื่อมผู้ป่วยไม่สำเร็จ",
  },
  "devicesDetail.selectPatient": { en: "Select patient", th: "เลือกผู้ป่วย" },
  "devicesDetail.selectRoom": { en: "Select room", th: "เลือกห้อง" },
  "devicesDetail.selectSsid": { en: "Select SSID", th: "เลือก SSID" },
  "devicesDetail.link": { en: "Link", th: "เชื่อม" },
  "devicesDetail.unlink": { en: "Unlink", th: "ยกเลิกการเชื่อม" },
  "devicesDetail.scanWifi": { en: "Scan WiFi", th: "สแกน WiFi" },
  "devicesDetail.wifiPassword": { en: "WiFi password", th: "รหัสผ่าน WiFi" },
  "devicesDetail.lastScan": { en: "Last scan", th: "สแกนล่าสุด" },
  "devicesDetail.wifiScanRequested": { en: "WiFi scan requested.", th: "ส่งคำขอสแกน WiFi แล้ว" },
  "devicesDetail.mqttBroker": { en: "MQTT broker", th: "MQTT broker" },
  "devicesDetail.mqttUser": { en: "MQTT user", th: "ผู้ใช้ MQTT" },
  "devicesDetail.mqttPassword": { en: "MQTT password", th: "รหัสผ่าน MQTT" },
  "devicesDetail.mobileWalk": { en: "Realtime walk", th: "การเดินแบบเรียลไทม์" },
  "devicesDetail.mobileWalkHint": { en: "Derived from mobile telemetry stream.", th: "มาจากข้อมูลเทเลเมทรีของมือถือ" },
  "devicesDetail.linkedPolar": { en: "Linked Polar", th: "Polar ที่เชื่อม" },
  "devicesDetail.save": { en: "Save", th: "บันทึก" },
  "devicesDetail.pushMqtt": { en: "Push to device (MQTT)", th: "ส่งไปอุปกรณ์ (MQTT)" },
  "devicesDetail.refresh": { en: "Refresh", th: "รีเฟรช" },
  "devicesDetail.saved": { en: "Saved.", th: "บันทึกแล้ว" },
  "devicesDetail.pushed": { en: "MQTT command sent.", th: "ส่งคำสั่ง MQTT แล้ว" },
  "devicesDetail.camera": { en: "Camera (node)", th: "กล้อง (โหนด)" },
  "devicesDetail.cameraCheck": { en: "Check camera (snapshot)", th: "ทดสอบกล้อง (ภาพนิ่ง)" },
  "devicesDetail.cameraCheckSent": {
    en: "Capture requested — refresh in a few seconds.",
    th: "ขอถ่ายภาพแล้ว — รีเฟรชอีกครั้งในไม่กี่วินาที",
  },
  "devicesDetail.latestSnapshot": { en: "Latest snapshot", th: "ภาพล่าสุด" },

  // ── Monitoring ───────────────────────────────────────────────────────
  "monitoring.title": { en: "Location Monitoring", th: "ติดตามตำแหน่ง" },
  "monitoring.subtitle": {
    en: "Real-time patient location tracking",
    th: "ติดตามตำแหน่งผู้ป่วยแบบเรียลไทม์",
  },
  "monitoring.noRooms": { en: "No rooms configured", th: "ยังไม่ได้ตั้งค่าห้อง" },
  "monitoring.empty": { en: "Empty", th: "ว่าง" },
  "monitoring.tabRooms": { en: "Rooms", th: "ห้อง" },
  "monitoring.tabFloorplans": { en: "Interactive floorplans", th: "ผังชั้นแบบโต้ตอบ" },
  "monitoring.floorPrefix": { en: "Floor", th: "ชั้น" },
  "monitoring.noFloor": { en: "No floor assigned", th: "ยังไม่ระบุชั้น" },
  "monitoring.unassignedFacility": {
    en: "Unassigned facility",
    th: "ยังไม่ได้กำหนดอาคาร",
  },
  "monitoring.typeLabel": { en: "Type", th: "ประเภท" },
  "monitoring.addRoom": { en: "Add room", th: "เพิ่มห้อง" },
  "monitoring.roomsHint": {
    en: "Assign each room to a building and floor for maps and monitoring.",
    th: "ผูกห้องกับอาคารและชั้นเพื่อใช้กับแผนที่และการติดตาม",
  },
  "monitoring.roomTypes.general": { en: "General", th: "ทั่วไป" },
  "monitoring.roomTypes.bedroom": { en: "Bedroom", th: "ห้องนอน" },
  "monitoring.roomTypes.bathroom": { en: "Bathroom", th: "ห้องน้ำ" },
  "monitoring.roomTypes.dining": { en: "Dining", th: "ห้องอาหาร" },
  "monitoring.roomTypes.therapy": { en: "Therapy", th: "กายภาพบำบัด" },
  "monitoring.roomTypes.outdoor": { en: "Outdoor", th: "กลางแจ้ง" },
  "monitoring.roomTypes.other": { en: "Other (custom)", th: "อื่นๆ (กำหนดเอง)" },
  "monitoring.roomForm.titleCreate": { en: "New room", th: "ห้องใหม่" },
  "monitoring.roomForm.titleEdit": { en: "Edit room", th: "แก้ไขห้อง" },
  "monitoring.roomForm.close": { en: "Close", th: "ปิด" },
  "monitoring.roomForm.name": { en: "Room name", th: "ชื่อห้อง" },
  "monitoring.roomForm.description": { en: "Description", th: "คำอธิบาย" },
  "monitoring.roomForm.facility": { en: "Building / facility", th: "อาคาร / สถานที่" },
  "monitoring.roomForm.floor": { en: "Floor", th: "ชั้น" },
  "monitoring.roomForm.noFacility": { en: "— None —", th: "— ไม่ระบุ —" },
  "monitoring.roomForm.noFloor": { en: "— None —", th: "— ไม่ระบุ —" },
  "monitoring.roomForm.searchFacility": {
    en: "Search building name or ID…",
    th: "ค้นหาชื่ออาคารหรือรหัส…",
  },
  "monitoring.roomForm.searchFloor": {
    en: "Search floor name, number, or ID…",
    th: "ค้นหาชื่อชั้น เลขชั้น หรือรหัส…",
  },
  "monitoring.roomForm.selectFacility": {
    en: "Building / facility list",
    th: "รายการอาคาร / สถานที่",
  },
  "monitoring.roomForm.selectFloor": {
    en: "Floor list",
    th: "รายการชั้น",
  },
  "monitoring.roomForm.noFacilityMatchesSearch": {
    en: "No buildings match your search.",
    th: "ไม่พบอาคารที่ตรงกับการค้นหา",
  },
  "monitoring.roomForm.noFloorMatchesSearch": {
    en: "No floors match your search.",
    th: "ไม่พบชั้นที่ตรงกับการค้นหา",
  },
  "monitoring.roomForm.addFacilityFirst": {
    en: "Create a facility under the Facilities tab first.",
    th: "สร้างสถานที่ในแท็บสถานที่ก่อน",
  },
  "monitoring.roomForm.noFloorsInBuilding": {
    en: "No floors in this building yet. Add floors from the Floorplans tab.",
    th: "อาคารนี้ยังไม่มีชั้น เพิ่มชั้นได้จากแท็บผังชั้น",
  },
  "monitoring.roomForm.floorMismatch": {
    en: "Current floor is not in this building — pick a floor or clear building.",
    th: "ชั้นปัจจุบันไม่อยู่ในอาคารนี้ — เลือกชั้นใหม่หรือล้างอาคาร",
  },
  "monitoring.roomForm.roomType": { en: "Room type", th: "ประเภทห้อง" },
  "monitoring.roomForm.customTypePlaceholder": {
    en: "e.g. ICU, isolation",
    th: "เช่น ICU, ห้องแยกโรค",
  },
  "monitoring.roomForm.nodeDevice": {
    en: "Node device ID (optional)",
    th: "รหัสอุปกรณ์ Node (ถ้ามี)",
  },
  "monitoring.roomForm.nodePlaceholder": {
    en: "T-SIMCam / gateway id",
    th: "รหัส T-SIMCam หรือเกตเวย์",
  },
  "monitoring.roomForm.nameRequired": { en: "Room name is required", th: "ต้องระบุชื่อห้อง" },
  "monitoring.roomForm.saveFailed": { en: "Could not save room", th: "บันทึกห้องไม่สำเร็จ" },
  "monitoring.roomForm.cancel": { en: "Cancel", th: "ยกเลิก" },
  "monitoring.roomForm.save": { en: "Save", th: "บันทึก" },
  "monitoring.roomForm.create": { en: "Create room", th: "สร้างห้อง" },
  "monitoring.roomSavedCreate": { en: "Room created", th: "สร้างห้องแล้ว" },
  "monitoring.roomSavedUpdate": { en: "Room updated", th: "อัปเดตห้องแล้ว" },

  "monitoring.flow.selectFacility": {
    en: "Select a building to manage floors, rooms, and floorplans.",
    th: "เลือกอาคารเพื่อจัดการชั้น ห้อง และผัง",
  },
  "monitoring.flow.selectFloor": {
    en: "Choose a floor to list rooms or edit the interactive map.",
    th: "เลือกชั้นเพื่อดูรายการห้องหรือแก้ไขแผนที่",
  },
  "monitoring.flow.viewList": { en: "List", th: "รายการ" },
  "monitoring.flow.viewMap": { en: "Map", th: "แผนที่" },
  "monitoring.flow.overviewFloors": { en: "{count} floors", th: "{count} ชั้น" },
  "monitoring.flow.overviewRooms": { en: "{count} rooms on this floor", th: "{count} ห้องบนชั้นนี้" },
  "monitoring.flow.overviewRoomsTotal": {
    en: "{count} rooms in this building",
    th: "{count} ห้องในอาคารนี้",
  },
  "monitoring.flow.noFloors": { en: "No floors yet — add one in facility settings.", th: "ยังไม่มีชั้น — เพิ่มได้ในหน้าสถานที่" },
  "monitoring.flow.roomDetail": { en: "Room details", th: "รายละเอียดห้อง" },
  "monitoring.flow.mapHint": {
    en: "Drag rooms on the canvas. Save to update the floorplan layout.",
    th: "ลากห้องบนแผนที่ แล้วกดบันทึกเพื่ออัปเดตผัง",
  },
  "monitoring.flow.mapLoading": { en: "Loading floor map…", th: "กำลังโหลดแผนที่ชั้น…" },

  "monitoring.ha.title": { en: "Smart devices (Home Assistant)", th: "อุปกรณ์อัจฉริยะ (Home Assistant)" },
  "monitoring.ha.pickRoom": {
    en: "Select a room to manage smart device mappings.",
    th: "เลือกห้องเพื่อจัดการการผูกอุปกรณ์อัจฉริยะ",
  },
  "monitoring.ha.empty": { en: "No devices mapped to this room.", th: "ยังไม่มีอุปกรณ์ผูกกับห้องนี้" },
  "monitoring.ha.activeLabel": { en: "Active", th: "ใช้งาน" },
  "monitoring.ha.add": { en: "Map device", th: "ผูกอุปกรณ์" },
  "monitoring.ha.entityId": { en: "Entity ID", th: "รหัส entity" },
  "monitoring.ha.name": { en: "Display name", th: "ชื่อที่แสดง" },
  "monitoring.ha.type": { en: "Type", th: "ประเภท" },
  "monitoring.ha.save": { en: "Save", th: "บันทึก" },
  "monitoring.ha.delete": { en: "Remove mapping", th: "ลบการผูก" },
  "monitoring.ha.loadFailed": { en: "Could not load devices", th: "โหลดอุปกรณ์ไม่สำเร็จ" },
  "monitoring.ha.saveFailed": { en: "Could not save device", th: "บันทึกอุปกรณ์ไม่สำเร็จ" },
  "monitoring.ha.deleteFailed": { en: "Could not remove device", th: "ลบการผูกไม่สำเร็จ" },

  // ── Account management (system auth & identity links) ────────────────
  "accountMgmt.subtitle": {
    en: "How sign-in works in this workspace, and which login account is tied to each staff or patient record.",
    th: "วิธีเข้าสู่ระบบในพื้นที่ทำงานนี้ และบัญชีล็อกอินเชื่อมกับบุคลากรหรือผู้ป่วยคนใด",
  },
  "accountMgmt.authCardTitle": { en: "Authentication in WheelSense", th: "การยืนยันตัวตนใน WheelSense" },
  "accountMgmt.authPrimary": {
    en: "Primary method: username and password. The login form uses the standard OAuth2 password flow against `/api/auth/login` and receives a JWT (Bearer token). All API calls send that token in the `Authorization` header.",
    th: "วิธีหลัก: ชื่อผู้ใช้และรหัสผ่าน ฟอร์มล็อกอินใช้ OAuth2 password ไปที่ `/api/auth/login` แล้วได้ JWT (Bearer token) ทุกคำขอ API ส่งโทเค็นใน `Authorization`",
  },
  "accountMgmt.authLinks": {
    en: "There are no separate social logins for staff or patient accounts in this build—each person is one `users` row with a role. Linking below connects that login to a Staff (caregiver) or Patient row when needed.",
    th: "ในเวอร์ชันนี้ยังไม่มีล็อกอินโซเชียลแยกสำหรับบัญชีบุคลากรหรือผู้ป่วย — แต่ละคนคือแถว `users` หนึ่งแถวพร้อมบทบาท การเชื่อมด้านล่างจะผูกการล็อกอินนั้นกับข้อมูลบุคลากร (caregiver) หรือผู้ป่วยเมื่อจำเป็น",
  },
  "accountMgmt.linkingCardTitle": { en: "Identity linking", th: "การเชื่อมตัวตน" },
  "accountMgmt.linkingBody": {
    en: "Optional `caregiver_id` and `patient_id` on a user record tie the same login to directory entries. At most one patient login can claim a given patient in this workspace.",
    th: "ฟิลด์ `caregiver_id` และ `patient_id` (ถ้ามี) ผูกบัญชีล็อกอินกับข้อมูลในระบบ ในพื้นที่ทำงานเดียวกัน ผู้ป่วยหนึ่งคนสามารถมีบัญชีล็อกอินที่ผูกได้ไม่เกินหนึ่งบัญชี",
  },
  "accountMgmt.profileCta": { en: "Open profile & preferences", th: "เปิดโปรไฟล์และการตั้งค่า" },
  "accountMgmt.tableCaption": { en: "Workspace users and identity links", th: "ผู้ใช้และการเชื่อมตัวตนในพื้นที่ทำงาน" },
  "accountMgmt.colUser": { en: "Login", th: "ล็อกอิน" },
  "accountMgmt.colRole": { en: "Role", th: "บทบาท" },
  "accountMgmt.colActive": { en: "Active", th: "ใช้งาน" },
  "accountMgmt.colStaff": { en: "Linked staff", th: "บุคลากรที่เชื่อม" },
  "accountMgmt.colPatient": { en: "Linked patient", th: "ผู้ป่วยที่เชื่อม" },
  "accountMgmt.colActions": { en: "Actions", th: "การทำงาน" },
  "accountMgmt.yes": { en: "Yes", th: "ใช่" },
  "accountMgmt.no": { en: "No", th: "ไม่" },
  "accountMgmt.none": { en: "—", th: "—" },
  "accountMgmt.editLinks": { en: "Edit links", th: "แก้การเชื่อม" },
  "accountMgmt.editTitle": { en: "Link login to records", th: "เชื่อมบัญชีล็อกอินกับข้อมูล" },
  "accountMgmt.pickStaff": { en: "Staff (caregiver)", th: "บุคลากร (caregiver)" },
  "accountMgmt.pickPatient": { en: "Patient", th: "ผู้ป่วย" },
  "accountMgmt.clearSelection": { en: "None (clear)", th: "ไม่เลือก (ล้าง)" },
  "accountMgmt.save": { en: "Save", th: "บันทึก" },
  "accountMgmt.cancel": { en: "Cancel", th: "ยกเลิก" },
  "accountMgmt.saving": { en: "Saving…", th: "กำลังบันทึก…" },
  "accountMgmt.readOnlyHint": {
    en: "You can view links; only admins and head nurses can change them.",
    th: "ดูการเชื่อมได้ แก้ไขได้เฉพาะผู้ดูแลระบบและหัวหน้าพยาบาล",
  },
  "accountMgmt.loadError": { en: "Could not load data.", th: "โหลดข้อมูลไม่สำเร็จ" },
  "accountMgmt.saveError": { en: "Could not save changes.", th: "บันทึกไม่สำเร็จ" },

  // ── Admin settings (unified) ─────────────────────────────────────────
  "settings.title": { en: "Settings", th: "การตั้งค่า" },
  "settings.subtitle": {
    en: "Profile, AI chat, and ML calibration",
    th: "โปรไฟล์ แชท AI และปรับเทียบ ML",
  },
  "settings.tabProfile": { en: "Profile", th: "โปรไฟล์" },
  "settings.tabAi": { en: "AI chat", th: "แชท AI" },
  "settings.tabMl": { en: "ML calibration", th: "ปรับเทียบ ML" },
  "settings.ai.userOverrides": { en: "Your preferences", th: "การตั้งค่าส่วนตัว" },
  "settings.ai.workspaceDefaults": {
    en: "Workspace defaults (admin)",
    th: "ค่าเริ่มต้นของพื้นที่ทำงาน (ผู้ดูแล)",
  },
  "settings.ai.provider": { en: "Provider", th: "ผู้ให้บริการ" },
  "settings.ai.model": { en: "Model", th: "โมเดล" },
  "settings.ai.saveUser": { en: "Save my settings", th: "บันทึกการตั้งค่าของฉัน" },
  "settings.ai.saveWorkspace": { en: "Save workspace defaults", th: "บันทึกค่าเริ่มต้นพื้นที่ทำงาน" },
  "settings.ai.copilotConnect": { en: "Connect GitHub", th: "เชื่อม GitHub" },
  "settings.ai.copilotStatus": { en: "Copilot connection", th: "การเชื่อม Copilot" },
  "settings.ai.copilotConnected": { en: "Connected", th: "เชื่อมแล้ว" },
  "settings.ai.copilotDisconnected": { en: "Not connected", th: "ยังไม่เชื่อม" },
  "settings.ai.enterCode": { en: "Enter this code on GitHub:", th: "ใส่รหัสนี้บน GitHub:" },
  "settings.ai.ollamaModels": { en: "Ollama models", th: "โมเดล Ollama" },
  "settings.ai.ollamaLibraryTitle": { en: "Ollama library (local disk)", th: "คลังโมเดล Ollama (ดิสก์ในเครื่อง)" },
  "settings.ai.ollamaLibrarySubtitle": {
    en: "Models listed here are what Ollama reports on this server. Use them in “Your preferences” and “Workspace defaults” when Provider is Ollama.",
    th: "รายการนี้คือโมเดลที่ Ollama รายงานบนเซิร์ฟเวอร์นี้ ใช้เลือกในค่าส่วนตัวและค่าเริ่มต้น workspace เมื่อเลือก Ollama",
  },
  "settings.ai.ollamaModelCountSuffix": { en: "installed", th: "ตัวที่ติดตั้ง" },
  "settings.ai.noOllamaInstalledSelect": {
    en: "No models yet — pull one below",
    th: "ยังไม่มีโมเดล — ดึงด้านล่างก่อน",
  },
  "settings.ai.pickInstalledPlaceholder": {
    en: "Select an installed model…",
    th: "เลือกโมเดลที่ติดตั้งแล้ว…",
  },
  "settings.ai.savedOllamaNotInstalled": {
    en: "Saved name is not in the list — pull it in the library below, then select it.",
    th: "ชื่อที่บันทึกไว้ไม่อยู่ในรายการ — ดึงโมเดลในคลังด้านล่าง แล้วค่อยเลือก",
  },
  "settings.ai.ollamaModelHintShort": {
    en: "Only models from the Ollama library below can be selected.",
    th: "เลือกได้เฉพาะโมเดลที่แสดงในคลัง Ollama ด้านล่าง",
  },
  "settings.ai.pickCopilotPlaceholder": {
    en: "Select a Copilot model…",
    th: "เลือกโมเดล Copilot…",
  },
  "settings.ai.savedCopilotNotInList": {
    en: "Saved model is not in this list — pick one of the options.",
    th: "โมเดลที่บันทึกไม่อยู่ในรายการ — เลือกจากตัวเลือกที่มี",
  },
  "settings.ai.pullModel": { en: "Pull model", th: "ดึงโมเดล" },
  "settings.ai.pullPlaceholder": { en: "e.g. gemma4:e4b", th: "เช่น gemma4:e4b" },
  "settings.ai.pullPresetLabel": { en: "Model to pull", th: "โมเดลที่จะดึง" },
  "settings.ai.pullNameRequired": {
    en: "Enter a model tag to pull.",
    th: "พิมพ์ชื่อแท็กโมเดลที่จะดึง",
  },
  "settings.ai.pullOtherModel": {
    en: "Other… (custom tag)",
    th: "อื่นๆ… (พิมพ์แท็กโมเดล)",
  },
  "settings.ai.pullDoneSuccess": { en: "Pull finished successfully.", th: "ดึงโมเดลเสร็จแล้ว" },
  "settings.ai.pullStreamError": { en: "Pull failed", th: "ดึงโมเดลไม่สำเร็จ" },
  "settings.ai.pullSucceededButEmpty": {
    en: "Pull reported success but the model list is still empty. Check that the API server and Ollama use the same host (OLLAMA_BASE_URL / Docker service name).",
    th: "ดึงสำเร็จแต่รายการโมเดลยังว่าง ตรวจสอบว่า API กับ Ollama ชี้ไปที่เดียวกัน (OLLAMA_BASE_URL / ชื่อบริการใน Docker)",
  },
  "settings.ai.pullEmptyResponse": {
    en: "Empty response from server during pull.",
    th: "ไม่ได้รับข้อมูลจากเซิร์ฟเวอร์ระหว่างดึงโมเดล",
  },

  // ── Vitals ───────────────────────────────────────────────────────────
  "vitals.title": { en: "Vital Signs", th: "สัญญาณชีพ" },
  "vitals.subtitle": {
    en: "Polar Verity Sense, mobile Polar SDK, and wheelchair BLE relay — same hardware filters as Devices (HR, R-R, SpO₂, temperature, sensor battery).",
    th: "Polar Verity Sense, Polar บนมือถือ และ BLE ผ่านรถเข็น — กรองอุปกรณ์เหมือนหน้า Devices (ชีพจร R-R SpO₂ อุณหภูมิ แบตเซ็นเซอร์)",
  },
  "vitals.empty": { en: "No vital readings", th: "ไม่มีข้อมูลสัญญาณชีพ" },
  "vitals.emptyForFilter": {
    en: "No readings for this device filter",
    th: "ไม่มีข้อมูลสำหรับตัวกรองอุปกรณ์นี้",
  },
  "vitals.loadError": { en: "Could not load vitals", th: "โหลดสัญญาณชีพไม่สำเร็จ" },
  "vitals.retry": { en: "Retry", th: "ลองอีกครั้ง" },
  "vitals.hr": { en: "Heart Rate", th: "อัตราการเต้นของหัวใจ" },
  "vitals.rr": { en: "R-R interval", th: "ช่วง R-R" },
  "vitals.spo2": { en: "SpO2", th: "SpO2" },
  "vitals.temp": { en: "Temperature", th: "อุณหภูมิ" },
  "vitals.battery": { en: "Battery", th: "แบตเตอรี่" },
  "vitals.patient": { en: "Patient", th: "ผู้ป่วย" },
  "vitals.device": { en: "Device", th: "อุปกรณ์" },
  "vitals.sourceCol": { en: "Source", th: "แหล่งข้อมูล" },
  "vitals.sourcePolarSdk": { en: "Polar mobile SDK", th: "Polar SDK บนมือถือ" },
  "vitals.sourceBlePolar": { en: "Polar via BLE relay", th: "Polar ผ่าน BLE" },
  "vitals.sourceManual": { en: "Manual entry", th: "บันทึกด้วยมือ" },
  "vitals.sourceSimulated": { en: "Simulated (demo)", th: "จำลอง (เดโม)" },
  "vitals.time": { en: "Time", th: "เวลา" },

  // ── Alerts ───────────────────────────────────────────────────────────
  "alerts.title": { en: "Alert Center", th: "ศูนย์การแจ้งเตือน" },
  "alerts.subtitle": {
    en: "Monitor and manage system alerts",
    th: "ตรวจสอบและจัดการการแจ้งเตือน",
  },
  "alerts.all": { en: "All", th: "ทั้งหมด" },
  "alerts.active": { en: "Active", th: "ใช้งานอยู่" },
  "alerts.acknowledged": { en: "Acknowledged", th: "รับทราบแล้ว" },
  "alerts.resolved": { en: "Resolved", th: "แก้ไขแล้ว" },
  "alerts.acknowledge": { en: "Acknowledge", th: "รับทราบ" },
  "alerts.resolve": { en: "Resolve", th: "แก้ไข" },
  "alerts.empty": { en: "No alerts", th: "ไม่มีการแจ้งเตือน" },

  // ── Timeline ─────────────────────────────────────────────────────────
  "timeline.title": { en: "Activity Timeline", th: "ไทม์ไลน์กิจกรรม" },
  "timeline.subtitle": {
    en: "Patient event history",
    th: "ประวัติเหตุการณ์ผู้ป่วย",
  },
  "timeline.allPatients": { en: "All Patients", th: "ผู้ป่วยทั้งหมด" },
  "timeline.empty": { en: "No events", th: "ไม่มีเหตุการณ์" },

  // ── Caregivers ───────────────────────────────────────────────────────
  "caregivers.allStaff": { en: "All staff", th: "บุคลากรทั้งหมด" },
  "caregivers.title": { en: "Staff", th: "บุคคลากร" },
  "caregivers.directorySubtitle": {
    en: "Directory of workspace staff—including observers and supervisors—with roles, zones, patient access, and contact details.",
    th: "รายชื่อบุคลากรในเวิร์กสเปซ รวมผู้ดูแลและผู้เชี่ยวชาญ พร้อมบทบาท โซน สิทธิ์เข้าถึงผู้ป่วย และข้อมูลติดต่อ",
  },
  "caregivers.search": { en: "Search staff...", th: "ค้นหาบุคคลากร..." },
  "caregivers.searchDetailed": {
    en: "Search by name, username, or specialization…",
    th: "ค้นหาด้วยชื่อ ชื่อผู้ใช้ หรือความเชี่ยวชาญ…",
  },
  "caregivers.listNoMatches": {
    en: "No staff match your search.",
    th: "ไม่มีบุคคลากรที่ตรงกับการค้นหา",
  },
  "caregivers.filterRole": { en: "Staff role", th: "บทบาทบุคลากร" },
  "caregivers.filterStatus": { en: "Status", th: "สถานะ" },
  "caregivers.clearSearchAria": {
    en: "Clear search",
    th: "ล้างการค้นหา",
  },
  "caregivers.licenseLabel": { en: "License", th: "เลขใบอนุญาต" },
  "caregivers.fallbackName": {
    en: "Caregiver {id}",
    th: "ผู้ดูแล {id}",
  },
  "caregivers.addNew": { en: "Add Staff", th: "เพิ่มบุคคลากร" },
  "caregivers.empty": { en: "No staff found", th: "ไม่พบบุคคลากร" },
  "caregivers.noLinkedAccountShort": {
    en: "No linked account",
    th: "ยังไม่มีบัญชีที่ผูก",
  },
  "caregivers.sectionAbout": { en: "About", th: "ข้อมูลทั่วไป" },
  "caregivers.sectionZones": { en: "Zone assignments", th: "พื้นที่รับผิดชอบ" },
  "caregivers.sectionLinkedPatients": {
    en: "Patients in assigned rooms",
    th: "ผู้ป่วยในห้องที่รับผิดชอบ",
  },
  "caregivers.linkedPatientsEmpty": {
    en: "No patients match this staff member’s room assignments yet.",
    th: "ยังไม่มีผู้ป่วยในห้องที่ผูกกับบุคลากรท่านนี้",
  },
  "caregivers.openFullDetail": {
    en: "Open Profile",
    th: "เปิดหน้าโปรไฟล์"
  },
  "caregivers.backToDirectory": {
    en: "Back to staff directory",
    th: "กลับไปรายชื่อเจ้าหน้าที่",
  },
  "caregivers.detailInvalidId": {
    en: "Invalid staff id.",
    th: "รหัสเจ้าหน้าที่ไม่ถูกต้อง",
  },
  "caregivers.detailLoadError": {
    en: "Could not load this staff member.",
    th: "โหลดข้อมูลเจ้าหน้าที่ไม่สำเร็จ",
  },
  "caregivers.detailNotFound": {
    en: "Staff member not found.",
    th: "ไม่พบเจ้าหน้าที่",
  },
  "caregivers.editStaff": { en: "Edit staff", th: "แก้ไขเจ้าหน้าที่" },
  "caregivers.editStaffSave": { en: "Save changes", th: "บันทึกการเปลี่ยนแปลง" },
  "caregivers.editStaffError": {
    en: "Could not update this staff member.",
    th: "อัปเดตข้อมูลเจ้าหน้าที่ไม่สำเร็จ",
  },

  // ── Facilities ───────────────────────────────────────────────────────
  "facilities.title": { en: "Facilities", th: "สถานที่" },
  "facilities.search": { en: "Search facilities...", th: "ค้นหาสถานที่..." },
  "facilities.addNew": { en: "Add Facility", th: "เพิ่มสถานที่" },
  "facilities.empty": { en: "No facilities found", th: "ไม่พบสถานที่" },
  "facilities.rooms": { en: "Rooms", th: "ห้อง" },

  // ── Floorplan builder ────────────────────────────────────────────────
  "floorplan.title": { en: "Floorplan builder", th: "ผังชั้นแบบโต้ตอบ" },
  "floorplan.subtitle": {
    en: "Pick a building and floor, place rooms, map one node per room, drag to move, corners to resize.",
    th: "เลือกอาคารและชั้น วางห้อง แมปโหนดต่อห้อง ลากย้าย จุดมุมเพื่อย่อขยาย",
  },
  "floorplan.building": { en: "Building", th: "อาคาร" },
  "floorplan.floor": { en: "Floor", th: "ชั้น" },
  "floorplan.selectBuilding": { en: "Select building", th: "เลือกอาคาร" },
  "floorplan.selectFloor": { en: "Select floor", th: "เลือกชั้น" },
  "floorplan.save": { en: "Save layout", th: "บันทึกผัง" },
  "floorplan.saved": { en: "Layout saved", th: "บันทึกผังแล้ว" },
  "floorplan.saveFailed": { en: "Could not save layout", th: "บันทึกผังไม่สำเร็จ" },
  "floorplan.addRoom": { en: "Add room", th: "เพิ่มห้อง" },
  "floorplan.canvas": { en: "Floor canvas", th: "พื้นที่ผัง" },
  "floorplan.hint": {
    en: "Click a room to select. Drag the room body to move. Drag corners to resize.",
    th: "คลิกห้องเพื่อเลือก ลากตัวห้องเพื่อย้าย ลากมุมเพื่อย่อขยาย",
  },
  "floorplan.zoomIn": { en: "Zoom in", th: "ขยาย" },
  "floorplan.zoomOut": { en: "Zoom out", th: "ย่อ" },
  "floorplan.zoomReset": { en: "Reset zoom", th: "รีเซ็ตการซูม" },
  "floorplan.zoomWheelHint": {
    en: "Ctrl + scroll to zoom",
    th: "กด Ctrl แล้วเลื่อนล้อเพื่อซูม",
  },
  "floorplan.bootstrappedHint": {
    en: "Boxes were generated from rooms on this floor. Save layout to persist positions.",
    th: "วางกล่องจากรายการห้องบนชั้นนี้แล้ว กดบันทึกผังเพื่อเก็บตำแหน่ง",
  },
  "floorplan.roomProps": { en: "Room details", th: "รายละเอียดห้อง" },
  "floorplan.selectRoom": { en: "Select a room on the canvas", th: "เลือกห้องบนผัง" },
  "floorplan.label": { en: "Room name", th: "ชื่อห้อง" },
  "floorplan.nodeDevice": { en: "Node (device)", th: "โหนด (อุปกรณ์)" },
  "floorplan.nodeDeviceLinkHint": {
    en: "Choose a device type, then search by name or ID to assign the room node.",
    th: "เลือกประเภทอุปกรณ์ แล้วค้นหาด้วยชื่อหรือรหัสเพื่อกำหนดโหนดของห้อง",
  },
  "floorplan.deviceCategoryStep": { en: "1. Device type", th: "1. ประเภทอุปกรณ์" },
  "floorplan.deviceSearchStep": { en: "2. Find device", th: "2. ค้นหาอุปกรณ์" },
  "floorplan.searchNodeDevice": {
    en: "Search device name or ID…",
    th: "ค้นหาชื่อหรือรหัสอุปกรณ์…",
  },
  "floorplan.noNodeDeviceMatches": {
    en: "No devices match your search.",
    th: "ไม่พบอุปกรณ์ที่ตรงกับการค้นหา",
  },
  "floorplan.noDevicesInCategory": {
    en: "No devices of this type in the workspace.",
    th: "ไม่มีอุปกรณ์ประเภทนี้ในเวิร์กสเปซ",
  },
  "floorplan.selectNodeDevice": { en: "Room node device", th: "อุปกรณ์โหนดของห้อง" },
  "floorplan.noNode": { en: "No node", th: "ไม่มีโหนด" },
  "floorplan.powerKw": { en: "Power (kW)", th: "กำลังไฟ (kW)" },
  "floorplan.removeRoom": { en: "Remove room", th: "ลบห้อง" },
  "floorplan.viewTitle": { en: "Floor plan", th: "ผังชั้น" },
  "floorplan.viewSubtitle": {
    en: "Saved layout from admin (read-only). Select building and floor.",
    th: "ผังที่บันทึกจากผู้ดูแล (อ่านอย่างเดียว) เลือกอาคารและชั้น",
  },
  "floorplan.emptyLayout": {
    en: "No floor plan saved for this floor yet.",
    th: "ยังไม่มีผังที่บันทึกสำหรับชั้นนี้",
  },
  "floorplan.layoutError": {
    en: "Could not load floor plan.",
    th: "โหลดผังไม่สำเร็จ",
  },
  "floorplan.noFacilities": {
    en: "No facilities in this workspace yet.",
    th: "ยังไม่มีสถานที่ใน workspace นี้",
  },
  "floorplan.noFloors": {
    en: "No floors for this building yet.",
    th: "ยังไม่มีชั้นสำหรับอาคารนี้",
  },
  "floorplan.readOnlyHint": {
    en: "Click a room to highlight. Editing is available in Admin → Floorplans.",
    th: "คลิกห้องเพื่อไฮไลต์ แก้ไขได้ที่ผู้ดูแล → ผังอาคาร",
  },
  "floorplan.scopeTitle": { en: "Building & floor", th: "อาคารและชั้น" },
  "floorplan.scopeHint": {
    en: "Choose where this layout applies, or create a new building or floor below.",
    th: "เลือกตำแหน่งที่ใช้ผังนี้ หรือสร้างอาคาร/ชั้นใหม่ด้านล่าง",
  },
  "floorplan.newBuilding": { en: "New building", th: "อาคารใหม่" },
  "floorplan.newFloor": { en: "New floor", th: "ชั้นใหม่" },
  "floorplan.buildingName": { en: "Building name", th: "ชื่ออาคาร" },
  "floorplan.addressOptional": { en: "Address (optional)", th: "ที่อยู่ (ถ้ามี)" },
  "floorplan.createBuilding": { en: "Create building", th: "สร้างอาคาร" },
  "floorplan.floorNumberLabel": { en: "Floor #", th: "เลขชั้น" },
  "floorplan.floorDisplayName": { en: "Label (optional)", th: "ชื่อเรียกชั้น (ถ้ามี)" },
  "floorplan.floorDisplayNamePh": {
    en: "e.g. Ground floor",
    th: "เช่น ชั้น 1",
  },
  "floorplan.createFloor": { en: "Create floor", th: "สร้างชั้น" },
  "floorplan.cancel": { en: "Cancel", th: "ยกเลิก" },
  "floorplan.selectBuildingFirst": {
    en: "Select or create a building first.",
    th: "เลือกหรือสร้างอาคารก่อน",
  },
  "floorplan.createFacilityFailed": {
    en: "Could not create building.",
    th: "สร้างอาคารไม่สำเร็จ",
  },
  "floorplan.createFloorFailed": {
    en: "Could not create floor.",
    th: "สร้างชั้นไม่สำเร็จ",
  },
  "floorplan.buildingCreated": {
    en: "Building created and selected.",
    th: "สร้างอาคารแล้วและเลือกให้แล้ว",
  },
  "floorplan.floorCreated": {
    en: "Floor created and selected.",
    th: "สร้างชั้นแล้วและเลือกให้แล้ว",
  },
  "floorplan.actions": { en: "Layout actions", th: "การจัดการผัง" },

  // ── Admin users ───────────────────────────────────────────────────────
  "admin.users.title": { en: "User management", th: "จัดการผู้ใช้" },
  "admin.users.subtitle": {
    en: "Create accounts, assign roles, and distribute credentials.",
    th: "สร้างบัญชี กำหนดบทบาท และแจก username / password",
  },
  "admin.users.create": { en: "Create user", th: "สร้างผู้ใช้" },
  "admin.users.username": { en: "Username", th: "ชื่อผู้ใช้" },
  "admin.users.password": { en: "Password", th: "รหัสผ่าน" },
  "admin.users.role": { en: "Role", th: "บทบาท" },
  "admin.users.created": { en: "User created", th: "สร้างผู้ใช้แล้ว" },
  "admin.users.list": { en: "Workspace users", th: "ผู้ใช้ในระบบ" },

  // ── Audit ───────────────────────────────────────────────────────────
  "admin.audit.title": { en: "Audit trail", th: "บันทึกตรวจสอบ" },
  "admin.audit.subtitle": {
    en: "Workflow and clinical actions recorded for compliance.",
    th: "บันทึกการกระทำสำหรับการตรวจสอบ",
  },

  // ── ML ───────────────────────────────────────────────────────────────
  "admin.ml.title": { en: "ML model calibration", th: "ปรับเทียบโมเดล ML" },
  "admin.ml.subtitle": {
    en: "KNN room localization and XGBoost motion classification — status from the API.",
    th: "KNN ห้องจาก RSSI และ XGBoost จำแนกการเคลื่อนไหว — สถานะจาก API",
  },
  "admin.ml.knn": { en: "KNN localization", th: "KNN ระบุห้อง" },
  "admin.ml.motion": { en: "XGBoost motion", th: "XGBoost การเคลื่อนไหว" },

  // ── Profile ──────────────────────────────────────────────────────────
  "profile.title": { en: "My Profile", th: "โปรไฟล์ของฉัน" },
  "profile.role": { en: "Role", th: "บทบาท" },
  "profile.apiDocs": { en: "API Documentation", th: "เอกสาร API" },
  "profile.avatar.editorTitle": { en: "Profile photo", th: "รูปโปรไฟล์" },
  "profile.avatar.changePhoto": { en: "Change photo", th: "เปลี่ยนรูป" },
  "profile.avatar.removePhoto": { en: "Remove photo", th: "ลบรูป" },
  "profile.avatar.save": { en: "Save photo", th: "บันทึกรูป" },
  "profile.avatar.cancel": { en: "Cancel", th: "ยกเลิก" },
  "profile.avatar.urlHint": {
    en: "Use an https image address, or pick a file (saved as a square crop, max 512px). Data URLs are not accepted.",
    th: "ใช้ลิงก์รูปแบบ https หรือเลือกไฟล์ (บันทึกเป็นสี่เหลี่ยมจัตุรัส ขนาดไม่เกิน 512px) ไม่รับ data URL",
  },
  "profile.avatar.localFileLabel": {
    en: "Upload from device",
    th: "อัปโหลดจากเครื่อง",
  },
  "profile.avatar.cropHint": {
    en: "Images are center-cropped to a square and compressed to JPEG before you save.",
    th: "รูปจะถูกครอบกลางเป็นสี่เหลี่ยมจัตุรัสและบีบเป็น JPEG ก่อนบันทึก",
  },
  "profile.avatar.errorDataUrl": {
    en: "Pasted data URLs are not allowed. Use https://… or upload a file.",
    th: "ไม่รับ data URL ใช้ https://… หรืออัปโหลดไฟล์แทน",
  },
  "profile.avatar.errorInvalidUrl": {
    en: "Enter a valid http(s) URL or clear the field to keep your current photo.",
    th: "กรอก URL แบบ http(s) ที่ถูกต้อง หรือเว้นว่างเพื่อคงรูปเดิม",
  },
  "profile.avatar.errorFileType": {
    en: "Choose a JPG, PNG, or WebP image.",
    th: "กรุณาเลือกไฟล์ JPG PNG หรือ WebP",
  },
  "profile.avatar.errorFileSize": {
    en: "This file is too large. Choose a smaller image.",
    th: "ไฟล์ใหญ่เกินไป กรุณาเลือกรูปที่เล็กลง",
  },
  "profile.avatar.errorUpload": {
    en: "Could not upload the photo. Try again.",
    th: "อัปโหลดรูปไม่สำเร็จ ลองอีกครั้ง",
  },
  "profile.avatar.success": {
    en: "Profile photo updated.",
    th: "อัปเดตรูปโปรไฟล์แล้ว",
  },

  // ── Common ───────────────────────────────────────────────────────────
  // -- AI / Copilot flow ----------------------------------------------
  "settings.ai.copilotSectionTitle": {
    en: "Copilot connection and models",
    th: "การเชื่อมต่อและโมเดล Copilot",
  },
  "settings.ai.noCopilotModelsAvailable": {
    en: "No Copilot models available",
    th: "ไม่มีโมเดล Copilot ให้ใช้งาน",
  },
  "settings.ai.copilotModelsHint": {
    en: "Copilot model choices and connection state come from the backend bridge.",
    th: "ตัวเลือกโมเดล Copilot และสถานะการเชื่อมต่อมาจากแบ็กเอนด์",
  },
  "settings.ai.copilotReconnect": { en: "Re-authenticate", th: "ยืนยันตัวตนใหม่" },
  "settings.ai.copilotDialogDescription": {
    en: "Use GitHub device flow to connect Copilot models to this workspace.",
    th: "ใช้ GitHub device flow เพื่อเชื่อมโมเดล Copilot กับ workspace นี้",
  },
  "settings.ai.copilotPending": { en: "Waiting for authorization...", th: "กำลังรอการยืนยัน..." },
  "settings.ai.copilotSlowDown": {
    en: "GitHub asked the client to slow down. Retrying with a longer interval.",
    th: "GitHub ขอให้ชะลอการลองใหม่ ระบบจะลองอีกครั้งด้วยช่วงเวลาที่นานขึ้น",
  },
  "settings.ai.copilotExpired": {
    en: "This device code has expired. Start a new sign-in.",
    th: "รหัสอุปกรณ์นี้หมดอายุแล้ว เริ่มลงชื่อเข้าใช้ใหม่",
  },
  "settings.ai.copilotDenied": { en: "GitHub denied the device flow request.", th: "GitHub ปฏิเสธคำขอ device flow" },
  "settings.ai.copilotBackendError": {
    en: "Copilot device flow failed on the server.",
    th: "Device flow ของ Copilot ล้มเหลวบนเซิร์ฟเวอร์",
  },
  "settings.ai.copilotSuccess": { en: "Copilot connected successfully.", th: "เชื่อมต่อ Copilot สำเร็จ" },
  "settings.ai.copilotConnectedButModelsUnavailable": {
    en: "Connected, but the backend could not return any models yet.",
    th: "เชื่อมต่อแล้ว แต่แบ็กเอนด์ยังไม่ส่งรายการโมเดลกลับมา",
  },
  "settings.ai.copyCode": { en: "Copy code", th: "คัดลอกรหัส" },
  "settings.ai.copied": { en: "Copied", th: "คัดลอกแล้ว" },
  "settings.ai.openGitHub": { en: "Open GitHub to enter code", th: "เปิด GitHub เพื่อกรอกรหัส" },
  "settings.ai.expiresAt": { en: "Expires at", th: "หมดอายุเมื่อ" },
  "settings.ai.expiresAtHint": { en: "The device code lifetime from GitHub.", th: "อายุของรหัสอุปกรณ์จาก GitHub" },
  "settings.ai.intervalSeconds": { en: "Interval (s)", th: "ช่วงเวลา (วินาที)" },
  "settings.ai.intervalHint": { en: "Poll using the interval returned by GitHub.", th: "โพลตามช่วงเวลาที่ GitHub ส่งกลับมา" },
  "settings.ai.deviceCode": { en: "Flow state", th: "สถานะ flow" },
  "settings.ai.deviceCodeHint": { en: "Pending, retrying, or terminal state.", th: "รอ ลองใหม่ หรือสถานะสุดท้าย" },
  "settings.ai.ollamaSectionTitle": {
    en: "Host-native Ollama library",
    th: "ไลบรารี Ollama บนเครื่องโฮสต์",
  },
  "settings.ai.ollamaNotReachable": {
    en: "Ollama is not reachable.",
    th: "ติดต่อ Ollama ไม่ได้",
  },
  "settings.ai.ollamaHostConfig": {
    en: "This workspace is configured for host-native Ollama at {origin}.",
    th: "workspace นี้ตั้งค่าให้ใช้ Ollama บนเครื่องโฮสต์ที่ {origin}",
  },
  "common.cancel": { en: "Cancel", th: "ยกเลิก" },
  "common.saving": { en: "Saving…", th: "กำลังบันทึก…" },
  "common.loading": { en: "Loading...", th: "กำลังโหลด..." },
  "common.search": { en: "Search...", th: "ค้นหา..." },
  "common.clearSearch": { en: "Clear search", th: "ล้างการค้นหา" },
  "common.clearField": { en: "Clear", th: "ล้าง" },
  "common.clearSelection": { en: "Clear selection", th: "ล้างการเลือก" },
  "common.noSearchMatches": {
    en: "No matching results.",
    th: "ไม่มีรายการที่ตรงกับการค้นหา",
  },
  "common.listEmpty": {
    en: "Nothing to show here yet.",
    th: "ยังไม่มีรายการให้แสดง",
  },
  "common.noData": { en: "No data available", th: "ไม่มีข้อมูล" },
  "common.active": { en: "Active", th: "ใช้งานอยู่" },
  "common.inactive": { en: "Inactive", th: "ไม่ได้ใช้งาน" },
} as const;

export type TranslationKey = keyof typeof translations;

/* ── Context ─────────────────────────────────────────────────────────────── */

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (saved === "en" || saved === "th") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate locale from storage once
      setLocaleState(saved);
    }
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem(STORAGE_KEY, newLocale);
    document.documentElement.lang = newLocale;
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => {
      const entry = translations[key];
      if (!entry) return key;
      return maybeRepairMojibake(entry[locale] || entry.en || key);
    },
    [locale],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useTranslation must be used within I18nProvider");
  return ctx;
}
