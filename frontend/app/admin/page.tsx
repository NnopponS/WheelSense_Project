"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight, Bell, ClipboardList, MapPin, MessageSquare, Monitor, Server, Settings, ShieldAlert, Tablet, Users, type LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useFixedNowMs } from "@/hooks/useFixedNowMs";
import { api } from "@/lib/api";
import { isDeviceOnline } from "@/lib/deviceOnline";
import { isSmartDeviceOnline } from "@/lib/smartDeviceOnline";
import { getQueryPollingMs, getQueryStaleTimeMs } from "@/lib/queryEndpointDefaults";
import { withWorkspaceScope } from "@/lib/workspaceQuery";
import { useTranslation } from "@/lib/i18n";
import type { Device, HardwareType, SmartDevice } from "@/lib/types";
import type { ListAlertsResponse, ListDeviceActivityResponse, ListUsersResponse } from "@/lib/api/task-scope-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CsvExportButton } from "@/components/shared/CsvExportButton";
import DashboardMapLauncher from "@/components/dashboard/DashboardMapLauncher";
import { RoleQuickActions } from "@/components/dashboard/RoleQuickActions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type HealthStatus = "healthy" | "warning";

type MenuItem = {
  label: string;
  href: string;
  note: string;
};

type MenuGroup = {
  group: string;
  icon: LucideIcon;
  summary: string;
  items: MenuItem[];
};

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

function healthVariant(status: HealthStatus) {
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
        .slice(0, 6),
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

  const healthRows = useMemo(
    () => [
      {
        label: "API",
        status: systemStatus.api,
        detail: t("admin.system.detailApi"),
        href: "/admin/settings",
      },
      {
        label: t("admin.system.database"),
        status: systemStatus.database,
        detail: t("admin.system.detailDatabase"),
        href: "/admin/audit",
      },
      {
        label: t("admin.labelMqttBroker"),
        status: systemStatus.mqtt,
        detail:
          totalFleet > 0
            ? formatTemplate(t("admin.system.detailMqttRegistered"), { count: totalFleet })
            : t("admin.system.detailMqttEmpty"),
        href: "/admin/device-health",
      },
      {
        label: t("admin.system.automationPipeline"),
        status: systemStatus.automation,
        detail: t("admin.system.detailAutomation"),
        href: "/admin/settings",
      },
      {
        label: t("admin.system.groupDevices"),
        status: (totalDevicesOffline > 0 ? "warning" : "healthy") as HealthStatus,
        detail: formatTemplate(t("admin.system.detailOnline"), { online: totalDevicesOnline, total: totalFleet }),
        href: "/admin/devices",
      },
      {
        label: t("admin.system.smartBridge"),
        status: (smartStats.offline > 0 ? "warning" : "healthy") as HealthStatus,
        detail: formatTemplate(t("admin.system.detailOnline"), { online: smartStats.online, total: smartStats.total }),
        href: "/admin/devices?tab=smart_home",
      },
    ],
    [smartStats.offline, smartStats.online, smartStats.total, systemStatus.api, systemStatus.automation, systemStatus.database, systemStatus.mqtt, t, totalDevicesOffline, totalDevicesOnline, totalFleet],
  );

  const menuGroups = useMemo<MenuGroup[]>(
    () => [
      {
        group: t("admin.system.groupPeople"),
        icon: Users,
        summary: t("admin.system.summaryPeople"),
        items: [
          {
            label: t("admin.system.users"),
            href: "/admin/users",
            note: formatTemplate(t("admin.system.noteActiveAccounts"), {
              active: userStats.active,
              total: userStats.total,
            }),
          },
          {
            label: t("admin.openPatients"),
            href: "/admin/patients",
            note: formatTemplate(t("admin.system.notePatientAccounts"), { count: userStats.byRole.patient }),
          },
        ],
      },
      {
        group: t("admin.system.groupPlaces"),
        icon: Monitor,
        summary: t("admin.system.summaryPlaces"),
        items: [
          {
            label: t("nav.facilities"),
            href: "/admin/facility-management",
            note: t("admin.system.noteFacilities"),
          },
        ],
      },
      {
        group: t("admin.system.groupDevices"),
        icon: Tablet,
        summary: t("admin.system.summaryDevices"),
        items: [
          {
            label: t("admin.system.groupDevices"),
            href: "/admin/devices",
            note: formatTemplate(t("admin.system.detailOnline"), { online: totalDevicesOnline, total: totalFleet }),
          },
          {
            label: t("admin.smartFleet"),
            href: "/admin/devices?tab=smart_home",
            note: formatTemplate(t("admin.system.detailOnline"), { online: smartStats.online, total: smartStats.total }),
          },
          {
            label: t("admin.system.deviceHealth"),
            href: "/admin/device-health",
            note: systemStatus.mqtt === "healthy" ? t("admin.system.noteBrokerHealthy") : t("admin.system.noteBrokerReview"),
          },
        ],
      },
      {
        group: t("admin.system.groupOperations"),
        icon: Activity,
        summary: t("admin.system.summaryOperations"),
        items: [
          {
            label: t("admin.openAlerts"),
            href: "/admin/alerts",
            note: t("admin.system.noteAlerts"),
          },
          {
            label: t("admin.system.audit"),
            href: "/admin/audit",
            note: formatTemplate(t("admin.system.noteRecentEvents"), { count: latestActivity.length }),
          },
          {
            label: t("admin.system.demoControl"),
            href: "/admin/demo-control",
            note: t("admin.system.noteDemo"),
          },
        ],
      },
      {
        group: t("admin.system.groupSystem"),
        icon: Settings,
        summary: t("admin.system.summarySystem"),
        items: [
          {
            label: t("admin.system.settings"),
            href: "/admin/settings",
            note: t("admin.system.noteSettings"),
          },
        ],
      },
    ],
    [
      latestActivity.length,
      smartStats.online,
      smartStats.total,
      systemStatus.mqtt,
      t,
      totalDevicesOnline,
      totalFleet,
      userStats.active,
      userStats.byRole.patient,
      userStats.total,
    ],
  );

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

  const healthyServices = [systemStatus.api, systemStatus.database, systemStatus.mqtt, systemStatus.automation].filter(
    (status) => status === "healthy",
  ).length;
  const mobileCommandActions = useMemo(
    () => [
      {
        label: t("nav.alerts"),
        description: `${criticalAlerts.length}/${alerts.length}`,
        href: "/admin/alerts",
        icon: ShieldAlert,
        tone: criticalAlerts.length > 0 ? ("danger" as const) : ("neutral" as const),
      },
      {
        label: t("nav.tasks"),
        description: t("admin.system.summaryOperations"),
        href: "/admin/tasks",
        icon: ClipboardList,
        tone: "warning" as const,
      },
      {
        label: t("admin.system.devices"),
        description: formatTemplate(t("admin.system.detailOnline"), { online: totalDevicesOnline, total: totalFleet }),
        href: "/admin/devices",
        icon: Tablet,
        tone: totalDevicesOffline > 0 ? ("warning" as const) : ("success" as const),
      },
      {
        label: t("admin.system.users"),
        description: formatTemplate(t("admin.system.noteActiveAccounts"), {
          active: userStats.active,
          total: userStats.total,
        }),
        href: "/admin/users",
        icon: Users,
        tone: "primary" as const,
      },
      {
        label: t("nav.facilities"),
        description: t("admin.system.noteFacilities"),
        href: "/admin/facility-management",
        icon: MapPin,
        tone: "neutral" as const,
      },
      {
        label: t("admin.system.settings"),
        description: t("admin.system.noteSettings"),
        href: "/admin/settings",
        icon: Settings,
        tone: "neutral" as const,
      },
    ],
    [alerts.length, criticalAlerts.length, t, totalDevicesOffline, totalDevicesOnline, totalFleet, userStats.active, userStats.total],
  );

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Server className="h-3.5 w-3.5" />
            {t("admin.system.badge")}
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-foreground md:text-3xl">{t("admin.system.title")}</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {t("admin.system.subtitle")}
            </p>
          </div>
        </div>
        <div className="hidden flex-wrap gap-2 md:flex">
          <CsvExportButton
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
              <Bell className="mr-1.5 h-4 w-4" />
              {t("nav.alerts")}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/tasks">
              <ClipboardList className="mr-1.5 h-4 w-4" />
              {t("nav.tasks")}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/support">
              <MessageSquare className="mr-1.5 h-4 w-4" />
              {t("nav.support")}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/users">
              <Users className="mr-1.5 h-4 w-4" />
              {t("admin.system.users")}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/devices">
              <Tablet className="mr-1.5 h-4 w-4" />
              {t("admin.system.devices")}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/audit">
              <Activity className="mr-1.5 h-4 w-4" />
              {t("admin.system.audit")}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/settings">
              <Settings className="mr-1.5 h-4 w-4" />
              {t("admin.system.settings")}
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 md:hidden">
        <CsvExportButton
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
        <Button asChild size="sm" variant="outline">
          <Link href="/admin/facility-management">
            <MapPin className="h-4 w-4" />
            {t("dashboard.map.fullPage")}
          </Link>
        </Button>
      </div>

      <RoleQuickActions
        title={t("admin.system.mobileActions")}
        actions={mobileCommandActions}
        className="md:hidden"
      />

      <DashboardMapLauncher
        href="/admin/facility-management"
        title={t("admin.system.liveMapTitle")}
        description={t("admin.system.liveMapDesc")}
        primaryLabel={criticalAlerts.length ? t("headNurse.dashboard.openEmergencyMap") : t("dashboard.map.openMap")}
        emergencyCount={criticalAlerts.length}
        peopleCount={userStats.active}
        roomLabel={t("headNurse.dashboard.find")}
        compact
      />

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.95fr]">
        <Card className="border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("admin.system.systemHealth")}</CardTitle>
            <CardDescription>
              {t("admin.system.systemHealthDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="min-h-20 rounded-lg border border-border/70 bg-background/65 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("admin.system.healthyServices")}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{healthyServices}/4</p>
              </div>
              <div className="min-h-20 rounded-lg border border-border/70 bg-background/65 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("admin.system.fleetOnline")}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-600">
                  {totalDevicesOnline}/{totalFleet}
                </p>
              </div>
              <div className="min-h-20 rounded-lg border border-border/70 bg-background/65 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("admin.system.smartBridge")}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {smartStats.online}/{smartStats.total}
                </p>
              </div>
              <div className="min-h-20 rounded-lg border border-border/70 bg-background/65 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("admin.system.recentEvents")}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{latestActivity.length}</p>
              </div>
            </div>

            <div className="grid gap-2 md:hidden">
              {healthRows.map((row) => (
                <Link
                  key={row.label}
                  href={row.href}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2.5 hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{row.label}</p>
                      <Badge variant={healthVariant(row.status)}>{healthLabel(row.status, t)}</Badge>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{row.detail}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.system.service")}</TableHead>
                    <TableHead>{t("admin.system.status")}</TableHead>
                    <TableHead>{t("admin.system.detail")}</TableHead>
                    <TableHead className="text-right">{t("admin.system.open")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {healthRows.map((row) => (
                    <TableRow key={row.label}>
                      <TableCell className="font-medium text-foreground">{row.label}</TableCell>
                      <TableCell>
                        <Badge variant={healthVariant(row.status)}>{healthLabel(row.status, t)}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.detail}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link href={row.href}>
                            {t("admin.system.open")}
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("admin.system.governanceMenuMap")}</CardTitle>
            <CardDescription>
              {t("admin.system.governanceMenuMapDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 md:hidden">
              {menuGroups.map((group) => {
                const Icon = group.icon;
                return (
                  <div key={group.group} className="rounded-lg bg-background/65 px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{group.group}</p>
                        <p className="line-clamp-1 text-xs text-muted-foreground">{group.summary}</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {group.items.map((item) => (
                        <Button key={item.label} asChild size="sm" variant="outline" className="justify-between">
                          <Link href={item.href}>
                            <span className="truncate">{item.label}</span>
                            <ArrowRight className="h-4 w-4 shrink-0" />
                          </Link>
                        </Button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[28%]">{t("admin.system.group")}</TableHead>
                    <TableHead>{t("admin.system.pages")}</TableHead>
                    <TableHead className="w-[30%]">{t("admin.system.summary")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {menuGroups.map((group) => {
                    const Icon = group.icon;

                    return (
                      <TableRow key={group.group}>
                        <TableCell className="align-top">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{group.group}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatTemplate(t("admin.system.destinations"), { count: group.items.length })}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="space-y-2">
                            {group.items.map((item) => (
                              <div key={item.label} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 gap-y-1">
                                <Button asChild size="sm" variant="outline">
                                  <Link href={item.href}>
                                    {item.label}
                                    <ArrowRight className="h-4 w-4" />
                                  </Link>
                                </Button>
                                <span className="text-sm text-muted-foreground">{item.note}</span>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="align-top text-sm text-muted-foreground">{group.summary}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("admin.system.fleetDetail")}</CardTitle>
            <CardDescription>
              {t("admin.system.fleetDetailDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin.system.hardware")}</TableHead>
                  <TableHead>{t("admin.system.csvTotal")}</TableHead>
                  <TableHead>{t("admin.system.online")}</TableHead>
                  <TableHead>{t("admin.system.offline")}</TableHead>
                  <TableHead className="text-right">{t("admin.system.open")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fleetByType.map((row) => (
                  <TableRow key={row.hardware}>
                    <TableCell className="font-medium text-foreground">{row.label}</TableCell>
                    <TableCell>{row.total}</TableCell>
                    <TableCell>
                      <span className="text-emerald-600">{row.online}</span>
                    </TableCell>
                    <TableCell>
                      <span className={row.offline > 0 ? "text-amber-600" : "text-muted-foreground"}>
                        {row.offline}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/admin/devices?tab=${row.hardware}`}>
                          {t("admin.system.open")}
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-medium text-foreground">{t("admin.smartFleet")}</TableCell>
                  <TableCell>{smartStats.total}</TableCell>
                  <TableCell>
                    <span className="text-emerald-600">{smartStats.online}</span>
                  </TableCell>
                  <TableCell>
                    <span className={smartStats.offline > 0 ? "text-amber-600" : "text-muted-foreground"}>
                      {smartStats.offline}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="ghost">
                      <Link href="/admin/devices?tab=smart_home">
                        {t("admin.system.open")}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("admin.system.recentGovernance")}</CardTitle>
            <CardDescription>
              {t("admin.system.recentGovernanceDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {latestActivity.length ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("admin.system.event")}</TableHead>
                      <TableHead>{t("admin.system.summary")}</TableHead>
                      <TableHead>{t("admin.system.time")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {latestActivity.slice(0, 4).map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-medium text-foreground">{entry.event_type}</TableCell>
                        <TableCell className="max-w-[18rem] text-sm text-muted-foreground">
                          {entry.summary || t("admin.system.noDescription")}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(entry.occurred_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex justify-end">
                  <Button asChild size="sm" variant="ghost">
                    <Link href="/admin/audit">
                      {t("admin.system.viewFullAudit")}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-border/70 px-3 py-6 text-center">
                <Activity className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">{t("admin.system.noRecentGovernance")}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
