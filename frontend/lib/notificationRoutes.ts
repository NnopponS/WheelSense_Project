import type { User } from "@/lib/types";

export type AppRole = User["role"];

/** In-app path to the alerts inbox for the signed-in role. */
export function alertsInboxPath(role: AppRole): string {
  switch (role) {
    case "caregiver":
      return "/caregiver/alerts";
    case "head_caregiver":
      return "/head-caregiver/emergency";
    case "patient":
      return "/patient";
    case "admin":
    case "head_caregiver":
      return "/head-caregiver/alerts";
    default:
      return "/head-caregiver/alerts";
  }
}

/** Alerts inbox URL with optional `?alert=` deep link (row id `ws-alert-{id}` on queue tables). */
export function alertsInboxUrl(role: AppRole, alertId?: number | null): string {
  const base = alertsInboxPath(role);
  if (alertId == null || !Number.isFinite(alertId)) return base;
  const q = new URLSearchParams({ alert: String(alertId) });
  return `${base}?${q.toString()}`;
}

export function workflowTasksPath(role: AppRole): string {
  switch (role) {
    case "caregiver":
      return "/caregiver/tasks";
    case "head_caregiver":
      return "/head-caregiver/tasks";
    case "admin":
    case "head_caregiver":
      return "/head-caregiver/tasks";
    case "patient":
      return "/patient";
    default:
      return "/head-caregiver/tasks";
  }
}

export function staffMessagesPath(role: AppRole): string {
  switch (role) {
    case "admin":
      return "/admin/messages";
    case "head_caregiver":
      return "/head-caregiver/messages";
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
