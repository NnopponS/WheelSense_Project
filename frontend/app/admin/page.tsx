"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@/hooks/useQuery";
import { useAuth } from "@/hooks/useAuth";
import { useFixedNowMs } from "@/hooks/useFixedNowMs";
import { withWorkspaceScope } from "@/lib/workspaceQuery";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { ageYears } from "@/lib/age";
import { isDeviceOnline } from "@/lib/deviceOnline";
import { isSmartDeviceOnline } from "@/lib/smartDeviceOnline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  CircleAlert,
  Clock3,
  Gauge,
  ShieldCheck,
  Tablet,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { Alert, Device, HardwareType, Patient, SmartDevice, User } from "@/lib/types";
import type {
  CareDirectiveOut,
  CareScheduleOut,
  CareTaskOut,
  DeviceActivityEventOut,
  GetAlertSummaryResponse,
  GetWardSummaryResponse,
} from "@/lib/api/task-scope-types";

type CopilotModelsResponse = {
  models: { id: string; name: string }[];
  connected: boolean;
  message?: string | null;
};

const HARDWARE_ROWS: Array<{ hardware: HardwareType; labelKey: TranslationKey }> = [
  { hardware: "wheelchair", labelKey: "devicesDetail.tabWheelchair" },
  { hardware: "node", labelKey: "devicesDetail.tabNode" },
  { hardware: "polar_sense", labelKey: "devicesDetail.tabPolar" },
  { hardware: "mobile_phone", labelKey: "devicesDetail.tabMobile" },
];

const SEVERITY_ICON: Record<string, LucideIcon> = {
  critical: CircleAlert,
  warning: AlertTriangle,
};

function severityRank(value: string): number {
  if (value === "critical") return 0;
  if (value === "warning") return 1;
  return 2;
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const nowMs = useFixedNowMs();

  const patientsEndpoint = useMemo(
    () => withWorkspaceScope("/patients?limit=200", user?.workspace_id),
    [user?.workspace_id],
  );
  const alertsEndpoint = useMemo(
    () => withWorkspaceScope("/alerts?status=active&limit=40", user?.workspace_id),
    [user?.workspace_id],
  );
  const devicesEndpoint = useMemo(
    () => withWorkspaceScope("/devices?limit=200", user?.workspace_id),
    [user?.workspace_id],
  );
  const smartEndpoint = useMemo(
    () => withWorkspaceScope("/ha/devices", user?.workspace_id),
    [user?.workspace_id],
  );
  const usersEndpoint = useMemo(
    () => withWorkspaceScope("/users", user?.workspace_id),
    [user?.workspace_id],
  );
  const tasksEndpoint = useMemo(
    () => withWorkspaceScope("/workflow/tasks?status=pending&limit=24", user?.workspace_id),
    [user?.workspace_id],
  );
  const directivesEndpoint = useMemo(
    () => withWorkspaceScope("/workflow/directives?status=active&limit=24", user?.workspace_id),
    [user?.workspace_id],
  );
  const schedulesEndpoint = useMemo(
    () => withWorkspaceScope("/workflow/schedules?status=scheduled&limit=24", user?.workspace_id),
    [user?.workspace_id],
  );
  const activityEndpoint = useMemo(
    () => withWorkspaceScope("/devices/activity?limit=12", user?.workspace_id),
    [user?.workspace_id],
  );
  const copilotStatusEndpoint = useMemo(
    () => withWorkspaceScope("/settings/ai/copilot/status", user?.workspace_id),
    [user?.workspace_id],
  );
  const copilotModelsEndpoint = useMemo(
    () => withWorkspaceScope("/settings/ai/copilot/models", user?.workspace_id),
    [user?.workspace_id],
  );
  const wardSummaryEndpoint = useMemo(
    () => withWorkspaceScope("/analytics/wards/summary", user?.workspace_id),
    [user?.workspace_id],
  );
  const alertSummaryEndpoint = useMemo(
    () => withWorkspaceScope("/analytics/alerts/summary", user?.workspace_id),
    [user?.workspace_id],
  );

  const { data: patients } = useQuery<Patient[]>(patientsEndpoint);
  const { data: alerts } = useQuery<Alert[]>(alertsEndpoint);
  const { data: devices } = useQuery<Device[]>(devicesEndpoint);
  const { data: smartDevices } = useQuery<SmartDevice[]>(smartEndpoint);
  const { data: users } = useQuery<User[]>(usersEndpoint);
  const { data: tasks } = useQuery<CareTaskOut[]>(tasksEndpoint);
  const { data: directives } = useQuery<CareDirectiveOut[]>(directivesEndpoint);
  const { data: schedules } = useQuery<CareScheduleOut[]>(schedulesEndpoint);
  const { data: activity } = useQuery<DeviceActivityEventOut[]>(activityEndpoint);
  const { data: wardSummary } = useQuery<GetWardSummaryResponse>(wardSummaryEndpoint);
  const { data: alertSummary } = useQuery<GetAlertSummaryResponse>(alertSummaryEndpoint);
  const { data: copilotStatus } = useQuery<{ connected: boolean }>(copilotStatusEndpoint);
  const { data: copilotModels } = useQuery<CopilotModelsResponse>(copilotModelsEndpoint);

  const activeAlerts = useMemo(
    () => (alerts ?? []).filter((item) => item.status === "active"),
    [alerts],
  );
  const urgentAlerts = useMemo(
    () =>
      [...activeAlerts]
        .sort((left, right) => {
          const rank = severityRank(left.severity) - severityRank(right.severity);
          return rank !== 0 ? rank : right.timestamp.localeCompare(left.timestamp);
        })
        .slice(0, 4),
    [activeAlerts],
  );
  const openTasks = useMemo(
    () =>
      [...(tasks ?? [])]
        .filter((item) => item.status === "pending" || item.status === "in_progress")
        .sort((left, right) => {
          const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 } as const;
          const leftRank = priorityOrder[left.priority as keyof typeof priorityOrder] ?? 4;
          const rightRank = priorityOrder[right.priority as keyof typeof priorityOrder] ?? 4;
          if (leftRank !== rightRank) return leftRank - rightRank;
          if (!left.due_at) return 1;
          if (!right.due_at) return -1;
          return left.due_at.localeCompare(right.due_at);
        })
        .slice(0, 4),
    [tasks],
  );
  const activeDirectives = useMemo(
    () => (directives ?? []).filter((item) => item.status === "active").slice(0, 4),
    [directives],
  );
  const upcomingSchedules = useMemo(
    () =>
      [...(schedules ?? [])]
        .filter((item) => item.status === "scheduled")
        .sort((left, right) => left.starts_at.localeCompare(right.starts_at))
        .slice(0, 4),
    [schedules],
  );
  const recentPatients = useMemo(() => (patients ?? []).slice(0, 5), [patients]);
  const latestActivity = useMemo(
    () =>
      [...(activity ?? [])]
        .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))
        .slice(0, 4),
    [activity],
  );

  const patientMap = useMemo(
    () => new Map((patients ?? []).map((patient) => [patient.id, patient])),
    [patients],
  );
  const fleetByType = useMemo(
    () =>
      HARDWARE_ROWS.map(({ hardware, labelKey }) => {
        const rows = (devices ?? []).filter((device) => device.hardware_type === hardware);
        const online = rows.filter((device) => isDeviceOnline(device.last_seen, nowMs)).length;
        return { hardware, labelKey, total: rows.length, online, offline: rows.length - online };
      }),
    [devices, nowMs],
  );
  const smartStats = useMemo(() => {
    const list = smartDevices ?? [];
    const online = list.filter((device) => isSmartDeviceOnline(device)).length;
    return { total: list.length, online, offline: list.length - online };
  }, [smartDevices]);
  const activeUsers = useMemo(() => (users ?? []).filter((item) => item.is_active), [users]);
  const linkedUsers = useMemo(
    () => activeUsers.filter((item) => item.caregiver_id != null || item.patient_id != null),
    [activeUsers],
  );
  const copilotModelCount = copilotModels?.models?.length ?? 0;
  const copilotHealthy = Boolean(copilotStatus?.connected) && copilotModelCount > 0;
  const copilotLimited = Boolean(copilotStatus?.connected) && copilotModelCount === 0;
  const workflowItems = useMemo(
    () => [
      ...openTasks.map((item) => ({
        key: `task-${item.id}`,
        title: item.title,
        subtitle: item.description || t("admin.noDescription"),
        badge: item.priority,
        variant: item.priority === "critical" ? ("destructive" as const) : item.priority === "high" ? ("warning" as const) : ("outline" as const),
        icon: Workflow,
      })),
      ...activeDirectives.map((item) => ({
        key: `directive-${item.id}`,
        title: item.title,
        subtitle: item.directive_text || t("admin.noDescription"),
        badge: item.status,
        variant: "secondary" as const,
        icon: ShieldCheck,
      })),
      ...upcomingSchedules.map((item) => ({
        key: `schedule-${item.id}`,
        title: item.title,
        subtitle: item.notes || t("admin.noDescription"),
        badge: item.schedule_type,
        variant: "outline" as const,
        icon: Clock3,
      })),
    ],
    [activeDirectives, openTasks, upcomingSchedules, t],
  );

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Gauge className="h-3.5 w-3.5" />
            {t("admin.dashboardBadge")}
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
              {t("admin.dashboardTitle")}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {t("admin.dashboardSubtitle")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/patients">{t("admin.openPatients")}</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/devices">{t("admin.openDevices")}</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/workflow">{t("admin.openWorkflow")}</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/admin/settings">{t("admin.openSettings")}</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="flex items-start gap-4 p-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-500/12 text-red-600"><AlertTriangle className="h-5 w-5" /></div>
          <div><p className="text-xs uppercase tracking-wide text-muted-foreground">{t("admin.urgentAlerts")}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{activeAlerts.length}</p><p className="mt-1 text-xs text-muted-foreground">{wardSummary ? `${wardSummary.critical_patients} ${t("admin.criticalPatients")}` : t("admin.urgentAlertsHint")}</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-start gap-4 p-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600"><Users className="h-5 w-5" /></div>
          <div><p className="text-xs uppercase tracking-wide text-muted-foreground">{t("admin.patientCoverage")}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{wardSummary?.total_patients ?? patients?.length ?? "—"}</p><p className="mt-1 text-xs text-muted-foreground">{patients ? `${patients.filter((p) => p.room_id != null).length} ${t("admin.roomLinkedPatients")}` : t("admin.coverageHint")}</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-start gap-4 p-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/12 text-sky-600"><Tablet className="h-5 w-5" /></div>
          <div><p className="text-xs uppercase tracking-wide text-muted-foreground">{t("admin.fleetHealth")}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{devices?.length ?? "—"}</p><p className="mt-1 text-xs text-muted-foreground">{fleetByType.reduce((sum, row) => sum + row.online, 0)} {t("admin.devicesOnline")}</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-start gap-4 p-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/12 text-violet-600"><Bot className="h-5 w-5" /></div>
          <div><p className="text-xs uppercase tracking-wide text-muted-foreground">{t("admin.copilotStatus")}</p><p className="mt-1 text-2xl font-semibold text-foreground">{copilotStatus?.connected ? t("admin.connected") : t("admin.notConnected")}</p><p className="mt-1 text-xs text-muted-foreground">{copilotLimited ? t("admin.connectedButModelsUnavailable") : copilotModels?.message || `${copilotModelCount} ${t("admin.copilotModels")}`}</p></div>
        </CardContent></Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.95fr]">
        <Card className="border-border/70">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">{t("admin.urgentAlerts")}</CardTitle>
              <CardDescription>{t("admin.urgentAlertsHint")}</CardDescription>
            </div>
            <Button asChild size="sm" variant="outline"><Link href="/admin/alerts">{t("admin.openAlerts")}<ArrowRight className="h-4 w-4" /></Link></Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {urgentAlerts.length ? urgentAlerts.map((alert) => {
              const patient = alert.patient_id ? patientMap.get(alert.patient_id) : null;
              const Icon = SEVERITY_ICON[alert.severity] ?? Clock3;
              return (
                <Link key={alert.id} href={alert.patient_id ? `/admin/patients/${alert.patient_id}` : "/admin/alerts"} className="flex items-start gap-3 rounded-xl border border-border/70 px-3 py-3 hover:bg-muted/40">
                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><p className="truncate font-medium text-foreground">{alert.title}</p><Badge variant={alert.severity === "critical" ? "destructive" : alert.severity === "warning" ? "warning" : "secondary"}>{alert.severity}</Badge></div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{alert.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{patient ? `${patient.first_name} ${patient.last_name}` : t("admin.unlinkedPatient")}</p>
                  </div>
                </Link>
              );
            }) : <p className="rounded-xl border border-dashed border-border/70 px-3 py-3 text-sm text-muted-foreground">{t("admin.noUrgentAlerts")}</p>}
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">{t("admin.workflowQueue")}</CardTitle>
              <CardDescription>{t("admin.workflowQueueHint")}</CardDescription>
            </div>
            <Button asChild size="sm" variant="outline"><Link href="/admin/workflow">{t("admin.openWorkflow")}<ArrowRight className="h-4 w-4" /></Link></Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {workflowItems.length ? workflowItems.slice(0, 8).map((item) => (
                <div key={item.key} className="flex items-start gap-3 rounded-xl border border-border/70 px-3 py-3">
                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground"><item.icon className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><p className="truncate font-medium text-foreground">{item.title}</p><Badge variant={item.variant}>{item.badge}</Badge></div>
                    <p className="mt-1 text-sm text-muted-foreground">{item.subtitle}</p>
                  </div>
                </div>
              )) : <p className="rounded-xl border border-dashed border-border/70 px-3 py-3 text-sm text-muted-foreground">{t("admin.noWorkflowItems")}</p>}          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="border-border/70">
          <CardHeader className="space-y-2 pb-3"><CardTitle className="text-base">{t("admin.fleetHealth")}</CardTitle><CardDescription>{t("admin.fleetHealthHint")}</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border/70 px-3 py-3"><p className="text-xs uppercase tracking-wide text-muted-foreground">{t("admin.devicesOnline")}</p><p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{fleetByType.reduce((sum, row) => sum + row.online, 0)}</p></div>
              <div className="rounded-xl border border-border/70 px-3 py-3"><p className="text-xs uppercase tracking-wide text-muted-foreground">{t("admin.devicesOffline")}</p><p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{fleetByType.reduce((sum, row) => sum + row.offline, 0)}</p></div>
              <div className="rounded-xl border border-border/70 px-3 py-3"><p className="text-xs uppercase tracking-wide text-muted-foreground">{t("admin.smartFleet")}</p><p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{smartStats.online}/{smartStats.total}</p></div>
            </div>
            {fleetByType.map((row) => (
              <Link key={row.hardware} href={`/admin/devices?tab=${row.hardware}`} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-3 hover:bg-muted/40">
                <div><p className="font-medium text-foreground">{t(row.labelKey)}</p><p className="text-xs text-muted-foreground">{row.online} {t("devices.online")} / {row.offline} {t("devices.offline")}</p></div>
                <Badge variant={row.offline > 0 ? "warning" : "success"}>{row.total}</Badge>
              </Link>
            ))}
            <div className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-3"><div><p className="font-medium text-foreground">{t("devicesDetail.tabSmartDevice")}</p><p className="text-xs text-muted-foreground">{smartStats.online} {t("devices.online")} / {smartStats.offline} {t("devices.offline")}</p></div><Badge variant={smartStats.offline > 0 ? "warning" : "success"}>{smartStats.total}</Badge></div>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="space-y-2 pb-3"><CardTitle className="text-base">{t("admin.accountLinkStatus")}</CardTitle><CardDescription>{t("admin.accountLinkStatusHint")}</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/70 px-3 py-3"><p className="text-xs uppercase tracking-wide text-muted-foreground">{t("admin.activeAccounts")}</p><p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{activeUsers.length}</p></div>
              <div className="rounded-xl border border-border/70 px-3 py-3"><p className="text-xs uppercase tracking-wide text-muted-foreground">{t("admin.unlinkedAccounts")}</p><p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{Math.max(activeUsers.length - linkedUsers.length, 0)}</p></div>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-3"><div><p className="font-medium text-foreground">{t("admin.caregiverLinkedAccounts")}</p><p className="text-xs text-muted-foreground">{t("admin.caregiverAccessSnapshot")}</p></div><Badge variant="outline">{activeUsers.filter((item) => item.caregiver_id != null).length}</Badge></div>
            <div className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-3"><div><p className="font-medium text-foreground">{t("admin.patientLinkedAccounts")}</p><p className="text-xs text-muted-foreground">{t("admin.patientLinkSnapshot")}</p></div><Badge variant="outline">{activeUsers.filter((item) => item.patient_id != null).length}</Badge></div>
            <div className="rounded-xl border border-dashed border-border/70 px-3 py-3 text-sm text-muted-foreground">{alertSummary ? `${alertSummary.total_active} ${t("admin.alertsActive")} · ${alertSummary.total_resolved} ${t("admin.alertsResolved")}` : t("admin.accountLinkFallback")}</div>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="space-y-2 pb-3"><CardTitle className="text-base">{t("admin.aiShortcutTitle")}</CardTitle><CardDescription>{t("admin.aiShortcutHint")}</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-3"><div><p className="font-medium text-foreground">{t("admin.copilotStatus")}</p><p className="text-xs text-muted-foreground">{copilotModels?.message || t("admin.copilotModelHint")}</p></div><Badge variant={copilotHealthy ? "success" : copilotLimited ? "warning" : "destructive"}>{copilotStatus?.connected ? t("admin.connected") : t("admin.notConnected")}</Badge></div>
            <div className="rounded-xl border border-border/70 px-3 py-3"><p className="text-xs uppercase tracking-wide text-muted-foreground">{t("admin.copilotModels")}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{copilotModelCount}</p><p className="mt-1 text-xs text-muted-foreground">{copilotLimited ? t("admin.connectedButModelsUnavailable") : t("admin.copilotModelCountHint")}</p></div>
            <Button asChild variant="outline" className="w-full justify-between"><Link href="/admin/settings"><span className="inline-flex items-center gap-2"><Bot className="h-4 w-4" />{t("admin.openAiSettings")}</span><ArrowRight className="h-4 w-4" /></Link></Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-border/70">
          <CardHeader className="space-y-2 pb-3"><CardTitle className="text-base">{t("admin.recentPatients")}</CardTitle><CardDescription>{t("admin.recentPatientsHint")}</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {recentPatients.length ? recentPatients.map((patient) => (
              <Link key={patient.id} href={`/admin/patients/${patient.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-3 hover:bg-muted/40">
                <div className="min-w-0"><p className="truncate font-medium text-foreground">{patient.first_name} {patient.last_name}</p><p className="text-xs text-muted-foreground">{t("patients.age")}: {ageYears(patient.date_of_birth, nowMs) ?? "—"} {t("patients.years")}{patient.room_id != null ? ` · ${t("admin.roomLinked")}` : ""}</p></div>
                <Badge variant={patient.care_level === "critical" ? "destructive" : patient.care_level === "special" ? "warning" : "outline"}>{patient.care_level}</Badge>
              </Link>
            )) : <p className="rounded-xl border border-dashed border-border/70 px-3 py-3 text-sm text-muted-foreground">{t("admin.noPatients")}</p>}
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="space-y-2 pb-3"><CardTitle className="text-base">{t("admin.activityFeed")}</CardTitle><CardDescription>{t("admin.activityFeedHint")}</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {latestActivity.length ? latestActivity.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 rounded-xl border border-border/70 px-3 py-3">
                <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Activity className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1"><p className="truncate font-medium text-foreground">{entry.event_type}</p><p className="mt-1 text-xs text-muted-foreground">{entry.summary || t("admin.noDescription")}</p></div>
              </div>
            )) : <p className="rounded-xl border border-dashed border-border/70 px-3 py-3 text-sm text-muted-foreground">{t("admin.noActivity")}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}




