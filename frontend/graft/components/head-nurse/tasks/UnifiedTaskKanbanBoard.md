# components/head-caregiver/tasks/UnifiedTaskKanbanBoard.tsx

- ColumnStatus · type · L43-L43 — type ColumnStatus = (typeof COLUMN_STATUSES)[number];
- TaskCardProps · interface · L96-L101 — interface TaskCardProps
- TaskCard · function · L103-L249 — function TaskCard({ task, onTaskClick, onStatusChange, isOverdue }: TaskCardProps)
- ColumnSkeleton · function · L253-L269 — function ColumnSkeleton()
- EmptyColumnStateProps · interface · L273-L277 — interface EmptyColumnStateProps
- EmptyColumnState · function · L279-L296 — function EmptyColumnState({ columnStatus, onCreateTask, canManage }: EmptyColumnStateProps)
- UnifiedTaskKanbanBoardProps · interface · L300-L309 — interface UnifiedTaskKanbanBoardProps
- UnifiedTaskKanbanBoard · function · L311-L544 — UnifiedTaskKanbanBoard = function UnifiedTaskKanbanBoard({ tasks, isLoading, onCreateTask, onTaskClick, onStatusChange, canManage = false, }: UnifiedTaskKanbanBoardProps)
- clearFilters · function · L367-L371 — clearFilters = ()
- isTaskOverdue · function · L373-L377 — isTaskOverdue = (task: TaskOut): boolean
