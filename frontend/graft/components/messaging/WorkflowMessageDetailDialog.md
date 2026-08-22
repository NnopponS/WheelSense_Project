# components/messaging/WorkflowMessageDetailDialog.tsx

- WorkflowMessageDetailDialogProps · type · L17-L26 — type WorkflowMessageDetailDialogProps = { open: boolean; onOpenChange: (open: boolean) => void; subject: string; body: string; meta?: ReactNode; contentClassName?: string; messageId?: number; attachments?: RoleMessageAttachmentOut[]; };
- WorkflowMessageDetailDialog · function · L28-L70 — function WorkflowMessageDetailDialog({ open, onOpenChange, subject, body, meta, contentClassName, messageId, attachments, }: WorkflowMessageDetailDialogProps)
- WorkflowMessagePreviewTriggerProps · type · L72-L77 — type WorkflowMessagePreviewTriggerProps = { subject: string; body: string; onOpen: () => void; className?: string; };
- WorkflowMessagePreviewTrigger · function · L79-L101 — function WorkflowMessagePreviewTrigger({ subject, body, onOpen, className, }: WorkflowMessagePreviewTriggerProps)
