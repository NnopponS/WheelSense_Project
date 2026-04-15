"use client";
"use no memo";

import { useCallback, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { z } from "zod";
import { CalendarClock, ClipboardList, Plus, Search, UserCog } from "lucide-react";
import { HeadNurseStaffMemberSheet } from "@/components/head-nurse/HeadNurseStaffMemberSheet";
import type { User } from "@/lib/types";
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
import { useTranslation } from "@/lib/i18n";
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

function portalUsersLinkedToCaregivers(users: User[]): User[] {
  return [...users]
    .filter((u) => typeof u.caregiver_id === "number" && u.caregiver_id > 0)
    .sort((a, b) => a.username.localeCompare(b.username));
}

function labelPortalUser(
  user: User,
  caregiverById: Map<number, { first_name: string; last_name: string }>,
): string {
  const cid = user.caregiver_id;
  if (cid) {
    const cg = caregiverById.get(cid);
    if (cg) return `${cg.first_name} ${cg.last_name}`.trim();
  }
  return user.username;
}

function toIsoDateTime(value: string): string {
  return new Date(value).toISOString();
}

export default function HeadNurseStaffPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [pendingTaskId, setPendingTaskId] = useState<number | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [staffSheetOpen, setStaffSheetOpen] = useState(false);
  const [sheetCaregiver, setSheetCaregiver] = useState<CaregiverRow | null>(null);

  const usersQuery = useQuery({
    queryKey: ["head-nurse", "staff", "users"],
    queryFn: () => api.listUsers(),
  });

  const caregiversQuery = useQuery({
    queryKey: ["head-nurse", "staff", "caregivers"],
    queryFn: () => api.listCaregivers({ limit: 400 }),
  });

  const schedulesQuery = useQuery({
    queryKey: ["head-nurse", "staff", "schedules"],
    queryFn: () => api.listWorkflowSchedules({ limit: 200 }),
  });

  const tasksQuery = useQuery({
    queryKey: ["head-nurse", "staff", "tasks"],
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
      await queryClient.invalidateQueries({ queryKey: ["head-nurse", "staff", "tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["head-nurse", "dashboard", "tasks"] });
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
      await queryClient.invalidateQueries({ queryKey: ["head-nurse", "staff", "schedules"] });
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
      await queryClient.invalidateQueries({ queryKey: ["head-nurse", "staff", "tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["head-nurse", "dashboard", "tasks"] });
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

  const portalUsers = useMemo(() => (usersQuery.data ?? []) as User[], [usersQuery.data]);

  const caregiverById = useMemo(() => {
    const map = new Map<number, { first_name: string; last_name: string }>();
    for (const item of caregivers) {
      map.set(item.id, { first_name: item.first_name, last_name: item.last_name });
    }
    return map;
  }, [caregivers]);

  const assignablePortalUsers = useMemo(
    () => portalUsersLinkedToCaregivers(portalUsers),
    [portalUsers],
  );

  const userById = useMemo(() => {
    const map = new Map<number, User>();
    for (const u of portalUsers) map.set(u.id, u);
    return map;
  }, [portalUsers]);

  const caregiverIdToUser = useMemo(() => {
    const map = new Map<number, User>();
    for (const u of portalUsers) {
      if (typeof u.caregiver_id === "number" && u.caregiver_id > 0) {
        map.set(u.caregiver_id, u);
      }
    }
    return map;
  }, [portalUsers]);

  const assignmentLabel = useCallback(
    (assignedRole: string | null, assignedUserId: number | null) => {
      if (assignedRole) return `${t("headNurse.staff.rolePrefix")}${assignedRole}`;
      if (assignedUserId) {
        const u = userById.get(assignedUserId);
        if (u) return labelPortalUser(u, caregiverById);
        return `${t("headNurse.staff.userPrefix")}${assignedUserId}`;
      }
      return t("headNurse.staff.unassigned");
    },
    [t, userById, caregiverById],
  );

  const caregiverRows = useMemo<CaregiverRow[]>(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return caregivers
      .filter((item) => {
        if (!normalizedSearch) return true;
        const corpus = `${item.first_name} ${item.last_name} ${item.role} ${item.email} ${item.phone}`.toLowerCase();
        return corpus.includes(normalizedSearch);
      })
      .map((item) => ({
        id: item.id,
        fullName: `${item.first_name} ${item.last_name}`.trim(),
        role: item.role,
        phone: item.phone,
        email: item.email,
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

  const linkedUserForSheet = useMemo(() => {
    if (!sheetCaregiver) return null;
    return caregiverIdToUser.get(sheetCaregiver.id) ?? null;
  }, [sheetCaregiver, caregiverIdToUser]);

  const tasksForMemberSheet = useMemo(() => {
    if (!linkedUserForSheet) return [];
    return tasks.filter((item) => item.assigned_user_id === linkedUserForSheet.id);
  }, [tasks, linkedUserForSheet]);

  const schedulesForMemberSheet = useMemo(() => {
    if (!linkedUserForSheet) return [];
    return schedules.filter((item) => item.assigned_user_id === linkedUserForSheet.id);
  }, [schedules, linkedUserForSheet]);

  const caregiversColumns = useMemo<ColumnDef<CaregiverRow>[]>(
    () => [
      {
        accessorKey: "fullName",
        header: t("clinical.table.caregiver"),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.fullName}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.role || t("clinical.role.caregiverFallback")}
            </p>
          </div>
        ),
      },
      { accessorKey: "phone", header: t("clinical.table.phone") },
      { accessorKey: "email", header: t("clinical.table.email") },
      {
        accessorKey: "isActive",
        header: t("clinical.table.status"),
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "success" : "outline"}>
            {row.original.isActive
              ? t("clinical.recordStatus.activeBadge")
              : t("clinical.recordStatus.inactiveBadge")}
          </Badge>
        ),
      },
      {
        id: "workChecklist",
        header: "",
        cell: ({ row }) => (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setSheetCaregiver(row.original);
              setStaffSheetOpen(true);
            }}
          >
            {t("headNurse.staff.viewWork")}
          </Button>
        ),
      },
    ],
    [t],
  );

  const schedulesColumns = useMemo<ColumnDef<ScheduleRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: t("clinical.table.schedule"),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.title}</p>
            <p className="text-xs text-muted-foreground">{row.original.scheduleType}</p>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: t("clinical.table.status"),
        cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
      },
      {
        id: "assignment",
        header: t("clinical.table.assignment"),
        cell: ({ row }) =>
          assignmentLabel(row.original.assignedRole, row.original.assignedUserId),
      },
      {
        accessorKey: "startsAt",
        header: t("clinical.table.starts"),
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.startsAt)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.startsAt)}</p>
          </div>
        ),
      },
    ],
    [t, assignmentLabel],
  );

  const tasksColumns = useMemo<ColumnDef<TaskRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: t("clinical.table.task"),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.title}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{row.original.description}</p>
          </div>
        ),
      },
      {
        accessorKey: "priority",
        header: t("clinical.table.priority"),
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
        accessorKey: "status",
        header: t("clinical.table.status"),
        cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
      },
      {
        id: "assignee",
        header: t("headNurse.staff.tableAssignee"),
        cell: ({ row }) => (
          <span className="text-sm text-foreground">
            {assignmentLabel(row.original.assignedRole, row.original.assignedUserId)}
          </span>
        ),
      },
      {
        accessorKey: "dueAt",
        header: t("clinical.table.due"),
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.dueAt)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.dueAt)}</p>
          </div>
        ),
      },
      {
        id: "actions",
        header: t("clinical.table.actions"),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
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
                {t("clinical.action.start")}
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
              {t("clinical.action.complete")}
            </Button>
          </div>
        ),
      },
    ],
    [assignmentLabel, pendingTaskId, t, updateTaskMutation],
  );

  const openTaskCount = taskRows.length;
  const activeStaffCount = useMemo(
    () => caregiverRows.filter((item) => item.isActive).length,
    [caregiverRows],
  );
  const openScheduleCount = useMemo(
    () => scheduleRows.filter((item) => item.status !== "completed").length,
    [scheduleRows],
  );

  const isLoadingAny =
    usersQuery.isLoading ||
    caregiversQuery.isLoading ||
    schedulesQuery.isLoading ||
    tasksQuery.isLoading;

  const taskSaveError = taskError ?? (createTaskMutation.error ? parseRequestError(createTaskMutation.error) : null);
  const scheduleSaveError =
    scheduleError ?? (createScheduleMutation.error ? parseRequestError(createScheduleMutation.error) : null);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Staff & Shift Operations</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Team availability, schedules, and execution-ready task board for the ward.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryStatCard icon={UserCog} label="Active staff" value={activeStaffCount} tone="info" />
        <SummaryStatCard icon={CalendarClock} label="Open schedules" value={openScheduleCount} tone="warning" />
        <SummaryStatCard icon={ClipboardList} label="Open tasks" value={openTaskCount} tone="warning" />
      </section>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search nurse, role, phone, email"
          className="pl-9"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Create</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-2">
            <form
              className="space-y-4"
              onSubmit={taskForm.handleSubmit((values) => {
                setTaskError(null);
                createTaskMutation.mutate(values);
              })}
            >
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Create task</p>
                <p className="text-xs text-muted-foreground">Queue a ward action and assign it to a caregiver.</p>
              </div>

              <div className="space-y-2">
                <Label>Title</Label>
                <Input {...taskForm.register("title")} placeholder="Patient check-in" />
                {taskForm.formState.errors.title ? (
                  <p className="text-xs text-destructive">{taskForm.formState.errors.title.message}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea rows={3} {...taskForm.register("description")} placeholder="Short execution note" />
                {taskForm.formState.errors.description ? (
                  <p className="text-xs text-destructive">{taskForm.formState.errors.description.message}</p>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Controller
                    control={taskForm.control}
                    name="priority"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                        <SelectContent>
                          {TASK_PRIORITY_OPTIONS.map((priority) => (
                            <SelectItem key={priority} value={priority}>
                              {priority}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Due at</Label>
                  <Input type="datetime-local" {...taskForm.register("dueAt")} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Schedule</Label>
                  <Controller
                    control={taskForm.control}
                    name="scheduleId"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Optional schedule" />
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
                  <Label>{t("headNurse.staff.assignPortalUser")}</Label>
                  <Controller
                    control={taskForm.control}
                    name="assignedUserId"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Optional caregiver" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EMPTY_SELECT}>Unassigned</SelectItem>
                          {assignablePortalUsers.map((user) => (
                            <SelectItem key={user.id} value={String(user.id)}>
                              {labelPortalUser(user, caregiverById)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>

              {taskSaveError ? <p className="text-sm text-destructive">{taskSaveError}</p> : null}

              <Button type="submit" disabled={createTaskMutation.isPending}>
                <Plus className="h-4 w-4" />
                {createTaskMutation.isPending ? "Creating..." : "Create task"}
              </Button>
            </form>

            <form
              className="space-y-4"
              onSubmit={scheduleForm.handleSubmit((values) => {
                setScheduleError(null);
                createScheduleMutation.mutate(values);
              })}
            >
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Create schedule</p>
                <p className="text-xs text-muted-foreground">
                  Publish a recurring ward schedule and optionally assign it to a caregiver.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Title</Label>
                <Input {...scheduleForm.register("title")} placeholder="Evening rounds" />
                {scheduleForm.formState.errors.title ? (
                  <p className="text-xs text-destructive">{scheduleForm.formState.errors.title.message}</p>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Controller
                    control={scheduleForm.control}
                    name="scheduleType"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
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
                  <Label>Starts at</Label>
                  <Input type="datetime-local" {...scheduleForm.register("startsAt")} />
                  {scheduleForm.formState.errors.startsAt ? (
                    <p className="text-xs text-destructive">{scheduleForm.formState.errors.startsAt.message}</p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Recurrence rule</Label>
                <Input
                  {...scheduleForm.register("recurrenceRule")}
                  placeholder="RRULE:FREQ=DAILY"
                />
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea rows={3} {...scheduleForm.register("notes")} placeholder="Optional schedule notes" />
              </div>

              <div className="space-y-2">
                <Label>{t("headNurse.staff.assignPortalUser")}</Label>
                <Controller
                  control={scheduleForm.control}
                  name="assignedUserId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Optional caregiver" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={EMPTY_SELECT}>Unassigned</SelectItem>
                        {assignablePortalUsers.map((user) => (
                          <SelectItem key={user.id} value={String(user.id)}>
                            {labelPortalUser(user, caregiverById)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {scheduleSaveError ? <p className="text-sm text-destructive">{scheduleSaveError}</p> : null}

              <Button type="submit" disabled={createScheduleMutation.isPending}>
                <Plus className="h-4 w-4" />
                {createScheduleMutation.isPending ? "Creating..." : "Create schedule"}
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>

      <DataTableCard
        title="Caregiver Roster"
        description="Current staff directory with active-state visibility."
        data={caregiverRows}
        columns={caregiversColumns}
        isLoading={isLoadingAny}
        emptyText="No caregivers match this search."
      />

      <DataTableCard
        title="Upcoming Schedules"
        description="Scheduled rounds ordered by start time."
        data={scheduleRows}
        columns={schedulesColumns}
        isLoading={isLoadingAny}
        emptyText="No workflow schedules found."
      />

      <DataTableCard
        title="Open Task Board"
        description="Pending and in-progress tasks with inline status actions."
        data={taskRows}
        columns={tasksColumns}
        isLoading={isLoadingAny}
        emptyText="No open tasks."
      />

      <HeadNurseStaffMemberSheet
        open={staffSheetOpen}
        onOpenChange={(open) => {
          setStaffSheetOpen(open);
          if (!open) setSheetCaregiver(null);
        }}
        caregiver={
          sheetCaregiver
            ? {
                id: sheetCaregiver.id,
                fullName: sheetCaregiver.fullName,
                role: sheetCaregiver.role,
              }
            : null
        }
        linkedUser={linkedUserForSheet}
        tasksForUser={tasksForMemberSheet}
        schedulesForUser={schedulesForMemberSheet}
      />
    </div>
  );
}
