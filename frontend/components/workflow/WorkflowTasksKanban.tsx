"use client";

import { useMemo } from "react";
import { format, isPast, isToday } from "date-fns";
import {
  closestCorners,
  DndContext,
  KeyboardSensor,
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
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
        <span className="ws-tabular-nums text-sm text-muted-foreground">{count}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto pr-0.5">{children}</div>
    </div>
  );
}

function KanbanTaskCard({
  task,
  patientLine,
  disabled,
  onColumnChange,
}: {
  task: CareTaskOut;
  patientLine?: string;
  disabled?: boolean;
  onColumnChange: (column: WorkflowTaskBoardColumn) => void;
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
        disabled && "opacity-60",
      )}
      aria-disabled={disabled || undefined}
    >
      <div className="flex items-start gap-2">
          <button
            type="button"
            className="mt-0.5 flex h-11 w-11 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed"
            aria-label={t("workflowTasks.kanban.dragHandleAria")}
            disabled={disabled}
            {...listeners}
            {...attributes}
          >
            <GripVertical className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium leading-snug text-foreground">{task.title}</div>
            {task.description ? (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{task.description}</p>
            ) : null}
            {patientLine ? (
              <div className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                <User className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="truncate">{patientLine}</span>
              </div>
            ) : null}
            {due ? (
              <div
                className={cn(
                  "ws-tabular-nums mt-1 flex items-center gap-1.5 text-sm",
                  overdue ? "font-medium text-destructive" : "text-muted-foreground",
                )}
              >
                <Clock className="h-5 w-5 shrink-0" aria-hidden="true" />
                {t("headNurse.taskDuePrefix")}{" "}
                {format(due, isToday(due) ? "HH:mm" : "MMM d, HH:mm")}
                {overdue ? ` · ${t("observer.tasks.overdueSuffix")}` : ""}
              </div>
            ) : null}
            {task.priority ? (
              <div className="mt-2">
                <StatusBadge
                  label={task.priority}
                  tone={
                    task.priority === "critical"
                      ? "critical"
                      : task.priority === "high"
                        ? "warning"
                        : "neutral"
                  }
                />
              </div>
            ) : null}
            <div className="mt-3 space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground" htmlFor={`task-${task.id}-column`}>
                {t("workflowTasks.kanban.moveTo")}
              </label>
              <Select
                value={taskToBoardColumn(task)}
                disabled={disabled}
                onValueChange={(value) => onColumnChange(value as WorkflowTaskBoardColumn)}
              >
                <SelectTrigger id={`task-${task.id}-column`} className="h-11 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">{t("workflowTasks.kanban.columnPending")}</SelectItem>
                  <SelectItem value="in_progress">{t("workflowTasks.kanban.columnInProgress")}</SelectItem>
                  <SelectItem value="completed">{t("workflowTasks.kanban.columnCompleted")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
    useSensor(KeyboardSensor),
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
      <p className="text-sm text-muted-foreground">{t("workflowTasks.kanban.dragHint")}</p>
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
                <p className="py-8 text-center text-sm text-muted-foreground">
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
                      onColumnChange={(column) => {
                        if (taskToBoardColumn(task) !== column) {
                          onColumnChange(task.id, column);
                        }
                      }}
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
