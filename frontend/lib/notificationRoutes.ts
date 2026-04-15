import type { User } from "@/lib/types";

export type AppRole = User["role"];

/** In-app path to the alerts inbox for the signed-in role. */
export function alertsInboxPath(role: AppRole): string {
  switch (role) {
    case "observer":
      return "/observer/alerts";
    case "supervisor":
      return "/supervisor/emergency";
    case "patient":
      return "/patient";
    case "admin":
    case "head_nurse":
      return "/head-nurse/alerts";
    default:
      return "/head-nurse/alerts";
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
    case "observer":
      return "/observer/tasks";
    case "supervisor":
      return "/supervisor/tasks";
    case "admin":
    case "head_nurse":
      return "/head-nurse/tasks";
    case "patient":
      return "/patient";
    default:
      return "/head-nurse/tasks";
  }
}

export function staffMessagesPath(role: AppRole): string {
  switch (role) {
    case "admin":
      return "/admin/messages";
    case "head_nurse":
      return "/head-nurse/messages";
    case "observer":
      return "/observer/messages";
    case "supervisor":
      return "/supervisor/messages";
    case "patient":
      return "/patient/messages";
    default:
      return "/head-nurse/messages";
  }
}
