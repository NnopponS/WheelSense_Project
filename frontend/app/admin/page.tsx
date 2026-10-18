"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Bell,
  Building2,
  ClipboardList,
  Settings,
  Tablet,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useFixedNowMs } from "@/hooks/useFixedNowMs";
import { api } from "@/lib/api";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import { isDeviceOnline } from "@/lib/deviceOnline";
import { isSmartDeviceOnline } from "@/lib/smartDeviceOnline";
import { getQueryPollingMs, getQueryStaleTimeMs } from "@/lib/queryEndpointDefaults";
import { withWorkspaceScope } from "@/lib/workspaceQuery";
import { useTranslation } from "@/lib/i18n";
import type { Device, HardwareType, SmartDevice } from "@/lib/types";
import type { ListAlertsResponse, ListDeviceActivityResponse, ListUsersResponse } from "@/lib/api/task-scope-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CsvExportButton } from "@/components/shared/CsvExportButton";
import FloorplanRoleViewer from "@/components/floorplan/FloorplanRoleViewer";
import styles from "./overview-workspace.module.css";
import { DataState } from "@/components/layout/DataState";
import { AppPage } from "@/components/layout/AppPage";
import { PriorityBanner } from "@/components/shared/PriorityBanner";
import { StatusBadge } from "@/components/shared/StatusBadge";


/** Matches `RequireRole` on `GET /api/devices/activity` - avoid polling when the session cannot read fleet activity. */
const ROLES_DEVICE_ACTIVITY_POLL = new Set<string>(["admin", "head_caregiver"]);

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

  const devicesQuery = useQuery({
    queryKey: ["admin", "dashboard", "devices", devicesEndpoint],
    queryFn: () => api.get<Device[]>(devicesEndpoint!),
    enabled: Boolean(devicesEndpoint),
    staleTime: devicesEndpoint ? getQueryStaleTimeMs(devicesEndpoint) : 30_000,
    refetchInterval: devicesEndpoint ? getQueryPollingMs(devicesEndpoint) : false,
  });
  const smartQuery = useQuery({
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

  const activityQuery = useQuery({
    queryKey: ["admin", "dashboard", "device-activity", activityEndpoint],
    queryFn: () => api.get<ListDeviceActivityResponse>(activityEndpoint!),
    enabled: deviceActivityQueryEnabled,
    staleTime: activityEndpoint ? getQueryStaleTimeMs(activityEndpoint) : 30_000,
    refetchInterval: activityEndpoint && deviceActivityQueryEnabled ? getQueryPollingMs(activityEndpoint) : false,
  });
  const usersQuery = useQuery({
    queryKey: ["admin", "dashboard", "users", usersEndpoint],
    queryFn: () => api.get<ListUsersResponse>(usersEndpoint!),
    enabled: Boolean(usersEndpoint),
    staleTime: 30_000,
  });
  const alertsQuery = useQuery({
    queryKey: ["admin", "dashboard", "alerts"],
    queryFn: () => api.listAlerts({ status: "active", limit: 100 }),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  const devices = devicesQuery.data;
  const smartDevices = smartQuery.data;
  const activity = activityQuery.data;
  const users = usersQuery.data;
  const alertsData = alertsQuery.data;

  const fleetByType = useMemo(
    () =>
      HARDWARE_ROWS.map(({ hardware, label }) => {
        const rows = (devices ?? []).filter((device) => device.hardware_type === hardware);
        const online = rows.filter((device) => isDeviceOnline(device.last_seen, Math.max(nowMs, devicesQuery.dataUpdatedAt))).length;
        const missing = rows.filter(device => !device.last_seen || !Number.isFinite(Date.parse(device.last_seen))).length;
        return { hardware, label, total: rows.length, online, missing, stale: rows.length - online - missing };
      }),
    [devices, nowMs, devicesQuery.dataUpdatedAt],
  );

  const smartStats = useMemo(() => {
    const list = smartDevices ?? [];
    const online = list.filter((device) => isSmartDeviceOnline(device)).length;
    return { total: list.length, online, missing: list.length - online, stale: 0 };
  }, [smartDevices]);

  const totalDevicesOnline = fleetByType.reduce((sum, row) => sum + row.online, 0);
  const totalDevicesStale = fleetByType.reduce((sum, row) => sum + row.stale, 0);
  const totalDevicesMissing = fleetByType.reduce((sum, row) => sum + row.missing, 0);
  const totalFleet = fleetByType.reduce((sum, row) => sum + row.total, 0);

  const userStats = useMemo(() => {
    const list = users ?? [];
    const active = list.filter((u) => u.is_active).length;
    const byRole = {
      admin: list.filter((u) => u.role === "admin").length,
      head_caregiver: list.filter((u) => u.role === "head_caregiver").length,
      caregiver: list.filter((u) => u.role === "caregiver").length,
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

  const adminExportRows = useMemo(
    () => [
      ["accounts_total", "people", userStats.total, "active", userStats.active],
      ["patients_total", "people", userStats.byRole.patient, "patient accounts", userStats.byRole.patient],
      ["fleet_total", "devices", totalFleet, "online", totalDevicesOnline],
      ["fleet_stale", "devices", totalFleet, "stale", totalDevicesStale],
      ["fleet_missing", "devices", totalFleet, "missing telemetry", totalDevicesMissing],
      ["smart_devices", "devices", smartStats.total, "online", smartStats.online],
      ["recent_events", "operations", latestActivity.length, "latest", latestActivity[0]?.event_type ?? "none"],
      ...fleetByType.map((row) => [
        row.hardware,
        "hardware",
        row.total,
        `${row.online} online`,
        `${row.stale} stale; ${row.missing} missing`,
      ]),
    ],
    [fleetByType, latestActivity, smartStats.online, smartStats.total, totalDevicesStale, totalDevicesMissing, totalDevicesOnline, totalFleet, userStats.active, userStats.byRole.patient, userStats.total],
  );

  const priorityAlerts = [...alerts].sort((a, b) =>
    Number(b.severity === "critical") - Number(a.severity === "critical") || b.timestamp.localeCompare(a.timestamp),
  ).slice(0, 5);
  const dataUnavailable = devicesQuery.isError || alertsQuery.isError;
  const waiting = devicesQuery.isPending || alertsQuery.isPending;

  return (
    <AppPage
      title={t("redesign.nav.overview")}
      description={t("admin.system.subtitle")}
      className={styles.page}
      actions={
        <>
          <CsvExportButton label={t("admin.system.export")} fileNameBase="wheelsense-admin-overview"
            headers={[t("admin.system.csvMetric"), t("admin.system.csvArea"), t("admin.system.csvTotal"), t("admin.system.csvPrimaryState"), t("admin.system.csvSecondaryState")]}
            rows={adminExportRows} />
          <Button asChild variant="outline"><Link href="/admin/settings"><Settings aria-hidden className="size-4" />{t("nav.settings")}</Link></Button>
        </>
      }
    >
      {dataUnavailable && !criticalAlerts.length ? (
        <DataState kind="error" title={t("redesign.unavailable")} actionLabel={t("redesign.retry")}
          onAction={() => { void devicesQuery.refetch(); void alertsQuery.refetch(); }} />
      ) : waiting && !criticalAlerts.length ? (
        <DataState kind="loading" title={t("common.loading")} />
      ) : (
        <PriorityBanner
          className={styles.priority}
          tone={criticalAlerts.length ? "critical" : totalDevicesStale + totalDevicesMissing ? "warning" : "info"}
          title={criticalAlerts.length
            ? formatTemplate(t("admin.system.priorityCriticalTitle"), { count: criticalAlerts.length })
            : totalDevicesStale + totalDevicesMissing
              ? `${totalDevicesStale} ${t("overview.stale")} · ${totalDevicesMissing} ${t("overview.missing")}`
              : t("redesign.attentionEmpty")}
          description={criticalAlerts.length ? t("admin.system.priorityCriticalDescription") : t("overview.telemetryNote")}
          action={<Button asChild variant={criticalAlerts.length ? "destructive" : "outline"}>
            <Link href={criticalAlerts.length ? "/admin/alerts" : "/admin/devices"}>
              {criticalAlerts.length ? t("nav.alerts") : t("admin.system.reviewIssue")}<ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>}
        />
      )}

      <dl aria-label={t("redesign.snapshot")} className={styles.summary}>
        {([
          [t("admin.system.users"), users && !usersQuery.isError ? userStats.active : "—", "/admin/users"],
          [t("admin.system.fleetOnline"), devices && !devicesQuery.isError ? `${totalDevicesOnline}/${totalFleet}` : "—", "/admin/devices"],
          [t("admin.openAlerts"), alertsData && !alertsQuery.isError ? alerts.length : "—", "/admin/alerts"],
          [t("admin.system.recentEvents"), activity && !activityQuery.isError ? latestActivity.length : "—", "/admin/audit"],
        ] as const).map(([label, value, href]) => <div key={href}><dt>{label}</dt><dd><Link href={href} aria-label={`${label}: ${value}`}>{value}</Link></dd></div>)}
      </dl>

      <div className={styles.primary}>
        <Card className={styles.fleet} role="region" aria-labelledby="fleet-title">
          <CardHeader className={styles.fleetHeader}>
            <CardTitle id="fleet-title">{t("admin.system.fleetOnline")}</CardTitle>
            <p className={styles.fleetUpdated}>{devicesUpdatedLabel(devicesQuery.dataUpdatedAt)}</p>
          </CardHeader>
          <CardContent className={styles.fleetContents} tabIndex={0} aria-label={t("admin.system.fleetOnline")}>
            <ul className={styles.fleetRows}>
              {[
                ...fleetByType.map(row => ({ ...row, available: Boolean(devices) && !devicesQuery.isError, pending: devicesQuery.isPending })),
                { hardware: "smart", label: t("smartDevices.title"), ...smartStats, available: Boolean(smartDevices) && !smartQuery.isError, pending: smartQuery.isPending },
              ].map(row => {
                const state = row.pending ? "pending" : !row.available ? "unavailable" : !row.total ? "empty" : row.online === row.total ? "online" : "partial";
                const status = row.pending ? t("common.loading") : !row.available ? t("redesign.unavailable") : !row.total ? t("patient.health.notConfigured") : t("devices.online");
                const detail = row.hardware === "smart" ? `${row.missing} ${t("overview.unavailableOrDisabled")}` : `${row.stale} ${t("overview.stale")} · ${row.missing} ${t("overview.missing")}`;
                return <li key={row.hardware} className={styles.fleetRow} data-state={state} aria-busy={row.pending}>
                  <Link href={`/admin/devices?tab=${row.hardware === "smart" ? "smart_home" : row.hardware}`} className={styles.fleetCategory}><span className={styles.fleetIndicator} aria-hidden />{row.label}</Link>
                  <span className={styles.fleetBar} aria-hidden><span style={{ width: `${row.available && row.total ? row.online / row.total * 100 : 0}%` }} /></span>
                  <span className={styles.fleetReading}>
                    <span className={styles.fleetCount}>{row.available ? `${row.online} / ${row.total}` : "—"}</span>
                    <span className={styles.fleetStatus}>{status}</span>
                    {row.available && row.total > row.online ? <span className={styles.fleetDetail}>{detail}</span> : null}
                  </span>
                </li>;
              })}
            </ul>
          </CardContent>
          <CardFooter className={styles.fleetFooter}>
            <p className={styles.fleetNote}>{t("redesign.servicesNote")}</p>
            <div className={styles.fleetActions}>
              <Link href="/admin/devices" className={styles.fleetLink}>{t("admin.system.viewAllDevices")}<ArrowRight className="size-4" aria-hidden /></Link>
              <Button asChild variant="ghost" size="icon">
                <Link href="/admin/settings?tab=server" aria-label={t("admin.system.viewAllServices")} title={t("admin.system.viewAllServices")}><Settings aria-hidden /></Link>
              </Button>
            </div>
          </CardFooter>
        </Card>

        <section className={styles.attention}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{t("redesign.attention")}</h2>
            <Link href="/admin/alerts" className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-primary">{t("nav.alerts")}<ArrowRight className="ml-2 size-4" aria-hidden /></Link>
          </div>
          {alertsQuery.isError ? <p role="alert" className="text-sm text-muted-foreground">{t("redesign.unavailable")}</p> : priorityAlerts.length ? (
            <ul className={styles.alertList} tabIndex={0} aria-label={t("redesign.attention")}>
              {priorityAlerts.map(alert => <li key={alert.id}>
                <Link href={`/admin/alerts?alert=${alert.id}`} className="flex min-h-16 items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted">
                  <Bell className={`mt-1 size-4 shrink-0 ${alert.severity === "critical" ? "text-critical" : "text-warning"}`} aria-hidden />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-sm font-semibold">{alert.title || alert.alert_type}</span>
                    <span className="line-clamp-2 text-sm text-muted-foreground">{alert.description}</span>
                    <span className="text-xs text-muted-foreground">{formatRelativeTime(alert.timestamp)}</span>
                  </div>
                  <StatusBadge label={alert.severity} tone={alert.severity === "critical" ? "critical" : alert.severity === "warning" ? "warning" : "info"} />
                </Link>
              </li>)}
            </ul>
          ) : <p className="py-6 text-sm text-muted-foreground">{alertsData ? t("redesign.attentionEmpty") : t("common.loading")}</p>}
        </section>
      </div>

      <div className={styles.secondary}>
        <FloorplanRoleViewer compact overview />
        <div className={styles.operations}>
          <section aria-labelledby="activity-title">
            <div className={styles.sectionHeader}>
              <h2 id="activity-title">{t("admin.system.recentActivity")}</h2>
              <Link href="/admin/audit">{t("admin.system.viewAuditLog")}<ArrowRight aria-hidden className="size-4" /></Link>
            </div>
            {activityQuery.isError ? <p role="status" className="text-sm text-muted-foreground">{t("redesign.unavailable")}</p>
              : activityQuery.isPending ? <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
              : latestActivity.length ? <ul className={styles.activityList} tabIndex={0} aria-label={t("admin.system.recentActivity")}>{latestActivity.map(entry => (
                <li key={entry.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-1">
                    <span className="text-xs font-medium text-muted-foreground">{entry.event_type}</span>
                    <time dateTime={entry.occurred_at} title={formatDateTime(entry.occurred_at)} className="text-xs text-muted-foreground">{formatDateTime(entry.occurred_at)} · {formatRelativeTime(entry.occurred_at)}</time>
                  </div>
                  <p className="mt-1 text-sm">{entry.summary || t("admin.system.noDescription")}</p>
                  {typeof entry.details?.status === "string" ? <StatusBadge tone="neutral" label={entry.details.status} /> : null}
                </li>
              ))}</ul> : <p className="py-2 text-sm text-muted-foreground">{t("admin.system.noRecentActivity")}</p>}
          </section>
          <section aria-labelledby="quick-actions-title">
            <h2 id="quick-actions-title" className="text-base font-semibold">{t("admin.system.quickActions")}</h2>
            <div className={styles.quickActions}>
              {([
                ["/admin/users", Users, t("admin.system.manageUsers")],
                ["/admin/facility-management", Building2, t("admin.system.addFacility")],
                ["/admin/devices", Tablet, t("admin.system.registerDevice")],
                ["/admin/audit", ClipboardList, t("admin.system.viewAuditLog")],
              ] as const).map(([href, Icon, label]) => <Link key={href} href={href}>
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden /><span>{label}</span><ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>)}
            </div>
          </section>
        </div>
      </div>
      <section className={styles.context} aria-label={t("overview.administration")}>
        <div>
          <h2 className="text-base font-semibold">{t("overview.accounts")}</h2>
          {usersQuery.isError || !users ? <p className="text-sm text-muted-foreground">{usersQuery.isError ? t("redesign.unavailable") : t("common.loading")}</p> : <>
            <p className="my-2 text-sm text-muted-foreground">{userStats.total} {t("overview.total")} · {userStats.active} {t("overview.active")} · {userStats.inactive} {t("overview.inactive")}</p>
            <div className={styles.contextLinks}>{Object.entries(userStats.byRole).map(([role, count]) => <Link key={role} href={role === "patient" ? "/admin/patients" : "/admin/users"}>{t(`personnel.role.${role === "head_caregiver" ? "headCaregiver" : role}`)} <strong>{count}</strong></Link>)}</div>
          </>}
        </div>
        <div>
          <h2 className="text-base font-semibold">{t("overview.services")}</h2>
          <p className="my-2 text-xs text-muted-foreground">{t("overview.servicesUnavailable")}</p>
          <div className={styles.contextLinks}>
            <Link href="/admin/settings?tab=server">API · {t("overview.database")} · {t("overview.automation")}</Link>
            <Link href="/admin/device-health">MQTT · {t("overview.deviceHealth")}</Link>
            <Link href="/admin/devices?tab=smart_home">{t("smartDevices.title")}</Link>
          </div>
        </div>
        <nav aria-label={t("overview.administration")} className={styles.contextLinks}>
          <Link href="/admin/tasks">{t("nav.tasks")}</Link>
          <Link href="/admin/support">{t("overview.support")}</Link>
          <Link href="/admin/demo-control">{t("overview.simulator")}</Link>
        </nav>
      </section>
    </AppPage>
  );

  function devicesUpdatedLabel(timestamp: number) {
    return timestamp ? `${t("patient.roomControls.lastUpdated")}: ${formatRelativeTime(new Date(timestamp).toISOString())}` : t("redesign.unavailable");
  }
}
