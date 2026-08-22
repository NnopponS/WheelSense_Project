# components/messaging/WorkflowMessageAttachmentViews.tsx

- PendingAttachmentChip · type · L15-L15 — type PendingAttachmentChip = { pendingId: string; filename: string };
- ComposeProps · type · L17-L24 — type ComposeProps = { idPrefix: string; items: PendingAttachmentChip[]; onAdd: (file: File) => Promise<void>; onRemove: (pendingId: string) => void; disabled?: boolean; busy?: boolean; };
- WorkflowComposeAttachments · function · L26-L103 — function WorkflowComposeAttachments({ idPrefix, items, onAdd, onRemove, disabled, busy, }: ComposeProps)
- ReadonlyProps · type · L105-L109 — type ReadonlyProps = { messageId: number; attachments: RoleMessageAttachmentOut[]; linkLabelKey?: TranslationKey; };
- WorkflowMessageAttachmentLinks · function · L111-L141 — function WorkflowMessageAttachmentLinks({ messageId, attachments, linkLabelKey }: ReadonlyProps)
