/** API base URL — proxied by `app/api/[[...path]]/route.ts` to the FastAPI server */
export const API_BASE = "/api";

/** Routes — Phase 12R role shells */
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
  VITALS: "/admin/vitals",
  ALERTS: "/admin/alerts",
  TIMELINE: "/admin/timeline",
  CAREGIVERS: "/admin/caregivers",
  FACILITIES: "/admin/facilities",
  PROFILE: "/admin/settings?tab=profile",
} as const;
