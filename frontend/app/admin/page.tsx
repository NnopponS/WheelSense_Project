"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  Building2,
  CheckCircle2,
  ClipboardList,
  Settings,
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
import type { ListAlertsResponse, ListDeviceActivityResponse, ListUsersResponse } from "@/lib/api/task-scope-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CsvExportButton } from "@/components/shared/CsvExportButton";
import DashboardMapLauncher from "@/components/dashboard/DashboardMapLauncher";
import { AppPage } from "@/components/layout/AppPage";
import { MetricCard } from "@/components/shared/MetricCard";
import { PriorityBanner } from "@/components/shared/PriorityBanner";
import { StatusBadge, type StatusTone } from "@/components/shared/StatusBadge";

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

function healthTone(status: HealthStatus): StatusTone {
  return status === "healthy" ? "success" : "warning";
}

function healthLabel(status: HealthStatus, t: (key: string) => string) {
  return status === "healthy" ? t("admin.system.statusHealthy") : t("admin.system.statusNeedsReview");
}

function formatTemplate(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (output, [key, value]) => output.replaceAll(`{${key}}`, String(value)),
    template,
  );
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

  return (
    <AppPage
      eyebrow={t("admin.system.badge")}
      title={t("admin.system.title")}
      description={t("admin.system.subtitle")}
      className="animate-fade-in space-y-4 pb-6"
      priority={
        <PriorityBanner
          tone={criticalAlerts.length > 0 ? "critical" : totalDevicesOffline > 0 ? "warning" : "success"}
          title={
            criticalAlerts.length > 0
              ? formatTemplate(t("admin.system.priorityCriticalTitle"), { count: criticalAlerts.length })
              : totalDevicesOffline > 0
                ? formatTemplate(t("admin.system.priorityOfflineTitle"), { count: totalDevicesOffline })
                : t("admin.system.priorityHealthyTitle")
          }
          description={
            criticalAlerts.length > 0
              ? t("admin.system.priorityCriticalDescription")
              : totalDevicesOffline > 0
                ? t("admin.system.priorityOfflineDescription")
                : t("admin.system.priorityHealthyDescription")
          }
          action={
            <Button asChild variant={criticalAlerts.length > 0 ? "destructive" : "outline"}>
              <Link href={criticalAlerts.length > 0 ? "/admin/alerts" : "/admin/devices"}>
                {criticalAlerts.length > 0 ? t("nav.alerts") : t("admin.system.reviewIssue")}
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Link>
            </Button>
          }
        />
      }
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
      <section className="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          compact
          label={t("admin.system.users")}
          value={userStats.active}
          description={t("admin.system.activeAccount")}
          icon={Users}
          href="/admin/users"
        />
        <MetricCard
          compact
          label={t("admin.system.fleetOnline")}
          value={`${totalDevicesOnline}/${totalFleet}`}
          description={t("admin.system.onlineLower")}
          icon={Tablet}
          href="/admin/devices"
          status={totalDevicesOffline > 0 ? { label: t("admin.system.statusNeedsReview"), tone: "warning" } : undefined}
        />
        <MetricCard
          compact
          label={t("admin.openAlerts")}
          value={criticalAlerts.length}
          description={t("admin.system.activeLower")}
          icon={Bell}
          href="/admin/alerts"
          status={criticalAlerts.length > 0 ? { label: t("admin.system.statusNeedsReview"), tone: "critical" } : undefined}
        />
        <MetricCard
          compact
          label={t("admin.system.recentEvents")}
          value={latestActivity.length}
          description={t("admin.system.todayLower")}
          icon={Activity}
          href="/admin/audit"
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card className="border-border/70">
          <CardHeader className="flex-row items-baseline justify-between gap-2 pb-2 space-y-0">
            <CardTitle className="text-base">{t("admin.system.systemHealth")}</CardTitle>
            <span className="text-sm text-muted-foreground">
              {formatTemplate(t("admin.system.coreServicesHealthy"), { healthy: healthyCoreCount, total: coreHealthRows.length })}
            </span>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {coreHealthRows.map((row) =>
              row.status === "warning" ? (
                <div key={row.key} className="rounded-lg border border-warning/30 bg-warning-bg/50 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                      <span className="truncate text-sm font-medium text-foreground">{row.label}</span>
                    </div>
                    <StatusBadge label={healthLabel(row.status, t)} tone={healthTone(row.status)} />
                  </div>
                  <p className="mt-1 pl-6 text-xs text-muted-foreground">{row.detail}</p>
                </div>
              ) : (
                <div key={row.key} className="flex items-center gap-2 px-3 py-1.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
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
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("admin.system.recentActivity")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
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
          </CardContent>
        </Card>
      </div>

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

        <Card className="border-border/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("admin.system.quickActions")}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
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
          </CardContent>
        </Card>
      </div>
    </AppPage>
  );
}
