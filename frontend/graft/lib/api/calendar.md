# lib/api/calendar.ts

- CalendarEventType · type · L7-L7 — type CalendarEventType = "schedule" | "task" | "directive" | "shift";
- CalendarEventOut · interface · L9-L23 — interface CalendarEventOut
- fetchCalendarEvents · function · L25-L43 — async function fetchCalendarEvents(params: { start_at: string; end_at: string; patient_id?: number; person_user_id?: number; person_role?: string; limit?: number; }): Promise<CalendarEventOut[]>
