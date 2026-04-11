"use client";

import { Suspense, useMemo, useState } from "react";
import { addMinutes, format } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  GitMerge,
  ListChecks,
  PlayCircle,
} from "lucide-react";
import { HubTabBar, useHubTab } from "@/components/shared/HubTabBar";
import { api } from "@/lib/api";
import type { CareTaskOut, ListPatientsResponse } from "@/lib/api/task-scope-types";
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
import { AgendaView } from "@/components/calendar/AgendaView";
import {
  CalendarView,
  type CalendarEvent,
  type CalendarViewMode,
} from "@/components/calendar/CalendarView";
import { buildPatientNameMap } from "@/components/calendar/scheduleEventMapper";
import HeadNurseWorkflowPage from "@/app/head-nurse/workflow/page";
import HeadNurseShiftChecklistsPage from "@/app/head-nurse/shift-checklists/page";
import HeadNurseTimelinePage from "@/app/head-nurse/timeline/page";

const TABS = [
  { key: "tasks", label: "Tasks", icon: ClipboardCheck },
  { key: "workflow", label: "Workflow", icon: GitMerge },
  { key: "checklist", label: "Checklist", icon: ListChecks },
  { key: "timeline", label: "Timeline", icon: Clock },
];

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

function TasksTabContent() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<CalendarViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedPatientId, setSelectedPatientId] = useState<string>(ALL_FILTER);
  const [selectedStatus, setSelectedStatus] = useState<
    "all" | "pending" | "in_progress" | "completed"
  >("all");
  const [pendingTaskId, setPendingTaskId] = useState<number | null>(null);

  const tasksQuery = useQuery({
    queryKey: ["head-nurse", "tasks", "board"],
    queryFn: () => api.listWorkflowTasks({ limit: 400 }),
  });
  const patientsQuery = useQuery({
    queryKey: ["head-nurse", "tasks", "patients"],
    queryFn: () => api.listPatients({ limit: 400 }),
  });

  const tasks = useMemo(() => (tasksQuery.data ?? []) as CareTaskOut[], [tasksQuery.data]);
  const patients = useMemo(
    () => (patientsQuery.data ?? []) as ListPatientsResponse,
    [patientsQuery.data],
  );
  const patientNameById = useMemo(() => buildPatientNameMap(patients), [patients]);

  const updateTaskMutation = useMutation({
    mutationFn: async (variables: { taskId: number; status: "in_progress" | "completed" }) => {
      await api.updateWorkflowTask(variables.taskId, { status: variables.status });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["head-nurse", "tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["head-nurse", "dashboard", "tasks"] });
    },
    onSettled: () => setPendingTaskId(null),
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
              ? patientNameById.get(task.patient_id) ?? `Patient #${task.patient_id}`
              : null,
          assigneeId: task.assigned_user_id ?? null,
          assigneeName: task.assigned_role ?? null,
          scheduleType: "task",
          priority: toPriority(task.priority),
          status: toStatus(task.status),
          recurrence: null,
        };
      });
  }, [filteredTasks, patientNameById]);

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

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-semibold text-foreground md:text-3xl">Task Calendar Board</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Time-oriented task board for ward execution, status updates, and due-time visibility.
        </p>
      </div>

      <section className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Open</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{stats.open}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">In progress</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-600">
              {stats.inProgress}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Completed today</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-600">
              {stats.completedToday}
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Filter by patient
          </p>
          <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
            <SelectTrigger>
              <SelectValue placeholder="All patients" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>All patients</SelectItem>
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
            Filter by status
          </p>
          <Select
            value={selectedStatus}
            onValueChange={(value) =>
              setSelectedStatus(value as "all" | "pending" | "in_progress" | "completed")
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

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
            title="Task agenda"
            emptyMessage="No tasks in the selected filter."
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
                Quick status actions
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
                  Mark selected as in progress
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
                  Mark selected as completed
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Selected task id: {pendingTaskId ?? "-"}
              </p>
            </CardContent>
          </Card>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Legend</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="secondary">Pending</Badge>
              <Badge variant="warning">In progress</Badge>
              <Badge variant="outline">Completed</Badge>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HeadNurseTasksPage() {
  const tab = useHubTab(TABS);

  return (
    <div>
      <Suspense>
        <HubTabBar tabs={TABS} />
      </Suspense>
      {tab === "tasks" && <TasksTabContent />}
      {tab === "workflow" && <HeadNurseWorkflowPage />}
      {tab === "checklist" && <HeadNurseShiftChecklistsPage />}
      {tab === "timeline" && <HeadNurseTimelinePage />}
    </div>
  );
}
