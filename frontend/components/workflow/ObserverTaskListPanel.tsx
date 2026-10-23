"use client";

import { format, isPast, isToday } from "date-fns";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Clock,
  User,
} from "lucide-react";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { CareTaskOut } from "@/lib/api/task-scope-types";

export type GroupedObserverTasks = {
  pending: CareTaskOut[];
  inProgress: CareTaskOut[];
  completed: CareTaskOut[];
  overdue: CareTaskOut[];
};

interface ObserverTaskListPanelProps {
  grouped: GroupedObserverTasks;
  onComplete: (taskId: number) => void;
  onStart: (taskId: number) => void;
  completingTaskId: number | null;
}

export function ObserverTaskListPanel({
  grouped,
  onComplete,
  onStart,
  completingTaskId,
}: ObserverTaskListPanelProps) {
  const { t } = useTranslation();

  return (
    <>
      {grouped.overdue.length > 0 && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-900/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4" />
              {t("observer.tasks.overdueAlert")} ({grouped.overdue.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {grouped.overdue.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                variant="overdue"
                onComplete={() => onComplete(task.id)}
                onStart={() => onStart(task.id)}
                isCompleting={completingTaskId === task.id}
              />
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <Clock className="h-4 w-4 text-amber-600" />
              {t("observer.tasks.pending")} ({grouped.pending.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {grouped.pending.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {t("observer.tasks.noPending")}
              </div>
            ) : (
              grouped.pending.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  variant="pending"
                  onComplete={() => onComplete(task.id)}
                  onStart={() => onStart(task.id)}
                  isCompleting={completingTaskId === task.id}
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <Circle className="h-4 w-4 text-blue-600" />
              {t("observer.tasks.inProgress")} ({grouped.inProgress.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {grouped.inProgress.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {t("observer.tasks.noInProgress")}
              </div>
            ) : (
              grouped.inProgress.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  variant="in-progress"
                  onComplete={() => onComplete(task.id)}
                  isCompleting={completingTaskId === task.id}
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              {t("observer.tasks.completed")} ({grouped.completed.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {grouped.completed.slice(0, 6).map((task) => (
                <TaskItem key={task.id} task={task} variant="completed" compact />
              ))}
            </div>
            {grouped.completed.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {t("observer.tasks.noCompleted")}
              </div>
            )}
            {grouped.completed.length > 6 && (
              <div className="mt-3 text-center text-sm text-muted-foreground">
                +{grouped.completed.length - 6} {t("observer.tasks.moreCompleted")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

interface TaskItemProps {
  task: CareTaskOut;
  variant: "pending" | "in-progress" | "completed" | "overdue";
  onComplete?: () => void;
  onStart?: () => void;
  isCompleting?: boolean;
  compact?: boolean;
}

function TaskItem({
  task,
  variant,
  onComplete,
  onStart,
  isCompleting,
  compact = false,
}: TaskItemProps) {
  const { t } = useTranslation();
  const dueTime = task.due_at ? new Date(task.due_at) : null;
  const isOverdue = dueTime && isPast(dueTime) && variant !== "completed";

  if (compact) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/30 p-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{task.title}</div>
          {task.patient_id && (
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <User className="h-3 w-3" />
              {t("observer.tasks.patient")} #{task.patient_id}
            </div>
          )}
          {task.completed_at && (
            <div className="mt-1 text-xs text-muted-foreground">
              {t("observer.tasks.completedAt")} {format(new Date(task.completed_at), "MMM d, HH:mm")}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-xl border p-4 transition-colors",
        variant === "overdue"
          ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
          : variant === "in-progress"
            ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20"
            : variant === "completed"
              ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20"
              : "border-border/50 bg-card hover:bg-muted/30",
      )}
    >
      {variant !== "completed" && (
        <Checkbox
          checked={false}
          onCheckedChange={onComplete}
          disabled={isCompleting}
          className="mt-1"
        />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className={cn("font-medium", variant === "completed" && "line-through")}>
            {task.title}
          </div>
          <TaskBadge variant={variant} priority={task.priority} />
        </div>

        {task.description && (
          <div className="mt-1 text-sm text-muted-foreground">{task.description}</div>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {task.patient_id && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              Patient #{task.patient_id}
            </span>
          )}

          {dueTime && (
            <span className={cn("flex items-center gap-1", isOverdue && "font-medium text-red-600")}>
              <Clock className="h-3 w-3" />
              {t("observer.tasks.due")} {format(dueTime, isToday(dueTime) ? "HH:mm" : "MMM d, HH:mm")}
              {isOverdue && ` (${t("observer.tasks.overdueSuffix")})`}
            </span>
          )}
        </div>

        {variant === "pending" && onStart && (
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={onStart} className="text-xs">
              {t("observer.tasks.startTask")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function TaskBadge({
  variant,
  priority,
}: {
  variant: TaskItemProps["variant"];
  priority?: string;
}) {
  const { t } = useTranslation();
  const variants: Record<string, { color: string; label: TranslationKey }> = {
    pending: { color: "bg-amber-100 text-amber-700", label: "observer.tasks.pending" },
    "in-progress": { color: "bg-blue-100 text-blue-700", label: "observer.tasks.inProgress" },
    completed: { color: "bg-emerald-100 text-emerald-700", label: "observer.tasks.done" },
    overdue: { color: "bg-red-100 text-red-700", label: "observer.tasks.overdue" },
  };

  const priorityColors: Record<string, string> = {
    low: "bg-slate-100 text-slate-700",
    medium: "bg-blue-100 text-blue-700",
    high: "bg-amber-100 text-amber-700",
    urgent: "bg-red-100 text-red-700",
  };

  const v = variants[variant];

  return (
    <div className="flex gap-1">
      {priority && (
        <Badge
          variant="secondary"
          className={cn("text-xs", priorityColors[priority] ?? priorityColors.medium)}
        >
          {priority}
        </Badge>
      )}
      <Badge variant="secondary" className={cn("text-xs", v.color)}>
        {t(v.label)}
      </Badge>
    </div>
  );
}
