"use client";

import { useMemo } from "react";
import { format, isPast, isToday } from "date-fns";
import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Clock, GripVertical, User } from "lucide-react";
import type { CareTaskOut } from "@/lib/api/task-scope-types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import {
  boardColumnDroppableId,
  parseBoardColumnFromOver,
  parseTaskDraggableId,
  taskDraggableId,
  taskToBoardColumn,
  type WorkflowTaskBoardColumn,
} from "@/lib/workflowTaskBoard";

export interface WorkflowTasksKanbanProps {
  tasks: CareTaskOut[];
  onColumnChange: (taskId: number, column: WorkflowTaskBoardColumn) => void;
  /** Task ids currently being persisted */
  pendingTaskIds?: ReadonlySet<number>;
  getPatientLabel?: (patientId: number | null) => string | undefined;
  className?: string;
}

function KanbanColumn({
  column,
  title,
  count,
  children,
}: {
  column: WorkflowTaskBoardColumn;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: boardColumnDroppableId(column) });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[min(70vh,520px)] flex-1 flex-col rounded-xl border border-border/70 bg-muted/15 p-3 transition-colors",
        isOver && "border-primary/60 bg-primary/5 ring-2 ring-primary/25",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="tabular-nums text-xs text-muted-foreground">{count}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto pr-0.5">{children}</div>
    </div>
  );
}

function KanbanTaskCard({
  task,
  patientLine,
  disabled,
}: {
  task: CareTaskOut;
  patientLine?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: taskDraggableId(task.id),
    disabled,
    data: { task },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  const due = task.due_at ? new Date(task.due_at) : null;
  const overdue = due && isPast(due) && task.status !== "completed";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-xl border border-border/80 bg-card p-3 shadow-sm transition-shadow",
        isDragging && "z-10 cursor-grabbing opacity-90 shadow-lg ring-2 ring-primary/30",
        !isDragging && "cursor-grab",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <div className="flex items-start gap-2">
          <button
            type="button"
            className="mt-0.5 shrink-0 rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("workflowTasks.kanban.dragHandleAria")}
            {...listeners}
            {...attributes}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium leading-snug text-foreground">{task.title}</div>
            {task.description ? (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
            ) : null}
            {patientLine ? (
              <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                <User className="h-3 w-3 shrink-0" />
                <span className="truncate">{patientLine}</span>
              </div>
            ) : null}
            {due ? (
              <div
                className={cn(
                  "mt-1 flex items-center gap-1 text-xs",
                  overdue ? "font-medium text-destructive" : "text-muted-foreground",
                )}
              >
                <Clock className="h-3 w-3 shrink-0" />
                {t("headNurse.taskDuePrefix")}{" "}
                {format(due, isToday(due) ? "HH:mm" : "MMM d, HH:mm")}
                {overdue ? ` · ${t("observer.tasks.overdueSuffix")}` : ""}
              </div>
            ) : null}
            {task.priority ? (
              <div className="mt-2">
                <Badge variant="secondary" className="text-[10px] uppercase">
                  {task.priority}
                </Badge>
              </div>
            ) : null}
          </div>
        </div>
    </div>
  );
}

export function WorkflowTasksKanban({
  tasks,
  onColumnChange,
  pendingTaskIds,
  getPatientLabel,
  className,
}: WorkflowTasksKanbanProps) {
  const { t } = useTranslation();
  const pending = pendingTaskIds ?? new Set<number>();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const grouped = useMemo(() => {
    const buckets: Record<WorkflowTaskBoardColumn, CareTaskOut[]> = {
      pending: [],
      in_progress: [],
      completed: [],
    };
    for (const task of tasks) {
      buckets[taskToBoardColumn(task)].push(task);
    }
    return buckets;
  }, [tasks]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const taskId = parseTaskDraggableId(active.id);
    if (taskId == null) return;
    const task = tasks.find((x) => x.id === taskId);
    if (!task) return;
    const targetCol = parseBoardColumnFromOver(over.id, tasks);
    if (!targetCol) return;
    if (taskToBoardColumn(task) === targetCol) return;
    onColumnChange(taskId, targetCol);
  };

  const columnTitle = (c: WorkflowTaskBoardColumn) => {
    switch (c) {
      case "pending":
        return t("workflowTasks.kanban.columnPending");
      case "in_progress":
        return t("workflowTasks.kanban.columnInProgress");
      case "completed":
        return t("workflowTasks.kanban.columnCompleted");
      default:
        return c;
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <p className="text-xs text-muted-foreground">{t("workflowTasks.kanban.dragHint")}</p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          {(["pending", "in_progress", "completed"] as const).map((col) => (
            <KanbanColumn
              key={col}
              column={col}
              title={columnTitle(col)}
              count={grouped[col].length}
            >
              {grouped[col].length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  {t("workflowTasks.kanban.emptyColumn")}
                </p>
              ) : (
                grouped[col].map((task) => {
                  const pl =
                    task.patient_id != null
                      ? getPatientLabel?.(task.patient_id) ??
                        `${t("headNurse.tasksHub.patientFallback")}${task.patient_id}`
                      : undefined;
                  return (
                    <KanbanTaskCard
                      key={task.id}
                      task={task}
                      patientLine={pl}
                      disabled={pending.has(task.id)}
                    />
                  );
                })
              )}
            </KanbanColumn>
          ))}
        </div>
      </DndContext>
    </div>
  );
}
