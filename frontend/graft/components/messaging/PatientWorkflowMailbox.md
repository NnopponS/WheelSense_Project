# components/messaging/PatientWorkflowMailbox.tsx

- MessagingRecipient · type · L44-L50 — type MessagingRecipient = { id: number; username: string; role: string; display_name: string; kind: string; };
- MessageRow · type · L52-L64 — type MessageRow = { id: number; subject: string; body: string; isRead: boolean; senderLabel: string; recipientLabel: string; createdAt: string; senderUserId: number; recipientRole: string | null; recipientUserId: number | null; attachments: RoleMessageAttachmentOut[]; };
- toErrorText · function · L66-L70 — function toErrorText(error: unknown, fallback: string): string
- PatientWorkflowMailbox · function · L72-L522 — function PatientWorkflowMailbox()
