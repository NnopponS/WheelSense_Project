"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { useFixedNowMs } from "@/hooks/useFixedNowMs";
import { getQueryPollingMs, getQueryStaleTimeMs } from "@/lib/queryEndpointDefaults";
import { useTranslation } from "@/lib/i18n";
import { withWorkspaceScope } from "@/lib/workspaceQuery";
import { isDeviceOnline } from "@/lib/deviceOnline";
import { isSmartDeviceOnline } from "@/lib/smartDeviceOnline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import DashboardFloorplanPanel from "@/components/dashboard/DashboardFloorplanPanel";
import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  Globe,
  HardDrive,
  HelpCircle,
  Monitor,
  Server,
  Settings,
  Tablet,
  Users,
  Wifi,
} from "lucide-react";
import type { Device, HardwareType, SmartDevice } from "@/lib/types";
import type {
  ListDeviceActivityResponse,
  ListUsersResponse,
} from "@/lib/api/task-scope-types";

/** Matches `RequireRole` on `GET /api/devices/activity` — avoid polling when the session cannot read fleet activity. */
const ROLES_DEVICE_ACTIVITY_POLL = new Set<string>(["admin", "head_nurse", "supervisor"]);

const HARDWARE_ROWS: Array<{ hardware: HardwareType; labelKey: "devicesDetail.tabWheelchair" | "devicesDetail.tabNode" | "devicesDetail.tabPolar" | "devicesDetail.tabMobile" }> = [
  { hardware: "wheelchair", labelKey: "devicesDetail.tabWheelchair" },
  { hardware: "node", labelKey: "devicesDetail.tabNode" },
  { hardware: "polar_sense", labelKey: "devicesDetail.tabPolar" },
  { hardware: "mobile_phone", labelKey: "devicesDetail.tabMobile" },
];

export default function AdminDashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const nowMs = useFixedNowMs();

  // Data queries - Admin focuses on system/device health, not clinical data
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

  // Fleet health calculations
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

  const totalDevicesOnline = fleetByType.reduce((sum, row) => sum + row.online, 0);
  const totalDevicesOffline = fleetByType.reduce((sum, row) => sum + row.offline, 0);
  const totalFleet = totalDevicesOnline + totalDevicesOffline;

  // User/account stats
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

  // Recent activity
  const latestActivity = useMemo(
    () =>
      [...(activity ?? [])]
        .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))
        .slice(0, 6),
    [activity],
  );

  // System status indicators based on real device activity
  const systemStatus = useMemo(() => {
    // MQTT is healthy if we have registered devices (system is operational)
    // Devices reporting via MQTT means the broker is accepting connections
    const hasDeviceFleet = totalFleet > 0;

    // Check if any device has been seen recently (within 5 minutes)
    const fiveMinutesAgo = nowMs - 5 * 60 * 1000;
    const hasRecentActivity = devices?.some((d) => {
      if (!d.last_seen) return false;
      return new Date(d.last_seen).getTime() > fiveMinutesAgo;
    });

    // MQTT status: healthy if we have devices or recent activity
    const mqttStatus = hasDeviceFleet || hasRecentActivity ? "healthy" : "warning";

    return {
      api: { status: "healthy", label: "API" },
      database: { status: "healthy", label: "Database" },
      mqtt: { status: mqttStatus, label: "MQTT" },
      ml: { status: "healthy", label: "ML Pipeline" },
    };
  }, [totalFleet, devices, nowMs]);

  const getActivityIcon = (eventType: string) => {
    if (eventType.includes("registry_created")) return HardDrive;
    if (eventType.includes("registry_updated")) return Settings;
    if (eventType.includes("smart")) return Wifi;
    if (eventType.includes("paired")) return CheckCircle2;
    return Activity;
  };

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Server className="h-3.5 w-3.5" />
            {t("admin.dashboardBadge")}
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
              {t("admin.dashboardTitle")}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {t("admin.opsOverviewSubtitle")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/monitoring">{t("admin.openLiveMap")}</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/devices">{t("admin.openDevices")}</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/settings">{t("admin.openSettings")}</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/admin/device-health">
              <Monitor className="mr-1.5 h-4 w-4" />
              {t("admin.navDeviceHealth")}
            </Link>
          </Button>
        </div>
      </div>

      <section className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-foreground">{t("admin.monitoringTitle")}</h3>
          <p className="text-sm text-muted-foreground">{t("admin.monitoringSubtitle")}</p>
        </div>
        <DashboardFloorplanPanel className="min-w-0" />
      </section>

      {/* System Status Grid — grouped chrome for at-a-glance ops (iter-6 admin precision) */}
      <section className="grid gap-3 rounded-xl border border-border/60 bg-muted/10 p-3 sm:p-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm uppercase tracking-wide text-muted-foreground">
                  {t("admin.labelApiStatus")}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {systemStatus.api.status === "healthy" ? t("devices.online") : t("admin.statusDegraded")}
                </p>
                <p className="mt-1 text-xs text-emerald-600">{t("admin.statusOperational")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/12 text-sky-600">
                <Globe className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm uppercase tracking-wide text-muted-foreground">
                  {t("admin.labelMqttBroker")}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {systemStatus.mqtt.status === "healthy" ? t("admin.connected") : t("admin.statusWarning")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {totalDevicesOnline} {t("admin.devicesActiveSuffix")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/12 text-violet-600">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm uppercase tracking-wide text-muted-foreground">
                  {t("admin.labelMlPipeline")}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {systemStatus.ml.status === "healthy" ? t("common.active") : t("admin.mlPaused")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t("admin.mlStackHint")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/12 text-amber-600">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm uppercase tracking-wide text-muted-foreground">
                  {t("admin.labelActiveUsers")}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {userStats.active}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("admin.ofTotalAccountsPrefix")} {userStats.total} {t("admin.totalAccountsSuffix")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Fleet Health & Support Grid */}
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        {/* Device Fleet Overview */}
        <Card className="border-border/70">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">{t("admin.fleetHealth")}</CardTitle>
              <CardDescription>{t("admin.fleetByHardwareDesc")}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={totalDevicesOffline > 0 ? "warning" : "success"}>
                {totalDevicesOnline}/{totalFleet} {t("admin.onlineCountBadge")}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Fleet Summary */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border/70 px-3 py-3">
                <p className="text-sm uppercase tracking-wide text-muted-foreground">{t("devices.online")}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-600">
                  {totalDevicesOnline}
                </p>
              </div>
              <div className="rounded-xl border border-border/70 px-3 py-3">
                <p className="text-sm uppercase tracking-wide text-muted-foreground">{t("devices.offline")}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-red-600">
                  {totalDevicesOffline}
                </p>
              </div>
              <div className="rounded-xl border border-border/70 px-3 py-3">
                <p className="text-sm uppercase tracking-wide text-muted-foreground">
                  {t("admin.labelSmartDevicesFleet")}
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                  {smartStats.online}/{smartStats.total}
                </p>
              </div>
            </div>

            {/* Device Type Breakdown */}
            <div className="space-y-2">
              {fleetByType.map((row) => (
                <Link
                  key={row.hardware}
                  href={`/admin/devices?tab=${row.hardware}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-3 hover:bg-muted/40"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                      <Tablet className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{t(row.labelKey)}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.online} {t("devices.online")} / {row.offline} {t("devices.offline")}
                      </p>
                    </div>
                  </div>
                  <Badge variant={row.offline > 0 ? "warning" : "success"}>{row.total}</Badge>
                </Link>
              ))}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                    <Wifi className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{t("devicesDetail.tabSmartDevice")}</p>
                    <p className="text-xs text-muted-foreground">
                      {smartStats.online} {t("devices.online")} / {smartStats.offline}{" "}
                      {t("devices.offline")}
                    </p>
                  </div>
                </div>
                <Badge variant={smartStats.offline > 0 ? "warning" : "success"}>
                  {smartStats.total}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Support Tickets & Quick Actions */}
        <div className="space-y-4">
          <Card className="border-border/70">
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
              <div>
                <CardTitle className="text-base">{t("admin.supportChannelTitle")}</CardTitle>
                <CardDescription>{t("admin.supportChannelDesc")}</CardDescription>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href="/admin/support">
                  <HelpCircle className="mr-1.5 h-4 w-4" />
                  {t("dash.viewAll")}
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center">
                <HelpCircle className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">{t("admin.noSupportTickets")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("admin.supportTicketsPlaceholderHint")}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card className="border-border/70">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("admin.userDistributionTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border/70 px-3 py-2">
                  <p className="text-xs text-muted-foreground">{t("shell.roleAdmin")}</p>
                  <p className="text-lg font-semibold">{userStats.byRole.admin}</p>
                </div>
                <div className="rounded-lg border border-border/70 px-3 py-2">
                  <p className="text-xs text-muted-foreground">{t("shell.roleHeadNurse")}</p>
                  <p className="text-lg font-semibold">{userStats.byRole.head_nurse}</p>
                </div>
                <div className="rounded-lg border border-border/70 px-3 py-2">
                  <p className="text-xs text-muted-foreground">{t("shell.roleSupervisor")}</p>
                  <p className="text-lg font-semibold">{userStats.byRole.supervisor}</p>
                </div>
                <div className="rounded-lg border border-border/70 px-3 py-2">
                  <p className="text-xs text-muted-foreground">{t("shell.roleObserver")}</p>
                  <p className="text-lg font-semibold">{userStats.byRole.observer}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Activity Feed */}
      <Card className="border-border/70">
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
          <div>
            <CardTitle className="text-base">{t("admin.activityFeed")}</CardTitle>
            <CardDescription>{t("admin.activityFeedCardDesc")}</CardDescription>
          </div>
          <Button asChild size="sm" variant="ghost">
            <Link href="/admin/audit">
              {t("nav.auditLog")}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {latestActivity.length ? (
            latestActivity.map((entry) => {
              const Icon = getActivityIcon(entry.event_type);
              return (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 rounded-xl border border-border/70 px-3 py-3"
                >
                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{entry.event_type}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {entry.summary || t("admin.noDescription")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(entry.occurred_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-xl border border-dashed border-border/70 px-3 py-6 text-center">
              <Activity className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">{t("admin.noActivity")}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
