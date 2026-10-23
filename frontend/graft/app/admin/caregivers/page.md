# app/admin/caregivers/page.tsx

- TaskFormValues · type · L63-L63 — type TaskFormValues = z.infer<typeof taskFormSchema>;
- ScheduleFormValues · type · L64-L64 — type ScheduleFormValues = z.infer<typeof scheduleFormSchema>;
- CaregiverRow · type · L66-L75 — type CaregiverRow = { id: number; fullName: string; photoUrl: string | null; role: string; department: string; phone: string; email: string; isActive: boolean; };
- ScheduleRow · type · L77-L85 — type ScheduleRow = { id: number; title: string; scheduleType: string; status: string; assignedRole: string | null; assignedUserId: number | null; startsAt: string; };
- TaskRow · type · L87-L96 — type TaskRow = { id: number; title: string; description: string; priority: string; status: string; dueAt: string | null; assignedRole: string | null; assignedUserId: number | null; };
- parseRequestError · function · L98-L102 — function parseRequestError(error: unknown): string
- toIsoDateTime · function · L104-L106 — function toIsoDateTime(value: string): string
- recurrenceToApiRule · function · L108-L110 — function recurrenceToApiRule(value: ScheduleFormValues["recurrenceRule"]): string
- recurrenceLabel · function · L112-L117 — function recurrenceLabel(value: ScheduleFormValues["recurrenceRule"]): string
- getRoleBadgeVariant · function · L119-L130 — function getRoleBadgeVariant(role: string): "default" | "secondary" | "destructive" | "outline"
- getPriorityBadgeVariant · function · L132-L143 — function getPriorityBadgeVariant(priority: string): "default" | "secondary" | "destructive" | "outline"
- AdminCaregiversPage · function · L145-L895 — function AdminCaregiversPage()
