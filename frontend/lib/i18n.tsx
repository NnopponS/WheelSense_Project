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
  "nav.caregivers": { en: "Caregivers", th: "ผู้ดูแล" },
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

  // ── Dashboard ────────────────────────────────────────────────────────
  "dash.title": { en: "Dashboard", th: "แดชบอร์ด" },
  "dash.subtitle": {
    en: "WheelSense system overview",
    th: "ภาพรวมระบบ WheelSense",
  },
  "dash.totalPatients": { en: "Total Patients", th: "ผู้ป่วยทั้งหมด" },
  "dash.activeAlerts": { en: "Active Alerts", th: "การแจ้งเตือนที่ใช้งานอยู่" },
  "dash.totalDevices": { en: "Total Devices", th: "อุปกรณ์ทั้งหมด" },
  "dash.latestVitals": { en: "Latest Vitals", th: "สัญญาณชีพล่าสุด" },
  "dash.recentAlerts": { en: "Recent Alerts", th: "การแจ้งเตือนล่าสุด" },
  "dash.recentPatients": { en: "Recent Patients", th: "ผู้ป่วยล่าสุด" },
  "dash.viewAll": { en: "View All", th: "ดูทั้งหมด" },
  "dash.noAlerts": { en: "No active alerts", th: "ไม่มีการแจ้งเตือนที่ใช้งานอยู่" },
  "dash.noPatients": { en: "No patient data yet", th: "ยังไม่มีข้อมูลผู้ป่วย" },

  // ── Patients ─────────────────────────────────────────────────────────
  "patients.title": { en: "Patient Directory", th: "รายชื่อผู้ป่วย" },
  "patients.search": { en: "Search patients...", th: "ค้นหาผู้ป่วย..." },
  "patients.addNew": { en: "Add Patient", th: "เพิ่มผู้ป่วย" },
  "patients.empty": {
    en: "No patients found",
    th: "ไม่พบข้อมูลผู้ป่วย",
  },
  "patients.age": { en: "Age", th: "อายุ" },
  "patients.years": { en: "years", th: "ปี" },
  "patients.careLevel": { en: "Care Level", th: "ระดับการดูแล" },

  // ── Devices ──────────────────────────────────────────────────────────
  "devices.title": { en: "Device Fleet", th: "อุปกรณ์ทั้งหมด" },
  "devices.search": { en: "Search devices...", th: "ค้นหาอุปกรณ์..." },
  "devices.online": { en: "Online", th: "ออนไลน์" },
  "devices.offline": { en: "Offline", th: "ออฟไลน์" },
  "devices.lastSeen": { en: "Last seen", th: "เห็นล่าสุด" },
  "devices.empty": { en: "No devices found", th: "ไม่พบอุปกรณ์" },

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
  "settings.ai.pullModel": { en: "Pull model", th: "ดึงโมเดล" },
  "settings.ai.pullPlaceholder": { en: "e.g. gemma3:4b", th: "เช่น gemma3:4b" },

  // ── Vitals ───────────────────────────────────────────────────────────
  "vitals.title": { en: "Vital Signs", th: "สัญญาณชีพ" },
  "vitals.subtitle": {
    en: "Real-time vital sign monitoring",
    th: "ตรวจสอบสัญญาณชีพแบบเรียลไทม์",
  },
  "vitals.empty": { en: "No vital readings", th: "ไม่มีข้อมูลสัญญาณชีพ" },
  "vitals.hr": { en: "Heart Rate", th: "อัตราการเต้นของหัวใจ" },
  "vitals.spo2": { en: "SpO2", th: "SpO2" },
  "vitals.temp": { en: "Temperature", th: "อุณหภูมิ" },
  "vitals.battery": { en: "Battery", th: "แบตเตอรี่" },
  "vitals.patient": { en: "Patient", th: "ผู้ป่วย" },
  "vitals.device": { en: "Device", th: "อุปกรณ์" },
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
  "caregivers.title": { en: "Caregivers", th: "ผู้ดูแล" },
  "caregivers.search": { en: "Search caregivers...", th: "ค้นหาผู้ดูแล..." },
  "caregivers.addNew": { en: "Add Caregiver", th: "เพิ่มผู้ดูแล" },
  "caregivers.empty": { en: "No caregivers found", th: "ไม่พบผู้ดูแล" },

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
  "floorplan.roomProps": { en: "Room details", th: "รายละเอียดห้อง" },
  "floorplan.selectRoom": { en: "Select a room on the canvas", th: "เลือกห้องบนผัง" },
  "floorplan.label": { en: "Room name", th: "ชื่อห้อง" },
  "floorplan.nodeDevice": { en: "Node (device)", th: "โหนด (อุปกรณ์)" },
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

  // ── Common ───────────────────────────────────────────────────────────
  "common.loading": { en: "Loading...", th: "กำลังโหลด..." },
  "common.search": { en: "Search...", th: "ค้นหา..." },
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
      return entry[locale] || entry.en || key;
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
