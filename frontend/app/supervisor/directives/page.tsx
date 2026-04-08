"use client";
"use no memo";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { ClipboardList, History, ListTodo, ShieldCheck } from "lucide-react";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import { SummaryStatCard } from "@/components/supervisor/SummaryStatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import type {
  AuditTrailEventOut,
  CareDirectiveOut,
  CareScheduleOut,
  CareTaskOut,
  CreateWorkflowScheduleRequest,
  CreateWorkflowTaskRequest,
  ListPatientsResponse,
} from "@/lib/api/task-scope-types";

const EMPTY_SELECT = "__empty__";

type DirectiveRow = {
  id: number;
  title: string;
  directiveText: string;
  patientName: string;
  targetRole: string | null;
  effectiveFrom: string;
  status: string;
};

type TaskRow = {
  id: number;
  title: string;
  patientName: string;
  status: string;
  priority: string;
  dueAt: string | null;
};

type ScheduleRow = {
  id: number;
  title: string;
  patientName: string;
  status: string;
  scheduleType: string;
  startsAt: string;
};

type AuditRow = {
  id: number;
  domain: string;
  action: string;
  entityType: string;
  patientName: string;
  createdAt: string;
};

type SupervisorTaskFormState = {
  patientId: string;
  title: string;
  description: string;
  priority: string;
  dueAt: string;
  assignedRole: string;
};

type SupervisorScheduleFormState = {
  patientId: string;
  title: string;
  scheduleType: string;
  startsAt: string;
  recurrenceRule: string;
  notes: string;
  assignedRole: string;
};

const defaultSupervisorTaskForm: SupervisorTaskFormState = {
  patientId: EMPTY_SELECT,
  title: "",
  description: "",
  priority: "normal",
  dueAt: "",
  assignedRole: EMPTY_SELECT,
};

const defaultSupervisorScheduleForm: SupervisorScheduleFormState = {
  patientId: EMPTY_SELECT,
  title: "",
  scheduleType: "round",
  startsAt: "",
  recurrenceRule: "RRULE:FREQ=DAILY",
  notes: "",
  assignedRole: EMPTY_SELECT,
};

function parseRequestError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Request failed.";
}

function optionalNumber(value: string): number | null {
  return value === EMPTY_SELECT ? null : Number(value);
}

function optionalRole(value: string): string | null {
  return value === EMPTY_SELECT ? null : value;
}

function toIsoOrNull(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function toRequiredIso(value: string): string {
  return new Date(value).toISOString();
}

const directivesKeys = {
  patients: ["supervisor", "directives", "patients"] as QueryKey,
  directives: ["supervisor", "directives", "directives"] as QueryKey,
  tasks: ["supervisor", "directives", "tasks"] as QueryKey,
  schedules: ["supervisor", "directives", "schedules"] as QueryKey,
  audit: ["supervisor", "directives", "audit"] as QueryKey,
};

export default function SupervisorDirectivesPage() {
  const queryClient = useQueryClient();
  const [pendingDirectiveId, setPendingDirectiveId] = useState<number | null>(null);
  const [pendingTaskId, setPendingTaskId] = useState<number | null>(null);
  const [pendingScheduleId, setPendingScheduleId] = useState<number | null>(null);
  const [taskForm, setTaskForm] = useState<SupervisorTaskFormState>(defaultSupervisorTaskForm);
  const [scheduleForm, setScheduleForm] = useState<SupervisorScheduleFormState>(
    defaultSupervisorScheduleForm,
  );
  const [createError, setCreateError] = useState<string | null>(null);

  const patientsQuery = useQuery({
    queryKey: directivesKeys.patients,
    queryFn: () => api.listPatients({ limit: 300 }),
  });

  const directivesQuery = useQuery({
    queryKey: directivesKeys.directives,
    queryFn: () => api.listWorkflowDirectives({ limit: 120 }),
  });

  const tasksQuery = useQuery({
    queryKey: directivesKeys.tasks,
    queryFn: () => api.listWorkflowTasks({ limit: 120 }),
  });

  const schedulesQuery = useQuery({
    queryKey: directivesKeys.schedules,
    queryFn: () => api.listWorkflowSchedules({ limit: 120 }),
  });

  const auditQuery = useQuery({
    queryKey: directivesKeys.audit,
    queryFn: () => api.listWorkflowAudit({ limit: 60 }),
  });

  const acknowledgeDirectiveMutation = useMutation({
    mutationFn: async (directiveId: number) => {
      await api.acknowledgeWorkflowDirective(directiveId, {
        note: "Supervisor acknowledged directive",
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: directivesKeys.directives });
      await queryClient.invalidateQueries({ queryKey: directivesKeys.audit });
      await queryClient.invalidateQueries({ queryKey: ["supervisor", "dashboard"] });
    },
    onSettled: () => {
      setPendingDirectiveId(null);
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async (variables: { id: number; status: "in_progress" | "completed" }) => {
      await api.updateWorkflowTask(variables.id, { status: variables.status });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: directivesKeys.tasks });
      await queryClient.invalidateQueries({ queryKey: directivesKeys.audit });
      await queryClient.invalidateQueries({ queryKey: ["supervisor", "dashboard"] });
    },
    onSettled: () => {
      setPendingTaskId(null);
    },
  });

  const updateScheduleMutation = useMutation({
    mutationFn: async (variables: { id: number; status: "completed" | "cancelled" }) => {
      await api.updateWorkflowSchedule(variables.id, { status: variables.status });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: directivesKeys.schedules });
      await queryClient.invalidateQueries({ queryKey: directivesKeys.audit });
      await queryClient.invalidateQueries({ queryKey: ["supervisor", "dashboard"] });
    },
    onSettled: () => {
      setPendingScheduleId(null);
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      if (!taskForm.title.trim()) throw new Error("Task title is required.");
      const payload = {
        patient_id: optionalNumber(taskForm.patientId),
        title: taskForm.title.trim(),
        description: taskForm.description.trim(),
        priority: taskForm.priority,
        due_at: toIsoOrNull(taskForm.dueAt),
        assigned_role: optionalRole(taskForm.assignedRole),
        assigned_user_id: null,
        schedule_id: null,
      } satisfies CreateWorkflowTaskRequest;
      await api.createWorkflowTask(payload);
    },
    onSuccess: async () => {
      setCreateError(null);
      setTaskForm(defaultSupervisorTaskForm);
      await queryClient.invalidateQueries({ queryKey: directivesKeys.tasks });
      await queryClient.invalidateQueries({ queryKey: directivesKeys.audit });
      await queryClient.invalidateQueries({ queryKey: ["supervisor", "dashboard"] });
    },
    onError: (error) => {
      setCreateError(parseRequestError(error));
    },
  });

  const createScheduleMutation = useMutation({
    mutationFn: async () => {
      if (!scheduleForm.title.trim()) throw new Error("Schedule title is required.");
      if (!scheduleForm.startsAt) throw new Error("Start time is required.");
      const payload = {
        patient_id: optionalNumber(scheduleForm.patientId),
        room_id: null,
        title: scheduleForm.title.trim(),
        schedule_type: scheduleForm.scheduleType,
        starts_at: toRequiredIso(scheduleForm.startsAt),
        ends_at: null,
        recurrence_rule: scheduleForm.recurrenceRule.trim() || "RRULE:FREQ=DAILY",
        assigned_role: optionalRole(scheduleForm.assignedRole),
        assigned_user_id: null,
        notes: scheduleForm.notes.trim(),
      } satisfies CreateWorkflowScheduleRequest;
      await api.createWorkflowSchedule(payload);
    },
    onSuccess: async () => {
      setCreateError(null);
      setScheduleForm(defaultSupervisorScheduleForm);
      await queryClient.invalidateQueries({ queryKey: directivesKeys.schedules });
      await queryClient.invalidateQueries({ queryKey: directivesKeys.audit });
      await queryClient.invalidateQueries({ queryKey: ["supervisor", "dashboard"] });
    },
    onError: (error) => {
      setCreateError(parseRequestError(error));
    },
  });

  const patients = useMemo(
    () => (patientsQuery.data ?? []) as ListPatientsResponse,
    [patientsQuery.data],
  );
  const directives = useMemo(
    () => (directivesQuery.data ?? []) as CareDirectiveOut[],
    [directivesQuery.data],
  );
  const tasks = useMemo(
    () => (tasksQuery.data ?? []) as CareTaskOut[],
    [tasksQuery.data],
  );
  const schedules = useMemo(
    () => (schedulesQuery.data ?? []) as CareScheduleOut[],
    [schedulesQuery.data],
  );
  const auditEvents = useMemo(
    () => (auditQuery.data ?? []) as AuditTrailEventOut[],
    [auditQuery.data],
  );

  const patientById = useMemo(
    () => new Map(patients.map((patient) => [patient.id, patient])),
    [patients],
  );

  const activeDirectives = useMemo(
    () => directives.filter((directive) => directive.status === "active"),
    [directives],
  );

  const pendingTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.status === "pending" || task.status === "in_progress")
        .sort((left, right) => {
          if (!left.due_at) return 1;
          if (!right.due_at) return -1;
          return left.due_at.localeCompare(right.due_at);
        }),
    [tasks],
  );

  const scheduledRows = useMemo(
    () => schedules.filter((schedule) => schedule.status === "scheduled"),
    [schedules],
  );

  const directiveRows = useMemo<DirectiveRow[]>(() => {
    return activeDirectives.map((directive) => {
      const patient = directive.patient_id ? patientById.get(directive.patient_id) : null;
      return {
        id: directive.id,
        title: directive.title,
        directiveText: directive.directive_text,
        patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : "Unit-wide",
        targetRole: directive.target_role,
        effectiveFrom: directive.effective_from,
        status: directive.status,
      };
    });
  }, [activeDirectives, patientById]);

  const taskRows = useMemo<TaskRow[]>(() => {
    return pendingTasks.map((task) => {
      const patient = task.patient_id ? patientById.get(task.patient_id) : null;
      return {
        id: task.id,
        title: task.title,
        patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : "Unit-wide",
        status: task.status,
        priority: task.priority,
        dueAt: task.due_at,
      };
    });
  }, [patientById, pendingTasks]);

  const scheduleRows = useMemo<ScheduleRow[]>(() => {
    return scheduledRows
      .map((schedule) => {
        const patient = schedule.patient_id ? patientById.get(schedule.patient_id) : null;
        return {
          id: schedule.id,
          title: schedule.title,
          patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : "Unit-wide",
          status: schedule.status,
          scheduleType: schedule.schedule_type,
          startsAt: schedule.starts_at,
        };
      })
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  }, [patientById, scheduledRows]);

  const auditRows = useMemo<AuditRow[]>(() => {
    return auditEvents.map((event) => {
      const patient = event.patient_id ? patientById.get(event.patient_id) : null;
      return {
        id: event.id,
        domain: event.domain,
        action: event.action,
        entityType: event.entity_type,
        patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : "-",
        createdAt: event.created_at,
      };
    });
  }, [auditEvents, patientById]);

  const directivesColumns = useMemo<ColumnDef<DirectiveRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Directive",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.title}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{row.original.directiveText}</p>
          </div>
        ),
      },
      { accessorKey: "patientName", header: "Patient" },
      {
        accessorKey: "targetRole",
        header: "Target role",
        cell: ({ row }) => row.original.targetRole || "Any role",
      },
      {
        accessorKey: "effectiveFrom",
        header: "Effective",
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.effectiveFrom)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.effectiveFrom)}</p>
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={acknowledgeDirectiveMutation.isPending && pendingDirectiveId === row.original.id}
            onClick={() => {
              setPendingDirectiveId(row.original.id);
              acknowledgeDirectiveMutation.mutate(row.original.id);
            }}
          >
            Acknowledge
          </Button>
        ),
      },
    ],
    [acknowledgeDirectiveMutation, pendingDirectiveId],
  );

  const taskColumns = useMemo<ColumnDef<TaskRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Task",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.title}</p>
            <p className="text-xs text-muted-foreground">{row.original.patientName}</p>
          </div>
        ),
      },
      {
        accessorKey: "priority",
        header: "Priority",
        cell: ({ row }) => {
          const priority = row.original.priority;
          const variant =
            priority === "critical"
              ? "destructive"
              : priority === "high"
                ? "warning"
                : priority === "normal"
                  ? "secondary"
                  : "outline";
          return <Badge variant={variant}>{priority}</Badge>;
        },
      },
      {
        accessorKey: "dueAt",
        header: "Due",
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.dueAt)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.dueAt)}</p>
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex flex-wrap justify-end gap-2">
            {row.original.status === "pending" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={updateTaskMutation.isPending && pendingTaskId === row.original.id}
                onClick={() => {
                  setPendingTaskId(row.original.id);
                  updateTaskMutation.mutate({ id: row.original.id, status: "in_progress" });
                }}
              >
                Start
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              disabled={updateTaskMutation.isPending && pendingTaskId === row.original.id}
              onClick={() => {
                setPendingTaskId(row.original.id);
                updateTaskMutation.mutate({ id: row.original.id, status: "completed" });
              }}
            >
              Complete
            </Button>
          </div>
        ),
      },
    ],
    [pendingTaskId, updateTaskMutation],
  );

  const scheduleColumns = useMemo<ColumnDef<ScheduleRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Schedule",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.title}</p>
            <p className="text-xs text-muted-foreground">{row.original.patientName}</p>
          </div>
        ),
      },
      { accessorKey: "scheduleType", header: "Type" },
      {
        accessorKey: "startsAt",
        header: "Starts",
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.startsAt)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.startsAt)}</p>
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              size="sm"
              disabled={updateScheduleMutation.isPending && pendingScheduleId === row.original.id}
              onClick={() => {
                setPendingScheduleId(row.original.id);
                updateScheduleMutation.mutate({ id: row.original.id, status: "completed" });
              }}
            >
              Complete
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={updateScheduleMutation.isPending && pendingScheduleId === row.original.id}
              onClick={() => {
                setPendingScheduleId(row.original.id);
                updateScheduleMutation.mutate({ id: row.original.id, status: "cancelled" });
              }}
            >
              Cancel
            </Button>
          </div>
        ),
      },
    ],
    [pendingScheduleId, updateScheduleMutation],
  );

  const auditColumns = useMemo<ColumnDef<AuditRow>[]>(
    () => [
      {
        accessorKey: "domain",
        header: "Domain",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.domain}</p>
            <p className="text-xs text-muted-foreground">{row.original.action}</p>
          </div>
        ),
      },
      { accessorKey: "entityType", header: "Entity" },
      { accessorKey: "patientName", header: "Patient" },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.createdAt)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.createdAt)}</p>
          </div>
        ),
      },
    ],
    [],
  );

  const isLoadingAny =
    patientsQuery.isLoading ||
    directivesQuery.isLoading ||
    tasksQuery.isLoading ||
    schedulesQuery.isLoading ||
    auditQuery.isLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Directives & Care Operations</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Acknowledge directives, progress tasks, and close schedules from a single board.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryStatCard icon={ShieldCheck} label="Active directives" value={activeDirectives.length} tone="critical" />
        <SummaryStatCard icon={ListTodo} label="Open tasks" value={pendingTasks.length} tone="warning" />
        <SummaryStatCard icon={ClipboardList} label="Scheduled rounds" value={scheduledRows.length} tone="info" />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Create</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                setCreateError(null);
                createTaskMutation.mutate();
              }}
            >
              <div>
                <p className="text-sm font-medium text-foreground">Create task</p>
                <p className="text-xs text-muted-foreground">
                  Queue a patient or unit-wide task for care execution.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={taskForm.title}
                  onChange={(event) => setTaskForm((form) => ({ ...form, title: event.target.value }))}
                  placeholder="Task title"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  rows={3}
                  value={taskForm.description}
                  onChange={(event) =>
                    setTaskForm((form) => ({ ...form, description: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Patient</Label>
                  <Select
                    value={taskForm.patientId}
                    onValueChange={(value) => setTaskForm((form) => ({ ...form, patientId: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Unit-wide" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EMPTY_SELECT}>Unit-wide</SelectItem>
                      {patients.map((patient) => (
                        <SelectItem key={patient.id} value={String(patient.id)}>
                          {patient.first_name} {patient.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select
                    value={taskForm.priority}
                    onValueChange={(value) => setTaskForm((form) => ({ ...form, priority: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">normal</SelectItem>
                      <SelectItem value="high">high</SelectItem>
                      <SelectItem value="critical">critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Due at</Label>
                  <Input
                    type="datetime-local"
                    value={taskForm.dueAt}
                    onChange={(event) => setTaskForm((form) => ({ ...form, dueAt: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Assign role</Label>
                  <Select
                    value={taskForm.assignedRole}
                    onValueChange={(value) =>
                      setTaskForm((form) => ({ ...form, assignedRole: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EMPTY_SELECT}>Unassigned</SelectItem>
                      <SelectItem value="head_nurse">head_nurse</SelectItem>
                      <SelectItem value="caregiver">caregiver</SelectItem>
                      <SelectItem value="observer">observer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="submit" disabled={createTaskMutation.isPending}>
                Create task
              </Button>
            </form>

            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                setCreateError(null);
                createScheduleMutation.mutate();
              }}
            >
              <div>
                <p className="text-sm font-medium text-foreground">Create schedule</p>
                <p className="text-xs text-muted-foreground">
                  Add a scheduled care round or check-in.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={scheduleForm.title}
                  onChange={(event) => setScheduleForm((form) => ({ ...form, title: event.target.value }))}
                  placeholder="Schedule title"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Patient</Label>
                  <Select
                    value={scheduleForm.patientId}
                    onValueChange={(value) =>
                      setScheduleForm((form) => ({ ...form, patientId: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Unit-wide" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EMPTY_SELECT}>Unit-wide</SelectItem>
                      {patients.map((patient) => (
                        <SelectItem key={patient.id} value={String(patient.id)}>
                          {patient.first_name} {patient.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Input
                    value={scheduleForm.scheduleType}
                    onChange={(event) =>
                      setScheduleForm((form) => ({ ...form, scheduleType: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Starts at</Label>
                  <Input
                    type="datetime-local"
                    value={scheduleForm.startsAt}
                    onChange={(event) =>
                      setScheduleForm((form) => ({ ...form, startsAt: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Assign role</Label>
                  <Select
                    value={scheduleForm.assignedRole}
                    onValueChange={(value) =>
                      setScheduleForm((form) => ({ ...form, assignedRole: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EMPTY_SELECT}>Unassigned</SelectItem>
                      <SelectItem value="head_nurse">head_nurse</SelectItem>
                      <SelectItem value="caregiver">caregiver</SelectItem>
                      <SelectItem value="observer">observer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Recurrence</Label>
                <Input
                  value={scheduleForm.recurrenceRule}
                  onChange={(event) =>
                    setScheduleForm((form) => ({ ...form, recurrenceRule: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  rows={3}
                  value={scheduleForm.notes}
                  onChange={(event) => setScheduleForm((form) => ({ ...form, notes: event.target.value }))}
                />
              </div>
              <Button type="submit" disabled={createScheduleMutation.isPending}>
                Create schedule
              </Button>
            </form>
          </div>
          {createError ? <p className="text-sm text-destructive">{createError}</p> : null}
        </CardContent>
      </Card>

      <DataTableCard
        title="Directive Acknowledgement Queue"
        description="Directives awaiting supervisor acknowledgement."
        data={directiveRows}
        columns={directivesColumns}
        isLoading={isLoadingAny}
        emptyText="There are no active directives waiting for acknowledgement."
      />

      <DataTableCard
        title="Task Execution"
        description="Pending and in-progress tasks with inline status controls."
        data={taskRows}
        columns={taskColumns}
        isLoading={isLoadingAny}
        emptyText="No pending or in-progress tasks are currently assigned."
      />

      <DataTableCard
        title="Schedule Control"
        description="Scheduled care rounds with completion and cancellation controls."
        data={scheduleRows}
        columns={scheduleColumns}
        isLoading={isLoadingAny}
        emptyText="No upcoming schedules need action."
      />

      <DataTableCard
        title="Workflow Audit Trail"
        description="Latest workflow domain actions for traceability."
        data={auditRows}
        columns={auditColumns}
        isLoading={isLoadingAny}
        emptyText="No workflow audit activity has been recorded yet."
        rightSlot={<History className="h-4 w-4 text-muted-foreground" />}
      />
    </div>
  );
}

