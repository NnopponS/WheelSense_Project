# components/messaging/StaffWorkflowMailbox.tsx

- RecipientFilterRole · type · L56-L56 — type RecipientFilterRole = (typeof RECIPIENT_FILTER_ROLES)[number];
- ComposeValues · type · L66-L66 — type ComposeValues = z.infer<typeof composeSchema>;
- StaffMailboxVariant · type · L68-L68 — type StaffMailboxVariant = "head_nurse" | "supervisor" | "observer";
- MessageRow · type · L70-L84 — type MessageRow = { id: number; subject: string; body: string; senderLabel: string; senderUserId: number; recipientRole: string | null; recipientLabel: string; recipientUserId: number | null; patientId: number | null; patientName: string; isRead: boolean; createdAt: string; attachments: RoleMessageAttachmentOut[]; };
- parseError · function · L127-L131 — function parseError(error: unknown): string
- fk · function · L134-L136 — function fk(key: string): TranslationKey
- recipientFilterRoleLabelKey · function · L138-L151 — function recipientFilterRoleLabelKey(role: RecipientFilterRole): TranslationKey
- StaffWorkflowMailbox · function · L153-L735 — function StaffWorkflowMailbox({ variant }: { variant: StaffMailboxVariant })
- fieldErr · function · L365-L373 — fieldErr = (key: "subject" | "body" | "recipientUserId"): string | undefined
