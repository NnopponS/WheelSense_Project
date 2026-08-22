# components/workflow/WorkflowJobsPanel.tsx

- WorkflowJobsPanelVariant · type · L27-L27 — type WorkflowJobsPanelVariant = "head-nurse" | "observer" | "supervisor";
- invalidateWorkflowTaskQueries · function · L36-L44 — function invalidateWorkflowTaskQueries( queryClient: ReturnType<typeof useQueryClient>, variant: WorkflowJobsPanelVariant, )
- stepProgress · function · L46-L51 — function stepProgress(job: CareWorkflowJobOut): { done: number; total: number }
- actorMayEditStep · function · L56-L65 — function actorMayEditStep( actorUserId: number | undefined, actorRole: string | undefined, stepAssignedUserId: number | null | undefined, ): boolean
- WorkflowJobsPanel · function · L67-L486 — function WorkflowJobsPanel({ variant }: { variant: WorkflowJobsPanelVariant })
- invalidate · function · L104-L108 — invalidate = ()
