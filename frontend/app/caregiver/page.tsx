"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  AlertTriangle,
  CheckSquare,
  ArrowRight,
  ClipboardEdit,
  ConciergeBell,
  Bot,
} from "lucide-react";
import { MobilePageLayout } from "@/components/layout/MobilePageLayout";
import DashboardMapLauncher from "@/components/dashboard/DashboardMapLauncher";
import { RoleQuickActions } from "@/components/dashboard/RoleQuickActions";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { api } from "@/lib/api";
import { mergeServerShiftChecklist, utcShiftDateString } from "@/lib/shiftChecklistDefaults";
import { formatRelativeTime } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShiftChecklistMePanel } from "@/components/shift-checklist/ShiftChecklistMePanel";
import { ObserverNextActionHero } from "@/components/observer/ObserverNextActionHero";
import { CsvExportButton } from "@/components/shared/CsvExportButton";
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

export default function CaregiverDashboardPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [shiftDate] = useState(() => utcShiftDateString());
  const [taskActionError, setTaskActionError] = useState<string | null>(null);

  const shiftChecklistQuery = useQuery({
    queryKey: ["shift-checklist", "me", shiftDate],
    queryFn: () => api.getShiftChecklistMe({ shift_date: shiftDate }),
  });

  // Data queries
  const patientsQuery = useQuery({
    queryKey: ["caregiver", "dashboard", "patients"],
    queryFn: () => api.listPatients({ limit: 100 }),
  });

  const alertsQuery = useQuery({
    queryKey: ["caregiver", "dashboard", "alerts"],
    queryFn: () => api.listAlerts({ status: "active", limit: 50 }),
    refetchInterval: 20_000,
  });

  const tasksQuery = useQuery({
    queryKey: ["caregiver", "dashboard", "tasks"],
    queryFn: () => api.listWorkflowTasks({ limit: 50 }),
  });

  const vitalsQuery = useQuery({
    queryKey: ["caregiver", "dashboard", "vitals"],
    queryFn: () => api.listVitalReadings({ limit: 100 }),
    refetchInterval: 30_000,
  });

  const supportRequestsQuery = useQuery({
    queryKey: ["caregiver", "dashboard", "service-requests"],
    queryFn: () => api.listServiceRequests({ limit: 50 }),
    refetchInterval: 15_000,
  });

  const completeDashboardTaskMutation = useMutation({
    mutationFn: (taskId: number) => api.updateWorkflowTask(taskId, { status: "completed" }),
    onSuccess: async () => {
      setTaskActionError(null);
      await queryClient.invalidateQueries({ queryKey: ["caregiver", "dashboard", "tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: () => setTaskActionError(t("observer.page.taskActionError")),
  });

  const acknowledgeHeroAlertMutation = useMutation({
    mutationFn: (alertId: number) => api.acknowledgeAlert(alertId, {}),
    onSuccess: async () => {
      setTaskActionError(null);
      await queryClient.invalidateQueries({ queryKey: ["caregiver", "dashboard", "alerts"] });
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

  // Next-action hero: pick highest-severity active alert, else top-priority task.
  const heroSelection = useMemo(() => {
    const severityRank: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    const activeAlerts = alerts
      .filter((a) => a.status === "active")
      .sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9));
    if (activeAlerts.length > 0) {
      const top = activeAlerts[0];
      const patient = top.patient_id != null ? patientById.get(top.patient_id) : undefined;
      const subtitleParts: string[] = [];
      if (patient) {
        const name = [patient.first_name, patient.last_name].filter(Boolean).join(" ").trim();
        if (name) subtitleParts.push(name);
      }
      if (top.description) subtitleParts.push(top.description);
      return {
        mode: "alert" as const,
        alertId: top.id,
        taskId: null as number | null,
        title: top.title,
        subtitle: subtitleParts.join(" · "),
        severity:
          top.severity === "critical"
            ? ("critical" as const)
            : top.severity === "warning"
              ? ("warning" as const)
              : ("info" as const),
        severityLabel: top.severity,
      };
    }
    if (myTasks.length > 0) {
      const top = myTasks[0];
      const patient = top.patient_id != null ? patientById.get(top.patient_id) : undefined;
      const subtitleParts: string[] = [];
      if (patient) {
        const name = [patient.first_name, patient.last_name].filter(Boolean).join(" ").trim();
        if (name) subtitleParts.push(name);
      }
      if (top.due_at) subtitleParts.push(formatRelativeTime(top.due_at));
      return {
        mode: "task" as const,
        alertId: null as number | null,
        taskId: top.id,
        title: top.title ?? t("observer.page.untitledTask"),
        subtitle: subtitleParts.join(" · "),
        severity:
          top.priority === "critical"
            ? ("critical" as const)
            : top.priority === "high"
              ? ("warning" as const)
              : ("info" as const),
        severityLabel: taskPriorityLabel(t, top.priority ?? "normal"),
      };
    }
    return {
      mode: "idle" as const,
      alertId: null as number | null,
      taskId: null as number | null,
      title: undefined,
      subtitle: undefined,
      severity: "idle" as const,
      severityLabel: undefined,
    };
  }, [alerts, myTasks, patientById, t]);

  const heroPending =
    acknowledgeHeroAlertMutation.isPending || completeDashboardTaskMutation.isPending;

  const observerExportRows = useMemo(
    () => [
      ["summary", "patients", myPatients.length, "", ""],
      ["summary", "tasks", myTasks.length, "", ""],
      ["summary", "support_requests", supportRequests.length, "", ""],
      ["summary", "shift_checklist", shiftStats.total, `${shiftStats.completed} completed`, `${shiftStats.remaining} remaining`],
      ...myTasks.map((task) => [
        "task",
        task.id,
        task.priority,
        task.title ?? "",
        task.patient_id ?? "",
      ]),
      ...supportRequests.map((request) => [
        "service_request",
        request.id,
        request.status,
        request.title,
        request.patient_id ?? "",
      ]),
    ],
    [myPatients.length, myTasks, shiftStats.completed, shiftStats.remaining, shiftStats.total, supportRequests],
  );
  const activeAlerts = useMemo(
    () => alerts.filter((alert) => alert.status === "active"),
    [alerts],
  );
  const criticalAlerts = useMemo(
    () => activeAlerts.filter((alert) => alert.severity === "critical"),
    [activeAlerts],
  );
  const quickActions = useMemo(
    () => [
      {
        label: t("nav.observer.alerts"),
        description: `${criticalAlerts.length}/${activeAlerts.length}`,
        href: "/caregiver/alerts",
        icon: AlertTriangle,
        tone: criticalAlerts.length > 0 ? ("danger" as const) : ("neutral" as const),
      },
      {
        label: t("nav.observer.tasks"),
        description: `${myTasks.length}`,
        href: "/caregiver/tasks",
        icon: CheckSquare,
        tone: "warning" as const,
      },
      {
        label: t("nav.observer.patients"),
        description: `${myPatients.length}`,
        href: "/caregiver/personnel",
        icon: Users,
        tone: "primary" as const,
      },
      {
        label: t("nav.observer.handover"),
        description: t("observer.page.handoverActionDesc"),
        href: "/caregiver/messages?new=handover",
        icon: ClipboardEdit,
        tone: "neutral" as const,
      },
      {
        label: t("nav.observer.support"),
        description: `${supportRequests.length}`,
        href: "/caregiver/support?new=request",
        icon: ConciergeBell,
        tone: "success" as const,
      },
      {
        label: t("observer.page.askAi"),
        description: t("observer.page.askAiDesc"),
        icon: Bot,
        tone: "neutral" as const,
        aiPrompt: t("observer.page.askAiPrompt"),
      },
    ],
    [activeAlerts.length, criticalAlerts.length, myPatients.length, myTasks.length, supportRequests.length, t],
  );

  const onHeroPrimaryAction = () => {
    if (heroSelection.mode === "alert" && heroSelection.alertId != null) {
      acknowledgeHeroAlertMutation.mutate(heroSelection.alertId);
    } else if (heroSelection.mode === "task" && heroSelection.taskId != null) {
      completeDashboardTaskMutation.mutate(heroSelection.taskId);
    }
  };

  return (
    <MobilePageLayout
      title={t("nav.observer.today")}
      description={t("observer.page.dashboardSubtitle")}
      topActions={
        <CsvExportButton
          fileNameBase="wheelsense-observer-shift"
          headers={[
            t("observer.page.exportType"),
            t("observer.page.exportId"),
            t("observer.page.exportState"),
            t("observer.page.exportTitle"),
            t("observer.page.exportPatientId"),
          ]}
          rows={observerExportRows}
        />
      }
    >
      <div className="space-y-3 pb-4 animate-fade-in sm:space-y-4 sm:pb-6">

      {taskActionError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {taskActionError}
        </div>
      ) : null}

      {/* Elder-friendly next action hero */}
      <ObserverNextActionHero
        mode={heroSelection.mode}
        title={heroSelection.title}
        subtitle={heroSelection.subtitle}
        severity={heroSelection.severity}
        severityLabel={heroSelection.severityLabel}
        isPending={heroPending}
        onPrimaryAction={onHeroPrimaryAction}
      />

        <RoleQuickActions title={t("observer.page.roleDuties")} actions={quickActions} />

        <DashboardMapLauncher
          href="/caregiver/floorplans"
          title={t("observer.page.mapTitle")}
          description={t("observer.page.mapDesc")}
          primaryLabel={criticalAlerts.length ? t("observer.page.openEmergencyMap") : t("nav.observer.map")}
          emergencyCount={criticalAlerts.length}
          peopleCount={myPatients.length}
          roomLabel={t("observer.page.findRoom")}
          compact
        />

        {/* Shift Checklist */}
        <ShiftChecklistMePanel shiftDate={shiftDate} />

        {/* My Patients Summary (Compact — top 3 only) */}
        <Card className="border-border/70">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">{t("observer.page.statMyPatients")}</CardTitle>
              <CardDescription>{t("observer.page.previewPatientsDesc")}</CardDescription>
            </div>
            <Button asChild size="sm" variant="ghost" className="h-8">
              <Link href="/caregiver/personnel">
                {t("dash.viewAll")}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {myPatients.length ? (
              myPatients.slice(0, 3).map(({ patient }) => (
                <Link
                  key={patient.id}
                  href={`/caregiver/patients/${patient.id}`}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border/70 px-3 py-3 hover:bg-muted/40 transition-colors"
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
                      {t("observer.page.roomPrefix")} {patient.room_id ?? "—"}
                    </p>
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
    </MobilePageLayout>
  );
}
