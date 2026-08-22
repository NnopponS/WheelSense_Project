# components/workflow/WorkflowTasksKanban.tsx

- WorkflowTasksKanbanProps · interface · L30-L37 — interface WorkflowTasksKanbanProps
- KanbanColumn · function · L39-L67 — function KanbanColumn({ column, title, count, children, }: { column: WorkflowTaskBoardColumn; title: string; count: number; children: React.ReactNode; })
- KanbanTaskCard · function · L69-L148 — function KanbanTaskCard({ task, patientLine, disabled, }: { task: CareTaskOut; patientLine?: string; disabled?: boolean; })
- WorkflowTasksKanban · function · L150-L247 — function WorkflowTasksKanban({ tasks, onColumnChange, pendingTaskIds, getPatientLabel, className, }: WorkflowTasksKanbanProps)
- handleDragEnd · function · L178-L189 — handleDragEnd = (event: DragEndEvent)
- columnTitle · function · L191-L202 — columnTitle = (c: WorkflowTaskBoardColumn)
