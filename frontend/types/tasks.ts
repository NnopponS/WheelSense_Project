/* ─────────────────────────────────────────────────────────────────────────────
   Unified Task Management Types
   ───────────────────────────────────────────────────────────────────────────── */

export interface SubtaskReportSpec {
  body_html?: string;
  attachment_hints?: string[];
  /** Client-only pending upload IDs; stripped server-side and merged into attachments. */
  attachment_pending_ids?: string[];
  attachments?: Array<{
    id: string;
    filename: string;
    content_type?: string;
    byte_size?: number;
    storage_relpath?: string;
  }>;
}

export interface SubtaskItem {
  id: string;
  title: string;
  description?: string;
  assigned_user_id?: number;
  assigned_user_ids?: number[];
  report_spec?: SubtaskReportSpec;
  status: string;
  completed_at?: string;
}

export interface ReportTemplateField {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
}

export interface ReportTemplate {
  mode?: "structured" | "rich" | string | null;
  fields: ReportTemplateField[];
  body_html?: string | null;
  attachment_hints?: string[];
  attachments?: Array<{
    id: string;
    filename: string;
    content_type?: string;
    byte_size?: number;
    storage_relpath?: string;
  }>;
}

export interface TaskCreate {
  task_type: "specific" | "routine";
  title: string;
  description?: string;
  priority: "low" | "normal" | "high" | "critical";
  patient_id?: number;
  assigned_user_id?: number;
  assigned_user_ids?: number[];
  assigned_role?: string;
  /** ISO datetime — shown on workspace calendar */
  start_at?: string;
  /** ISO datetime — optional window end */
  ends_at?: string;
  due_at?: string;
  subtasks?: Array<{
    title: string;
    description?: string;
    assigned_user_id?: number;
    assigned_user_ids?: number[];
    report_spec?: SubtaskReportSpec;
  }>;
  report_template?: ReportTemplate;
  report_template_pending_attachment_ids?: string[];
  shift_date?: string;
}

export interface TaskUpdate {
  title?: string;
  description?: string;
  priority?: string;
  status?: string;
  assigned_user_id?: number;
  assigned_user_ids?: number[];
  assigned_role?: string;
  start_at?: string;
  ends_at?: string;
  due_at?: string;
  subtasks?: SubtaskItem[];
  report_template?: ReportTemplate;
  is_active?: boolean;
}

export interface TaskOut {
  id: number;
  workspace_id: number;
  task_type: "specific" | "routine";
  patient_id?: number;
  title: string;
  description?: string;
  priority: string;
  start_at?: string;
  ends_at?: string;
  due_at?: string;
  status: string;
  assigned_user_id?: number;
  assigned_user_ids?: number[];
  assigned_role?: string;
  created_by_user_id?: number;
  completed_at?: string;
  subtasks: SubtaskItem[];
  report_template: ReportTemplate;
  workflow_job_id?: string;
  shift_date?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  patient_name?: string;
  assigned_user_name?: string;
  created_by_user_name?: string;
  report_count: number;
}

export interface TaskReportCreate {
  report_data: Record<string, unknown>;
  notes?: string;
  attachments?: string[];
}

export interface TaskReportOut {
  id: number;
  workspace_id: number;
  task_id: number;
  patient_id?: number;
  submitted_by_user_id: number;
  report_data: Record<string, unknown>;
  notes?: string;
  attachments: string[];
  submitted_at: string;
  submitted_by_user_name?: string;
}

export interface TaskBoardUserRow {
  user_id: number;
  username: string;
  display_name: string;
  role: string;
  total: number;
  in_progress: number;
  completed: number;
  skipped: number;
  pending: number;
  percent_complete: number;
  tasks: TaskOut[];
}

export interface TaskBoardResponse {
  shift_date?: string;
  rows: TaskBoardUserRow[];
}
