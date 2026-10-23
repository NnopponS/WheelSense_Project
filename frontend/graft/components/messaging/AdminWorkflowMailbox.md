# components/messaging/AdminWorkflowMailbox.tsx

- RecipientTarget · type · L48-L48 — type RecipientTarget = "role" | "user";
- MessageTab · type · L49-L49 — type MessageTab = "all" | "inbox" | "sent";
- RecipientFilterRole · type · L53-L53 — type RecipientFilterRole = (typeof RECIPIENT_FILTER_ROLES)[number];
- MessageRow · type · L57-L68 — type MessageRow = { id: number; subject: string; body: string; senderUserId: number; recipientRole: string | null; recipientUserId: number | null; recipientLabel: string; isRead: boolean; createdAt: string; attachments: RoleMessageAttachmentOut[]; };
- parseError · function · L70-L74 — function parseError(error: unknown, t: (key: TranslationKey) => string)
- workflowRoleDisplay · function · L76-L91 — function workflowRoleDisplay(role: string, t: (key: TranslationKey) => string): string
- recipientFilterRoleLabelKey · function · L93-L106 — function recipientFilterRoleLabelKey(role: RecipientFilterRole): TranslationKey
- AdminWorkflowMailbox · function · L108-L685 — function AdminWorkflowMailbox()
