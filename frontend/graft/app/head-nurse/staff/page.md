# app/head-caregiver/staff/page.tsx

- TaskFormValues · type · L63-L63 — type TaskFormValues = z.infer<typeof taskFormSchema>;
- ScheduleFormValues · type · L64-L64 — type ScheduleFormValues = z.infer<typeof scheduleFormSchema>;
- CaregiverRow · type · L66-L73 — type CaregiverRow = { id: number; fullName: string; role: string; phone: string; email: string; isActive: boolean; };
- ScheduleRow · type · L75-L84 — type ScheduleRow = { id: number; title: string; scheduleType: string; recurrenceRule: string; status: string; assignedRole: string | null; assignedUserId: number | null; startsAt: string; };
- TaskRow · type · L86-L95 — type TaskRow = { id: number; title: string; description: string; priority: string; status: string; dueAt: string | null; assignedRole: string | null; assignedUserId: number | null; };
- parseRequestError · function · L97-L101 — function parseRequestError(error: unknown): string
- portalUsersLinkedToCaregivers · function · L103-L107 — function portalUsersLinkedToCaregivers(users: User[]): User[]
- labelPortalUser · function · L109-L119 — function labelPortalUser( user: User, caregiverById: Map<number, { first_name: string; last_name: string }>, ): string
- toIsoDateTime · function · L121-L123 — function toIsoDateTime(value: string): string
- recurrenceToApiRule · function · L125-L127 — function recurrenceToApiRule(value: ScheduleFormValues["recurrenceRule"]): string
- HeadNurseStaffPage · function · L129-L976 — function HeadNurseStaffPage()
