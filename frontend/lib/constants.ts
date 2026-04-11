/** API base URL — proxied by `app/api/[[...path]]/route.ts` to the FastAPI server */
export const API_BASE = "/api";

/** Role app route roots and common admin paths */
export const ROUTES = {
  LOGIN: "/login",
  ADMIN: "/admin",
  HEAD_NURSE: "/head-nurse",
  SUPERVISOR: "/supervisor",
  OBSERVER: "/observer",
  PATIENT: "/patient",
  // Clinical features moved to head-nurse role
  PATIENTS: "/head-nurse/patients",
  PATIENT_DETAIL: (id: number) => `/head-nurse/patients/${id}`,
  DEVICES: "/admin/devices",
  // Monitoring, alerts moved to role-specific dashboards
  MONITORING: "/admin",
  ALERTS: "/head-nurse/alerts",
  TIMELINE: "/admin",
  // Staff detail pages remain at admin; list view redirect to head-nurse
  CAREGIVERS: "/head-nurse/staff",
  CAREGIVER_DETAIL: (id: number) => `/admin/caregivers/${id}`,
  FACILITIES: "/admin/facility-management",
  PROFILE: "/account",
  ACCOUNT_MANAGEMENT: "/admin/account-management",
} as const;
