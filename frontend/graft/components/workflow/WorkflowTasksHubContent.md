# components/workflow/WorkflowTasksHubContent.tsx

- toPriority · function · L48-L53 — function toPriority(priority: string): CalendarEvent["priority"]
- toStatus · function · L55-L60 — function toStatus(status: string): CalendarEvent["status"]
- taskMutationErrorMessage · function · L62-L71 — function taskMutationErrorMessage( error: unknown, translate: (key: TranslationKey) => string, ): string
- WorkflowTasksHubVariant · type · L109-L109 — type WorkflowTasksHubVariant = "head-nurse" | "observer" | "supervisor";
- WorkflowTasksHubContentProps · interface · L111-L113 — interface WorkflowTasksHubContentProps
- WorkflowTasksHubContent · function · L115-L570 — function WorkflowTasksHubContent({ variant }: WorkflowTasksHubContentProps)
- invalidateAll · function · L183-L187 — invalidateAll = async ()
- handleCompleteTask · function · L295-L307 — handleCompleteTask = async (taskId: number)
- handleStartTask · function · L309-L316 — handleStartTask = async (taskId: number)
