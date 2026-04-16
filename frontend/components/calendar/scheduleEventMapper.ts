import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type {
  CareScheduleOut,
  ListPatientsResponse,
} from "@/lib/api/task-scope-types";
import type { CalendarEvent, CalendarViewMode } from "./CalendarView";

const FALLBACK_EVENT_DURATION_MS = 60 * 60 * 1000;

/** Encode virtual calendar row id (negative) from care_schedule id + calendar day. */
export function encodeScheduleInstanceId(scheduleId: number, day: Date): number {
  const ymd = Number(format(day, "yyyyMMdd"));
  return -(scheduleId * 100_000_000 + ymd);
}

/** Resolve DB `care_schedules.id` from a calendar event (handles recurrence instances). */
export function resolveCareScheduleIdFromEvent(ev: CalendarEvent): number {
  if (ev.sourceScheduleId != null) return ev.sourceScheduleId;
  return ev.id;
}

export function visibleCalendarRange(
  anchor: Date,
  mode: CalendarViewMode,
): { start: Date; end: Date } {
  if (mode === "month") {
    return {
      start: addDays(startOfMonth(anchor), -7),
      end: addDays(endOfMonth(anchor), 7),
    };
  }
  if (mode === "week") {
    return {
      start: startOfWeek(anchor, { weekStartsOn: 0 }),
      end: endOfWeek(anchor, { weekStartsOn: 0 }),
    };
  }
  return { start: startOfDay(anchor), end: startOfDay(anchor) };
}

function toEventStatus(status: string | null | undefined): CalendarEvent["status"] {
  if (status === "in_progress") return "in_progress";
  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";
  return "scheduled";
}

function recurrenceBaseRule(rule: string | null | undefined): "daily" | "weekly" | "monthly" | null {
  const raw = (rule || "").trim().toLowerCase();
  if (!raw) return null;
  const base = raw.split("|")[0]?.trim() ?? "";
  if (base === "daily") return "daily";
  if (base === "weekly") return "weekly";
  if (base === "monthly") return "monthly";
  return null;
}

function combineLocalDateWithTimeFrom(day: Date, timeSource: Date): Date {
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    timeSource.getHours(),
    timeSource.getMinutes(),
    timeSource.getSeconds(),
    timeSource.getMilliseconds(),
  );
}

function dayMatchesRecurrence(
  day: Date,
  anchorStart: Date,
  kind: "daily" | "weekly" | "monthly",
): boolean {
  const d0 = startOfDay(day);
  const anchorDay = startOfDay(anchorStart);
  if (isBefore(d0, anchorDay)) return false;
  if (kind === "daily") return true;
  if (kind === "weekly") return d0.getDay() === anchorDay.getDay();
  if (kind === "monthly") {
    const targetDom = anchorDay.getDate();
    const lastDom = new Date(d0.getFullYear(), d0.getMonth() + 1, 0).getDate();
    const dom = Math.min(targetDom, lastDom);
    return d0.getDate() === dom;
  }
  return false;
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
    sourceScheduleId: schedule.id,
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

function oneExpandedInstance(
  schedule: CareScheduleOut,
  patientNameById: Map<number, string>,
  instanceStart: Date,
  durationMs: number,
): CalendarEvent {
  const end = new Date(instanceStart.getTime() + durationMs);
  const instanceKey = `${schedule.id}-${instanceStart.toISOString()}`;
  return {
    id: encodeScheduleInstanceId(schedule.id, instanceStart),
    sourceScheduleId: schedule.id,
    instanceKey,
    title: schedule.title,
    startTime: instanceStart,
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

/**
 * Maps workflow schedules to calendar events, expanding daily/weekly/monthly rows
 * across `range` when `recurrence_rule` is set (supports optional `|notify_missed=1` suffix).
 */
export function schedulesToCalendarEvents(
  schedules: CareScheduleOut[],
  patientNameById: Map<number, string>,
  range?: { start: Date; end: Date } | null,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const effRange =
    range ??
    (() => {
      if (!schedules.length) return null;
      let minT = new Date(schedules[0].starts_at).getTime();
      let maxT = minT;
      for (const s of schedules) {
        const t = new Date(s.starts_at).getTime();
        minT = Math.min(minT, t);
        maxT = Math.max(maxT, t);
      }
      return { start: addDays(new Date(minT), -14), end: addDays(new Date(maxT), 120) };
    })();

  for (const schedule of schedules) {
    const kind = recurrenceBaseRule(schedule.recurrence_rule);
    if (!kind || !effRange) {
      events.push(scheduleToCalendarEvent(schedule, patientNameById));
      continue;
    }

    const anchorStart = new Date(schedule.starts_at);
    const anchorEnd = schedule.ends_at
      ? new Date(schedule.ends_at)
      : new Date(anchorStart.getTime() + FALLBACK_EVENT_DURATION_MS);
    const durationMs = Math.max(5 * 60 * 1000, anchorEnd.getTime() - anchorStart.getTime());

    const from = startOfDay(effRange.start);
    const to = startOfDay(effRange.end);
    if (isBefore(to, from)) {
      events.push(scheduleToCalendarEvent(schedule, patientNameById));
      continue;
    }

    const days = eachDayOfInterval({ start: from, end: to });
    for (const day of days) {
      if (!dayMatchesRecurrence(day, anchorStart, kind)) continue;
      const instanceStart = combineLocalDateWithTimeFrom(day, anchorStart);
      if (instanceStart.getTime() > effRange.end.getTime()) continue;
      const instanceEnd = new Date(instanceStart.getTime() + durationMs);
      if (instanceEnd.getTime() < effRange.start.getTime()) continue;
      events.push(oneExpandedInstance(schedule, patientNameById, instanceStart, durationMs));
    }
  }

  return events;
}
