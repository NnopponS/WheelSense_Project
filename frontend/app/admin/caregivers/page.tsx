"use client";
"use no memo";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { z } from "zod";
import { CalendarClock, Plus, Users, ArrowRight } from "lucide-react";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import UserAvatar from "@/components/shared/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataState } from "@/components/layout/DataState";
import styles from "./care-team-workspace.module.css";
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
import { AppPage } from "@/components/layout/AppPage";
import { FilterBar } from "@/components/shared/FilterBar";
import { getAccountManagementPath, getCaregiverDetailPath } from "@/lib/routes";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
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
const SCHEDULE_RECURRENCE_OPTIONS = ["none", "daily", "weekly", "monthly"] as const;

const taskFormSchema = z.object({
  title: z.string().trim().min(1, "adminCaregivers.validationTitleRequired"),
  description: z.string().trim().min(1, "adminCaregivers.validationDescriptionRequired"),
  priority: z.enum(TASK_PRIORITY_OPTIONS),
  dueAt: z.string(),
  scheduleId: z.string(),
  assignedUserId: z.string(),
});

const scheduleFormSchema = z.object({
  title: z.string().trim().min(1, "adminCaregivers.validationTitleRequired"),
  scheduleType: z.enum(SCHEDULE_TYPE_OPTIONS),
  startsAt: z.string().min(1, "adminCaregivers.validationStartRequired"),
  recurrenceRule: z.enum(SCHEDULE_RECURRENCE_OPTIONS),
  notes: z.string().trim(),
  assignedUserId: z.string(),
});

type TaskFormValues = z.infer<typeof taskFormSchema>;
type ScheduleFormValues = z.infer<typeof scheduleFormSchema>;

type CaregiverRow = {
  id: number;
  fullName: string;
  photoUrl: string | null;
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

function parseRequestError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

function toIsoDateTime(value: string): string {
  return new Date(value).toISOString();
}

function recurrenceToApiRule(value: ScheduleFormValues["recurrenceRule"]): string {
  return value === "none" ? "" : value;
}

function recurrenceLabel(value: ScheduleFormValues["recurrenceRule"], t: (key: TranslationKey) => string): string {
  if (value === "none") return t("adminCaregivers.recurrenceNone");
  if (value === "daily") return t("adminCaregivers.recurrenceDaily");
  if (value === "weekly") return t("adminCaregivers.recurrenceWeekly");
  return t("adminCaregivers.recurrenceMonthly");
}

function roleLabel(role: string, t: (key: TranslationKey) => string): string {
  if (role === "admin") return t("shell.roleAdmin");
  if (role === "head_caregiver" || role === "head_nurse" || role === "supervisor") return t("shell.roleHeadCaregiver");
  if (role === "caregiver" || role === "observer") return t("shell.roleCaregiver");
  if (role === "patient") return t("shell.rolePatient");
  return role.replace(/_/g, " ");
}

function statusLabel(status: string, t: (key: TranslationKey) => string): string {
  if (status === "pending") return t("tasks.pending");
  if (status === "in_progress") return t("tasks.inProgress");
  if (status === "completed") return t("tasks.completed");
  if (status === "cancelled") return t("tasks.cancelled");
  if (status === "scheduled") return t("status.scheduled");
  if (status === "active") return t("patients.statusActive");
  if (status === "inactive") return t("patients.statusInactive");
  return status.replace(/_/g, " ");
}

function priorityLabel(priority: string, t: (key: TranslationKey) => string): string {
  if (priority === "normal") return t("priority.normal");
  if (priority === "high") return t("priority.high");
  if (priority === "critical") return t("priority.critical");
  return priority;
}

function scheduleTypeLabel(scheduleType: string, t: (key: TranslationKey) => string): string {
  if (scheduleType === "round") return t("adminCaregivers.scheduleTypeRound");
  if (scheduleType === "check_in") return t("adminCaregivers.scheduleTypeCheckIn");
  if (scheduleType === "medication") return t("adminCaregivers.scheduleTypeMedication");
  if (scheduleType === "handoff") return t("adminCaregivers.scheduleTypeHandoff");
  return scheduleType.replace(/_/g, " ");
}

function getRoleBadgeVariant(role: string): "default" | "secondary" | "destructive" | "outline" {
  switch (role) {
    case "admin":
      return "destructive";
    case "head_caregiver":
      return "default";
    case "head_caregiver":
      return "secondary";
    case "caregiver":
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
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeView, setActiveView] = useState("staff");
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
  const [taskSheetOpen, setTaskSheetOpen] = useState(false);
  const [scheduleSheetOpen, setScheduleSheetOpen] = useState(false);
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
      recurrenceRule: "daily",
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
      setTaskSheetOpen(false);
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
      setTaskError(parseRequestError(error, t("common.requestFailed")));
    },
  });

  const createScheduleMutation = useMutation({
    mutationFn: async (values: ScheduleFormValues) => {
      const payload = {
        title: values.title.trim(),
        schedule_type: values.scheduleType,
        starts_at: toIsoDateTime(values.startsAt),
        ends_at: null,
        recurrence_rule: recurrenceToApiRule(values.recurrenceRule),
        assigned_role: null,
        assigned_user_id: values.assignedUserId === EMPTY_SELECT ? null : Number(values.assignedUserId),
        notes: values.notes.trim(),
      } satisfies CreateWorkflowScheduleRequest;

      await api.createWorkflowSchedule(payload);
    },
    onSuccess: async () => {
      setScheduleError(null);
      setScheduleSheetOpen(false);
      scheduleForm.reset({
        title: "",
        scheduleType: "round",
        startsAt: "",
        recurrenceRule: "daily",
        notes: "",
        assignedUserId: EMPTY_SELECT,
      });
      await queryClient.invalidateQueries({ queryKey: ["admin", "staff", "schedules"] });
    },
    onError: (error) => {
      setScheduleError(parseRequestError(error, t("common.requestFailed")));
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
        photoUrl: item.photo_url?.trim() || null,
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

  const selectedStaff = caregiverRows.find((staff) => staff.id === selectedStaffId) ?? caregiverRows[0] ?? null;

  const caregiversColumns = useMemo<ColumnDef<CaregiverRow>[]>(
    () => [
      {
        accessorKey: "fullName",
        header: t("adminCaregivers.caregiver"),
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-3">
            <UserAvatar username={row.original.fullName} profileImageUrl={row.original.photoUrl} sizePx={38} />
            <div className="min-w-0">
              <button
                type="button"
                className={styles.staffSelection}
                aria-pressed={selectedStaff?.id === row.original.id}
                onClick={() => setSelectedStaffId(row.original.id)}
              >
                {row.original.fullName}
              </button>
              <Link className={styles.mobileProfile} href={getCaregiverDetailPath(user?.role || "admin", row.original.id)}>
                {row.original.fullName}
              </Link>
              <p className="break-all text-sm text-muted-foreground">{row.original.email}</p>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "role",
        header: t("common.role"),
        cell: ({ row }) => <Badge variant={getRoleBadgeVariant(row.original.role)}>{roleLabel(row.original.role, t)}</Badge>,
      },
      {
        accessorKey: "isActive",
        header: t("adminCaregivers.status"),
        cell: ({ row }) => <Badge variant={row.original.isActive ? "default" : "outline"}>{row.original.isActive ? t("patients.statusActive") : t("patients.statusInactive")}</Badge>,
      },
    ],
    [selectedStaff?.id, t, user?.role],
  );

  const schedulesColumns = useMemo<ColumnDef<ScheduleRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: t("adminCaregivers.schedule"),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.title}</p>
            <Badge variant="outline" className="text-sm">
              {scheduleTypeLabel(row.original.scheduleType, t)}
            </Badge>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: t("adminCaregivers.status"),
        cell: ({ row }) => <Badge variant="outline">{statusLabel(row.original.status, t)}</Badge>,
      },
      {
        id: "assignment",
        header: t("adminCaregivers.assignment"),
        cell: ({ row }) =>
          row.original.assignedRole
            ? `${t("common.role")}: ${roleLabel(row.original.assignedRole, t)}`
            : row.original.assignedUserId
              ? `${t("adminCaregivers.userId")} #${row.original.assignedUserId}`
              : t("headNurse.scheduleUnassigned"),
      },
      {
        accessorKey: "startsAt",
        header: t("adminCaregivers.starts"),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="text-sm">{formatDateTime(row.original.startsAt)}</p>
            <p className="text-sm text-muted-foreground">{formatRelativeTime(row.original.startsAt)}</p>
          </div>
        ),
      },
    ],
    [t],
  );

  const tasksColumns = useMemo<ColumnDef<TaskRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: t("adminCaregivers.task"),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.title}</p>
            <p className="text-sm text-muted-foreground">{row.original.description}</p>
          </div>
        ),
      },
      {
        accessorKey: "priority",
        header: t("tasks.priority"),
        cell: ({ row }) => {
          const priority = row.original.priority;
          return (
            <Badge variant={getPriorityBadgeVariant(priority)}>
              {priorityLabel(priority, t)}
            </Badge>
          );
        },
      },
      {
        accessorKey: "status",
        header: t("adminCaregivers.status"),
        cell: ({ row }) => <Badge variant="outline">{statusLabel(row.original.status, t)}</Badge>,
      },
      {
        accessorKey: "dueAt",
        header: t("adminCaregivers.due"),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="text-sm">{formatDateTime(row.original.dueAt)}</p>
            <p className="text-sm text-muted-foreground">{formatRelativeTime(row.original.dueAt)}</p>
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
                {t("tasks.startTask")}
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
                {t("tasks.completeTask")}
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [pendingTaskId, t, updateTaskMutation],
  );

  const openScheduleCount = useMemo(
    () => scheduleRows.filter((item) => item.status !== "completed").length,
    [scheduleRows],
  );

  const pendingTaskCount = useMemo(
    () => taskRows.filter((item) => item.status === "pending").length,
    [taskRows],
  );

  const taskSaveError = taskError ?? (createTaskMutation.error ? parseRequestError(createTaskMutation.error, t("common.requestFailed")) : null);
  const scheduleSaveError =
    scheduleError ?? (createScheduleMutation.error ? parseRequestError(createScheduleMutation.error, t("common.requestFailed")) : null);

  return (
    <AppPage
      workspace
      title={t("caregivers.title")}
      description={t("caregivers.directorySubtitle")}
      breadcrumbs={[
        { label: t("nav.dashboard"), href: user?.role ? `/${String(user.role).replace("_", "-")}` : "/admin" },
        { label: t("nav.staff") },
      ]}
      actions={
        <Button asChild variant="outline">
          <Link href={getAccountManagementPath(user?.role || "admin")}>
            <Users className="size-4" aria-hidden="true" />
            {t("nav.users")}
          </Link>
        </Button>
      }
    >
      <dl className={styles.summary}>
        {[
          [t("adminCaregivers.totalStaff"), caregiversQuery.isLoading || caregiversQuery.isError ? "—" : caregivers.length],
          [t("adminCaregivers.activeStaff"), caregiversQuery.isLoading || caregiversQuery.isError ? "—" : caregivers.filter((staff) => staff.is_active).length],
          [t("adminCaregivers.openSchedules"), schedulesQuery.isLoading || schedulesQuery.isError ? "—" : openScheduleCount],
          [t("adminCaregivers.pendingTasks"), tasksQuery.isLoading || tasksQuery.isError ? "—" : pendingTaskCount],
        ].map(([label, value]) => (
          <div key={label} className={styles.summaryItem}>
            <dt>{label}</dt><dd>{value}</dd>
          </div>
        ))}
      </dl>

      <Tabs value={activeView} onValueChange={setActiveView} className={styles.tabs}>
        <div className={styles.toolbar}>
        <TabsList className={styles.tabList} aria-label={t("caregivers.title")}>
          <TabsTrigger value="staff">{t("nav.staff")}</TabsTrigger>
          <TabsTrigger value="schedules">{t("adminCaregivers.schedulesTitle")}</TabsTrigger>
          <TabsTrigger value="tasks">{t("adminCaregivers.tasksTitle")}</TabsTrigger>
        </TabsList>
          <div className={styles.toolbarControls}>
            {activeView === "staff" ? (
          <FilterBar
            className={styles.searchBar}
            searchValue={search}
            onSearchChange={setSearch}
            searchLabel={t("common.search")}
            searchPlaceholder={t("caregivers.searchDetailed")}
            resetLabel={t("common.reset")}
            hasActiveFilters={search.trim().length > 0}
            onReset={() => setSearch("")}
          />
            ) : activeView === "schedules" ? (
          <div className={styles.viewActions}>
            <Sheet open={scheduleSheetOpen} onOpenChange={setScheduleSheetOpen}>
              <SheetTrigger asChild><Button><CalendarClock className="size-4" aria-hidden="true" />{t("adminCaregivers.createSchedule")}</Button></SheetTrigger>
              <SheetContent className="flex flex-col">
                <SheetHeader className="shrink-0 pr-16">
                  <SheetTitle>{t("adminCaregivers.quickScheduleTitle")}</SheetTitle>
                  <SheetDescription>{t("adminCaregivers.quickScheduleDescription")}</SheetDescription>
                </SheetHeader>
                <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <form
                onSubmit={scheduleForm.handleSubmit((values) => {
                  setScheduleError(null);
                  createScheduleMutation.mutate(values);
                })}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="schedule-title">{t("adminCaregivers.titleLabel")}</Label>
                  <Input
                    id="schedule-title"
                    {...scheduleForm.register("title")}
                    placeholder={t("adminCaregivers.scheduleTitlePlaceholder")}
                  />
                  {scheduleForm.formState.errors.title ? (
                    <p className="text-sm text-destructive">{t(scheduleForm.formState.errors.title.message as TranslationKey)}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="schedule-type">{t("adminCaregivers.typeLabel")}</Label>
                  <Controller
                    name="scheduleType"
                    control={scheduleForm.control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger id="schedule-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SCHEDULE_TYPE_OPTIONS.map((scheduleType) => (
                            <SelectItem key={scheduleType} value={scheduleType}>
                              {scheduleTypeLabel(scheduleType, t)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="schedule-starts">{t("adminCaregivers.startsAt")}</Label>
                  <Input id="schedule-starts" type="datetime-local" {...scheduleForm.register("startsAt")} />
                  {scheduleForm.formState.errors.startsAt ? (
                    <p className="text-sm text-destructive">{t(scheduleForm.formState.errors.startsAt.message as TranslationKey)}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="schedule-repeat">{t("adminCaregivers.repeatLabel")}</Label>
                  <Controller
                    name="recurrenceRule"
                    control={scheduleForm.control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger id="schedule-repeat">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SCHEDULE_RECURRENCE_OPTIONS.map((option) => (
                            <SelectItem key={option} value={option}>
                              {recurrenceLabel(option, t)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <p className="text-sm text-muted-foreground">{t("adminCaregivers.recurrenceHint")}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="schedule-notes">{t("adminCaregivers.notesLabel")}</Label>
                  <Textarea
                    id="schedule-notes"
                    {...scheduleForm.register("notes")}
                    placeholder={t("adminCaregivers.notesPlaceholder")}
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="schedule-caregiver">{t("adminCaregivers.assignedCaregiver")}</Label>
                  <Controller
                    name="assignedUserId"
                    control={scheduleForm.control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger id="schedule-caregiver">
                          <SelectValue placeholder={t("headNurse.scheduleUnassigned")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EMPTY_SELECT}>{t("headNurse.scheduleUnassigned")}</SelectItem>
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

                {scheduleSaveError ? <p className="text-sm text-destructive">{scheduleSaveError}</p> : null}

                <Button type="submit" className="w-full" disabled={createScheduleMutation.isPending}>
                  {createScheduleMutation.isPending ? t("adminCaregivers.creating") : t("adminCaregivers.createSchedule")}
                </Button>
              </form>
                </div>
              </SheetContent>
            </Sheet>
          </div>

            ) : (
          <div className={styles.viewActions}>
            <Sheet open={taskSheetOpen} onOpenChange={setTaskSheetOpen}>
              <SheetTrigger asChild><Button><Plus className="size-4" aria-hidden="true" />{t("adminCaregivers.createTask")}</Button></SheetTrigger>
              <SheetContent className="flex flex-col">
                <SheetHeader className="shrink-0 pr-16">
                  <SheetTitle>{t("adminCaregivers.quickTaskTitle")}</SheetTitle>
                  <SheetDescription>{t("adminCaregivers.quickTaskDescription")}</SheetDescription>
                </SheetHeader>
                <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <form
                onSubmit={taskForm.handleSubmit((values) => {
                  setTaskError(null);
                  createTaskMutation.mutate(values);
                })}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="task-title">{t("adminCaregivers.titleLabel")}</Label>
                  <Input
                    id="task-title"
                    {...taskForm.register("title")}
                    placeholder={t("adminCaregivers.taskTitlePlaceholder")}
                  />
                  {taskForm.formState.errors.title ? (
                    <p className="text-sm text-destructive">{t(taskForm.formState.errors.title.message as TranslationKey)}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="task-description">{t("adminCaregivers.descriptionLabel")}</Label>
                  <Textarea
                    id="task-description"
                    {...taskForm.register("description")}
                    placeholder={t("adminCaregivers.taskDescriptionPlaceholder")}
                    rows={2}
                  />
                  {taskForm.formState.errors.description ? (
                    <p className="text-sm text-destructive">{t(taskForm.formState.errors.description.message as TranslationKey)}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="task-priority">{t("tasks.priority")}</Label>
                  <Controller
                    name="priority"
                    control={taskForm.control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger id="task-priority">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TASK_PRIORITY_OPTIONS.map((priority) => (
                            <SelectItem key={priority} value={priority}>
                              <Badge variant={getPriorityBadgeVariant(priority)} className="mr-2">
                                {priorityLabel(priority, t)}
                              </Badge>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="task-due">{t("adminCaregivers.dueAt")}</Label>
                  <Input id="task-due" type="datetime-local" {...taskForm.register("dueAt")} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="task-schedule">{t("adminCaregivers.schedule")}</Label>
                  <Controller
                    name="scheduleId"
                    control={taskForm.control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger id="task-schedule">
                          <SelectValue placeholder={t("adminCaregivers.noSchedule")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EMPTY_SELECT}>{t("adminCaregivers.noSchedule")}</SelectItem>
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
                  <Label htmlFor="task-caregiver">{t("adminCaregivers.assignedCaregiver")}</Label>
                  <Controller
                    name="assignedUserId"
                    control={taskForm.control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger id="task-caregiver">
                          <SelectValue placeholder={t("headNurse.scheduleUnassigned")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EMPTY_SELECT}>{t("headNurse.scheduleUnassigned")}</SelectItem>
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

                {taskSaveError ? <p className="text-sm text-destructive">{taskSaveError}</p> : null}

                <Button type="submit" className="w-full" disabled={createTaskMutation.isPending}>
                  {createTaskMutation.isPending ? t("adminCaregivers.creating") : t("adminCaregivers.createTask")}
                </Button>
              </form>
                </div>
              </SheetContent>
            </Sheet>
          </div>

            )}
          </div>
        </div>
        <TabsContent value="staff" className={styles.view}>

          {caregiversQuery.isError ? (
            <DataState kind="error" title={t("common.requestFailed")} description={parseRequestError(caregiversQuery.error, t("common.requestFailed"))} actionLabel={t("redesign.retry")} onAction={() => void caregiversQuery.refetch()} />
          ) : (
            <div className={styles.staffGrid}>
              <div className={styles.scrollPane}>
                <DataTableCard
                  title={t("adminCaregivers.rosterTitle")}
                  description={t("adminCaregivers.rosterDescription")}
                  data={caregiverRows}
                  columns={caregiversColumns}
                  isLoading={caregiversQuery.isLoading}
                  emptyKind={search.trim().length > 0 ? "filtered-empty" : "empty"}
                  emptyText={search.trim().length > 0 ? t("common.filteredEmpty") : t("caregivers.empty")}
                  getRowClassName={(staff) => staff.id === selectedStaff?.id ? "bg-accent/60" : undefined}
                  mobileMode="cards"
                />
              </div>
              {selectedStaff ? (
                <Card className={styles.staffDetail}>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <UserAvatar username={selectedStaff.fullName} profileImageUrl={selectedStaff.photoUrl} sizePx={48} />
                      <div className="min-w-0">
                        <CardTitle className="break-words text-lg">{selectedStaff.fullName}</CardTitle>
                        <p className="text-sm text-muted-foreground">{roleLabel(selectedStaff.role, t)}</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-5">
                    <Badge className="self-start" variant={selectedStaff.isActive ? "default" : "outline"}>
                      {selectedStaff.isActive ? t("patients.statusActive") : t("patients.statusInactive")}
                    </Badge>
                    <dl className={styles.staffFacts}>
                      <div><dt>{t("caregivers.department")}</dt><dd>{selectedStaff.department}</dd></div>
                      <div><dt>{t("clinical.table.phone")}</dt><dd>{selectedStaff.phone}</dd></div>
                      <div><dt>{t("caregivers.email")}</dt><dd>{selectedStaff.email}</dd></div>
                    </dl>
                    <Button asChild variant="outline" className="self-start">
                      <Link href={getCaregiverDetailPath(user?.role || "admin", selectedStaff.id)}>
                        {t("personnel.rowOpen")}<ArrowRight className="size-4" aria-hidden="true" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          )}
        </TabsContent>
        <TabsContent value="schedules" className={styles.view}>
          <div className={styles.scrollPane}>
            {schedulesQuery.isError ? (
              <DataState kind="error" title={t("common.requestFailed")} description={parseRequestError(schedulesQuery.error, t("common.requestFailed"))} actionLabel={t("redesign.retry")} onAction={() => void schedulesQuery.refetch()} />
            ) : (
              <DataTableCard title={t("adminCaregivers.schedulesTitle")} description={t("adminCaregivers.schedulesDescription")} data={scheduleRows} columns={schedulesColumns} isLoading={schedulesQuery.isLoading} emptyText={t("adminCaregivers.schedulesEmpty")} mobileMode="cards" />
            )}
          </div>
        </TabsContent>
        <TabsContent value="tasks" className={styles.view}>
          {updateTaskMutation.isError ? <p role="alert" className="text-sm text-destructive">{parseRequestError(updateTaskMutation.error, t("common.requestFailed"))}</p> : null}
          <div className={styles.scrollPane}>
            {tasksQuery.isError ? (
              <DataState kind="error" title={t("common.requestFailed")} description={parseRequestError(tasksQuery.error, t("common.requestFailed"))} actionLabel={t("redesign.retry")} onAction={() => void tasksQuery.refetch()} />
            ) : (
              <DataTableCard title={t("adminCaregivers.tasksTitle")} description={t("adminCaregivers.tasksDescription")} data={taskRows} columns={tasksColumns} isLoading={tasksQuery.isLoading} emptyText={t("adminCaregivers.tasksEmpty")} mobileMode="cards" />
            )}
          </div>
        </TabsContent>
      </Tabs>
    </AppPage>
  );
}
