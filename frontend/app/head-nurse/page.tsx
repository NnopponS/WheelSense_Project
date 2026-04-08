"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery, type QueryKey } from "@tanstack/react-query";
import { AlertTriangle, Bell, CalendarClock, Clock3, Users } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { api } from "@/lib/api";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  CareDirectiveOut,
  CareScheduleOut,
  CareTaskOut,
  GetAlertSummaryResponse,
  GetVitalsAveragesResponse,
  GetWardSummaryResponse,
  ListAlertsResponse,
  ListCaregiversResponse,
  ListPatientsResponse,
  ListTimelineEventsResponse,
} from "@/lib/api/task-scope-types";

type ViewMode = "today" | "alerts" | "tasks" | "timeline";

const keys = {
  ward: ["head-nurse", "dashboard", "ward-summary"] as QueryKey,
  alertSummary: ["head-nurse", "dashboard", "alert-summary"] as QueryKey,
  vitalsAverage: ["head-nurse", "dashboard", "vitals-average"] as QueryKey,
  alerts: ["head-nurse", "dashboard", "alerts"] as QueryKey,
  caregivers: ["head-nurse", "dashboard", "caregivers"] as QueryKey,
  patients: ["head-nurse", "dashboard", "patients"] as QueryKey,
  tasks: ["head-nurse", "dashboard", "tasks"] as QueryKey,
  schedules: ["head-nurse", "dashboard", "schedules"] as QueryKey,
  timeline: ["head-nurse", "dashboard", "timeline"] as QueryKey,
  directives: ["head-nurse", "dashboard", "directives"] as QueryKey,
};

function StatusPill({ children, severity }: { children: string; severity?: "success" | "warning" | "critical" }) {
  return (
    <Badge
      variant={
        severity === "critical" ? "destructive" : severity === "warning" ? "warning" : "outline"
      }
    >
      {children}
    </Badge>
  );
}

export default function HeadNurseHomePage() {
  const { t } = useTranslation();
  const [view, setView] = useState<ViewMode>("today");

  const wardSummaryQuery = useQuery({
    queryKey: keys.ward,
    queryFn: () => api.getWardSummary(),
  });
  const alertSummaryQuery = useQuery({
    queryKey: keys.alertSummary,
    queryFn: () => api.getAlertSummary(),
  });
  const vitalsAverageQuery = useQuery({
    queryKey: keys.vitalsAverage,
    queryFn: () => api.getVitalsAverages(24),
  });
  const alertsQuery = useQuery({
    queryKey: keys.alerts,
    queryFn: () => api.listAlerts({ status: "active", limit: 160 }),
  });
  const caregiversQuery = useQuery({
    queryKey: keys.caregivers,
    queryFn: () => api.listCaregivers({ limit: 300 }),
  });
  const patientsQuery = useQuery({
    queryKey: keys.patients,
    queryFn: () => api.listPatients({ limit: 300 }),
  });
  const tasksQuery = useQuery({
    queryKey: keys.tasks,
    queryFn: () => api.listWorkflowTasks({ limit: 200 }),
  });
  const directivesQuery = useQuery({
    queryKey: keys.directives,
    queryFn: () => api.listWorkflowDirectives({ status: "active", limit: 200 }),
  });
  const schedulesQuery = useQuery({
    queryKey: keys.schedules,
    queryFn: () => api.listWorkflowSchedules({ status: "scheduled", limit: 200 }),
  });
  const timelineQuery = useQuery({
    queryKey: keys.timeline,
    queryFn: () => api.listTimelineEvents({ limit: 80 }),
    refetchInterval: 30_000,
  });

  const wardSummary = useMemo(() => (wardSummaryQuery.data ?? null) as GetWardSummaryResponse | null, [wardSummaryQuery.data]);
  const alertSummary = useMemo(() => (alertSummaryQuery.data ?? null) as GetAlertSummaryResponse | null, [alertSummaryQuery.data]);
  const vitalsAverage = useMemo(() => (vitalsAverageQuery.data ?? null) as GetVitalsAveragesResponse | null, [vitalsAverageQuery.data]);
  const alerts = useMemo(() => (alertsQuery.data ?? []) as ListAlertsResponse, [alertsQuery.data]);
  const caregivers = useMemo(() => (caregiversQuery.data ?? []) as ListCaregiversResponse, [caregiversQuery.data]);
  const patients = useMemo(() => (patientsQuery.data ?? []) as ListPatientsResponse, [patientsQuery.data]);
  const tasks = useMemo(() => (tasksQuery.data ?? []) as CareTaskOut[], [tasksQuery.data]);
  const directives = useMemo(() => (directivesQuery.data ?? []) as CareDirectiveOut[], [directivesQuery.data]);
  const schedules = useMemo(() => (schedulesQuery.data ?? []) as CareScheduleOut[], [schedulesQuery.data]);
  const timeline = useMemo(() => (timelineQuery.data ?? []) as ListTimelineEventsResponse, [timelineQuery.data]);

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
        .sort((left, right) => left.starts_at.localeCompare(right.starts_at)),
    [schedules],
  );
  const sortedAlerts = useMemo(
    () =>
      [...activeAlerts].sort((left, right) => {
        if (left.severity !== right.severity) {
          const order = { critical: 0, warning: 1, low: 2 };
          return (order[left.severity as keyof typeof order] ?? 3) - (order[right.severity as keyof typeof order] ?? 3);
        }
        return right.timestamp.localeCompare(left.timestamp);
      }),
    [activeAlerts],
  );
  const sortedTasks = useMemo(
    () =>
      [...openTasks].sort((left, right) => {
        const order = { critical: 0, high: 1, normal: 2, low: 3 };
        const leftRank = order[left.priority as keyof typeof order] ?? 4;
        const rightRank = order[right.priority as keyof typeof order] ?? 4;
        if (leftRank !== rightRank) return leftRank - rightRank;
        if (!left.due_at) return 1;
        if (!right.due_at) return -1;
        return left.due_at.localeCompare(right.due_at);
      }),
    [openTasks],
  );
  const sortedTimeline = useMemo(
    () =>
      [...timeline].sort((left, right) => right.timestamp.localeCompare(left.timestamp)),
    [timeline],
  );
  const recentCaregivers = useMemo(
    () => caregivers.filter((item) => item.is_active).slice(0, 4),
    [caregivers],
  );

  const topAlerts = sortedAlerts.slice(0, view === "today" ? 3 : 8);
  const topTasks = sortedTasks.slice(0, view === "today" ? 3 : 8);
  const topTimeline = sortedTimeline.slice(0, view === "today" ? 4 : 10);
  const topSchedules = upcomingSchedules.slice(0, view === "today" ? 3 : 6);

  const nav = [
    { key: "today" as const, label: t("headNurse.today") },
    { key: "alerts" as const, label: t("headNurse.alerts") },
    { key: "tasks" as const, label: t("headNurse.tasks") },
    { key: "timeline" as const, label: t("headNurse.timeline") },
  ];

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold text-foreground">{t("headNurse.title")}</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">{t("headNurse.subtitle")}</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/70">
          <CardContent className="flex items-start gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("headNurse.totalPatients")}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {wardSummary?.total_patients ?? patients.length}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {recentCaregivers.length} {t("headNurse.onDutyHint")}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="flex items-start gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/12 text-red-600">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("headNurse.activeAlerts")}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {wardSummary?.active_alerts ?? alertSummary?.total_active ?? activeAlerts.length}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {criticalAlerts.length} {t("headNurse.criticalAlerts")}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="flex items-start gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/12 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("headNurse.openTasks")}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{openTasks.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {activeDirectives.length} {t("headNurse.activeDirectives")}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="flex items-start gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/12 text-sky-600">
              <CalendarClock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("headNurse.upcomingSchedules")}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {upcomingSchedules.length}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {vitalsAverage?.spo2_avg != null
                  ? `${vitalsAverage.spo2_avg.toFixed(1)}% SpO2`
                  : t("headNurse.noVitals")}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="border-border/70">
        <CardContent className="flex flex-wrap gap-2 p-3">
          {nav.map((item) => (
            <Button
              key={item.key}
              type="button"
              variant={view === item.key ? "default" : "outline"}
              size="sm"
              onClick={() => setView(item.key)}
            >
              {item.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      {view === "today" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="border-border/70">
            <CardHeader className="space-y-2 pb-3">
              <CardTitle className="text-base">{t("headNurse.priorityAlerts")}</CardTitle>
              <CardDescription>{t("headNurse.priorityAlertsHint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {topAlerts.length ? topAlerts.map((alert) => (
                <Link
                  key={alert.id}
                  href={alert.patient_id ? `/head-nurse/patients/${alert.patient_id}` : "/head-nurse/alerts"}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border/70 px-3 py-3 hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{alert.title}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{alert.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {alert.patient_id ? (patientMap.get(alert.patient_id)?.first_name ?? "") : t("headNurse.unitWide")}
                    </p>
                  </div>
                  <StatusPill severity={alert.severity as "warning" | "critical"}>{alert.severity}</StatusPill>
                </Link>
              )) : <p className="rounded-xl border border-dashed border-border/70 px-3 py-3 text-sm text-muted-foreground">{t("headNurse.noAlerts")}</p>}
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader className="space-y-2 pb-3">
              <CardTitle className="text-base">{t("headNurse.priorityTasks")}</CardTitle>
              <CardDescription>{t("headNurse.priorityTasksHint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {topTasks.length ? topTasks.map((task) => (
                <div key={task.id} className="flex items-start justify-between gap-3 rounded-xl border border-border/70 px-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{task.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{task.patient_id ? (patientMap.get(task.patient_id)?.first_name ?? "") : t("headNurse.unitWide")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{task.due_at ? `${formatDateTime(task.due_at)} - ${formatRelativeTime(task.due_at)}` : t("headNurse.noDueDate")}</p>
                  </div>
                  <StatusPill severity={task.priority === "critical" ? "critical" : task.priority === "high" ? "warning" : undefined}>{task.priority}</StatusPill>
                </div>
              )) : <p className="rounded-xl border border-dashed border-border/70 px-3 py-3 text-sm text-muted-foreground">{t("headNurse.noTasks")}</p>}
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader className="space-y-2 pb-3">
              <CardTitle className="text-base">{t("headNurse.scheduleSnapshot")}</CardTitle>
              <CardDescription>{t("headNurse.scheduleSnapshotHint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {topSchedules.length ? topSchedules.map((schedule) => (
                <div key={schedule.id} className="flex items-start justify-between gap-3 rounded-xl border border-border/70 px-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{schedule.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{schedule.patient_id ? (patientMap.get(schedule.patient_id)?.first_name ?? "") : t("headNurse.unitWide")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(schedule.starts_at)}</p>
                  </div>
                  <StatusPill>{schedule.schedule_type}</StatusPill>
                </div>
              )) : <p className="rounded-xl border border-dashed border-border/70 px-3 py-3 text-sm text-muted-foreground">{t("headNurse.noSchedules")}</p>}
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader className="space-y-2 pb-3">
              <CardTitle className="text-base">{t("headNurse.timelineSnapshot")}</CardTitle>
              <CardDescription>{t("headNurse.timelineSnapshotHint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {topTimeline.length ? topTimeline.map((event) => (
                <div key={event.id} className="flex items-start gap-3 rounded-xl border border-border/70 px-3 py-3">
                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Clock3 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{event.event_type}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{event.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatRelativeTime(event.timestamp)}</p>
                  </div>
                </div>
              )) : <p className="rounded-xl border border-dashed border-border/70 px-3 py-3 text-sm text-muted-foreground">{t("headNurse.noTimeline")}</p>}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {view === "alerts" ? (
        <Card className="border-border/70">
          <CardHeader className="space-y-2 pb-3">
            <CardTitle className="text-base">{t("headNurse.alerts")}</CardTitle>
            <CardDescription>{t("headNurse.alertsHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {topAlerts.map((alert) => (
              <div key={alert.id} className="flex items-start justify-between gap-3 rounded-xl border border-border/70 px-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{alert.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{alert.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(alert.timestamp)} · {formatRelativeTime(alert.timestamp)}</p>
                </div>
                <StatusPill severity={alert.severity as "warning" | "critical"}>{alert.severity}</StatusPill>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {view === "tasks" ? (
        <Card className="border-border/70">
          <CardHeader className="space-y-2 pb-3">
            <CardTitle className="text-base">{t("headNurse.tasks")}</CardTitle>
            <CardDescription>{t("headNurse.tasksHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {topTasks.map((task) => (
              <div key={task.id} className="flex items-start justify-between gap-3 rounded-xl border border-border/70 px-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{task.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{task.description || t("headNurse.noDetails")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{task.due_at ? `${formatDateTime(task.due_at)} - ${formatRelativeTime(task.due_at)}` : t("headNurse.noDueDate")}</p>
                </div>
                <StatusPill severity={task.priority === "critical" ? "critical" : task.priority === "high" ? "warning" : undefined}>{task.priority}</StatusPill>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {view === "timeline" ? (
        <Card className="border-border/70">
          <CardHeader className="space-y-2 pb-3">
            <CardTitle className="text-base">{t("headNurse.timeline")}</CardTitle>
            <CardDescription>{t("headNurse.timelineHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {topTimeline.map((event) => (
              <div key={event.id} className="flex items-start gap-3 rounded-xl border border-border/70 px-3 py-3">
                <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Clock3 className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{event.event_type}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{event.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {(event.patient_id ? (patientMap.get(event.patient_id)?.first_name ?? "") : (event.room_name || t("headNurse.unitWide")))} - {formatRelativeTime(event.timestamp)}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {!alerts.length && !tasks.length && !timeline.length ? (
        <p className="text-sm text-muted-foreground">{t("headNurse.loadingFallback")}</p>
      ) : null}
    </div>
  );
}



