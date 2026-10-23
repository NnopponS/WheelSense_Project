/* ─────────────────────────────────────────────────────────────────────────────
   Workspace calendar read API (schedules, unified tasks, directives, shifts)
   ───────────────────────────────────────────────────────────────────────────── */

import { api } from "@/lib/api";

export type CalendarEventType = "schedule" | "task" | "directive" | "shift";

export interface CalendarEventOut {
  event_id: string;
  event_type: CalendarEventType;
  source_id: number;
  title: string;
  description?: string;
  starts_at: string;
  ends_at: string | null;
  status: string | null;
  patient_id: number | null;
  person_user_id: number | null;
  person_role: string | null;
  can_edit: boolean;
  metadata?: Record<string, unknown>;
}

export async function fetchCalendarEvents(params: {
  start_at: string;
  end_at: string;
  patient_id?: number;
  person_user_id?: number;
  person_role?: string;
  limit?: number;
}): Promise<CalendarEventOut[]> {
  const q = new URLSearchParams();
  q.set("start_at", params.start_at);
  q.set("end_at", params.end_at);
  if (typeof params.patient_id === "number") q.set("patient_id", String(params.patient_id));
  if (typeof params.person_user_id === "number") {
    q.set("person_user_id", String(params.person_user_id));
  }
  if (params.person_role) q.set("person_role", params.person_role);
  if (typeof params.limit === "number") q.set("limit", String(params.limit));
  return api.get<CalendarEventOut[]>(`/calendar/events?${q.toString()}`);
}
