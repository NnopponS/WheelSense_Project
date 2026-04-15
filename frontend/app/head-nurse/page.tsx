"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  Clock3,
  Stethoscope,
  Users,
  ArrowRight,
  Activity,
  CheckCircle2,
  ShieldAlert,
  CheckIcon,
  ClipboardList,
  Calendar,
} from "lucide-react";
import DashboardFloorplanPanel from "@/components/dashboard/DashboardFloorplanPanel";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { api, ApiError } from "@/lib/api";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  CareDirectiveOut,
  CaregiverOut,
  CareScheduleOut,
  CareTaskOut,
  GetWardSummaryResponse,
  ListAlertsResponse,
  ListPatientsResponse,
  ListCaregiversResponse,
  ListTimelineEventsResponse,
} from "@/lib/api/task-scope-types";

function caregiverRoleLabel(role: string, translate: (key: TranslationKey) => string): string {
  const map: Record<string, TranslationKey> = {
    admin: "personnel.role.admin",
    head_nurse: "personnel.role.headNurse",
    supervisor: "personnel.role.supervisor",
    observer: "personnel.role.observer",
    patient: "personnel.role.patient",
  };
  const key = map[role];
  return key ? translate(key) : role.replace(/_/g, " ");
}

function staffInitials(c: CaregiverOut): string {
  const a = (c.first_name?.trim()?.[0] ?? "").toUpperCase();
  const b = (c.last_name?.trim()?.[0] ?? "").toUpperCase();
  return (a + b) || "?";
}

export default function HeadNurseDashboardPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [pendingTaskId, setPendingTaskId] = useState<number | null>(null);

  // Data queries
  const wardSummaryQuery = useQuery({
    queryKey: ["head-nurse", "dashboard", "ward-summary"],
    queryFn: () => api.getWardSummary(),
  });

  const alertsQuery = useQuery({
    queryKey: ["head-nurse", "dashboard", "alerts"],
    queryFn: () => api.listAlerts({ status: "active", limit: 100 }),
    refetchInterval: 15_000,
  });

  const patientsQuery = useQuery({
    queryKey: ["head-nurse", "dashboard", "patients"],
    queryFn: () => api.listPatients({ limit: 300 }),
  });

  const caregiversQuery = useQuery({
    queryKey: ["head-nurse", "dashboard", "caregivers"],
    queryFn: () => api.listCaregivers({ limit: 100 }),
  });

  const tasksQuery = useQuery({
    queryKey: ["head-nurse", "dashboard", "tasks"],
    queryFn: () => api.listWorkflowTasks({ limit: 100 }),
  });

  const schedulesQuery = useQuery({
    queryKey: ["head-nurse", "dashboard", "schedules"],
    queryFn: () => api.listWorkflowSchedules({ status: "scheduled", limit: 50 }),
  });

  const directivesQuery = useQuery({
    queryKey: ["head-nurse", "dashboard", "directives"],
    queryFn: () => api.listWorkflowDirectives({ status: "active", limit: 50 }),
  });

  const timelineQuery = useQuery({
    queryKey: ["head-nurse", "dashboard", "timeline"],
    queryFn: () => api.listTimelineEvents({ limit: 50 }),
    refetchInterval: 30_000,
  });

  // Data processing
  const wardSummary = useMemo(
    () => (wardSummaryQuery.data ?? null) as GetWardSummaryResponse | null,
    [wardSummaryQuery.data],
  );
  const alerts = useMemo(() => (alertsQuery.data ?? []) as ListAlertsResponse, [alertsQuery.data]);
  const patients = useMemo(
    () => (patientsQuery.data ?? []) as ListPatientsResponse,
    [patientsQuery.data],
  );
  const caregivers = useMemo(
    () => (caregiversQuery.data ?? []) as ListCaregiversResponse,
    [caregiversQuery.data],
  );
  const tasks = useMemo(() => (tasksQuery.data ?? []) as CareTaskOut[], [tasksQuery.data]);
  const schedules = useMemo(
    () => (schedulesQuery.data ?? []) as CareScheduleOut[],
    [schedulesQuery.data],
  );
  const directives = useMemo(
    () => (directivesQuery.data ?? []) as CareDirectiveOut[],
    [directivesQuery.data],
  );
  const timeline = useMemo(
    () => (timelineQuery.data ?? []) as ListTimelineEventsResponse,
    [timelineQuery.data],
  );

  const patientMap = useMemo(
    () => new Map(patients.map((patient) => [patient.id, patient])),
    [patients],
  );

  const activeAlerts = useMemo(
    () => alerts.filter((item) => item.status === "active"),
    [alerts],
  );

  const criticalAlerts = useMemo(
    () => activeAlerts.filter((item) => item.severity === "critical"),
    [activeAlerts],
  );

  const openTasks = useMemo(
    () => tasks.filter((item) => item.status === "pending" || item.status === "in_progress"),
    [tasks],
  );

  const activeDirectives = useMemo(
    () => directives.filter((item) => item.status === "active"),
    [directives],
  );

  const upcomingSchedules = useMemo(
    () =>
      [...schedules]
        .filter((item) => item.status === "scheduled")
        .sort((left, right) => left.starts_at.localeCompare(right.starts_at))
        .slice(0, 5),
    [schedules],
  );

  const activeCaregivers = useMemo(
    () => caregivers.filter((c) => c.is_active),
    [caregivers],
  );

  const onDutyStaff = useMemo(() => activeCaregivers.slice(0, 8), [activeCaregivers]);

  const staffStripPreview = useMemo(() => activeCaregivers.slice(0, 5), [activeCaregivers]);

  const sortedAlerts = useMemo(
    () =>
      [...activeAlerts]
        .sort((left, right) => {
          const order = { critical: 0, warning: 1, low: 2 };
          const leftRank = order[left.severity as keyof typeof order] ?? 3;
          const rightRank = order[right.severity as keyof typeof order] ?? 3;
          if (leftRank !== rightRank) return leftRank - rightRank;
          return right.timestamp.localeCompare(left.timestamp);
        })
        .slice(0, 6),
    [activeAlerts],
  );

  const sortedTasks = useMemo(
    () =>
      [...openTasks]
        .sort((left, right) => {
          const order = { critical: 0, high: 1, normal: 2, low: 3 };
          const leftRank = order[left.priority as keyof typeof order] ?? 4;
          const rightRank = order[right.priority as keyof typeof order] ?? 4;
          if (leftRank !== rightRank) return leftRank - rightRank;
          if (!left.due_at) return 1;
          if (!right.due_at) return -1;
          return left.due_at.localeCompare(right.due_at);
        })
        .slice(0, 6),
    [openTasks],
  );

  const recentTimeline = useMemo(
    () =>
      [...timeline]
        .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
        .slice(0, 5),
    [timeline],
  );

  // Mutations
  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: number) => {
      await api.updateWorkflowTask(taskId, { status: "completed" });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["head-nurse", "dashboard", "tasks"] });
    },
    onSettled: () => setPendingTaskId(null),
  });

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Stethoscope className="h-3.5 w-3.5" />
            {t("headNurse.title")}
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
              {t("headNurse.wardDashboardTitle")}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {t("headNurse.wardDashboardSubtitle")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/head-nurse/patients">{t("nav.patients")}</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/head-nurse/staff">{t("nav.staff")}</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/head-nurse/tasks">{t("nav.tasks")}</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/head-nurse/alerts">
              <Bell className="mr-1.5 h-4 w-4" />
              {t("nav.alerts")}
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("dash.totalPatients")}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {wardSummary?.total_patients ?? patients.length}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {onDutyStaff.length} {t("headNurse.staffOnDuty")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-500/12 text-red-600">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("dash.activeAlerts")}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {activeAlerts.length}
                </p>
                <p className="mt-1 text-xs text-red-600">
                  {criticalAlerts.length} {t("headNurse.criticalAlerts")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/12 text-amber-600">
                <ClipboardList className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("headNurse.openTasks")}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {openTasks.length}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {activeDirectives.length} {t("headNurse.activeDirectives")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/12 text-sky-600">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("headNurse.upcomingSchedules")}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {upcomingSchedules.length}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t("headNurse.next24Hours")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Floorplan & Staff Grid */}
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <DashboardFloorplanPanel className="min-w-0" />

        {/* On-Duty Staff */}
        <Card className="border-border/70">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">{t("headNurse.onDutyStaffTitle")}</CardTitle>
              <CardDescription>{t("headNurse.onDutyStaffDesc")}</CardDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/head-nurse/staff">
                {t("dash.viewAll")}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {onDutyStaff.length ? (
              onDutyStaff.map((caregiver) => (
                <div
                  key={caregiver.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                      <Stethoscope className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">
                        {caregiver.first_name} {caregiver.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground">{caregiver.role}</p>
                    </div>
                  </div>
                  <Badge variant="success">{t("common.active")}</Badge>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border/70 px-3 py-6 text-center">
                <Users className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">{t("headNurse.noStaffOnDuty")}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Staff context strip — ties coverage to alerts/tasks section without duplicating the full roster card */}
      <section
        aria-label={t("headNurse.onDutyStaffTitle")}
        className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/25 shadow-sm"
      >
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-sky-500/70 to-primary/50"
          aria-hidden
        />
        <div className="flex flex-col gap-4 p-4 pl-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="flex min-w-0 items-start gap-3 sm:items-center">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/20">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight text-foreground">
                {t("headNurse.onDutyStaffTitle")}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("headNurse.dashStaffContextLine")}</p>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:items-end">
            {staffStripPreview.length ? (
              <div className="flex w-full flex-wrap items-center gap-2 sm:justify-end">
                {staffStripPreview.map((c) => (
                  <div
                    key={c.id}
                    className="inline-flex max-w-[200px] items-center gap-2 rounded-full border border-border/80 bg-background/90 py-1 pl-1 pr-2.5 shadow-sm"
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground"
                      aria-hidden
                    >
                      {staffInitials(c)}
                    </span>
                    <span className="min-w-0 truncate text-xs font-medium text-foreground">
                      {c.first_name} {c.last_name}
                    </span>
                    <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px] font-normal">
                      {caregiverRoleLabel(c.role, t)}
                    </Badge>
                  </div>
                ))}
                {activeCaregivers.length > staffStripPreview.length ? (
                  <Badge variant="outline" className="shrink-0 text-xs font-medium tabular-nums">
                    +{activeCaregivers.length - staffStripPreview.length}
                  </Badge>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("headNurse.noStaffOnDuty")}</p>
            )}
            <Button asChild size="sm" variant="outline" className="w-full shrink-0 sm:w-auto">
              <Link href="/head-nurse/staff">
                {t("dash.viewAll")}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Alerts & Tasks Grid */}
      <div className="grid gap-4 xl:grid-cols-2">
        {/* Priority Alerts */}
        <Card className="border-border/70">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">{t("headNurse.priorityAlerts")}</CardTitle>
              <CardDescription>{t("headNurse.alertsCardDesc")}</CardDescription>
            </div>
            <Button asChild size="sm" variant="ghost">
              <Link href="/head-nurse/alerts">
                {t("dash.viewAll")}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {sortedAlerts.length ? (
              sortedAlerts.map((alert) => {
                const patient = alert.patient_id ? patientMap.get(alert.patient_id) : null;
                return (
                  <Link
                    key={alert.id}
                    href={alert.patient_id ? `/head-nurse/patients/${alert.patient_id}` : "/head-nurse/alerts"}
                    className="flex items-start justify-between gap-3 rounded-xl border border-border/70 px-3 py-3 hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium text-foreground">{alert.title}</p>
                        <Badge
                          variant={
                            alert.severity === "critical"
                              ? "destructive"
                              : alert.severity === "warning"
                                ? "warning"
                                : "secondary"
                          }
                          className="shrink-0"
                        >
                          {alert.severity}
                        </Badge>
                      </div>
                      <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                        {alert.description}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{patient ? `${patient.first_name} ${patient.last_name}` : t("headNurse.unitWide")}</span>
                        <span>·</span>
                        <span>{formatRelativeTime(alert.timestamp)}</span>
                      </div>
                    </div>
                  </Link>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-border/70 px-3 py-6 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500/50" />
                <p className="mt-2 text-sm text-muted-foreground">{t("headNurse.noAlerts")}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Priority Tasks */}
        <Card className="border-border/70">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">{t("headNurse.priorityTasks")}</CardTitle>
              <CardDescription>{t("supervisor.page.taskQueueDesc")}</CardDescription>
            </div>
            <Button asChild size="sm" variant="ghost">
              <Link href="/head-nurse/tasks">
                {t("dash.viewAll")}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {sortedTasks.length ? (
              sortedTasks.map((task) => {
                const patient = task.patient_id ? patientMap.get(task.patient_id) : null;
                return (
                  <div
                    key={task.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-border/70 px-3 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium text-foreground">{task.title}</p>
                        <Badge
                          variant={
                            task.priority === "critical"
                              ? "destructive"
                              : task.priority === "high"
                                ? "warning"
                                : "secondary"
                          }
                          className="shrink-0"
                        >
                          {task.priority}
                        </Badge>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{patient ? `${patient.first_name} ${patient.last_name}` : t("headNurse.unitWide")}</span>
                        {task.due_at && (
                          <>
                            <span>·</span>
                            <span>
                              {t("headNurse.taskDuePrefix")} {formatDateTime(task.due_at)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={completeTaskMutation.isPending && pendingTaskId === task.id}
                      onClick={() => {
                        setPendingTaskId(task.id);
                        completeTaskMutation.mutate(task.id);
                      }}
                    >
                      <CheckIcon className="mr-1.5 h-4 w-4" />
                      {t("tasks.completeTask")}
                    </Button>
                  </div>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-border/70 px-3 py-6 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500/50" />
                <p className="mt-2 text-sm text-muted-foreground">{t("headNurse.noTasks")}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
