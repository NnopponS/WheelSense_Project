import type {
  CareScheduleOut,
  ListPatientsResponse,
} from "@/lib/api/task-scope-types";
import type { CalendarEvent } from "./CalendarView";

const FALLBACK_EVENT_DURATION_MS = 60 * 60 * 1000;

function toEventStatus(status: string | null | undefined): CalendarEvent["status"] {
  if (status === "in_progress") return "in_progress";
  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";
  return "scheduled";
}

export function buildPatientNameMap(patients: ListPatientsResponse): Map<number, string> {
  return new Map(
    patients.map((patient) => [
      patient.id,
      `${patient.first_name} ${patient.last_name}`.trim() || `Patient #${patient.id}`,
    ]),
  );
}

export function scheduleToCalendarEvent(
  schedule: CareScheduleOut,
  patientNameById: Map<number, string>,
): CalendarEvent {
  const start = new Date(schedule.starts_at);
  const end = schedule.ends_at
    ? new Date(schedule.ends_at)
    : new Date(start.getTime() + FALLBACK_EVENT_DURATION_MS);

  return {
    id: schedule.id,
    title: schedule.title,
    startTime: start,
    endTime: end,
    patientId: schedule.patient_id,
    patientName:
      schedule.patient_id != null
        ? patientNameById.get(schedule.patient_id) ?? `Patient #${schedule.patient_id}`
        : null,
    assigneeId: schedule.assigned_user_id,
    assigneeName: null,
    scheduleType: schedule.schedule_type,
    priority: "medium",
    status: toEventStatus(schedule.status),
    recurrence: schedule.recurrence_rule || null,
  };
}

export function schedulesToCalendarEvents(
  schedules: CareScheduleOut[],
  patientNameById: Map<number, string>,
): CalendarEvent[] {
  return schedules.map((schedule) => scheduleToCalendarEvent(schedule, patientNameById));
}

