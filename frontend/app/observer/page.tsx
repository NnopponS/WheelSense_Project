"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  Heart,
  ListTodo,
  Map as MapIcon,
  Stethoscope,
  User,
  Users,
  AlertTriangle,
  CheckSquare,
  ArrowRight,
  ConciergeBell,
} from "lucide-react";
import DashboardFloorplanPanel from "@/components/dashboard/DashboardFloorplanPanel";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { mergeServerShiftChecklist, utcShiftDateString } from "@/lib/shiftChecklistDefaults";
import { formatRelativeTime } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShiftChecklistMePanel } from "@/components/shift-checklist/ShiftChecklistMePanel";
import type {
  CareTaskOut,
  ListAlertsResponse,
  ListPatientsResponse,
  ListVitalReadingsResponse,
  ServiceRequestOut,
} from "@/lib/api/task-scope-types";

function taskPriorityLabel(t: (key: TranslationKey) => string, priority: string): string {
  switch (priority) {
    case "low":
      return t("priority.low");
    case "medium":
      return t("priority.medium");
    case "high":
      return t("priority.high");
    case "critical":
      return t("support.priorityCritical");
    case "urgent":
      return t("priority.urgent");
    default:
      return priority;
  }
}

function careLevelLabel(t: (key: TranslationKey) => string, level: string): string {
  switch (level) {
    case "standard":
      return t("observer.page.careLevelStandard");
    case "special":
      return t("observer.page.careLevelSpecial");
    case "critical":
      return t("observer.page.careLevelCritical");
    default:
      return level;
  }
}

export default function ObserverDashboardPage() {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const [shiftDate] = useState(() => utcShiftDateString());
  const [claimError, setClaimError] = useState<string | null>(null);
  const [taskActionError, setTaskActionError] = useState<string | null>(null);

  const shiftChecklistQuery = useQuery({
    queryKey: ["shift-checklist", "me", shiftDate],
    queryFn: () => api.getShiftChecklistMe({ shift_date: shiftDate }),
  });

  // Data queries
  const patientsQuery = useQuery({
    queryKey: ["observer", "dashboard", "patients"],
    queryFn: () => api.listPatients({ limit: 100 }),
  });

  const alertsQuery = useQuery({
    queryKey: ["observer", "dashboard", "alerts"],
    queryFn: () => api.listAlerts({ status: "active", limit: 50 }),
    refetchInterval: 20_000,
  });

  const tasksQuery = useQuery({
    queryKey: ["observer", "dashboard", "tasks"],
    queryFn: () => api.listWorkflowTasks({ limit: 50 }),
  });

  const vitalsQuery = useQuery({
    queryKey: ["observer", "dashboard", "vitals"],
    queryFn: () => api.listVitalReadings({ limit: 100 }),
    refetchInterval: 30_000,
  });

  const supportRequestsQuery = useQuery({
    queryKey: ["observer", "dashboard", "service-requests"],
    queryFn: () => api.listServiceRequests({ limit: 50 }),
    refetchInterval: 15_000,
  });

  const claimMutation = useMutation({
    mutationFn: async (id: number) => {
      setClaimError(null);
      await api.claimServiceRequest(id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["observer", "dashboard", "service-requests"] });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("observer.supportQueue.claimFailed");
      setClaimError(msg);
    },
  });

  const fulfillMutation = useMutation({
    mutationFn: async (id: number) => {
      setClaimError(null);
      await api.updateServiceRequest(id, { status: "fulfilled", resolution_note: null });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["observer", "dashboard", "service-requests"] });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("observer.supportQueue.fulfillFailed");
      setClaimError(msg);
    },
  });

  const completeDashboardTaskMutation = useMutation({
    mutationFn: (taskId: number) => api.updateWorkflowTask(taskId, { status: "completed" }),
    onSuccess: async () => {
      setTaskActionError(null);
      await queryClient.invalidateQueries({ queryKey: ["observer", "dashboard", "tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: () => setTaskActionError(t("observer.page.taskActionError")),
  });

  // Data processing
  const patients = useMemo(
    () => (patientsQuery.data ?? []) as ListPatientsResponse,
    [patientsQuery.data],
  );
  const alerts = useMemo(() => (alertsQuery.data ?? []) as ListAlertsResponse, [alertsQuery.data]);
  const tasks = useMemo(() => (tasksQuery.data ?? []) as CareTaskOut[], [tasksQuery.data]);
  const vitals = useMemo(
    () => (vitalsQuery.data ?? []) as ListVitalReadingsResponse,
    [vitalsQuery.data],
  );

  const supportRequests = useMemo(() => {
    const rows = (supportRequestsQuery.data ?? []) as ServiceRequestOut[];
    return [...rows]
      .filter((r) => r.status === "open" || r.status === "in_progress")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 12);
  }, [supportRequestsQuery.data]);

  const patientById = useMemo(
    () => new Map(patients.map((patient) => [patient.id, patient])),
    [patients],
  );

  // Latest vitals per patient
  const latestVitalsByPatient = useMemo(() => {
    const map = new Map<number, ListVitalReadingsResponse[number]>();
    for (const reading of vitals) {
      const current = map.get(reading.patient_id);
      if (!current || reading.timestamp > current.timestamp) {
        map.set(reading.patient_id, reading);
      }
    }
    return map;
  }, [vitals]);

  // My assigned patients (for now show all active patients, in future filter by caregiver assignment)
  const myPatients = useMemo(() => {
    return patients
      .filter((p) => p.is_active)
      .slice(0, 8)
      .map((patient) => {
        const patientAlerts = alerts.filter((a) => a.patient_id === patient.id);
        const latestVitals = latestVitalsByPatient.get(patient.id);
        return {
          patient,
          alerts: patientAlerts,
          latestVitals,
        };
      });
  }, [patients, alerts, latestVitalsByPatient]);

  // My tasks (filter by assigned caregiver if available)
  const myTasks = useMemo(() => {
    return tasks
      .filter((task) => task.status === "pending" || task.status === "in_progress")
      .sort((left, right) => {
        const order = { critical: 0, high: 1, normal: 2, low: 3 };
        const leftRank = order[left.priority as keyof typeof order] ?? 4;
        const rightRank = order[right.priority as keyof typeof order] ?? 4;
        if (leftRank !== rightRank) return leftRank - rightRank;
        if (!left.due_at) return 1;
        if (!right.due_at) return -1;
        return left.due_at.localeCompare(right.due_at);
      })
      .slice(0, 6);
  }, [tasks]);

  const checklist = useMemo(
    () => mergeServerShiftChecklist(shiftChecklistQuery.data?.items),
    [shiftChecklistQuery.data],
  );

  // Shift stats
  const shiftStats = useMemo(() => {
    const total = checklist.length;
    const completed = checklist.filter((item) => item.checked).length;
    const remaining = total - completed;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, remaining, percent };
  }, [checklist]);

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            {t("observer.page.consoleBadge")}
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
              {t("observer.page.dashboardTitle")}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {t("observer.page.dashboardSubtitle")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/observer/tasks">{t("nav.tasks")}</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/observer/personnel">{t("nav.personnel")}</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/observer/monitoring">
              <MapIcon className="mr-1.5 h-4 w-4" />
              {t("observer.page.zoneMap")}
            </Link>
          </Button>
        </div>
      </div>

      {taskActionError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {taskActionError}
        </div>
      ) : null}

      {/* Stats Overview */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("observer.page.statMyPatients")}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {myPatients.length}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t("observer.page.statAssignedToday")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/12 text-amber-600">
                <ListTodo className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("observer.page.statMyTasks")}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {myTasks.length}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t("observer.page.statPending")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/12 text-sky-600">
                <CheckSquare className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("observer.page.statChecklist")}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {shiftStats.percent}%
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {shiftStats.completed}/{shiftStats.total} {t("observer.page.statCompletedSuffix")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-500/12 text-red-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("observer.page.statAlerts")}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {alerts.filter((a) => a.status === "active").length}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t("observer.page.statActiveZone")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="border-border/70">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <ConciergeBell className="h-3.5 w-3.5" />
              {t("observer.supportQueue.badge")}
            </div>
            <CardTitle className="text-base">{t("observer.supportQueue.title")}</CardTitle>
            <CardDescription>{t("observer.supportQueue.desc")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {claimError ? <p className="text-sm text-destructive">{claimError}</p> : null}
          {supportRequestsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : supportRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("observer.supportQueue.empty")}</p>
          ) : (
            <div className="space-y-2">
              {supportRequests.map((req) => {
                const patient = req.patient_id ? patientById.get(req.patient_id) : null;
                const claimedByMe = me?.id != null && req.claimed_by_user_id === me.id;
                const claimedByOther = req.claimed_by_user_id != null && !claimedByMe;
                return (
                  <div
                    key={req.id}
                    className="flex flex-col gap-2 rounded-xl border border-border/70 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="text-xs text-muted-foreground">
                        {t("observer.supportQueue.patient")}:{" "}
                        <span className="font-medium text-foreground">
                          {patient
                            ? `${patient.first_name ?? ""} ${patient.last_name ?? ""}`.trim() || `Patient #${patient.id}`
                            : `#${req.patient_id ?? "?"}`}
                        </span>
                      </p>
                      {req.title ? <p className="truncate text-sm font-semibold text-foreground">{req.title}</p> : null}
                      <p className="line-clamp-2 text-xs text-muted-foreground">{req.note}</p>
                      {claimedByOther ? (
                        <p className="text-xs text-amber-700 dark:text-amber-400">{t("observer.supportQueue.taken")}</p>
                      ) : null}
                      {claimedByMe ? (
                        <p className="text-xs text-emerald-700 dark:text-emerald-400">{t("observer.supportQueue.claimed")}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                      {req.status === "open" && !claimedByOther ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={claimMutation.isPending}
                          onClick={() => claimMutation.mutate(req.id)}
                        >
                          {t("observer.supportQueue.claim")}
                        </Button>
                      ) : null}
                      {claimedByMe && req.status === "in_progress" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={fulfillMutation.isPending}
                          onClick={() => fulfillMutation.mutate(req.id)}
                        >
                          {t("observer.supportQueue.markFulfilled")}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Zone Map & Shift Checklist Grid */}
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        {/* Zone Map */}
        <DashboardFloorplanPanel />

        <ShiftChecklistMePanel shiftDate={shiftDate} />
      </div>

      {/* My Tasks & Patient Cards Grid */}
      <div className="grid gap-4 xl:grid-cols-2">
        {/* My Tasks */}
        <Card className="border-border/70">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">{t("observer.page.statMyTasks")}</CardTitle>
              <CardDescription>{t("observer.page.previewTasksDesc")}</CardDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/observer/tasks">
                {t("dash.viewAll")}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {myTasks.length ? (
              myTasks.map((task) => {
                const patient = task.patient_id ? patientById.get(task.patient_id) : null;
                return (
                  <div
                    key={task.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-border/70 px-3 py-3"
                  >
                    <div className="min-w-0">
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
                          {taskPriorityLabel(t, task.priority)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {patient
                          ? `${patient.first_name} ${patient.last_name}`
                          : t("observer.page.unitWide")}
                      </p>
                      {task.due_at && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          <Clock className="mr-1 inline h-3 w-3" />
                          {t("observer.tasks.due")} {formatRelativeTime(task.due_at)}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                      {task.patient_id ? (
                        <Button asChild size="sm" variant="outline" className="whitespace-nowrap">
                          <Link href={`/observer/personnel/${task.patient_id}`}>
                            {t("observer.page.openPatient")}
                          </Link>
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        className="whitespace-nowrap"
                        disabled={completeDashboardTaskMutation.isPending}
                        onClick={() => completeDashboardTaskMutation.mutate(task.id)}
                      >
                        {t("observer.page.completeTask")}
                      </Button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-border/70 px-3 py-6 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500/50" />
            <p className="mt-2 text-sm text-muted-foreground">{t("observer.tasks.noPending")}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* My Patients */}
        <Card className="border-border/70">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">{t("observer.page.statMyPatients")}</CardTitle>
              <CardDescription>{t("observer.page.previewPatientsDesc")}</CardDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/observer/personnel">
                {t("dash.viewAll")}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {myPatients.length ? (
              myPatients.map(({ patient, alerts: patientAlerts, latestVitals }) => (
                <Link
                  key={patient.id}
                  href={`/observer/personnel/${patient.id}`}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border/70 px-3 py-3 hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-foreground">
                        {patient.first_name} {patient.last_name}
                      </p>
                      <Badge
                        variant={
                          patient.care_level === "critical"
                            ? "destructive"
                            : patient.care_level === "special"
                              ? "warning"
                              : "outline"
                        }
                        className="shrink-0"
                      >
                        {careLevelLabel(t, patient.care_level)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("observer.page.roomPrefix")}{" "}
                      {patient.room_id ?? "—"}
                      {latestVitals && (
                        <span className="ml-2">
                          {latestVitals.heart_rate_bpm && (
                            <span className="mr-2 inline-flex items-center gap-1">
                              <Heart className="h-3 w-3" />
                              {latestVitals.heart_rate_bpm}bpm
                            </span>
                          )}
                          {latestVitals.spo2 && (
                            <span className="inline-flex items-center gap-1">
                              <Stethoscope className="h-3 w-3" />
                              {latestVitals.spo2}%
                            </span>
                          )}
                        </span>
                      )}
                    </p>
                    {patientAlerts.length > 0 && (
                      <p className="mt-1 text-xs text-red-600">
                        {(() => {
                          const criticalCount = patientAlerts.filter(
                            (a) => a.severity === "critical",
                          ).length;
                          const otherCount = patientAlerts.length - criticalCount;
                          return (
                            <>
                              {criticalCount > 0 && (
                                <span>
                                  {criticalCount} {t("observer.page.severityCritical")}
                                </span>
                              )}
                              {otherCount > 0 && (
                                <span className={criticalCount > 0 ? "ml-1" : undefined}>
                                  {otherCount}{" "}
                                  {otherCount === 1
                                    ? t("observer.page.alertSingular")
                                    : t("observer.page.alertPlural")}
                                </span>
                              )}
                            </>
                          );
                        })()}
                      </p>
                    )}
                  </div>
                </Link>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border/70 px-3 py-6 text-center">
                <Users className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("observer.page.noPatientsAssigned")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
