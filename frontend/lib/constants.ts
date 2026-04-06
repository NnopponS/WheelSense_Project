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
  PATIENTS: "/admin/patients",
  PATIENT_DETAIL: (id: number) => `/admin/patients/${id}`,
  DEVICES: "/admin/devices",
  MONITORING: "/admin/monitoring",
  ALERTS: "/admin/alerts",
  TIMELINE: "/admin/timeline",
  CAREGIVERS: "/admin/caregivers",
  CAREGIVER_DETAIL: (id: number) => `/admin/caregivers/${id}`,
  FACILITIES: "/admin/facilities",
  PROFILE: "/admin/settings?tab=profile",
  ACCOUNT_MANAGEMENT: "/admin/account-management",
} as const;
