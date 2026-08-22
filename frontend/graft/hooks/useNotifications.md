# hooks/useNotifications.tsx

- NotificationType · type · L33-L33 — type NotificationType = "alert" | "message" | "task" | "workflow_job";
- Notification · interface · L35-L45 — interface Notification
- UseNotificationsReturn · interface · L47-L54 — interface UseNotificationsReturn
- severityNotifyLevel · function · L56-L61 — function severityNotifyLevel(severity: string | undefined): "none" | "toast" | "toastSound"
- formatRoomLocationLine · function · L63-L72 — function formatRoomLocationLine(room: Room): string
- resolvePatientAlertContext · function · L74-L100 — async function resolvePatientAlertContext( patientId: number, t: (key: TranslationKey) => string, ): Promise<{ nameLine: string; roomLine: string }>
- transformAlert · function · L102-L114 — function transformAlert(alert: AlertOut, role: AppRole): Notification
- transformTask · function · L116-L128 — function transformTask(task: CareTaskOut, role: AppRole): Notification
- pendingWorkflowJobSteps · function · L130-L132 — function pendingWorkflowJobSteps(job: CareWorkflowJobOut): number
- workflowJobSignature · function · L134-L136 — function workflowJobSignature(job: CareWorkflowJobOut): string
- transformWorkflowJob · function · L138-L166 — function transformWorkflowJob( job: CareWorkflowJobOut, role: AppRole, t: (key: TranslationKey) => string, ): Notification
- transformMessage · function · L168-L184 — function transformMessage(message: RoleMessageOut, role: AppRole): Notification
- useNotifications · function · L186-L427 — function useNotifications(): UseNotificationsReturn
