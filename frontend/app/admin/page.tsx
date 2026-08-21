"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  Bell,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  HeartPulse,
  Settings,
  ShieldAlert,
  Tablet,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useFixedNowMs } from "@/hooks/useFixedNowMs";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/datetime";
import { isDeviceOnline } from "@/lib/deviceOnline";
import { isSmartDeviceOnline } from "@/lib/smartDeviceOnline";
import { getQueryPollingMs, getQueryStaleTimeMs } from "@/lib/queryEndpointDefaults";
import { withWorkspaceScope } from "@/lib/workspaceQuery";
import { useTranslation } from "@/lib/i18n";
import type { Device, HardwareType, SmartDevice } from "@/lib/types";
import type { PatientHealthAnalysis } from "@/lib/patientHealthAnalysis";
import type { ListAlertsResponse, ListDeviceActivityResponse, ListUsersResponse, ListPatientsResponse } from "@/lib/api/task-scope-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CsvExportButton } from "@/components/shared/CsvExportButton";
import DashboardMapLauncher from "@/components/dashboard/DashboardMapLauncher";
import { AppPage } from "@/components/layout/AppPage";
import {
  HealthMetricCard,
  RiskBadge,
  SectionHeader,
  riskToneFromLevel,
  type RiskTone,
} from "@/components/shared/health/HealthPrimitives";
import { cn } from "@/lib/utils";

type HealthStatus = "healthy" | "warning";

/** Matches `RequireRole` on `GET /api/devices/activity` - avoid polling when the session cannot read fleet activity. */
const ROLES_DEVICE_ACTIVITY_POLL = new Set<string>(["admin", "head_nurse", "supervisor"]);

const HARDWARE_ROWS: Array<{
  hardware: HardwareType;
  label: string;
}> = [
  { hardware: "wheelchair", label: "Wheelchairs" },
  { hardware: "node", label: "Nodes" },
  { hardware: "polar_sense", label: "Polar Sense" },
  { hardware: "mobile_phone", label: "Mobile phones" },
];

function formatTemplate(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (output, [key, value]) => output.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function greetingForHour(hour: number, t: (key: string) => string): string {
  if (hour < 12) return t("admin.greeting.morning");
  if (hour < 18) return t("admin.greeting.afternoon");
  return t("admin.greeting.evening");
}

export default function AdminDashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const nowMs = useFixedNowMs();

  const devicesEndpoint = useMemo(
    () => withWorkspaceScope("/devices?limit=200", user?.workspace_id),
    [user?.workspace_id],
  );
  const smartEndpoint = useMemo(
    () => withWorkspaceScope("/ha/devices", user?.workspace_id),
    [user?.workspace_id],
  );
  const activityEndpoint = useMemo(
    () => withWorkspaceScope("/devices/activity?limit=12", user?.workspace_id),
    [user?.workspace_id],
  );
  const usersEndpoint = useMemo(
    () => withWorkspaceScope("/users?limit=200", user?.workspace_id),
    [user?.workspace_id],
  );

  const { data: devices } = useQuery({
    queryKey: ["admin", "dashboard", "devices", devicesEndpoint],
    queryFn: () => api.get<Device[]>(devicesEndpoint!),
    enabled: Boolean(devicesEndpoint),
    staleTime: devicesEndpoint ? getQueryStaleTimeMs(devicesEndpoint) : 30_000,
    refetchInterval: devicesEndpoint ? getQueryPollingMs(devicesEndpoint) : false,
  });
  const { data: smartDevices } = useQuery({
    queryKey: ["admin", "dashboard", "ha-devices", smartEndpoint],
    queryFn: () => api.get<SmartDevice[]>(smartEndpoint!),
    enabled: Boolean(smartEndpoint),
    staleTime: smartEndpoint ? getQueryStaleTimeMs(smartEndpoint) : 30_000,
    refetchInterval: smartEndpoint ? getQueryPollingMs(smartEndpoint) : false,
  });
  const deviceActivityQueryEnabled =
    Boolean(activityEndpoint) &&
    Boolean(user?.role) &&
    ROLES_DEVICE_ACTIVITY_POLL.has(String(user?.role));

  const { data: activity } = useQuery({
    queryKey: ["admin", "dashboard", "device-activity", activityEndpoint],
    queryFn: () => api.get<ListDeviceActivityResponse>(activityEndpoint!),
    enabled: deviceActivityQueryEnabled,
    staleTime: activityEndpoint ? getQueryStaleTimeMs(activityEndpoint) : 30_000,
    refetchInterval: activityEndpoint && deviceActivityQueryEnabled ? getQueryPollingMs(activityEndpoint) : false,
  });
  const { data: users } = useQuery({
    queryKey: ["admin", "dashboard", "users", usersEndpoint],
    queryFn: () => api.get<ListUsersResponse>(usersEndpoint!),
    enabled: Boolean(usersEndpoint),
    staleTime: 30_000,
  });
  const { data: alertsData } = useQuery({
    queryKey: ["admin", "dashboard", "alerts"],
    queryFn: () => api.listAlerts({ status: "active", limit: 100 }),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
  const { data: patientsData } = useQuery({
    queryKey: ["admin", "dashboard", "patients"],
    queryFn: () => api.listPatients({ limit: 200, is_active: true }),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const fleetByType = useMemo(
    () =>
      HARDWARE_ROWS.map(({ hardware, label }) => {
        const rows = (devices ?? []).filter((device) => device.hardware_type === hardware);
        const online = rows.filter((device) => isDeviceOnline(device.last_seen, nowMs)).length;
        return { hardware, label, total: rows.length, online, offline: rows.length - online };
      }),
    [devices, nowMs],
  );

  const smartStats = useMemo(() => {
    const list = smartDevices ?? [];
    const online = list.filter((device) => isSmartDeviceOnline(device)).length;
    return { total: list.length, online, offline: list.length - online };
  }, [smartDevices]);

  const totalDevicesOnline = fleetByType.reduce((sum, row) => sum + row.online, 0);
  const totalDevicesOffline = fleetByType.reduce((sum, row) => sum + row.offline, 0);
  const totalFleet = totalDevicesOnline + totalDevicesOffline;

  const userStats = useMemo(() => {
    const list = users ?? [];
    const active = list.filter((u) => u.is_active).length;
    const byRole = {
      admin: list.filter((u) => u.role === "admin").length,
      head_nurse: list.filter((u) => u.role === "head_nurse").length,
      supervisor: list.filter((u) => u.role === "supervisor").length,
      observer: list.filter((u) => u.role === "observer").length,
      patient: list.filter((u) => u.role === "patient").length,
    };
    return { total: list.length, active, inactive: list.length - active, byRole };
  }, [users]);

  const latestActivity = useMemo(
    () =>
      [...(activity ?? [])]
        .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))
        .slice(0, 5),
    [activity],
  );
  const alerts = useMemo(() => (alertsData ?? []) as ListAlertsResponse, [alertsData]);
  const criticalAlerts = useMemo(
    () => alerts.filter((alert) => alert.status === "active" && alert.severity === "critical"),
    [alerts],
  );

  const patients = (patientsData ?? []) as ListPatientsResponse;
  const activePatientCount = patients.filter((p) => p.is_active).length;

  // Fetch health analysis for up to 12 active patients to find anomalies
  const patientsForHealth = useMemo(() => patients.filter((p) => p.is_active).slice(0, 12), [patients]);
  const healthAnalyses = useQuery({
    queryKey: ["admin", "dashboard", "patient-health", patientsForHealth.map((p) => p.id)],
    queryFn: async () => {
      const results = await Promise.all(
        patientsForHealth.map((p) =>
          api.getPatientHealthAnalysis(p.id).catch(() => null),
        ),
      );
      return patientsForHealth.map((p, i) => ({
        patient: p,
        analysis: results[i] as PatientHealthAnalysis | null,
      }));
    },
    enabled: patientsForHealth.length > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const patientsNeedingAttention = useMemo(() => {
    const list = healthAnalyses.data ?? [];
    return list
      .filter((item) => item.analysis && item.analysis.risk_level !== "normal")
      .sort((a, b) => {
        const order = { critical: 0, warning: 1, watch: 2, normal: 3 };
        return (order[a.analysis!.risk_level] ?? 3) - (order[b.analysis!.risk_level] ?? 3);
      });
  }, [healthAnalyses.data]);

  const activeAnomalyCount = patientsNeedingAttention.filter(
    (p) => p.analysis?.risk_level === "critical" || p.analysis?.risk_level === "warning",
  ).length;

  const avgHealthScore = useMemo(() => {
    const list = (healthAnalyses.data ?? []).filter((item) => item.analysis);
    if (list.length === 0) return null;
    const sum = list.reduce((acc, item) => acc + (item.analysis?.overall_score ?? 0), 0);
    return Math.round(sum / list.length);
  }, [healthAnalyses.data]);

  const hasRecentDeviceSignal = useMemo(() => {
    const fiveMinutesAgo = nowMs - 5 * 60 * 1000;
    return Boolean(
      devices?.some((device) => device.last_seen && new Date(device.last_seen).getTime() > fiveMinutesAgo),
    );
  }, [devices, nowMs]);

  const systemStatus = useMemo(
    () => ({
      api: "healthy" as HealthStatus,
      database: "healthy" as HealthStatus,
      mqtt: (totalFleet > 0 || hasRecentDeviceSignal ? "healthy" : "warning") as HealthStatus,
      automation: "healthy" as HealthStatus,
    }),
    [hasRecentDeviceSignal, totalFleet],
  );

  const coreHealthRows = useMemo(() => {
    const rows = [
      { key: "api", label: "API", status: systemStatus.api, detail: t("admin.system.detailApi") },
      {
        key: "database",
        label: t("admin.system.database"),
        status: systemStatus.database,
        detail: t("admin.system.detailDatabase"),
      },
      {
        key: "mqtt",
        label: t("admin.labelMqttBroker"),
        status: systemStatus.mqtt,
        detail:
          totalFleet > 0
            ? formatTemplate(t("admin.system.detailMqttRegistered"), { count: totalFleet })
            : t("admin.system.detailMqttEmpty"),
      },
      {
        key: "automation",
        label: t("admin.system.automationPipeline"),
        status: systemStatus.automation,
        detail: t("admin.system.detailAutomation"),
      },
    ];
    return [...rows].sort((a, b) => {
      if (a.status === b.status) return 0;
      return a.status === "warning" ? -1 : 1;
    });
  }, [systemStatus, t, totalFleet]);

  const healthyCoreCount = coreHealthRows.filter((row) => row.status === "healthy").length;

  const adminExportRows = useMemo(
    () => [
      ["accounts_total", "people", userStats.total, "active", userStats.active],
      ["patients_total", "people", userStats.byRole.patient, "patient accounts", userStats.byRole.patient],
      ["fleet_total", "devices", totalFleet, "online", totalDevicesOnline],
      ["fleet_offline", "devices", totalFleet, "offline", totalDevicesOffline],
      ["smart_devices", "devices", smartStats.total, "online", smartStats.online],
      ["recent_events", "operations", latestActivity.length, "latest", latestActivity[0]?.event_type ?? "none"],
      ...fleetByType.map((row) => [
        row.hardware,
        "hardware",
        row.total,
        `${row.online} online`,
        `${row.offline} offline`,
      ]),
    ],
    [fleetByType, latestActivity, smartStats.online, smartStats.total, totalDevicesOffline, totalDevicesOnline, totalFleet, userStats.active, userStats.byRole.patient, userStats.total],
  );

  const greetingHour = new Date(nowMs).getHours();
  const adminName = user?.username ?? "Admin";
  const todayDate = new Date(nowMs).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <AppPage
      title={t("admin.system.title")}
      className="animate-fade-in space-y-5 pb-6"
      actions={
        <>
          <CsvExportButton
            label={t("admin.system.export")}
            fileNameBase="wheelsense-admin-overview"
            headers={[
              t("admin.system.csvMetric"),
              t("admin.system.csvArea"),
              t("admin.system.csvTotal"),
              t("admin.system.csvPrimaryState"),
              t("admin.system.csvSecondaryState"),
            ]}
            rows={adminExportRows}
          />
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/alerts">
              <Bell className="h-5 w-5" aria-hidden="true" />
              {t("nav.alerts")}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/settings">
              <Settings className="h-5 w-5" aria-hidden="true" />
              {t("admin.system.settings")}
            </Link>
          </Button>
        </>
      }
    >
      {/* ── Greeting Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {greetingForHour(greetingHour, t)}, {adminName}
        </h1>
        <p className="text-sm text-muted-foreground">
          {criticalAlerts.length > 0
            ? formatTemplate(t("admin.system.priorityCriticalDescription"), { count: criticalAlerts.length })
            : activeAnomalyCount > 0
              ? `${activeAnomalyCount} patients need attention today.`
              : t("admin.system.priorityHealthyDescription")}
          <span className="mx-2 text-border">·</span>
          {todayDate}
        </p>
      </div>

      {/* ── Top Metric Cards ────────────────────────────────────────────── */}
      <section className="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HealthMetricCard
          label="Patients Needing Attention"
          value={patientsNeedingAttention.length}
          icon={HeartPulse}
          status={patientsNeedingAttention.length > 0 ? "warning" : "normal"}
          trend={`${activePatientCount} active patients`}
        />
        <HealthMetricCard
          label="Active Anomalies"
          value={activeAnomalyCount}
          icon={ShieldAlert}
          status={activeAnomalyCount > 0 ? "critical" : "normal"}
          trend={activeAnomalyCount > 0 ? "Requires review" : "All clear"}
        />
        <HealthMetricCard
          label="Avg. Health Score"
          value={avgHealthScore ?? "—"}
          unit={avgHealthScore != null ? "/100" : undefined}
          icon={Activity}
          status={avgHealthScore != null && avgHealthScore < 60 ? "warning" : "normal"}
          trend={avgHealthScore != null ? "Across monitored patients" : "No data yet"}
        />
        <HealthMetricCard
          label="Devices Online"
          value={`${totalDevicesOnline}/${totalFleet}`}
          icon={Tablet}
          status={totalDevicesOffline > 0 ? "warning" : "normal"}
          trend={totalDevicesOffline > 0 ? `${totalDevicesOffline} offline` : "All online"}
        />
      </section>

      {/* ── Needs Attention: Patient Anomalies ──────────────────────────── */}
      {patientsNeedingAttention.length > 0 ? (
        <div className="space-y-3">
          <SectionHeader
            title="Needs Attention"
            subtitle="Patients with active health anomalies ranked by risk"
            icon={ShieldAlert}
            action={
              <Link href="/admin/personnel?tab=patients" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                View all patients <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <div className="grid gap-3 lg:grid-cols-2">
            {patientsNeedingAttention.slice(0, 6).map(({ patient, analysis }) => {
              if (!analysis) return null;
              const tone = riskToneFromLevel(analysis.risk_level);
              const patientPath = `/admin/patients/${patient.id}`;
              return (
                <Link
                  key={patient.id}
                  href={patientPath}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border border-border/60 bg-card p-4 transition-all hover:border-foreground/20 hover:shadow-sm",
                  )}
                >
                  <RiskBadge tone={tone} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground truncate">
                      {patient.first_name} {patient.last_name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground truncate">{analysis.trend_summary}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-lg font-bold tabular-nums text-foreground">{analysis.overall_score}</p>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Risk Score</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        </div>
      ) : healthAnalyses.isLoading ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-muted/40" />
          ))}
        </div>
      ) : null}

      {/* ── Operations + Health Overview ────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        {/* System Health */}
        <div className="rounded-xl border border-border/60 bg-card">
          <div className="border-b border-border/40 px-5 py-4">
            <SectionHeader title={t("admin.system.systemHealth")} icon={CheckCircle2} />
          </div>
          <div className="space-y-1.5 p-5">
            {coreHealthRows.map((row) =>
              row.status === "warning" ? (
                <div key={row.key} className="rounded-lg border border-amber/30 bg-amber-50/50 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{row.label}</span>
                    <RiskBadge tone="warning" size="xs" label={t("admin.system.statusNeedsReview")} />
                  </div>
                  <p className="mt-1 pl-0 text-xs text-muted-foreground">{row.detail}</p>
                </div>
              ) : (
                <div key={row.key} className="flex items-center gap-2 px-3 py-1.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                  <span className="text-sm text-foreground">{row.label}</span>
                </div>
              ),
            )}
            <div className="pt-1">
              <Link
                href="/admin/device-health"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                {t("admin.system.viewAllServices")}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="rounded-xl border border-border/60 bg-card">
          <div className="border-b border-border/40 px-5 py-4">
            <SectionHeader title={t("admin.system.recentActivity")} icon={Activity} />
          </div>
          <div className="space-y-2 p-5">
            {latestActivity.length ? (
              <>
                <div className="divide-y divide-border/60">
                  {latestActivity.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between gap-3 py-1.5">
                      <span className="min-w-0 truncate text-sm text-foreground">
                        {entry.event_type || entry.summary || t("admin.system.noDescription")}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatRelativeTime(entry.occurred_at)}
                      </span>
                    </div>
                  ))}
                </div>
                <Link
                  href="/admin/audit"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                >
                  {t("admin.system.viewAuditLog")}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("admin.system.noRecentActivity")}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Facility + Quick Actions ────────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-2">
        <DashboardMapLauncher
          variant="card"
          href="/admin/facility-management"
          title={t("admin.system.facilityStatus")}
          description={t("admin.system.liveMapDesc")}
          emergencyCount={criticalAlerts.length}
          peopleCount={userStats.active}
          deviceCount={`${totalDevicesOnline}/${totalFleet}`}
        />

        <div className="rounded-xl border border-border/60 bg-card">
          <div className="border-b border-border/40 px-5 py-4">
            <SectionHeader title={t("admin.system.quickActions")} icon={ClipboardList} />
          </div>
          <div className="grid grid-cols-2 gap-2 p-5">
            <Button asChild variant="outline" size="sm" className="justify-start">
              <Link href="/admin/users">
                <Users className="h-4 w-4" aria-hidden="true" />
                {t("admin.system.manageUsers")}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="justify-start">
              <Link href="/admin/facility-management">
                <Building2 className="h-4 w-4" aria-hidden="true" />
                {t("admin.system.addFacility")}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="justify-start">
              <Link href="/admin/devices">
                <Tablet className="h-4 w-4" aria-hidden="true" />
                {t("admin.system.registerDevice")}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="justify-start">
              <Link href="/admin/audit">
                <ClipboardList className="h-4 w-4" aria-hidden="true" />
                {t("admin.system.viewAuditLog")}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </AppPage>
  );
}
