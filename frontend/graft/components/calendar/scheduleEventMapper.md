# components/calendar/scheduleEventMapper.ts

- encodeScheduleInstanceId · function · L21-L24 — function encodeScheduleInstanceId(scheduleId: number, day: Date): number
- resolveCareScheduleIdFromEvent · function · L27-L30 — function resolveCareScheduleIdFromEvent(ev: CalendarEvent): number
- visibleCalendarRange · function · L32-L49 — function visibleCalendarRange( anchor: Date, mode: CalendarViewMode, ): { start: Date; end: Date }
- toEventStatus · function · L51-L56 — function toEventStatus(status: string | null | undefined): CalendarEvent["status"]
- recurrenceBaseRule · function · L58-L66 — function recurrenceBaseRule(rule: string | null | undefined): "daily" | "weekly" | "monthly" | null
- combineLocalDateWithTimeFrom · function · L68-L78 — function combineLocalDateWithTimeFrom(day: Date, timeSource: Date): Date
- dayMatchesRecurrence · function · L80-L97 — function dayMatchesRecurrence( day: Date, anchorStart: Date, kind: "daily" | "weekly" | "monthly", ): boolean
- buildPatientNameMap · function · L99-L106 — function buildPatientNameMap(patients: ListPatientsResponse): Map<number, string>
- scheduleToCalendarEvent · function · L108-L135 — function scheduleToCalendarEvent( schedule: CareScheduleOut, patientNameById: Map<number, string>, ): CalendarEvent
- oneExpandedInstance · function · L137-L164 — function oneExpandedInstance( schedule: CareScheduleOut, patientNameById: Map<number, string>, instanceStart: Date, durationMs: number, ): CalendarEvent
- schedulesToCalendarEvents · function · L170-L222 — function schedulesToCalendarEvents( schedules: CareScheduleOut[], patientNameById: Map<number, string>, range?: { start: Date; end: Date } | null, ): CalendarEvent[]
