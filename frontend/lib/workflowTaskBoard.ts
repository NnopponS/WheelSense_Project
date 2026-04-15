import type { CareTaskOut } from "@/lib/api/task-scope-types";

/** Three-column board lanes aligned with workflow task PATCH statuses */
export type WorkflowTaskBoardColumn = "pending" | "in_progress" | "completed";

export function taskToBoardColumn(task: CareTaskOut): WorkflowTaskBoardColumn {
  const s = (task.status ?? "").toLowerCase();
  if (s === "completed") return "completed";
  if (s === "in_progress") return "in_progress";
  return "pending";
}

/** API body status for PATCH /workflow/tasks/{id} */
export function boardColumnToApiStatus(column: WorkflowTaskBoardColumn): string {
  return column;
}

export function boardColumnDroppableId(column: WorkflowTaskBoardColumn): string {
  return `col-${column}`;
}

export function taskDraggableId(taskId: number): string {
  return `task-${taskId}`;
}

export function parseTaskDraggableId(id: string | number): number | null {
  const s = String(id);
  const m = s.match(/^task-(\d+)$/);
  return m ? Number(m[1]) : null;
}

export function parseBoardColumnFromOver(
  overId: string | number | null | undefined,
  tasks: CareTaskOut[],
): WorkflowTaskBoardColumn | null {
  if (overId == null) return null;
  const s = String(overId);
  if (s.startsWith("col-")) {
    const lane = s.replace("col-", "") as WorkflowTaskBoardColumn;
    if (lane === "pending" || lane === "in_progress" || lane === "completed") return lane;
    return null;
  }
  const tid = parseTaskDraggableId(s);
  if (tid == null) return null;
  const hit = tasks.find((t) => t.id === tid);
  return hit ? taskToBoardColumn(hit) : null;
}
