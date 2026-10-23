# components/patient/PatientCareRoadmap.tsx

- scheduleWindow · function · L20-L24 — function scheduleWindow(s: CareScheduleOut): { start: Date; end: Date }
- RoadColumn · type · L26-L26 — type RoadColumn = "past" | "now" | "next";
- classifySchedule · function · L28-L40 — function classifySchedule(s: CareScheduleOut, now: Date): RoadColumn | null
- classifyTask · function · L42-L51 — function classifyTask(t: CareTaskOut, now: Date): RoadColumn | null
- roomLabel · function · L53-L59 — function roomLabel(roomId: number | null | undefined, rooms: Room[]): string | null
- PatientCareRoadmapProps · interface · L61-L63 — interface PatientCareRoadmapProps
- PatientCareRoadmap · function · L65-L292 — function PatientCareRoadmap({ patientId }: PatientCareRoadmapProps)
- byTimeDesc · function · L117-L120 — byTimeDesc = ( a: { at: Date }, b: { at: Date }, )
- byTimeAsc · function · L121-L121 — byTimeAsc = (a: { at: Date }, b: { at: Date })
- renderRow · function · L145-L205 — renderRow = ( row: { kind: "schedule" | "task"; item: CareScheduleOut | CareTaskOut; at: Date }, tone: "muted" | "primary" | "default", )
