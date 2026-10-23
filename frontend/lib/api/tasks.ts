/* ─────────────────────────────────────────────────────────────────────────────
   Unified Task Management API Client
   ───────────────────────────────────────────────────────────────────────────── */

import { api } from "@/lib/api";
import type {
  TaskCreate,
  TaskOut,
  TaskUpdate,
  TaskReportCreate,
  TaskReportOut,
  TaskBoardResponse,
} from "@/types/tasks";

export async function fetchTasks(params?: {
  task_type?: string;
  status?: string;
  patient_id?: number;
  assignee_user_id?: number;
  date_from?: string;
  date_to?: string;
  shift_date?: string;
  is_active?: boolean;
  limit?: number;
}): Promise<TaskOut[]> {
  const query = new URLSearchParams();
  if (params?.task_type) query.set("task_type", params.task_type);
  if (params?.status) query.set("status", params.status);
  if (typeof params?.patient_id === "number") query.set("patient_id", String(params.patient_id));
  if (typeof params?.assignee_user_id === "number") query.set("assignee_user_id", String(params.assignee_user_id));
  if (params?.date_from) query.set("date_from", params.date_from);
  if (params?.date_to) query.set("date_to", params.date_to);
  if (params?.shift_date) query.set("shift_date", params.shift_date);
  if (typeof params?.is_active === "boolean") query.set("is_active", String(params.is_active));
  if (typeof params?.limit === "number") query.set("limit", String(params.limit));
  
  const suffix = query.toString();
  // Trailing slash avoids FastAPI/Starlette 307 redirect from /api/tasks -> /api/tasks/
  return api.get<TaskOut[]>(suffix ? `/tasks/?${suffix}` : "/tasks/");
}

export async function fetchTaskBoard(shiftDate?: string): Promise<TaskBoardResponse> {
  const query = shiftDate ? `?shift_date=${encodeURIComponent(shiftDate)}` : "";
  return api.get<TaskBoardResponse>(`/tasks/board${query}`);
}

export async function fetchTask(taskId: number): Promise<TaskOut> {
  return api.get<TaskOut>(`/tasks/${taskId}`);
}

export async function createTask(data: TaskCreate): Promise<TaskOut> {
  return api.post<TaskOut>("/tasks/", data);
}

export async function updateTask(taskId: number, data: TaskUpdate): Promise<TaskOut> {
  return api.patch<TaskOut>(`/tasks/${taskId}`, data);
}

export async function deleteTask(taskId: number): Promise<void> {
  return api.delete<void>(`/tasks/${taskId}`);
}

export async function submitTaskReport(taskId: number, data: TaskReportCreate): Promise<TaskReportOut> {
  return api.post<TaskReportOut>(`/tasks/${taskId}/reports`, data);
}

export async function fetchTaskReports(taskId: number): Promise<TaskReportOut[]> {
  return api.get<TaskReportOut[]>(`/tasks/${taskId}/reports`);
}

/** Browser URL for streaming a pending attachment (create-task flow; cookie auth). */
export function taskPendingAttachmentContentUrl(pendingId: string): string {
  return `/api/tasks/attachments/pending/${encodeURIComponent(pendingId)}/content`;
}

/** Browser URL for a finalized task template / subtask attachment. */
export function taskTemplateAttachmentContentUrl(
  taskId: number,
  attachmentId: string,
): string {
  return `/api/tasks/${taskId}/attachments/${encodeURIComponent(attachmentId)}/content`;
}

export async function resetRoutineTasks(shiftDate?: string): Promise<{ reset_count: number }> {
  const query = shiftDate ? `?shift_date=${encodeURIComponent(shiftDate)}` : "";
  return api.post<{ reset_count: number }>(`/tasks/routines/reset${query}`, {});
}
