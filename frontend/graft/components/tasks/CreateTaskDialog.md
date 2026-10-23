# components/tasks/CreateTaskDialog.tsx

- StaffRoleValue · type · L46-L46 — type StaffRoleValue = (typeof STAFF_ROLE_VALUES)[number];
- TaskFormValues · type · L104-L104 — type TaskFormValues = z.input<typeof taskSchema>;
- CreateTaskDialogProps · interface · L108-L111 — interface CreateTaskDialogProps
- CreateTaskDialog · function · L115-L914 — function CreateTaskDialog({ open, onOpenChange, }: CreateTaskDialogProps)
- getStaffName · function · L171-L174 — getStaffName = (userId: number)
- staffUsersForRole · function · L176-L177 — staffUsersForRole = (role: StaffRoleValue | "")
- toDatetimeLocalValue · function · L179-L187 — toDatetimeLocalValue = (date?: Date | null)
- parseDatetimeLocal · function · L189-L194 — parseDatetimeLocal = (value: string)
- onSubmit · function · L196-L261 — onSubmit = async (data: TaskFormValues)
- handleReset · function · L263-L269 — handleReset = ()
- setSubRole · function · L630-L634 — setSubRole = (v: StaffRoleValue | "")
