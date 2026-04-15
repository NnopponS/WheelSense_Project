"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList,
  Eye,
  ShieldAlert,
  Siren,
  Stethoscope,
  CheckIcon,
  ArrowRight,
  UserCheck,
  Users,
  Bell,
} from "lucide-react";
import DashboardFloorplanPanel from "@/components/dashboard/DashboardFloorplanPanel";
import { useTranslation } from "@/lib/i18n";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/datetime";
import { useFixedNowMs } from "@/hooks/useFixedNowMs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  CareDirectiveOut,
  CareTaskOut,
  ListAlertsResponse,
  ListPatientsResponse,
  ListVitalReadingsResponse,
} from "@/lib/api/task-scope-types";

export default function SupervisorDashboardPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [pendingTaskId, setPendingTaskId] = useState<number | null>(null);
  const [pendingDirectiveId, setPendingDirectiveId] = useState<number | null>(null);

  // Data queries
  const patientsQuery = useQuery({
    queryKey: ["supervisor", "dashboard", "patients"],
    queryFn: () => api.listPatients({ limit: 300 }),
  });

  const alertsQuery = useQuery({
    queryKey: ["supervisor", "dashboard", "alerts"],
    queryFn: () => api.listAlerts({ status: "active", limit: 100 }),
    refetchInterval: 15_000,
  });

  const vitalsQuery = useQuery({
    queryKey: ["supervisor", "dashboard", "vitals"],
    queryFn: () => api.listVitalReadings({ limit: 300 }),
    refetchInterval: 30_000,
  });

  const tasksQuery = useQuery({
    queryKey: ["supervisor", "dashboard", "tasks"],
    queryFn: () => api.listWorkflowTasks({ limit: 100 }),
  });

  const directivesQuery = useQuery({
    queryKey: ["supervisor", "dashboard", "directives"],
    queryFn: () => api.listWorkflowDirectives({ status: "active", limit: 50 }),
  });

  // Data processing
  const patients = useMemo(
    () => (patientsQuery.data ?? []) as ListPatientsResponse,
    [patientsQuery.data],
  );
  const alerts = useMemo(() => (alertsQuery.data ?? []) as ListAlertsResponse, [alertsQuery.data]);
  const vitals = useMemo(
    () => (vitalsQuery.data ?? []) as ListVitalReadingsResponse,
    [vitalsQuery.data],
  );
  const tasks = useMemo(() => (tasksQuery.data ?? []) as CareTaskOut[], [tasksQuery.data]);
  const directives = useMemo(
    () => (directivesQuery.data ?? []) as CareDirectiveOut[],
    [directivesQuery.data],
  );

  const patientById = useMemo(
    () => new Map(patients.map((patient) => [patient.id, patient])),
    [patients],
  );

  const activeAlerts = useMemo(
    () => alerts.filter((alert) => alert.status === "active"),
    [alerts],
  );

  const criticalAlerts = useMemo(
    () => activeAlerts.filter((alert) => alert.severity === "critical"),
    [activeAlerts],
  );

  const openTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.status === "pending" || task.status === "in_progress")
        .sort((left, right) => {
          const order = { critical: 0, high: 1, normal: 2, low: 3 };
          const leftRank = order[left.priority as keyof typeof order] ?? 4;
          const rightRank = order[right.priority as keyof typeof order] ?? 4;
          if (leftRank !== rightRank) return leftRank - rightRank;
          if (!left.due_at) return 1;
          if (!right.due_at) return -1;
          return left.due_at.localeCompare(right.due_at);
        }),
    [tasks],
  );

  const activeDirectives = useMemo(
    () => directives.filter((directive) => directive.status === "active"),
    [directives],
  );

  // Mutations
  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: number) => {
      await api.updateWorkflowTask(taskId, { status: "completed" });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["supervisor", "dashboard", "tasks"] });
    },
    onSettled: () => setPendingTaskId(null),
  });

  const acknowledgeDirectiveMutation = useMutation({
    mutationFn: async (directiveId: number) => {
      await api.acknowledgeWorkflowDirective(directiveId, {
        note: t("supervisor.page.ackNote"),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["supervisor", "dashboard", "directives"] });
    },
    onSettled: () => setPendingDirectiveId(null),
  });

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5" />
            {t("supervisor.page.commandBadge")}
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
              {t("supervisor.page.dashboardTitle")}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {t("supervisor.page.dashboardSubtitle")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/supervisor/patients">{t("nav.patients")}</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/supervisor/tasks">{t("supervisor.page.workflowLink")}</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/supervisor/monitoring">
              <Eye className="mr-1.5 h-4 w-4" />
              {t("supervisor.page.zoneMap")}
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-500/12 text-red-600">
                <Siren className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("supervisor.page.criticalAlerts")}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {criticalAlerts.length}
                </p>
                <p className="mt-1 text-xs text-red-600">
                  {activeAlerts.length} {t("supervisor.page.totalActiveAlerts")}
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
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("supervisor.page.openTasks")}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {openTasks.length}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t("supervisor.page.pendingCompletion")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("supervisor.page.patientsInZone")}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {patients.length}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t("supervisor.page.inYourZone")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/12 text-sky-600">
                <Eye className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("supervisor.page.directivesTitle")}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {activeDirectives.length}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t("supervisor.page.awaitingAck")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Zone Map & Directives Grid */}
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <DashboardFloorplanPanel className="min-w-0" />

        {/* Directives */}
        <Card className="border-border/70">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">{t("supervisor.page.directivesCardTitle")}</CardTitle>
              <CardDescription>{t("supervisor.page.directivesCardDesc")}</CardDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/supervisor/directives">
                {t("supervisor.page.viewAll")}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {activeDirectives.length ? (
              activeDirectives.map((directive) => {
                const patient = directive.patient_id ? patientById.get(directive.patient_id) : null;
                return (
                  <div
                    key={directive.id}
                    className="rounded-xl border border-border/70 px-3 py-3 space-y-2"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{directive.title}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {directive.directive_text}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          {patient ? `${patient.first_name} ${patient.last_name}` : t("supervisor.page.unitWide")}
                        </Badge>
                        {directive.target_role && (
                          <Badge variant="secondary">{directive.target_role}</Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      disabled={acknowledgeDirectiveMutation.isPending && pendingDirectiveId === directive.id}
                      onClick={() => {
                        setPendingDirectiveId(directive.id);
                        acknowledgeDirectiveMutation.mutate(directive.id);
                      }}
                    >
                      <UserCheck className="mr-1.5 h-4 w-4" />
                      {t("supervisor.page.acknowledge")}
                    </Button>
                  </div>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-border/70 px-3 py-6 text-center">
                <CheckIcon className="mx-auto h-8 w-8 text-emerald-500/50" />
                <p className="mt-2 text-sm text-muted-foreground">{t("supervisor.page.allAcknowledged")}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Task Queue */}
      <Card className="border-border/70">
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
          <div>
            <CardTitle className="text-base">{t("supervisor.page.taskQueueTitle")}</CardTitle>
            <CardDescription>{t("supervisor.page.taskQueueDesc")}</CardDescription>
          </div>
          <Button asChild size="sm" variant="ghost">
            <Link href="/supervisor/tasks">
              {t("supervisor.page.viewAll")}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {openTasks.length ? (
            openTasks.slice(0, 6).map((task) => {
              const patient = task.patient_id ? patientById.get(task.patient_id) : null;
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
                    <p className="mt-1 text-sm text-muted-foreground">
                      {patient ? `${patient.first_name} ${patient.last_name}` : t("supervisor.page.unitWide")}
                    </p>
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
              <CheckIcon className="mx-auto h-8 w-8 text-emerald-500/50" />
              <p className="mt-2 text-sm text-muted-foreground">{t("supervisor.page.noPendingTasks")}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
