/* ─────────────────────────────────────────────────────────────────────────────
   Task Management API Types
   ───────────────────────────────────────────────────────────────────────────── */

// ── Routine Task Templates ────────────────────────────────────────────────────

export interface RoutineTaskAssignedUser {
  user_id: number;
  username: string;
  display_name: string;
  role: string;
}

export interface RoutineTaskOut {
  id: number;
  workspace_id: number;
  title: string;
  description: string;
  label: string;
  category: string;
  sort_order: number;
  assigned_user_id: number | null;
  assigned_role: string | null;
  created_by_user_id: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  assigned_user: RoutineTaskAssignedUser | null;
}

export interface RoutineTaskCreate {
  title: string;
  description?: string;
  label?: string;
  category?: string;
  sort_order?: number;
  assigned_user_id?: number | null;
  assigned_role?: string | null;
  is_active?: boolean;
}

export interface RoutineTaskUpdate {
  title?: string;
  description?: string;
  label?: string;
  category?: string;
  sort_order?: number;
  assigned_user_id?: number | null;
  assigned_role?: string | null;
  is_active?: boolean;
}

// ── Routine Daily Logs ────────────────────────────────────────────────────────

export type RoutineLogStatus = "pending" | "done" | "skipped";

export interface RoutineTaskLogOut {
  id: number;
  workspace_id: number;
  routine_task_id: number;
  assigned_user_id: number | null;
  shift_date: string; // YYYY-MM-DD
  status: RoutineLogStatus;
  note: string;
  report_text: string;
  report_images: string[];
  completed_at: string | null;
  updated_at: string;
  routine_task: RoutineTaskOut;
}

export interface RoutineTaskLogUpdate {
  status: RoutineLogStatus;
  note?: string;
  report_text?: string;
  report_images?: string[];
}

export interface DailyBoardUserRow {
  user_id: number;
  username: string;
  display_name: string;
  role: string;
  total: number;
  done: number;
  skipped: number;
  pending: number;
  percent_complete: number;
  logs: RoutineTaskLogOut[];
}

export interface DailyBoardResponse {
  shift_date: string;
  rows: DailyBoardUserRow[];
  workspace_summary?: {
    total: number;
    done: number;
    skipped: number;
    pending: number;
    percent_complete: number;
  };
}

export interface RoutineLogBulkResetRequest {
  shift_date?: string | null;
}

// ── Patient Fix Routines ──────────────────────────────────────────────────────

export interface RoutineStep {
  title: string;
  description?: string;
  order?: number;
}

export interface PatientSummary {
  id: number;
  name: string;
  room_number: number | null;
}

export interface PatientFixRoutineOut {
  id: number;
  workspace_id: number;
  title: string;
  description: string;
  patient_ids: number[];
  target_roles: string[];
  schedule_type: string;
  recurrence_rule: string;
  steps: RoutineStep[];
  created_by_user_id: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  patient_summaries: PatientSummary[];
}

export interface PatientFixRoutineCreate {
  title: string;
  description?: string;
  patient_ids?: number[];
  target_roles?: string[];
  schedule_type?: string;
  recurrence_rule?: string;
  steps?: RoutineStep[];
  is_active?: boolean;
}

export interface PatientFixRoutineUpdate {
  title?: string;
  description?: string;
  patient_ids?: number[];
  target_roles?: string[];
  schedule_type?: string;
  recurrence_rule?: string;
  steps?: RoutineStep[];
  is_active?: boolean;
}
