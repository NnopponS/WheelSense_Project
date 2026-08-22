# components/head-caregiver/tasks/TaskDetailModal.tsx

- TaskDetailModalProps · interface · L78-L92 — interface TaskDetailModalProps
- formatDate · function · L109-L119 — function formatDate(dateStr?: string): string
- formatDateShort · function · L121-L129 — function formatDateShort(dateStr?: string): string
- getPriorityColor · function · L131-L144 — function getPriorityColor(priority: string): string
- getStatusColor · function · L146-L159 — function getStatusColor(status: string): string
- buildReportSchema · function · L161-L195 — function buildReportSchema(fields: ReportTemplateField[]): z.ZodObject<Record<string, z.ZodTypeAny>>
- TaskDetailModal · function · L197-L1301 — function TaskDetailModal({ task, role = "head-nurse", isOpen, onClose, reports = [], isLoadingReports = false, onUpdateTask, onSubmitReport, onDeleteTask, onArchiveTask, onRestoreTask, canManage = false, canExecute = false, }: TaskDetailModalProps)
- handleFieldChange · function · L267-L270 — handleFieldChange = (field: keyof TaskUpdate, value: TaskUpdate[keyof TaskUpdate])
- handleSave · function · L272-L281 — handleSave = ()
- handleDelete · function · L283-L290 — handleDelete = ()
- handleArchive · function · L292-L295 — handleArchive = ()
- handleRestore · function · L297-L300 — handleRestore = ()
- handleSubtaskToggle · function · L302-L311 — handleSubtaskToggle = (subtaskId: string, currentStatus: string)
- handleAddSubtask · function · L313-L327 — handleAddSubtask = ()
- handleRemoveSubtask · function · L329-L336 — handleRemoveSubtask = (subtaskId: string)
- toggleReportExpand · function · L338-L348 — toggleReportExpand = (reportId: number)
