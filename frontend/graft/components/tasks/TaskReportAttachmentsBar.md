# components/tasks/TaskReportAttachmentsBar.tsx

- PendingAttachmentItem · interface · L14-L18 — interface PendingAttachmentItem
- TaskReportAttachmentsBarProps · interface · L20-L35 — interface TaskReportAttachmentsBarProps
- TaskReportAttachmentsBar · function · L37-L191 — function TaskReportAttachmentsBar({ pendingItems, onPendingItemsChange, taskId, serverAttachments, disabled, readOnly, className, }: TaskReportAttachmentsBarProps)
- handleFiles · function · L55-L73 — handleFiles = async (files: FileList | null)
- removePending · function · L75-L77 — removePending = (pendingId: string)
- openPendingPreview · function · L79-L88 — openPendingPreview = (p: PendingAttachmentItem)
- openServerPreview · function · L90-L100 — openServerPreview = (id: string, filename: string, ctype?: string)
