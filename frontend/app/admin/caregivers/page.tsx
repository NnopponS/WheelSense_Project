"use client";
"use no memo";

import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { z } from "zod";
import { CalendarClock, ClipboardList, Plus, Search, UserCog, Users, Briefcase } from "lucide-react";
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
import { useAuth } from "@/hooks/useAuth";
import { getAccountManagementPath } from "@/lib/routes";
import type {
  CareTaskOut,
  CareScheduleOut,
  CreateWorkflowScheduleRequest,
  CreateWorkflowTaskRequest,
  ListCaregiversResponse,
} from "@/lib/api/task-scope-types";

const EMPTY_SELECT = "__empty__";
const TASK_PRIORITY_OPTIONS = ["normal", "high", "critical"] as const;
const SCHEDULE_TYPE_OPTIONS = ["round", "check_in", "medication", "handoff"] as const;

const taskFormSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().min(1, "Description is required"),
  priority: z.enum(TASK_PRIORITY_OPTIONS),
  dueAt: z.string(),
  scheduleId: z.string(),
  assignedUserId: z.string(),
});

const scheduleFormSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  scheduleType: z.enum(SCHEDULE_TYPE_OPTIONS),
  startsAt: z.string().min(1, "Start time is required"),
  recurrenceRule: z.string().trim(),
  notes: z.string().trim(),
  assignedUserId: z.string(),
});

type TaskFormValues = z.infer<typeof taskFormSchema>;
type ScheduleFormValues = z.infer<typeof scheduleFormSchema>;

type CaregiverRow = {
  id: number;
  fullName: string;
  role: string;
  department: string;
  phone: string;
  email: string;
  isActive: boolean;
};

type ScheduleRow = {
  id: number;
  title: string;
  scheduleType: string;
  status: string;
  assignedRole: string | null;
  assignedUserId: number | null;
  startsAt: string;
};

type TaskRow = {
  id: number;
  title: string;
  description: string;
  priority: string;
  status: string;
  dueAt: string | null;
  assignedRole: string | null;
  assignedUserId: number | null;
};

function parseRequestError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Request failed.";
}

function toIsoDateTime(value: string): string {
  return new Date(value).toISOString();
}

function getRoleBadgeVariant(role: string): "default" | "secondary" | "destructive" | "outline" {
  switch (role) {
    case "admin":
      return "destructive";
    case "head_nurse":
      return "default";
    case "supervisor":
      return "secondary";
    case "observer":
      return "outline";
    default:
      return "outline";
  }
}

function getPriorityBadgeVariant(priority: string): "default" | "secondary" | "destructive" | "outline" {
  switch (priority) {
    case "critical":
      return "destructive";
    case "high":
      return "secondary";
    case "normal":
      return "outline";
    default:
      return "outline";
  }
}

export default function AdminCaregiversPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [pendingTaskId, setPendingTaskId] = useState<number | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // Admin has workspace-wide caregiver access
  const caregiversQuery = useQuery({
    queryKey: ["admin", "caregivers", "list"],
    queryFn: () => api.listCaregivers({ limit: 400 }),
  });

  const schedulesQuery = useQuery({
    queryKey: ["admin", "staff", "schedules"],
    queryFn: () => api.listWorkflowSchedules({ limit: 200 }),
  });

  const tasksQuery = useQuery({
    queryKey: ["admin", "staff", "tasks"],
    queryFn: () => api.listWorkflowTasks({ limit: 240 }),
  });

  const taskForm = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "normal",
      dueAt: "",
      scheduleId: EMPTY_SELECT,
      assignedUserId: EMPTY_SELECT,
    },
  });

  const scheduleForm = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues: {
      title: "",
      scheduleType: "round",
      startsAt: "",
      recurrenceRule: "RRULE:FREQ=DAILY",
      notes: "",
      assignedUserId: EMPTY_SELECT,
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (values: TaskFormValues) => {
      const payload = {
        title: values.title.trim(),
        description: values.description.trim(),
        priority: values.priority,
        due_at: values.dueAt ? toIsoDateTime(values.dueAt) : null,
        schedule_id: values.scheduleId === EMPTY_SELECT ? null : Number(values.scheduleId),
        assigned_user_id: values.assignedUserId === EMPTY_SELECT ? null : Number(values.assignedUserId),
        assigned_role: null,
      } satisfies CreateWorkflowTaskRequest;

      await api.createWorkflowTask(payload);
    },
    onSuccess: async () => {
      setTaskError(null);
      taskForm.reset({
        title: "",
        description: "",
        priority: "normal",
        dueAt: "",
        scheduleId: EMPTY_SELECT,
        assignedUserId: EMPTY_SELECT,
      });
      await queryClient.invalidateQueries({ queryKey: ["admin", "staff", "tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "dashboard", "tasks"] });
    },
    onError: (error) => {
      setTaskError(parseRequestError(error));
    },
  });

  const createScheduleMutation = useMutation({
    mutationFn: async (values: ScheduleFormValues) => {
      const payload = {
        title: values.title.trim(),
        schedule_type: values.scheduleType,
        starts_at: toIsoDateTime(values.startsAt),
        ends_at: null,
        recurrence_rule: values.recurrenceRule.trim() || "RRULE:FREQ=DAILY",
        assigned_role: null,
        assigned_user_id: values.assignedUserId === EMPTY_SELECT ? null : Number(values.assignedUserId),
        notes: values.notes.trim(),
      } satisfies CreateWorkflowScheduleRequest;

      await api.createWorkflowSchedule(payload);
    },
    onSuccess: async () => {
      setScheduleError(null);
      scheduleForm.reset({
        title: "",
        scheduleType: "round",
        startsAt: "",
        recurrenceRule: "RRULE:FREQ=DAILY",
        notes: "",
        assignedUserId: EMPTY_SELECT,
      });
      await queryClient.invalidateQueries({ queryKey: ["admin", "staff", "schedules"] });
    },
    onError: (error) => {
      setScheduleError(parseRequestError(error));
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async (variables: { id: number; status: "in_progress" | "completed" }) => {
      await api.updateWorkflowTask(variables.id, { status: variables.status });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "staff", "tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "dashboard", "tasks"] });
    },
    onSettled: () => {
      setPendingTaskId(null);
    },
  });

  const caregivers = useMemo(
    () => (caregiversQuery.data ?? []) as ListCaregiversResponse,
    [caregiversQuery.data],
  );
  const schedules = useMemo(
    () => (schedulesQuery.data ?? []) as CareScheduleOut[],
    [schedulesQuery.data],
  );
  const tasks = useMemo(
    () => (tasksQuery.data ?? []) as CareTaskOut[],
    [tasksQuery.data],
  );

  const caregiverRows = useMemo<CaregiverRow[]>(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return caregivers
      .filter((item) => {
        if (!normalizedSearch) return true;
        const corpus = `${item.first_name} ${item.last_name} ${item.role} ${item.department} ${item.email} ${item.phone}`.toLowerCase();
        return corpus.includes(normalizedSearch);
      })
      .map((item) => ({
        id: item.id,
        fullName: `${item.first_name} ${item.last_name}`.trim() || `Caregiver #${item.id}`,
        role: item.role,
        department: item.department || "-",
        phone: item.phone || "-",
        email: item.email || "-",
        isActive: item.is_active,
      }));
  }, [caregivers, search]);

  const scheduleRows = useMemo<ScheduleRow[]>(() => {
    return [...schedules]
      .sort((left, right) => left.starts_at.localeCompare(right.starts_at))
      .map((item) => ({
        id: item.id,
        title: item.title,
        scheduleType: item.schedule_type,
        status: item.status,
        assignedRole: item.assigned_role,
        assignedUserId: item.assigned_user_id,
        startsAt: item.starts_at,
      }));
  }, [schedules]);

  const taskRows = useMemo<TaskRow[]>(() => {
    return tasks
      .filter((item) => item.status !== "completed" && item.status !== "cancelled")
      .sort((left, right) => {
        if (!left.due_at) return 1;
        if (!right.due_at) return -1;
        return left.due_at.localeCompare(right.due_at);
      })
      .map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        priority: item.priority,
        status: item.status,
        dueAt: item.due_at,
        assignedRole: item.assigned_role,
        assignedUserId: item.assigned_user_id,
      }));
  }, [tasks]);

  const caregiversColumns = useMemo<ColumnDef<CaregiverRow>[]>(
    () => [
      {
        accessorKey: "fullName",
        header: "Caregiver",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.fullName}</p>
            <p className="text-xs text-muted-foreground">{row.original.email}</p>
          </div>
        ),
      },
      {
        accessorKey: "role",
        header: "Role",
        cell: ({ row }) => (
          <Badge variant={getRoleBadgeVariant(row.original.role)}>
            {row.original.role}
          </Badge>
        ),
      },
      {
        accessorKey: "department",
        header: "Department",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm">{row.original.department}</span>
          </div>
        ),
      },
      {
        accessorKey: "phone",
        header: "Phone",
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.phone}</span>,
      },
      {
        accessorKey: "isActive",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "default" : "outline"}>
            {row.original.isActive ? "active" : "inactive"}
          </Badge>
        ),
      },
    ],
    [],
  );

  const schedulesColumns = useMemo<ColumnDef<ScheduleRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Schedule",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.title}</p>
            <Badge variant="outline" className="text-xs">
              {row.original.scheduleType}
            </Badge>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
      },
      {
        id: "assignment",
        header: "Assignment",
        cell: ({ row }) =>
          row.original.assignedRole
            ? `Role: ${row.original.assignedRole}`
            : row.original.assignedUserId
              ? `User #${row.original.assignedUserId}`
              : "Unassigned",
      },
      {
        accessorKey: "startsAt",
        header: "Starts",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="text-sm">{formatDateTime(row.original.startsAt)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.startsAt)}</p>
          </div>
        ),
      },
    ],
    [],
  );

  const tasksColumns = useMemo<ColumnDef<TaskRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Task",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.title}</p>
            <p className="text-xs text-muted-foreground">{row.original.description}</p>
          </div>
        ),
      },
      {
        accessorKey: "priority",
        header: "Priority",
        cell: ({ row }) => {
          const priority = row.original.priority;
          return (
            <Badge variant={getPriorityBadgeVariant(priority)}>
              {priority}
            </Badge>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
      },
      {
        accessorKey: "dueAt",
        header: "Due",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="text-sm">{formatDateTime(row.original.dueAt)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.dueAt)}</p>
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {row.original.status === "pending" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={pendingTaskId === row.original.id}
                onClick={() => {
                  setPendingTaskId(row.original.id);
                  updateTaskMutation.mutate({ id: row.original.id, status: "in_progress" });
                }}
              >
                Start
              </Button>
            ) : null}
            {row.original.status === "in_progress" ? (
              <Button
                size="sm"
                variant="default"
                disabled={pendingTaskId === row.original.id}
                onClick={() => {
                  setPendingTaskId(row.original.id);
                  updateTaskMutation.mutate({ id: row.original.id, status: "completed" });
                }}
              >
                Complete
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [pendingTaskId, updateTaskMutation],
  );

  const activeStaffCount = useMemo(
    () => caregiverRows.filter((item) => item.isActive).length,
    [caregiverRows],
  );

  const openScheduleCount = useMemo(
    () => scheduleRows.filter((item) => item.status !== "completed").length,
    [scheduleRows],
  );

  const pendingTaskCount = useMemo(
    () => taskRows.filter((item) => item.status === "pending").length,
    [taskRows],
  );

  const staffByRole = useMemo(() => {
    const counts: Record<string, number> = { admin: 0, head_nurse: 0, supervisor: 0, observer: 0 };
    caregiverRows.forEach((cg) => {
      if (counts[cg.role] !== undefined) {
        counts[cg.role]++;
      }
    });
    return counts;
  }, [caregiverRows]);

  const taskSaveError = taskError ?? (createTaskMutation.error ? parseRequestError(createTaskMutation.error) : null);
  const scheduleSaveError =
    scheduleError ?? (createScheduleMutation.error ? parseRequestError(createScheduleMutation.error) : null);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Staff & Caregivers</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Complete staff directory with routine management, schedules, and task coordination.
          </p>
        </div>
        <Button asChild>
          <a href={getAccountManagementPath(user?.role || "admin")}>
            <Users className="mr-1.5 h-4 w-4" />
            Manage Users
          </a>
        </Button>
      </div>

      {/* Stats Grid */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryStatCard icon={Users} label="Total staff" value={caregiverRows.length} tone="info" />
        <SummaryStatCard icon={UserCog} label="Active staff" value={activeStaffCount} tone="success" />
        <SummaryStatCard icon={CalendarClock} label="Open schedules" value={openScheduleCount} tone="warning" />
        <SummaryStatCard icon={ClipboardList} label="Pending tasks" value={pendingTaskCount} tone="critical" />
      </section>

      {/* Role Breakdown */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Admins</p>
            <p className="text-xl font-semibold">{staffByRole.admin}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Head Nurses</p>
            <p className="text-xl font-semibold">{staffByRole.head_nurse}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Supervisors</p>
            <p className="text-xl font-semibold">{staffByRole.supervisor}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Observers</p>
            <p className="text-xl font-semibold">{staffByRole.observer}</p>
          </CardContent>
        </Card>
      </section>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search nurse, role, department, phone, email"
          className="pl-9"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Staff List */}
        <div className="xl:col-span-2">
          <DataTableCard
            title="Caregiver Roster"
            description="Complete staff directory with department and role information."
            data={caregiverRows}
            columns={caregiversColumns}
            isLoading={caregiversQuery.isLoading}
            emptyText="No caregivers match this search."
          />
        </div>

        {/* Quick Create Forms */}
        <div className="space-y-6">
          {/* Quick Create Task */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="h-4 w-4" />
                Quick Create Task
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Queue a ward action and assign it to a caregiver.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                onSubmit={taskForm.handleSubmit((values) => {
                  setTaskError(null);
                  createTaskMutation.mutate(values);
                })}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="task-title">Title</Label>
                  <Input
                    id="task-title"
                    {...taskForm.register("title")}
                    placeholder="e.g., Check vital signs"
                  />
                  {taskForm.formState.errors.title ? (
                    <p className="text-xs text-destructive">{taskForm.formState.errors.title.message}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="task-description">Description</Label>
                  <Textarea
                    id="task-description"
                    {...taskForm.register("description")}
                    placeholder="Task details..."
                    rows={2}
                  />
                  {taskForm.formState.errors.description ? (
                    <p className="text-xs text-destructive">{taskForm.formState.errors.description.message}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Controller
                    name="priority"
                    control={taskForm.control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TASK_PRIORITY_OPTIONS.map((priority) => (
                            <SelectItem key={priority} value={priority}>
                              <Badge variant={getPriorityBadgeVariant(priority)} className="mr-2">
                                {priority}
                              </Badge>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="task-due">Due at</Label>
                  <Input id="task-due" type="datetime-local" {...taskForm.register("dueAt")} />
                </div>

                <div className="space-y-2">
                  <Label>Schedule</Label>
                  <Controller
                    name="scheduleId"
                    control={taskForm.control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder="No schedule" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EMPTY_SELECT}>No schedule</SelectItem>
                          {scheduleRows.map((schedule) => (
                            <SelectItem key={schedule.id} value={String(schedule.id)}>
                              #{schedule.id} {schedule.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Assigned caregiver</Label>
                  <Controller
                    name="assignedUserId"
                    control={taskForm.control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EMPTY_SELECT}>Unassigned</SelectItem>
                          {caregivers.map((caregiver) => (
                            <SelectItem key={caregiver.id} value={String(caregiver.id)}>
                              {caregiver.first_name} {caregiver.last_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                {taskSaveError ? <p className="text-xs text-destructive">{taskSaveError}</p> : null}

                <Button type="submit" className="w-full" disabled={createTaskMutation.isPending}>
                  {createTaskMutation.isPending ? "Creating..." : "Create task"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Quick Create Schedule */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="h-4 w-4" />
                Quick Create Schedule
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Publish a recurring ward schedule and optionally assign it to a caregiver.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                onSubmit={scheduleForm.handleSubmit((values) => {
                  setScheduleError(null);
                  createScheduleMutation.mutate(values);
                })}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="schedule-title">Title</Label>
                  <Input
                    id="schedule-title"
                    {...scheduleForm.register("title")}
                    placeholder="e.g., Morning rounds"
                  />
                  {scheduleForm.formState.errors.title ? (
                    <p className="text-xs text-destructive">{scheduleForm.formState.errors.title.message}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label>Type</Label>
                  <Controller
                    name="scheduleType"
                    control={scheduleForm.control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SCHEDULE_TYPE_OPTIONS.map((scheduleType) => (
                            <SelectItem key={scheduleType} value={scheduleType}>
                              {scheduleType}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="schedule-starts">Starts at</Label>
                  <Input id="schedule-starts" type="datetime-local" {...scheduleForm.register("startsAt")} />
                  {scheduleForm.formState.errors.startsAt ? (
                    <p className="text-xs text-destructive">{scheduleForm.formState.errors.startsAt.message}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="schedule-recurrence">Recurrence rule</Label>
                  <Input
                    id="schedule-recurrence"
                    {...scheduleForm.register("recurrenceRule")}
                    placeholder="RRULE:FREQ=DAILY"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="schedule-notes">Notes</Label>
                  <Textarea
                    id="schedule-notes"
                    {...scheduleForm.register("notes")}
                    placeholder="Additional notes..."
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Assigned caregiver</Label>
                  <Controller
                    name="assignedUserId"
                    control={scheduleForm.control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EMPTY_SELECT}>Unassigned</SelectItem>
                          {caregivers.map((caregiver) => (
                            <SelectItem key={caregiver.id} value={String(caregiver.id)}>
                              {caregiver.first_name} {caregiver.last_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                {scheduleSaveError ? <p className="text-xs text-destructive">{scheduleSaveError}</p> : null}

                <Button type="submit" className="w-full" disabled={createScheduleMutation.isPending}>
                  {createScheduleMutation.isPending ? "Creating..." : "Create schedule"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Schedules Table */}
      <DataTableCard
        title="Schedules"
        description="Recurring ward schedules and routines."
        data={scheduleRows}
        columns={schedulesColumns}
        isLoading={schedulesQuery.isLoading}
        emptyText="No schedules found."
      />

      {/* Tasks Table */}
      <DataTableCard
        title="Tasks"
        description="Pending and in-progress tasks with priority and status."
        data={taskRows}
        columns={tasksColumns}
        isLoading={tasksQuery.isLoading}
        emptyText="No active tasks found."
      />
    </div>
  );
}
