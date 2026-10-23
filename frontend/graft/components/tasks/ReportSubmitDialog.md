# components/tasks/ReportSubmitDialog.tsx

- ReportFormValues · type · L34-L34 — type ReportFormValues = z.infer<typeof reportSchema>;
- ReportSubmitDialogProps · interface · L38-L42 — interface ReportSubmitDialogProps
- formatFileSize · function · L46-L52 — function formatFileSize(bytes: number): string
- getFileIcon · function · L56-L63 — function getFileIcon(fileName: string): string
- ReportSubmitDialog · function · L67-L362 — function ReportSubmitDialog({ taskId, open, onOpenChange, }: ReportSubmitDialogProps)
- handleDragOver · function · L142-L146 — handleDragOver = (e: React.DragEvent<HTMLDivElement>)
- handleDragLeave · function · L148-L152 — handleDragLeave = (e: React.DragEvent<HTMLDivElement>)
- handleDrop · function · L154-L159 — handleDrop = (e: React.DragEvent<HTMLDivElement>)
- handleRemoveFile · function · L161-L163 — handleRemoveFile = (index: number)
- onSubmit · function · L167-L194 — onSubmit = (data: ReportFormValues)
- handleReset · function · L196-L199 — handleReset = ()
- handleOpenChange · function · L201-L206 — handleOpenChange = (newOpen: boolean)
