# components/staff/StaffTimelinePanel.tsx

- TimelineItem · type · L12-L20 — type TimelineItem = { id: string; kind: "task" | "schedule"; title: string; description: string; status: string; priority?: string; timestamp: string | null; };
- StaffTimelinePanelProps · type · L22-L29 — type StaffTimelinePanelProps = { tasks: CareTaskOut[]; schedules: CareScheduleOut[]; title?: string; description?: string; className?: string; maxItems?: number; };
- timestampMs · function · L31-L35 — function timestampMs(value: string | null): number
- taskBadgeVariant · function · L37-L42 — function taskBadgeVariant(priority: string | undefined)
- StaffTimelinePanel · function · L44-L151 — function StaffTimelinePanel({ tasks, schedules, title, description, className, maxItems = 10, }: StaffTimelinePanelProps)
