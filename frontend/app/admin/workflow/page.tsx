"use client";
"use no memo";

import { useCallback, useId, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { ClipboardList, FileText, History, Plus } from "lucide-react";
import SearchableListboxPicker, {
  type SearchableListboxOption,
} from "@/components/shared/SearchableListboxPicker";
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
  CreateWorkflowDirectiveRequest,
  CreateWorkflowScheduleRequest,
  CreateWorkflowTaskRequest,
  ListPatientsResponse,
  ListUsersResponse,
} from "@/lib/api/task-scope-types";

const EMPTY_SELECT = "__empty__";

type WorkflowFormKind = "task" | "schedule" | "directive";
type AssignmentMode = "role" | "person";

type TaskFormState = {
  patientId: string;
  title: string;
  description: string;
  priority: string;
  dueAt: string;
  assignmentMode: AssignmentMode;
  assignedRole: string;
  assignedUserId: string;
};

type ScheduleFormState = {
  patientId: string;
  title: string;
  scheduleType: string;
  startsAt: string;
  recurrenceRule: string;
  notes: string;
  assignmentMode: AssignmentMode;
  assignedRole: string;
  assignedUserId: string;
};

type DirectiveFormState = {
  patientId: string;
  title: string;
  directiveText: string;
  assignmentMode: AssignmentMode;
  targetRole: string;
  targetUserId: string;
  effectiveFrom: string;
};

type WorkflowRow = {
  id: number;
  type: string;
  title: string;
  patientName: string;
  status: string;
  timestamp: string;
};

type AuditRow = {
  id: number;
  domain: string;
  action: string;
  entityType: string;
  patientName: string;
  createdAt: string;
};

const defaultTaskForm: TaskFormState = {
  patientId: EMPTY_SELECT,
  title: "",
  description: "",
  priority: "normal",
  dueAt: "",
  assignmentMode: "role",
  assignedRole: EMPTY_SELECT,
  assignedUserId: EMPTY_SELECT,
};

const defaultScheduleForm: ScheduleFormState = {
  patientId: EMPTY_SELECT,
  title: "",
  scheduleType: "round",
  startsAt: "",
  recurrenceRule: "RRULE:FREQ=DAILY",
  notes: "",
  assignmentMode: "role",
  assignedRole: EMPTY_SELECT,
  assignedUserId: EMPTY_SELECT,
};

const defaultDirectiveForm: DirectiveFormState = {
  patientId: EMPTY_SELECT,
  title: "",
  directiveText: "",
  assignmentMode: "role",
  targetRole: EMPTY_SELECT,
  targetUserId: EMPTY_SELECT,
  effectiveFrom: "",
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

function formatUserLabel(user: ListUsersResponse[number]): string {
  const linked = user.caregiver_id ? `Staff #${user.caregiver_id}` : user.patient_id ? `Patient #${user.patient_id}` : null;
  return linked ? `${user.username} (${linked})` : user.username;
}

function matchesSearch(value: string, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return value.toLowerCase().includes(needle);
}

function toIsoOrNull(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function toRequiredIso(value: string): string {
  return new Date(value).toISOString();
}

export default function AdminWorkflowPage() {
  const queryClient = useQueryClient();
  const [formKind, setFormKind] = useState<WorkflowFormKind>("task");
  const [taskForm, setTaskForm] = useState<TaskFormState>(defaultTaskForm);
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(defaultScheduleForm);
  const [directiveForm, setDirectiveForm] = useState<DirectiveFormState>(defaultDirectiveForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [taskPatientSearch, setTaskPatientSearch] = useState("");
  const [schedulePatientSearch, setSchedulePatientSearch] = useState("");
  const [directivePatientSearch, setDirectivePatientSearch] = useState("");
  const [taskAssigneeSearch, setTaskAssigneeSearch] = useState("");
  const [scheduleAssigneeSearch, setScheduleAssigneeSearch] = useState("");
  const [directiveAssigneeSearch, setDirectiveAssigneeSearch] = useState("");
  const taskPatientInputId = useId();
  const taskPatientListboxId = useId();
  const schedulePatientInputId = useId();
  const schedulePatientListboxId = useId();
  const directivePatientInputId = useId();
  const directivePatientListboxId = useId();
  const taskAssigneeInputId = useId();
  const taskAssigneeListboxId = useId();
  const scheduleAssigneeInputId = useId();
  const scheduleAssigneeListboxId = useId();
  const directiveAssigneeInputId = useId();
  const directiveAssigneeListboxId = useId();

  const patientsQuery = useQuery({
    queryKey: ["admin", "workflow", "patients"],
    queryFn: () => api.listPatients({ limit: 500 }),
  });

  const usersQuery = useQuery({
    queryKey: ["admin", "workflow", "users"],
    queryFn: () => api.listUsers(),
  });

  const tasksQuery = useQuery({
    queryKey: ["admin", "workflow", "tasks"],
    queryFn: () => api.listWorkflowTasks({ limit: 200 }),
  });

  const schedulesQuery = useQuery({
    queryKey: ["admin", "workflow", "schedules"],
    queryFn: () => api.listWorkflowSchedules({ limit: 200 }),
  });

  const directivesQuery = useQuery({
    queryKey: ["admin", "workflow", "directives"],
    queryFn: () => api.listWorkflowDirectives({ limit: 200 }),
  });

  const auditQuery = useQuery({
    queryKey: ["admin", "workflow", "audit"],
    queryFn: () => api.listWorkflowAudit({ limit: 80 }),
  });

  const invalidateWorkflow = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin", "workflow"] });
    await queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
  };

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
        assigned_user_id:
          taskForm.assignmentMode === "person" ? optionalNumber(taskForm.assignedUserId) : null,
        schedule_id: null,
      } satisfies CreateWorkflowTaskRequest;
      if (taskForm.assignmentMode === "person") payload.assigned_role = null;
      if (taskForm.assignmentMode === "role") payload.assigned_user_id = null;
      await api.createWorkflowTask(payload);
    },
    onSuccess: async () => {
      setFormError(null);
      setTaskForm(defaultTaskForm);
      setTaskPatientSearch("");
      setTaskAssigneeSearch("");
      await invalidateWorkflow();
    },
    onError: (error) => setFormError(parseRequestError(error)),
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
        assigned_user_id:
          scheduleForm.assignmentMode === "person" ? optionalNumber(scheduleForm.assignedUserId) : null,
        notes: scheduleForm.notes.trim(),
      } satisfies CreateWorkflowScheduleRequest;
      if (scheduleForm.assignmentMode === "person") payload.assigned_role = null;
      if (scheduleForm.assignmentMode === "role") payload.assigned_user_id = null;
      await api.createWorkflowSchedule(payload);
    },
    onSuccess: async () => {
      setFormError(null);
      setScheduleForm(defaultScheduleForm);
      setSchedulePatientSearch("");
      setScheduleAssigneeSearch("");
      await invalidateWorkflow();
    },
    onError: (error) => setFormError(parseRequestError(error)),
  });

  const createDirectiveMutation = useMutation({
    mutationFn: async () => {
      if (!directiveForm.title.trim()) throw new Error("Directive title is required.");
      if (!directiveForm.directiveText.trim()) throw new Error("Directive text is required.");
      const payload = {
        patient_id: optionalNumber(directiveForm.patientId),
        title: directiveForm.title.trim(),
        directive_text: directiveForm.directiveText.trim(),
        target_role: optionalRole(directiveForm.targetRole),
        target_user_id:
          directiveForm.assignmentMode === "person" ? optionalNumber(directiveForm.targetUserId) : null,
        effective_from: toIsoOrNull(directiveForm.effectiveFrom),
        effective_until: null,
      } satisfies CreateWorkflowDirectiveRequest;
      if (directiveForm.assignmentMode === "person") payload.target_role = null;
      if (directiveForm.assignmentMode === "role") payload.target_user_id = null;
      await api.createWorkflowDirective(payload);
    },
    onSuccess: async () => {
      setFormError(null);
      setDirectiveForm(defaultDirectiveForm);
      setDirectivePatientSearch("");
      setDirectiveAssigneeSearch("");
      await invalidateWorkflow();
    },
    onError: (error) => setFormError(parseRequestError(error)),
  });

  const patients = useMemo(
    () => (patientsQuery.data ?? []) as ListPatientsResponse,
    [patientsQuery.data],
  );
  const users = useMemo(() => (usersQuery.data ?? []) as ListUsersResponse, [usersQuery.data]);
  const tasks = useMemo(() => (tasksQuery.data ?? []) as CareTaskOut[], [tasksQuery.data]);
  const schedules = useMemo(
    () => (schedulesQuery.data ?? []) as CareScheduleOut[],
    [schedulesQuery.data],
  );
  const directives = useMemo(
    () => (directivesQuery.data ?? []) as CareDirectiveOut[],
    [directivesQuery.data],
  );
  const auditEvents = useMemo(
    () => (auditQuery.data ?? []) as AuditTrailEventOut[],
    [auditQuery.data],
  );

  const patientById = useMemo(
    () => new Map(patients.map((patient) => [patient.id, patient])),
    [patients],
  );

  const userOptions = useMemo<SearchableListboxOption[]>(
    () =>
      users
        .filter((user) => user.is_active && user.role !== "patient")
        .map((user) => ({
          id: String(user.id),
          title: formatUserLabel(user),
          subtitle: user.role,
        })),
    [users],
  );

  const makePatientOptions = useCallback(
    (search: string): SearchableListboxOption[] => {
      const options: SearchableListboxOption[] = [
        { id: EMPTY_SELECT, title: "Unit-wide", subtitle: "No patient limit" },
        ...patients.map((patient) => ({
          id: String(patient.id),
          title: `${patient.first_name} ${patient.last_name}`.trim(),
          subtitle: patient.room_id ? `Room #${patient.room_id}` : `Patient #${patient.id}`,
        })),
      ];
      return options.filter((option) =>
        matchesSearch(`${option.title} ${option.subtitle ?? ""}`, search),
      );
    },
    [patients],
  );

  const makeUserOptions = useCallback(
    (search: string): SearchableListboxOption[] =>
      userOptions.filter((option) =>
        matchesSearch(`${option.title} ${option.subtitle ?? ""} ${option.id}`, search),
      ),
    [userOptions],
  );

  const patientName = useCallback((patientId: number | null) => {
    const patient = patientId ? patientById.get(patientId) : null;
    return patient ? `${patient.first_name} ${patient.last_name}`.trim() : "Unit-wide";
  }, [patientById]);

  const workflowRows = useMemo<WorkflowRow[]>(() => {
    const taskRows = tasks.map((task) => ({
      id: task.id,
      type: "Task",
      title: task.title,
      patientName: patientName(task.patient_id),
      status: task.status,
      timestamp: task.due_at ?? task.created_at,
    }));
    const scheduleRows = schedules.map((schedule) => ({
      id: schedule.id,
      type: "Schedule",
      title: schedule.title,
      patientName: patientName(schedule.patient_id),
      status: schedule.status,
      timestamp: schedule.starts_at,
    }));
    const directiveRows = directives.map((directive) => ({
      id: directive.id,
      type: "Directive",
      title: directive.title,
      patientName: patientName(directive.patient_id),
      status: directive.status,
      timestamp: directive.effective_from,
    }));
    return [...taskRows, ...scheduleRows, ...directiveRows]
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .slice(0, 120);
  }, [directives, patientName, schedules, tasks]);

  const auditRows = useMemo<AuditRow[]>(() => {
    return auditEvents.map((event) => ({
      id: event.id,
      domain: event.domain,
      action: event.action,
      entityType: event.entity_type,
      patientName: event.patient_id ? patientName(event.patient_id) : "-",
      createdAt: event.created_at,
    }));
  }, [auditEvents, patientName]);

  const workflowColumns = useMemo<ColumnDef<WorkflowRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Item",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.title}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.type} · {row.original.patientName}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
      },
      {
        accessorKey: "timestamp",
        header: "Time",
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.timestamp)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.timestamp)}</p>
          </div>
        ),
      },
    ],
    [],
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
        cell: ({ row }) => formatRelativeTime(row.original.createdAt),
      },
    ],
    [],
  );

  const renderAssignmentMode = (
    mode: AssignmentMode,
    onModeChange: (mode: AssignmentMode) => void,
  ) => (
    <div className="flex rounded-lg border border-outline-variant/30 bg-surface-container-low p-1">
      {(["role", "person"] as AssignmentMode[]).map((modeOption) => (
        <button
          key={modeOption}
          type="button"
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
            mode === modeOption
              ? "bg-primary text-on-primary shadow-sm"
              : "text-on-surface-variant hover:bg-surface-container-high"
          }`}
          onClick={() => onModeChange(modeOption)}
        >
          {modeOption}
        </button>
      ))}
    </div>
  );

  const renderPatientPicker = ({
    value,
    search,
    setSearch,
    onChange,
    inputId,
    listboxId,
  }: {
    value: string;
    search: string;
    setSearch: (value: string) => void;
    onChange: (value: string) => void;
    inputId: string;
    listboxId: string;
  }) => (
    <SearchableListboxPicker
      inputId={inputId}
      listboxId={listboxId}
      options={makePatientOptions(search)}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search patient by name, id, or room"
      selectedOptionId={value}
      onSelectOption={(id) => {
        onChange(id);
        const selected = makePatientOptions("").find((option) => option.id === id);
        setSearch(selected?.title ?? "");
      }}
      disabled={patientsQuery.isLoading}
      listboxAriaLabel="Select patient"
      noMatchMessage="No matching patients"
      emptyStateMessage={patients.length === 0 ? "No patients available" : null}
      emptyNoMatch={search.trim().length > 0}
    />
  );

  const renderPersonPicker = ({
    value,
    search,
    setSearch,
    onChange,
    inputId,
    listboxId,
  }: {
    value: string;
    search: string;
    setSearch: (value: string) => void;
    onChange: (value: string) => void;
    inputId: string;
    listboxId: string;
  }) => (
    <SearchableListboxPicker
      inputId={inputId}
      listboxId={listboxId}
      options={makeUserOptions(search)}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search staff by username, role, or id"
      selectedOptionId={value === EMPTY_SELECT ? null : value}
      onSelectOption={(id) => {
        onChange(id);
        const selected = makeUserOptions("").find((option) => option.id === id);
        setSearch(selected?.title ?? "");
      }}
      disabled={usersQuery.isLoading}
      listboxAriaLabel="Select staff member"
      noMatchMessage="No matching staff"
      emptyStateMessage={userOptions.length === 0 ? "No staff accounts available" : null}
      emptyNoMatch={search.trim().length > 0}
    />
  );

  const isSaving =
    createTaskMutation.isPending ||
    createScheduleMutation.isPending ||
    createDirectiveMutation.isPending;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Workflow Console</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Create tasks, schedules, and directives for care operations.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryStatCard icon={ClipboardList} label="Tasks" value={tasks.length} tone="warning" />
        <SummaryStatCard icon={Plus} label="Schedules" value={schedules.length} tone="info" />
        <SummaryStatCard icon={FileText} label="Directives" value={directives.length} tone="critical" />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Create</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {(["task", "schedule", "directive"] as WorkflowFormKind[]).map((kind) => (
              <Button
                key={kind}
                type="button"
                variant={formKind === kind ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setFormKind(kind);
                  setFormError(null);
                }}
              >
                {kind}
              </Button>
            ))}
          </div>

          {formKind === "task" ? (
            <form
              className="grid gap-4 lg:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                createTaskMutation.mutate();
              }}
            >
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={taskForm.title}
                  onChange={(event) => setTaskForm((form) => ({ ...form, title: event.target.value }))}
                  placeholder="Task title"
                />
              </div>
              <div className="space-y-2">
                <Label>Patient</Label>
                {renderPatientPicker({
                  value: taskForm.patientId,
                  search: taskPatientSearch,
                  setSearch: setTaskPatientSearch,
                  onChange: (value) => setTaskForm((form) => ({ ...form, patientId: value })),
                  inputId: taskPatientInputId,
                  listboxId: taskPatientListboxId,
                })}
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
                <Label>Assign to</Label>
                {renderAssignmentMode(taskForm.assignmentMode, (assignmentMode) =>
                  setTaskForm((form) => ({
                    ...form,
                    assignmentMode,
                    assignedRole: assignmentMode === "role" ? form.assignedRole : EMPTY_SELECT,
                    assignedUserId: assignmentMode === "person" ? form.assignedUserId : EMPTY_SELECT,
                  })),
                )}
                {taskForm.assignmentMode === "role" ? (
                  <Select
                    value={taskForm.assignedRole}
                    onValueChange={(value) => setTaskForm((form) => ({ ...form, assignedRole: value }))}
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
                ) : (
                  renderPersonPicker({
                    value: taskForm.assignedUserId,
                    search: taskAssigneeSearch,
                    setSearch: setTaskAssigneeSearch,
                    onChange: (value) => setTaskForm((form) => ({ ...form, assignedUserId: value })),
                    inputId: taskAssigneeInputId,
                    listboxId: taskAssigneeListboxId,
                  })
                )}
              </div>
              <div className="space-y-2">
                <Label>Due at</Label>
                <Input
                  type="datetime-local"
                  value={taskForm.dueAt}
                  onChange={(event) => setTaskForm((form) => ({ ...form, dueAt: event.target.value }))}
                />
              </div>
              <div className="space-y-2 lg:col-span-2">
                <Label>Description</Label>
                <Textarea
                  rows={3}
                  value={taskForm.description}
                  onChange={(event) => setTaskForm((form) => ({ ...form, description: event.target.value }))}
                  placeholder="Task details"
                />
              </div>
              <div className="lg:col-span-2">
                <Button type="submit" disabled={isSaving}>
                  Create task
                </Button>
              </div>
            </form>
          ) : null}

          {formKind === "schedule" ? (
            <form
              className="grid gap-4 lg:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                createScheduleMutation.mutate();
              }}
            >
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={scheduleForm.title}
                  onChange={(event) => setScheduleForm((form) => ({ ...form, title: event.target.value }))}
                  placeholder="Schedule title"
                />
              </div>
              <div className="space-y-2">
                <Label>Patient</Label>
                {renderPatientPicker({
                  value: scheduleForm.patientId,
                  search: schedulePatientSearch,
                  setSearch: setSchedulePatientSearch,
                  onChange: (value) => setScheduleForm((form) => ({ ...form, patientId: value })),
                  inputId: schedulePatientInputId,
                  listboxId: schedulePatientListboxId,
                })}
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Input
                  value={scheduleForm.scheduleType}
                  onChange={(event) => setScheduleForm((form) => ({ ...form, scheduleType: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Starts at</Label>
                <Input
                  type="datetime-local"
                  value={scheduleForm.startsAt}
                  onChange={(event) => setScheduleForm((form) => ({ ...form, startsAt: event.target.value }))}
                />
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
                <Label>Assign to</Label>
                {renderAssignmentMode(scheduleForm.assignmentMode, (assignmentMode) =>
                  setScheduleForm((form) => ({
                    ...form,
                    assignmentMode,
                    assignedRole: assignmentMode === "role" ? form.assignedRole : EMPTY_SELECT,
                    assignedUserId: assignmentMode === "person" ? form.assignedUserId : EMPTY_SELECT,
                  })),
                )}
                {scheduleForm.assignmentMode === "role" ? (
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
                ) : (
                  renderPersonPicker({
                    value: scheduleForm.assignedUserId,
                    search: scheduleAssigneeSearch,
                    setSearch: setScheduleAssigneeSearch,
                    onChange: (value) =>
                      setScheduleForm((form) => ({ ...form, assignedUserId: value })),
                    inputId: scheduleAssigneeInputId,
                    listboxId: scheduleAssigneeListboxId,
                  })
                )}
              </div>
              <div className="space-y-2 lg:col-span-2">
                <Label>Notes</Label>
                <Textarea
                  rows={3}
                  value={scheduleForm.notes}
                  onChange={(event) => setScheduleForm((form) => ({ ...form, notes: event.target.value }))}
                />
              </div>
              <div className="lg:col-span-2">
                <Button type="submit" disabled={isSaving}>
                  Create schedule
                </Button>
              </div>
            </form>
          ) : null}

          {formKind === "directive" ? (
            <form
              className="grid gap-4 lg:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                createDirectiveMutation.mutate();
              }}
            >
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={directiveForm.title}
                  onChange={(event) => setDirectiveForm((form) => ({ ...form, title: event.target.value }))}
                  placeholder="Directive title"
                />
              </div>
              <div className="space-y-2">
                <Label>Patient</Label>
                {renderPatientPicker({
                  value: directiveForm.patientId,
                  search: directivePatientSearch,
                  setSearch: setDirectivePatientSearch,
                  onChange: (value) => setDirectiveForm((form) => ({ ...form, patientId: value })),
                  inputId: directivePatientInputId,
                  listboxId: directivePatientListboxId,
                })}
              </div>
              <div className="space-y-2">
                <Label>Target</Label>
                {renderAssignmentMode(directiveForm.assignmentMode, (assignmentMode) =>
                  setDirectiveForm((form) => ({
                    ...form,
                    assignmentMode,
                    targetRole: assignmentMode === "role" ? form.targetRole : EMPTY_SELECT,
                    targetUserId: assignmentMode === "person" ? form.targetUserId : EMPTY_SELECT,
                  })),
                )}
                {directiveForm.assignmentMode === "role" ? (
                  <Select
                    value={directiveForm.targetRole}
                    onValueChange={(value) =>
                      setDirectiveForm((form) => ({ ...form, targetRole: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Any role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EMPTY_SELECT}>Any role</SelectItem>
                      <SelectItem value="supervisor">supervisor</SelectItem>
                      <SelectItem value="head_nurse">head_nurse</SelectItem>
                      <SelectItem value="caregiver">caregiver</SelectItem>
                      <SelectItem value="observer">observer</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  renderPersonPicker({
                    value: directiveForm.targetUserId,
                    search: directiveAssigneeSearch,
                    setSearch: setDirectiveAssigneeSearch,
                    onChange: (value) =>
                      setDirectiveForm((form) => ({ ...form, targetUserId: value })),
                    inputId: directiveAssigneeInputId,
                    listboxId: directiveAssigneeListboxId,
                  })
                )}
              </div>
              <div className="space-y-2">
                <Label>Effective from</Label>
                <Input
                  type="datetime-local"
                  value={directiveForm.effectiveFrom}
                  onChange={(event) =>
                    setDirectiveForm((form) => ({ ...form, effectiveFrom: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2 lg:col-span-2">
                <Label>Directive</Label>
                <Textarea
                  rows={4}
                  value={directiveForm.directiveText}
                  onChange={(event) =>
                    setDirectiveForm((form) => ({ ...form, directiveText: event.target.value }))
                  }
                  placeholder="Directive details"
                />
              </div>
              <div className="lg:col-span-2">
                <Button type="submit" disabled={isSaving}>
                  Create directive
                </Button>
              </div>
            </form>
          ) : null}

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
        </CardContent>
      </Card>

      <DataTableCard
        title="Workflow Items"
        description="Recent tasks, schedules, and directives across the workspace."
        data={workflowRows}
        columns={workflowColumns}
        isLoading={tasksQuery.isLoading || schedulesQuery.isLoading || directivesQuery.isLoading}
        emptyText="No workflow items have been created yet."
      />

      <DataTableCard
        title="Workflow Audit"
        description="Latest workflow actions for traceability."
        data={auditRows}
        columns={auditColumns}
        isLoading={auditQuery.isLoading}
        emptyText="No workflow audit activity has been recorded yet."
        rightSlot={<History className="h-4 w-4 text-muted-foreground" />}
      />
    </div>
  );
}
