"use client";

import { useMemo, useState } from "react";
import { addMinutes, format, isPast, parseISO } from "date-fns";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ClipboardList,
  LayoutGrid,
  List,
  PlayCircle,
  RefreshCw,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AgendaView } from "@/components/calendar/AgendaView";
import {
  CalendarView,
  type CalendarEvent,
  type CalendarViewMode,
} from "@/components/calendar/CalendarView";
import { buildPatientNameMap } from "@/components/calendar/scheduleEventMapper";
import { WorkflowTasksKanban } from "@/components/workflow/WorkflowTasksKanban";
import { ObserverTaskListPanel } from "@/components/workflow/ObserverTaskListPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { api, ApiError } from "@/lib/api";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { CareTaskOut, ListPatientsResponse } from "@/lib/api/task-scope-types";
import {
  boardColumnToApiStatus,
  type WorkflowTaskBoardColumn,
} from "@/lib/workflowTaskBoard";

const ALL_FILTER = "__all__";

function toPriority(priority: string): CalendarEvent["priority"] {
  if (priority === "critical") return "urgent";
  if (priority === "high") return "high";
  if (priority === "low") return "low";
  return "medium";
}

function toStatus(status: string): CalendarEvent["status"] {
  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";
  if (status === "in_progress") return "in_progress";
  return "scheduled";
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

const QUERY = {
  "head-nurse": {
    tasks: ["head-nurse", "tasks", "board"] as const,
    patients: ["head-nurse", "tasks", "patients"] as const,
    taskLimit: 400,
    invalidate: [
      ["head-nurse", "tasks"],
      ["head-nurse", "dashboard", "tasks"],
    ] as const,
  },
  observer: {
    tasks: ["observer", "tasks", "list"] as const,
    patients: ["observer", "tasks", "patients"] as const,
    taskLimit: 300,
    invalidate: [
      ["observer", "tasks"],
      ["observer", "dashboard", "tasks"],
      ["observer", "patients"],
      ["observer", "patient-detail"],
    ] as const,
  },
  supervisor: {
    tasks: ["supervisor", "tasks", "board"] as const,
    patients: ["supervisor", "tasks", "patients"] as const,
    taskLimit: 400,
    invalidate: [
      ["supervisor", "tasks"],
      ["supervisor", "dashboard", "tasks"],
      ["supervisor", "calendar", "tasks"],
    ] as const,
  },
} as const;

export type WorkflowTasksHubVariant = "head-nurse" | "observer" | "supervisor";

export interface WorkflowTasksHubContentProps {
  variant: WorkflowTasksHubVariant;
}

export function WorkflowTasksHubContent({ variant }: WorkflowTasksHubContentProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const q = QUERY[variant];

  const [viewMode, setViewMode] = useState<CalendarViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedPatientId, setSelectedPatientId] = useState<string>(ALL_FILTER);
  const [selectedStatus, setSelectedStatus] = useState<
    "all" | "pending" | "in_progress" | "completed"
  >("all");
  const [pendingTaskId, setPendingTaskId] = useState<number | null>(null);
  const [tasksLayout, setTasksLayout] = useState<"calendar" | "kanban" | "list">("calendar");
  const [savingTaskIds, setSavingTaskIds] = useState<Set<number>>(() => new Set());
  const [completingTaskId, setCompletingTaskId] = useState<number | null>(null);
  const [taskActionError, setTaskActionError] = useState<string | null>(null);

  const tasksQuery = useQuery({
    queryKey: [...q.tasks],
    queryFn: () => api.listWorkflowTasks({ limit: q.taskLimit }),
  });
  const patientsQuery = useQuery({
    queryKey: [...q.patients],
    queryFn: () => api.listPatients({ limit: 400 }),
  });

  const isLoading = tasksQuery.isLoading;
  const tasks = useMemo(() => (tasksQuery.data ?? []) as CareTaskOut[], [tasksQuery.data]);
  const patients = useMemo(
    () => (patientsQuery.data ?? []) as ListPatientsResponse,
    [patientsQuery.data],
  );
  const patientNameById = useMemo(() => buildPatientNameMap(patients), [patients]);

  const invalidateAll = async () => {
    for (const key of q.invalidate) {
      await queryClient.invalidateQueries({ queryKey: [...key] });
    }
  };

  const updateTaskMutation = useMutation({
    mutationFn: async (variables: { taskId: number; status: string }) => {
      await api.updateWorkflowTask(variables.taskId, { status: variables.status });
    },
    onMutate: ({ taskId }) => {
      setSavingTaskIds((prev) => new Set(prev).add(taskId));
    },
    onSuccess: async () => {
      if (variant === "observer") setTaskActionError(null);
      await invalidateAll();
    },
    onError: (err) => {
      if (variant === "observer") setTaskActionError(taskMutationErrorMessage(err, t));
    },
    onSettled: (_d, _e, variables) => {
      setPendingTaskId(null);
      if (variables) {
        setSavingTaskIds((prev) => {
          const n = new Set(prev);
          n.delete(variables.taskId);
          return n;
        });
      }
    },
  });

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (selectedStatus !== "all" && task.status !== selectedStatus) return false;
      if (selectedPatientId !== ALL_FILTER && task.patient_id !== Number(selectedPatientId)) {
        return false;
      }
      return true;
    });
  }, [tasks, selectedStatus, selectedPatientId]);

  const events = useMemo<CalendarEvent[]>(() => {
    return filteredTasks
      .filter((task) => task.due_at || task.created_at)
      .map((task) => {
        const start = new Date(task.due_at ?? task.created_at ?? new Date().toISOString());
        return {
          id: task.id,
          title: task.title,
          startTime: start,
          endTime: addMinutes(start, 30),
          patientId: task.patient_id ?? null,
          patientName:
            task.patient_id != null
              ? patientNameById.get(task.patient_id) ??
                `${t("headNurse.tasksHub.patientFallback")}${task.patient_id}`
              : null,
          assigneeId: task.assigned_user_id ?? null,
          assigneeName: task.assigned_role ?? null,
          scheduleType: "task",
          priority: toPriority(task.priority),
          status: toStatus(task.status),
          recurrence: null,
        };
      });
  }, [filteredTasks, patientNameById, t]);

  const stats = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    return {
      open: tasks.filter(
        (task) => task.status === "pending" || task.status === "in_progress",
      ).length,
      inProgress: tasks.filter((task) => task.status === "in_progress").length,
      completedToday: tasks.filter(
        (task) =>
          task.status === "completed" &&
          task.updated_at &&
          format(new Date(task.updated_at), "yyyy-MM-dd") === today,
      ).length,
    };
  }, [tasks]);

  const groupedFiltered = useMemo(() => {
    const pending = filteredTasks.filter((x) => x.status === "pending" || x.status === "assigned");
    const inProgress = filteredTasks.filter((x) => x.status === "in_progress");
    const completed = filteredTasks.filter((x) => x.status === "completed");
    const overdue = pending.filter((x) => x.due_at && isPast(parseISO(x.due_at)));
    return { pending, inProgress, completed, overdue };
  }, [filteredTasks]);

  const effectiveLayout =
    (variant === "head-nurse" || variant === "supervisor") && tasksLayout === "list"
      ? "calendar"
      : tasksLayout;

  const handleCompleteTask = async (taskId: number) => {
    setCompletingTaskId(taskId);
    try {
      setTaskActionError(null);
      await updateTaskMutation.mutateAsync({ taskId, status: "completed" });
    } catch {
      if (variant === "observer") {
        /* onError sets banner */
      }
    } finally {
      setCompletingTaskId(null);
    }
  };

  const handleStartTask = async (taskId: number) => {
    try {
      setTaskActionError(null);
      await updateTaskMutation.mutateAsync({ taskId, status: "in_progress" });
    } catch {
      /* observer: onError */
    }
  };

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
            {t("workflowTasks.hubBoardTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("workflowTasks.hubBoardSubtitle")}</p>
        </div>
        {variant === "observer" ? (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => {
              setTaskActionError(null);
              void invalidateAll();
            }}
            disabled={isLoading}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
            {t("observer.tasks.refresh")}
          </Button>
        ) : null}
      </div>

      {variant === "observer" && taskActionError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("observer.tasks.errorTitle")}</AlertTitle>
          <AlertDescription>{taskActionError}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("headNurse.tasksHub.statOpen")}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{stats.open}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("headNurse.tasksHub.statInProgress")}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-600">
              {stats.inProgress}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("headNurse.tasksHub.statCompletedToday")}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-600">
              {stats.completedToday}
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("headNurse.tasksHub.filterByPatient")}
          </p>
          <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
            <SelectTrigger>
              <SelectValue placeholder={t("headNurse.tasksHub.allPatients")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>{t("headNurse.tasksHub.allPatients")}</SelectItem>
              {patients.map((patient) => (
                <SelectItem key={patient.id} value={String(patient.id)}>
                  {patient.first_name} {patient.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("headNurse.tasksHub.filterByStatus")}
          </p>
          <Select
            value={selectedStatus}
            onValueChange={(value) =>
              setSelectedStatus(value as "all" | "pending" | "in_progress" | "completed")
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={t("headNurse.tasksHub.allStatuses")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("headNurse.tasksHub.allStatuses")}</SelectItem>
              <SelectItem value="pending">{t("headNurse.tasksHub.statusPending")}</SelectItem>
              <SelectItem value="in_progress">{t("headNurse.tasksHub.statusInProgress")}</SelectItem>
              <SelectItem value="completed">{t("headNurse.tasksHub.statusCompleted")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={effectiveLayout === "calendar" ? "default" : "outline"}
          size="sm"
          onClick={() => setTasksLayout("calendar")}
        >
          <Calendar className="mr-2 h-4 w-4" />
          {t("workflowTasks.kanban.viewCalendar")}
        </Button>
        <Button
          type="button"
          variant={effectiveLayout === "kanban" ? "default" : "outline"}
          size="sm"
          onClick={() => setTasksLayout("kanban")}
        >
          <LayoutGrid className="mr-2 h-4 w-4" />
          {t("workflowTasks.kanban.viewBoard")}
        </Button>
        {variant === "observer" ? (
          <Button
            type="button"
            variant={tasksLayout === "list" ? "default" : "outline"}
            size="sm"
            onClick={() => setTasksLayout("list")}
          >
            <List className="mr-2 h-4 w-4" />
            {t("observer.tasks.viewList")}
          </Button>
        ) : null}
      </div>

      {effectiveLayout === "kanban" ? (
        <WorkflowTasksKanban
          tasks={filteredTasks}
          pendingTaskIds={savingTaskIds}
          getPatientLabel={(pid) => (pid != null ? patientNameById.get(pid) : undefined)}
          onColumnChange={(taskId, column: WorkflowTaskBoardColumn) => {
            updateTaskMutation.mutate({
              taskId,
              status: boardColumnToApiStatus(column),
            });
          }}
        />
      ) : null}

      {effectiveLayout === "calendar" ? (
        <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
          <CalendarView
            events={events}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            currentDate={currentDate}
            onDateChange={setCurrentDate}
            showCreateButton={false}
            readOnly
          />

          <div className="space-y-4">
            <AgendaView
              events={events}
              maxDays={10}
              title={t("headNurse.tasksHub.agendaTitle")}
              emptyMessage={t("headNurse.tasksHub.agendaEmpty")}
              onEventComplete={(event) => {
                setPendingTaskId(event.id);
                updateTaskMutation.mutate({ taskId: event.id, status: "completed" });
              }}
              showCompleteButton
            />

            <Card>
              <CardContent className="space-y-3 p-4">
                <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                  <ClipboardList className="h-4 w-4" />
                  {t("headNurse.tasksHub.quickStatusTitle")}
                </p>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    disabled={pendingTaskId == null || updateTaskMutation.isPending}
                    onClick={() => {
                      if (!pendingTaskId) return;
                      updateTaskMutation.mutate({ taskId: pendingTaskId, status: "in_progress" });
                    }}
                  >
                    <PlayCircle className="mr-2 h-4 w-4" />
                    {t("headNurse.tasksHub.markInProgress")}
                  </Button>
                  <Button
                    className="w-full justify-start"
                    disabled={pendingTaskId == null || updateTaskMutation.isPending}
                    onClick={() => {
                      if (!pendingTaskId) return;
                      updateTaskMutation.mutate({ taskId: pendingTaskId, status: "completed" });
                    }}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {t("headNurse.tasksHub.markCompleted")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("headNurse.tasksHub.selectedTaskId")} {pendingTaskId ?? "-"}
                </p>
              </CardContent>
            </Card>

            <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("headNurse.tasksHub.legend")}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="secondary">{t("headNurse.tasksHub.statusPending")}</Badge>
                <Badge variant="warning">{t("headNurse.tasksHub.statusInProgress")}</Badge>
                <Badge variant="outline">{t("headNurse.tasksHub.statusCompleted")}</Badge>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {variant === "observer" && tasksLayout === "list" ? (
        <ObserverTaskListPanel
          grouped={groupedFiltered}
          onComplete={handleCompleteTask}
          onStart={handleStartTask}
          completingTaskId={completingTaskId}
        />
      ) : null}
    </div>
  );
}
