import { canonicalizeRole } from "@/lib/roles";

export type AppRole = import("@/lib/types").User["role"];

/** In-app path to the alerts inbox for the signed-in role. */
export function alertsInboxPath(role: string): string {
  switch (canonicalizeRole(role)) {
    case "caregiver":
      return "/caregiver/alerts";
    case "head_caregiver":
      return "/head-caregiver/emergency";
    case "patient":
      return "/patient";
    case "admin":
      return "/admin/alerts";
    default:
      return "/head-caregiver/emergency";
  }
}

/** Alerts inbox URL with optional `?alert=` deep link (row id `ws-alert-{id}` on queue tables). */
export function alertsInboxUrl(role: string, alertId?: number | null): string {
  const base = alertsInboxPath(role);
  if (alertId == null || !Number.isFinite(alertId)) return base;
  const q = new URLSearchParams({ alert: String(alertId) });
  return `${base}?${q.toString()}`;
}

export function workflowTasksPath(role: string): string {
  switch (canonicalizeRole(role)) {
    case "caregiver":
      return "/caregiver/tasks";
    case "head_caregiver":
      return "/head-caregiver/tasks";
    case "admin":
      return "/admin/tasks";
    case "patient":
      return "/patient";
    default:
      return "/head-caregiver/tasks";
  }
}

export function staffMessagesPath(role: string): string {
  switch (canonicalizeRole(role)) {
    case "admin":
      return "/admin/messages";
    case "caregiver":
      return "/caregiver/messages";
    case "head_caregiver":
      return "/head-caregiver/messages";
    case "patient":
      return "/patient/messages";
    default:
      return "/head-caregiver/messages";
  }
}
