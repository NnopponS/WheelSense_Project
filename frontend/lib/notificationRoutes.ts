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

export function workflowTasksPath(role: AppRole): string {
  switch (role) {
    case "observer":
      return "/observer/tasks";
    case "supervisor":
      return "/supervisor/workflow";
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
      return "/observer/workflow";
    case "supervisor":
      return "/supervisor/workflow";
    case "patient":
      return "/patient/messages";
    default:
      return "/head-nurse/messages";
  }
}
