# lib/workflowTaskBoard.ts

- WorkflowTaskBoardColumn · type · L4-L4 — type WorkflowTaskBoardColumn = "pending" | "in_progress" | "completed";
- taskToBoardColumn · function · L6-L11 — function taskToBoardColumn(task: CareTaskOut): WorkflowTaskBoardColumn
- boardColumnToApiStatus · function · L14-L16 — function boardColumnToApiStatus(column: WorkflowTaskBoardColumn): string
- boardColumnDroppableId · function · L18-L20 — function boardColumnDroppableId(column: WorkflowTaskBoardColumn): string
- taskDraggableId · function · L22-L24 — function taskDraggableId(taskId: number): string
- parseTaskDraggableId · function · L26-L30 — function parseTaskDraggableId(id: string | number): number | null
- parseBoardColumnFromOver · function · L32-L47 — function parseBoardColumnFromOver( overId: string | number | null | undefined, tasks: CareTaskOut[], ): WorkflowTaskBoardColumn | null
