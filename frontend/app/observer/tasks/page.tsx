"use client";

import { Suspense, useState, useMemo, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isToday, isPast, parseISO } from "date-fns";
import {
  Bell,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  ClipboardCheck,
  User,
  RefreshCw,
} from "lucide-react";
import ObserverWorkflowPage from "@/app/observer/workflow/page";
import ObserverAlertsPage from "@/app/observer/alerts/page";
import ObserverCalendarPage from "@/app/observer/calendar/page";
import { useHubTab, HubTabBar, type HubTab } from "@/components/shared/HubTabBar";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { api, ApiError } from "@/lib/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { CareTaskOut } from "@/lib/api/task-scope-types";

const TABS: HubTab[] = [
  { key: "tasks", label: "Tasks", icon: ClipboardCheck },
  { key: "workflow", label: "Workflow", icon: Clock },
  { key: "alerts", label: "Alerts", icon: Bell },
  { key: "calendar", label: "Calendar", icon: Calendar },
];

export default function ObserverTasksPage() {
  const tab = useHubTab(TABS);
  return (
    <div>
      <Suspense><HubTabBar tabs={TABS} /></Suspense>
      {tab === "tasks" && <TasksContent />}
      {tab === "workflow" && <ObserverWorkflowPage />}
      {tab === "alerts" && <ObserverAlertsPage />}
      {tab === "calendar" && <ObserverCalendarPage />}
    </div>
  );
}

function taskMutationErrorMessage(
  error: unknown,
  translate: (key: TranslationKey) => string,
): string {
  if (error instanceof ApiError && error.status === 403) {
    return translate("observer.tasks.permissionDenied");
  }
  if (error instanceof Error && error.message) return error.message;
  return translate("observer.tasks.updateFailed");
}

function TasksContent() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [completingTaskId, setCompletingTaskId] = useState<number | null>(null);
  const [taskActionError, setTaskActionError] = useState<string | null>(null);

  const {
    data: tasksData,
    isLoading,
  } = useQuery({
    queryKey: ["observer", "tasks", "list"],
    queryFn: () => api.listWorkflowTasks({ limit: 300 }),
  });

  const tasks = useMemo(() => tasksData ?? [], [tasksData]);
  const invalidateTaskLists = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["observer", "tasks"] });
    await queryClient.invalidateQueries({ queryKey: ["observer", "dashboard", "tasks"] });
    await queryClient.invalidateQueries({ queryKey: ["observer", "patients"] });
    await queryClient.invalidateQueries({ queryKey: ["observer", "patient-detail"] });
  }, [queryClient]);

  const completeTaskMutation = useMutation({
    mutationFn: (taskId: number) =>
      api.updateWorkflowTask(taskId, {
        status: "completed",
      }),
    onSuccess: async () => {
      setTaskActionError(null);
      await invalidateTaskLists();
    },
  });

  const startTaskMutation = useMutation({
    mutationFn: (taskId: number) => api.updateWorkflowTask(taskId, { status: "in_progress" }),
    onSuccess: async () => {
      setTaskActionError(null);
      await invalidateTaskLists();
    },
  });

  const groupedTasks = useMemo(() => {
    const pending = tasks.filter((t) => t.status === "pending" || t.status === "assigned");
    const inProgress = tasks.filter((t) => t.status === "in_progress");
    const completed = tasks.filter((t) => t.status === "completed");
    const overdue = pending.filter((t) => t.due_at && isPast(parseISO(t.due_at)));

    return {
      pending,
      inProgress,
      completed,
      overdue,
    };
  }, [tasks]);

  const handleCompleteTask = useCallback(
    async (taskId: number) => {
      setCompletingTaskId(taskId);
      try {
        setTaskActionError(null);
        await completeTaskMutation.mutateAsync(taskId);
      } catch (err) {
        setTaskActionError(taskMutationErrorMessage(err, t));
      } finally {
        setCompletingTaskId(null);
      }
    },
    [completeTaskMutation, t]
  );

  const handleStartTask = useCallback(
    async (taskId: number) => {
      try {
        setTaskActionError(null);
        await startTaskMutation.mutateAsync(taskId);
      } catch (err) {
        setTaskActionError(taskMutationErrorMessage(err, t));
      }
    },
    [startTaskMutation, t]
  );

  const stats = useMemo(() => {
    return {
      total: tasks.length,
      pending: groupedTasks.pending.length,
      inProgress: groupedTasks.inProgress.length,
      completed: groupedTasks.completed.length,
      overdue: groupedTasks.overdue.length,
    };
  }, [tasks, groupedTasks]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("nav.tasks")}</h1>
          <p className="text-sm text-muted-foreground">{t("observer.tasks.subtitle")}</p>
        </div>

        <Button
          variant="outline"
          onClick={() => {
            setTaskActionError(null);
            void invalidateTaskLists();
          }}
          disabled={isLoading}
        >
          <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
          {t("observer.tasks.refresh")}
        </Button>
      </div>

      {taskActionError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("observer.tasks.errorTitle")}</AlertTitle>
          <AlertDescription>{taskActionError}</AlertDescription>
        </Alert>
      ) : null}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">{t("observer.tasks.total")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
            <div className="text-xs text-muted-foreground">{t("observer.tasks.pending")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-600">{stats.inProgress}</div>
            <div className="text-xs text-muted-foreground">{t("observer.tasks.inProgress")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-emerald-600">{stats.completed}</div>
            <div className="text-xs text-muted-foreground">{t("observer.tasks.completed")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className={cn("text-2xl font-bold", stats.overdue > 0 ? "text-red-600" : "")}>
              {stats.overdue}
            </div>
            <div className="text-xs text-muted-foreground">{t("observer.tasks.overdue")}</div>
          </CardContent>
        </Card>
      </div>

      {/* Overdue Tasks Alert */}
      {groupedTasks.overdue.length > 0 && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-900/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4" />
              {t("observer.tasks.overdueAlert")} ({groupedTasks.overdue.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {groupedTasks.overdue.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                variant="overdue"
                onComplete={() => handleCompleteTask(task.id)}
                onStart={() => handleStartTask(task.id)}
                isCompleting={completingTaskId === task.id}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pending Tasks */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <Clock className="h-4 w-4 text-amber-600" />
              {t("observer.tasks.pending")} ({groupedTasks.pending.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {groupedTasks.pending.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {t("observer.tasks.noPending")}
              </div>
            ) : (
              groupedTasks.pending.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  variant="pending"
                  onComplete={() => handleCompleteTask(task.id)}
                  onStart={() => handleStartTask(task.id)}
                  isCompleting={completingTaskId === task.id}
                />
              ))
            )}
          </CardContent>
        </Card>

        {/* In Progress Tasks */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <Circle className="h-4 w-4 text-blue-600" />
              {t("observer.tasks.inProgress")} ({groupedTasks.inProgress.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {groupedTasks.inProgress.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {t("observer.tasks.noInProgress")}
              </div>
            ) : (
              groupedTasks.inProgress.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  variant="in-progress"
                  onComplete={() => handleCompleteTask(task.id)}
                  isCompleting={completingTaskId === task.id}
                />
              ))
            )}
          </CardContent>
        </Card>

        {/* Completed Tasks */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              {t("observer.tasks.completed")} ({groupedTasks.completed.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {groupedTasks.completed.slice(0, 6).map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  variant="completed"
                  compact
                />
              ))}
            </div>
            {groupedTasks.completed.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {t("observer.tasks.noCompleted")}
              </div>
            )}
            {groupedTasks.completed.length > 6 && (
              <div className="mt-3 text-center text-sm text-muted-foreground">
                +{groupedTasks.completed.length - 6} {t("observer.tasks.moreCompleted")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Task Item Component
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
              : "border-border/50 bg-card hover:bg-muted/30"
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
            <span className={cn("flex items-center gap-1", isOverdue && "text-red-600 font-medium")}>
              <Clock className="h-3 w-3" />
              {t("observer.tasks.due")} {format(dueTime, isToday(dueTime) ? "HH:mm" : "MMM d, HH:mm")}
              {isOverdue && ` (${t("observer.tasks.overdueSuffix")})`}
            </span>
          )}
        </div>

        {variant === "pending" && onStart && (
          <div className="mt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={onStart}
              className="text-xs"
            >
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
