# components/workflow/caregiverTaskListPanel.tsx

- GroupedObserverTasks · type · L19-L24 — type GroupedObserverTasks = { pending: CareTaskOut[]; inProgress: CareTaskOut[]; completed: CareTaskOut[]; overdue: CareTaskOut[]; };
- ObserverTaskListPanelProps · interface · L26-L31 — interface ObserverTaskListPanelProps
- ObserverTaskListPanel · function · L33-L148 — function ObserverTaskListPanel({ grouped, onComplete, onStart, completingTaskId, }: ObserverTaskListPanelProps)
- TaskItemProps · interface · L150-L157 — interface TaskItemProps
- TaskItem · function · L159-L254 — function TaskItem({ task, variant, onComplete, onStart, isCompleting, compact = false, }: TaskItemProps)
- TaskBadge · function · L256-L295 — function TaskBadge({ variant, priority, }: { variant: TaskItemProps["variant"]; priority?: string; })
