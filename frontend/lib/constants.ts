/** API base URL — proxied by `app/api/[[...path]]/route.ts` to the FastAPI server */
export const API_BASE = "/api";

/** Role app route roots and common admin paths */
export const ROUTES = {
  LOGIN: "/login",
  ADMIN: "/admin",
  HEAD_CAREGIVER: "/head-caregiver",
  CAREGIVER: "/caregiver",
  PATIENT: "/patient",
  // Clinical features under head-caregiver role
  PATIENTS: "/head-caregiver/patients",
  PATIENT_DETAIL: (id: number) => `/head-caregiver/patients/${id}`,
  DEVICES: "/admin/devices",
  // Monitoring, alerts moved to role-specific dashboards
  MONITORING: "/admin",
  ALERTS: "/head-caregiver/emergency",
  TIMELINE: "/admin",
  // Personnel hub includes staff and patients in head-caregiver role
  CAREGIVERS: "/head-caregiver/caregivers",
  CAREGIVER_DETAIL: (id: number) => `/admin/caregivers/${id}`,
  FACILITIES: "/admin/facility-management",
  PROFILE: "/account",
  ACCOUNT_MANAGEMENT: "/admin/account-management",
} as const;
