# components/calendar/ScheduleForm.tsx

- ScheduleFormValues · type · L95-L95 — type ScheduleFormValues = z.infer<typeof scheduleFormSchema>;
- ScheduleFormProps · interface · L97-L110 — interface ScheduleFormProps
- ScheduleForm · function · L114-L670 — function ScheduleForm({ open, onClose, onSuccess, initialDate, schedule, mode = "create", defaultAssigneeUserId = null, defaultPatientId = null, lockedPatientId = null, }: ScheduleFormProps)
- buildPayload · function · L241-L264 — buildPayload = (values: ScheduleFormValues)
- onSubmit · function · L266-L292 — onSubmit = async (values: ScheduleFormValues)
- handleClose · function · L294-L297 — handleClose = ()
- FormField · function · L672-L690 — function FormField({ label, error, children, className, }: { label: string; error?: string; children: React.ReactNode; className?: string; })
