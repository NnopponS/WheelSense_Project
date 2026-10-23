# components/patients/PatientCareCoordinationPanel.tsx

- VitalsRow · type · L46-L54 — type VitalsRow = { id: number; timestamp: string; heartRate: number | null; spo2: number | null; rrInterval: number | null; battery: number | null; source: string; };
- TaskRow · type · L56-L63 — type TaskRow = { id: number; title: string; description: string; priority: string; status: string; dueAt: string | null; };
- TimelineRow · type · L65-L72 — type TimelineRow = { id: number; eventType: string; description: string; roomName: string; source: string; timestamp: string; };
- MessageRow · type · L74-L84 — type MessageRow = { id: number; subject: string; body: string; senderUserId: number; recipientRole: string | null; recipientUserId: number | null; isRead: boolean; createdAt: string; attachments: RoleMessageAttachmentOut[]; };
- HandoverRow · type · L86-L92 — type HandoverRow = { id: number; note: string; priority: string; targetRole: string | null; createdAt: string; };
- HandoverTargetRoleChoice · type · L94-L94 — type HandoverTargetRoleChoice = "all" | "supervisor" | "admin" | "observer";
- AlertRow · type · L96-L104 — type AlertRow = { id: number; title: string; alertType: string; description: string; severity: string; status: string; timestamp: string; };
- errorText · function · L106-L116 — function errorText( error: unknown, translate: (key: TranslationKey) => string, fallbackKey: TranslationKey, ): string
- taskPriorityLabel · function · L118-L135 — function taskPriorityLabel(translate: (key: TranslationKey) => string, priority: string): string
- PatientCareCoordinationPanelProps · type · L140-L146 — type PatientCareCoordinationPanelProps = { patientId: number; /** When false, hide patient name heading (e.g. embedded in patient detail tabs). */ showHeader?: boolean; /** Link target for invalid patient id state. */ invalidBackHref?: string; };
- PatientCareCoordinationPanel · function · L148-L1097 — function PatientCareCoordinationPanel({ patientId, showHeader = true, invalidBackHref = "/caregiver/personnel", }: PatientCareCoordinationPanelProps)
