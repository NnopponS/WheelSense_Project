"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { endOfDay, format, isSameDay, startOfDay } from "date-fns";
import {
  Accessibility, Activity, ArrowRight, ArrowUpRight, ChevronDown, Download, Ellipsis, HeartPulse, Info, Move3d, Plug2, Server, ShieldAlert, Smartphone, Sparkles, TriangleAlert, Wifi,
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
import type { Device, HardwareType, Room, SmartDevice } from "@/lib/types";
import type { CareScheduleOut, ListAlertsResponse, ListDeviceActivityResponse, ListUsersResponse } from "@/lib/api/task-scope-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { buildCsvFromRows, downloadCsvFile } from "@/lib/csv";
import { StatusSegments } from "@/components/dashboard/StatusSegments";
import { sortOverviewAlerts } from "@/lib/overviewStatus";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import FloorplanRoleViewer from "@/components/floorplan/FloorplanRoleViewer";
import { BeltPresenceCard } from "@/components/overview/BeltPresenceCard";
import { schedulesToCalendarEvents } from "@/components/calendar/scheduleEventMapper";
import styles from "./overview-workspace.module.css";
import { DataState } from "@/components/layout/DataState";
import { AppPage } from "@/components/layout/AppPage";
import { StatusBadge } from "@/components/shared/StatusBadge";


/** Matches `RequireRole` on `GET /api/devices/activity` - avoid polling when the session cannot read fleet activity. */
const ROLES_DEVICE_ACTIVITY_POLL = new Set<string>(["admin", "head_caregiver"]);
type HealthServiceKey = "api" | "database" | "mqtt" | "automation";
type PlatformHealth = {
  status?: string;
  model_ready?: boolean;
  services?: Partial<Record<HealthServiceKey, "online" | "offline">>;
};

const HARDWARE_ROWS: Array<{
  /** `companion_m5` registry rows are the same physical belt M5 — counted under `belt`. */
  hardware: HardwareType;
  label: string;
}> = [
  { hardware: "wheelchair", label: "Wheelchairs" },
  { hardware: "node", label: "Nodes" },
  { hardware: "polar_sense", label: "Polar Sense" },
  { hardware: "mobile_phone", label: "Mobile phones" },
  { hardware: "belt", label: "Fall belts" },
];

/** Robert Chen — resident whose daily routine is spotlighted on the overview. */
const DAILY_PLAN_PATIENT_ID = 2;
const DAILY_PLAN_PATIENT_NAME = "Robert Chen";
/** AI quick-action prompts stay English-only — the assistant is English-tuned. */
const DAILY_PLAN_AI_PROMPTS = {
  summarizeDay:
    "Summarize everywhere Robert Chen went today and flag anything unusual in his routine.",
  planHealthCheck:
    "Create a care schedule for a health check for Robert Chen tomorrow morning.",
} as const;

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
    staleTime: 2_000,
    refetchInterval: 3_000,
  });

  const timelineQuery = useQuery({
    queryKey: ["admin", "dashboard", "timeline", user?.workspace_id],
    queryFn: () => api.listTimelineEvents({ limit: 15 }),
    enabled: Boolean(user?.role) && user?.role !== "patient",
    staleTime: 4_000,
    refetchInterval: 5_000,
  });

  const healthQuery = useQuery({
    queryKey: ["platform", "health"],
    queryFn: () => api.get<PlatformHealth>("/health"),
    enabled: Boolean(user), staleTime: 15_000, refetchInterval: 30_000, retry: false,
  });

  const dailyPlanSchedulesQuery = useQuery({
    queryKey: ["admin", "overview", "daily-plan", "schedules", DAILY_PLAN_PATIENT_ID],
    queryFn: () => api.listWorkflowSchedules({ patient_id: DAILY_PLAN_PATIENT_ID, limit: 100 }),
    staleTime: 60_000,
  });
  const dailyPlanRoomsQuery = useQuery({
    queryKey: ["admin", "overview", "daily-plan", "rooms"],
    queryFn: () => api.listRooms(),
    enabled: (dailyPlanSchedulesQuery.data ?? []).some((schedule) => schedule.room_id != null),
    staleTime: 60_000,
  });
  const devices = devicesQuery.data;
  const smartDevices = smartQuery.data;
  const activity = activityQuery.data;
  const users = usersQuery.data;
  const alertsData = alertsQuery.data;

  const fleetByType = useMemo(
    () =>
      HARDWARE_ROWS.map(({ hardware, label }) => {
        const rows = (devices ?? []).filter((device) =>
          hardware === "belt"
            ? device.hardware_type === "belt" || device.hardware_type === "companion_m5"
            : device.hardware_type === hardware);
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

  const latestActivity = useMemo(() => {
    const items: Array<{
      id: string;
      event_type: string;
      summary: string;
      occurred_at: string;
      severity: string | null;
      status: string | null;
    }> = [
      ...(activity ?? []).map((entry) => ({
        id: `device-${entry.id}`,
        event_type: entry.event_type,
        summary: entry.summary ?? "",
        occurred_at: entry.occurred_at ?? "",
        severity: null,
        status: typeof entry.details?.status === "string" ? entry.details.status : null,
      })),
      ...(alertsData ?? []).map((alert) => ({
        id: `alert-${alert.id}`,
        event_type: alert.alert_type,
        summary: alert.description || alert.title || "",
        occurred_at: alert.timestamp ?? "",
        severity: alert.severity ?? null,
        status: alert.status ?? null,
      })),
      ...(timelineQuery.data ?? []).map((event) => ({
        id: `timeline-${event.id}`,
        event_type: event.event_type,
        summary: event.description || event.room_name || "",
        occurred_at: event.timestamp ?? "",
        severity: null,
        status: null,
      })),
    ];
    items.sort((left, right) => (right.occurred_at || "").localeCompare(left.occurred_at || ""));
    return items.slice(0, 8);
  }, [activity, alertsData, timelineQuery.data]);
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

  const priorityAlerts = sortOverviewAlerts(alerts);
  const warningCount = alerts.filter(alert => alert.severity === "warning").length;
  const otherCount = alerts.length - criticalAlerts.length - warningCount;

  const dailyPlanSchedules = useMemo(
    () => (dailyPlanSchedulesQuery.data ?? []) as CareScheduleOut[],
    [dailyPlanSchedulesQuery.data],
  );
  const dailyPlanEvents = useMemo(() => {
    if (!dailyPlanSchedules.length) return [];
    const now = new Date(nowMs);
    const patientNameById = new Map<number, string>([
      [DAILY_PLAN_PATIENT_ID, DAILY_PLAN_PATIENT_NAME],
    ]);
    const todayRange = { start: startOfDay(now), end: endOfDay(now) };
    return schedulesToCalendarEvents(dailyPlanSchedules, patientNameById, todayRange)
      .filter((event) => isSameDay(event.startTime, now))
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }, [dailyPlanSchedules, nowMs]);
  const dailyPlanRoomByScheduleId = useMemo(() => {
    const rooms = (dailyPlanRoomsQuery.data ?? []) as Room[];
    const nameByRoomId = new Map<number, string>();
    for (const room of rooms) nameByRoomId.set(room.id, room.name);
    const map = new Map<number, string>();
    for (const schedule of dailyPlanSchedules) {
      if (schedule.room_id == null) continue;
      const name = nameByRoomId.get(schedule.room_id);
      if (name) map.set(schedule.id, name);
    }
    return map;
  }, [dailyPlanSchedules, dailyPlanRoomsQuery.data]);
  const openDailyPlanAi = (prompt: string) =>
    window.dispatchEvent(new CustomEvent("wheelsense:open-ai", { detail: { prompt } }));
  const apiReported = !healthQuery.isError && typeof healthQuery.data?.status === "string";
  const fleetLabel = `${totalDevicesOnline} ${t("devices.online")} · ${totalDevicesStale} ${t("overview.stale")} · ${totalDevicesMissing} ${t("overview.missing")}`;
  const exportOverview = () => downloadCsvFile(buildCsvFromRows(
    [t("admin.system.csvMetric"), t("admin.system.csvArea"), t("admin.system.csvTotal"), t("admin.system.csvPrimaryState"), t("admin.system.csvSecondaryState")],
    adminExportRows,
  ), `wheelsense-admin-overview-${new Date().toISOString().slice(0,10)}.csv`);
  const alertContext = (alert: ListAlertsResponse[number]) => {
    const evidence = [alert.data?.patient_name, alert.data?.resident_name, alert.data?.room_name].filter((value):value is string => typeof value === "string" && value.trim().length>0);
    if (!evidence.length && alert.patient_id != null) evidence.push(`${t("personnel.role.patient")} #${alert.patient_id}`);
    if (!evidence.length && alert.data?.room_id != null) evidence.push(`${t("overview.visual.room")} #${String(alert.data.room_id)}`);
    if (alert.device_id) evidence.push(devices?.find(device=>device.device_id===alert.device_id)?.display_name || alert.device_id);
    return [...new Set(evidence)].join(" · ");
  };
  const dataUnavailable = devicesQuery.isError || alertsQuery.isError;
  const waiting = devicesQuery.isPending || alertsQuery.isPending;

  return (
    <AppPage title={t("overview.visual.title")} className={styles.page}
      description={user?.workspace_id ? `${t("overview.visual.workspace")} ${user.workspace_id}` : undefined}
      actions={<>
        <Button asChild variant="outline"><Link href="/admin/alerts" aria-label={t("nav.alerts")}><Bell aria-hidden className="size-4"/><span className="hidden sm:inline">{t("nav.alerts")}</span></Link></Button>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label={t("overview.visual.more")} title={t("overview.visual.more")}><Ellipsis/></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuGroup>
            <DropdownMenuItem onSelect={exportOverview}><Download/>{t("admin.system.export")}</DropdownMenuItem>
            <DropdownMenuItem asChild><Link href="/admin/settings"><Settings/>{t("nav.settings")}</Link></DropdownMenuItem>
          </DropdownMenuGroup></DropdownMenuContent>
        </DropdownMenu>
      </>}>
      {dataUnavailable ? <DataState kind="error" title={t("redesign.unavailable")} actionLabel={t("redesign.retry")} onAction={()=>{void devicesQuery.refetch();void alertsQuery.refetch()}}/> : null}
      <section className={styles.priority} data-tone={criticalAlerts.length ? "critical" : totalDevicesStale+totalDevicesMissing ? "warning" : "neutral"} role={criticalAlerts.length ? "alert" : "status"}>
        {criticalAlerts.length ? <ShieldAlert aria-hidden/> : <Activity aria-hidden/>}
        <strong>{criticalAlerts.length ? `${formatTemplate(t(criticalAlerts.length===1 ? "overview.visual.criticalOne" : "overview.visual.critical"),{count:criticalAlerts.length})}${alertsQuery.isError ? ` · ${t("overview.visual.lastKnown")}` : ""}` : alertsQuery.isError ? t("redesign.unavailable") : waiting ? t("common.loading") : totalDevicesStale+totalDevicesMissing ? `${totalDevicesStale} ${t("overview.stale")} · ${totalDevicesMissing} ${t("overview.missing")}` : t("redesign.attentionEmpty")}</strong>
        <Link href={criticalAlerts.length ? "/admin/alerts" : "/admin/devices"}>{t("overview.visual.review")}<ArrowRight aria-hidden className="size-4"/></Link>
      </section>

      <section className={styles.summary} aria-label={t("redesign.snapshot")}>
        <Card><CardContent className={styles.metric}><Users aria-hidden/><div><dl><dt>{t("admin.system.users")}</dt><dd><Link href="/admin/users">{users && !usersQuery.isError ? userStats.active : "—"}</Link></dd></dl><small>{t("admin.system.activeAccount")}</small></div></CardContent></Card>
        <Card><CardContent className={styles.metric}><Tablet aria-hidden/><div><dl><dt>{t("admin.system.fleetOnline")}</dt><dd><Link href="/admin/devices">{devices && !devicesQuery.isError ? `${totalDevicesOnline}/${totalFleet}` : "—"}</Link></dd></dl><StatusSegments total={devicesQuery.isError ? 0 : totalFleet} label={devicesQuery.isError ? t("redesign.unavailable") : fleetLabel} segments={[{value:totalDevicesOnline,tone:"success"},{value:totalDevicesStale,tone:"warning"},{value:totalDevicesMissing,tone:"muted"}]}/></div></CardContent></Card>
        <Card><CardContent className={styles.metric}><Bell aria-hidden/><div><dl><dt>{t("admin.openAlerts")}</dt><dd><Link href="/admin/alerts">{alertsData && !alertsQuery.isError ? alerts.length : "—"}</Link></dd></dl><small className={styles.severityCounts}>{alertsQuery.isError || !alertsData ? <span>{t(alertsQuery.isError ? "overview.visual.lastKnown" : "common.loading")}</span> : <><span>{criticalAlerts.length} {t("overview.visual.criticalShort")}</span><span>{warningCount} {t("overview.visual.warningShort")}</span>{otherCount>0 ? <span>{otherCount} {t("overview.visual.other")}</span> : null}</>}</small></div></CardContent></Card>
        <Card><CardContent className={styles.metric}><Server aria-hidden/><div><dl><dt>{t("overview.visual.platform")}</dt><dd><Link href="/admin/device-health">{healthQuery.isPending ? "—" : `${Number(apiReported)}/4`}</Link></dd></dl><small>{t("overview.visual.reporting")}</small></div></CardContent></Card>
      </section>

      <div className={styles.primary}>
        <FloorplanRoleViewer compact overview overviewAlerts={!alertsQuery.isError ? alertsData : undefined}/>
        <section className={styles.attention} aria-labelledby="attention-title">
          <div className={styles.sectionHeader}><h2 id="attention-title">{t("redesign.attention")}</h2><Link href="/admin/alerts">{t("overview.visual.allAlerts")}<ArrowRight aria-hidden className="size-4"/></Link></div>
          {!alertsQuery.isError && alertsData ? <StatusSegments total={alerts.length} label={`${criticalAlerts.length} ${t("overview.visual.criticalShort")} · ${warningCount} ${t("overview.visual.warningShort")} · ${otherCount} ${t("overview.visual.other")}`} segments={[{value:criticalAlerts.length,tone:"critical"},{value:warningCount,tone:"warning"},{value:otherCount,tone:"info"}]}/> : null}
          {alertsQuery.isError ? <p role="status" className="text-sm text-muted-foreground">{t("redesign.unavailable")} · {t("overview.visual.lastKnown")}</p> : null}
          {priorityAlerts.length ? <ul className={styles.alertList} tabIndex={0} aria-label={t("redesign.attention")}>
            {priorityAlerts.slice(0,5).map(alert=>{
              const Icon=alert.severity==="critical" ? ShieldAlert : alert.severity==="warning" ? TriangleAlert : Info;
              return <li key={alert.id} className={styles.alertRow} data-severity={alert.severity}>
                <Icon aria-hidden className="size-4 shrink-0"/>
                <details><summary><span className={styles.alertText}><strong title={alert.title||alert.alert_type}>{alert.title||alert.alert_type}</strong>{alertContext(alert) ? <span>{alertContext(alert)}</span> : null}<span className={styles.alertMeta}><b>{alert.severity}</b><time dateTime={alert.timestamp} title={formatDateTime(alert.timestamp)}>{formatRelativeTime(alert.timestamp)}</time></span></span><ChevronDown aria-hidden className="size-3 shrink-0"/></summary>
                  <div className={styles.evidence}><p>{alert.description||t("admin.system.noDescription")}</p><span>{t("overview.visual.status")}: {alert.status}</span><time dateTime={alert.timestamp}>{formatDateTime(alert.timestamp)}</time></div>
                </details>
                <Link href={`/admin/alerts?alert=${alert.id}`} aria-label={`${t("overview.visual.review")}: ${alert.title||alert.alert_type}`} title={t("overview.visual.review")}><ArrowUpRight aria-hidden className="size-4"/></Link>
              </li>;
            })}
          </ul> : <p className={styles.empty}>{alertsQuery.isError ? t("redesign.unavailable") : alertsData ? t("redesign.attentionEmpty") : t("common.loading")}</p>}
          {priorityAlerts.length > 5 ? <p className={styles.hint}><Link href="/admin/alerts">+{priorityAlerts.length - 5} {t("overview.visual.allAlerts")}</Link></p> : null}
          <p className={styles.hint}>{t("overview.visual.alertHint")}</p>
          <BeltPresenceCard devices={devices} />
        </section>
      </div>

      {dailyPlanEvents.length ? (
        <section className={styles.dailyPlan} aria-labelledby="daily-plan-title">
          <div className={styles.dailyPlanHeader}>
            <h2 id="daily-plan-title">{t("overview.dailyPlan.title")}</h2>
            <div className={styles.dailyPlanActions}>
              <button type="button" onClick={() => openDailyPlanAi(DAILY_PLAN_AI_PROMPTS.summarizeDay)}>
                <Sparkles aria-hidden className="size-3" />{t("overview.dailyPlan.summarizeDay")}
              </button>
              <button type="button" onClick={() => openDailyPlanAi(DAILY_PLAN_AI_PROMPTS.planHealthCheck)}>
                <Sparkles aria-hidden className="size-3" />{t("overview.dailyPlan.planHealthCheck")}
              </button>
            </div>
          </div>
          <ol className={styles.dailyPlanStrip}>
            {dailyPlanEvents.map((event) => {
              const state = event.endTime.getTime() <= nowMs ? "done" : event.startTime.getTime() <= nowMs ? "now" : "upcoming";
              const roomName = dailyPlanRoomByScheduleId.get(event.sourceScheduleId ?? event.id);
              return (
                <li key={event.instanceKey ?? event.id} className={styles.dailyPlanEvent} data-state={state}>
                  <time dateTime={event.startTime.toISOString()}>{format(event.startTime, "HH:mm")}</time>
                  <span className={styles.dailyPlanMeta}>
                    <strong>{event.title}</strong>
                    {roomName ? <small>{roomName}</small> : null}
                  </span>
                  {state === "now"
                    ? <span className={styles.dailyPlanNowBadge}>{t("overview.dailyPlan.now")}</span>
                    : <span className="sr-only">{t(state === "done" ? "overview.dailyPlan.done" : "overview.dailyPlan.upcoming")}</span>}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      <div className={styles.secondary}>
        <Card className={styles.fleet} role="region" aria-labelledby="fleet-title">
          <CardHeader className={styles.fleetHeader}><CardTitle id="fleet-title">{t("admin.system.fleetOnline")}</CardTitle><p className={styles.fleetUpdated}>{devicesUpdatedLabel(devicesQuery.dataUpdatedAt)}</p></CardHeader>
          <CardContent className={styles.fleetContents}><ul className={styles.fleetGrid}>
            {[
              ...fleetByType.map(row=>({...row,label:t(`overview.visual.hardware.${row.hardware}`),available:Boolean(devices)&&!devicesQuery.isError,pending:devicesQuery.isPending})),
              {hardware:"smart",label:t("smartDevices.title"),...smartStats,available:Boolean(smartDevices)&&!smartQuery.isError,pending:smartQuery.isPending},
            ].map(row=>{
              const Icon=row.hardware==="wheelchair" ? Accessibility : row.hardware==="node" ? Wifi : row.hardware==="polar_sense" ? HeartPulse : row.hardware==="mobile_phone" ? Smartphone : row.hardware==="belt" ? Move3d : Plug2;
              const state=row.pending ? "pending" : !row.available ? "unavailable" : !row.total ? "empty" : row.online===row.total ? "online" : row.stale>0 ? "stale" : row.online>0 ? "partial" : "unknown";
              const status=row.pending ? t("common.loading") : !row.available ? t("redesign.unavailable") : !row.total ? t("patient.health.notConfigured") : state==="online" ? t("devices.online") : state==="unknown" ? t("patient.roomControls.unknownState") : t("admin.system.statusNeedsReview");
              const detail=row.hardware==="smart" ? `${row.missing} ${t("overview.unavailableOrDisabled")}` : `${row.stale} ${t("overview.stale")} · ${row.missing} ${t("overview.missing")}`;
              const onlinePct=row.available&&row.total ? (row.online/row.total)*100 : 0;
              const stalePct=row.available&&row.total ? (row.stale/row.total)*100 : 0;
              const label=`${row.label}: ${row.available ? `${row.online}/${row.total} ${t("devices.online")}` : status} · ${detail}`;
              return <li key={row.hardware}><Link href={`/admin/devices?tab=${row.hardware==="smart" ? "smart_home" : row.hardware}`} className={styles.fleetTile} data-state={state} aria-label={label}>
                <svg viewBox="0 0 36 36" className={styles.fleetRing} role="img" aria-hidden>
                  <circle className={styles.fleetRingTrack} cx="18" cy="18" r="15.9"/>
                  {onlinePct>0 ? <circle className={styles.fleetRingOnline} cx="18" cy="18" r="15.9" pathLength="100" strokeDasharray={`${onlinePct} 100`} transform="rotate(-90 18 18)"/> : null}
                  {stalePct>0 ? <circle className={styles.fleetRingStale} cx="18" cy="18" r="15.9" pathLength="100" strokeDasharray={`${stalePct} 100`} strokeDashoffset={-onlinePct} transform="rotate(-90 18 18)"/> : null}
                  <text x="18" y="20.5" textAnchor="middle" className={styles.fleetRingText}>{row.available ? `${row.online}/${row.total}` : "—"}</text>
                </svg>
                <span className={styles.fleetCategory}><Icon aria-hidden className="size-3"/>{row.label}{row.available && row.total>row.online ? <small>{detail}</small> : null}</span>
                <span className={styles.fleetState}>{status}</span>
              </Link></li>;
            })}
          </ul></CardContent>
          <CardFooter className={styles.fleetFooter}><span className={styles.legend}><i data-tone="online"/>{t("devices.online")}<i data-tone="stale"/>{t("overview.stale")}<i/>{t("overview.missing")}</span><Link href="/admin/devices" className={styles.fleetLink}>{t("admin.system.viewAllDevices")}<ArrowRight aria-hidden className="size-4"/></Link></CardFooter>
        </Card>

        <div className={styles.operations}>
          <section className={styles.activity}>
            <details open={latestActivity.length>0||activityQuery.isError}><summary><span>{t("admin.system.recentActivity")}</span><small>{activity && !activityQuery.isError ? latestActivity.length : "—"}</small><ChevronDown aria-hidden className="size-3"/></summary>
              <div>{activityQuery.isError ? <p role="status">{t("redesign.unavailable")}</p> : activityQuery.isPending ? <p>{t("common.loading")}</p> : latestActivity.length ? <ol className={styles.activityList} tabIndex={0} aria-label={t("admin.system.recentActivity")}>{latestActivity.map(entry=><li key={entry.id} data-severity={entry.severity ?? undefined}><span>{entry.event_type}</span><p>{entry.summary||t("admin.system.noDescription")}</p><time dateTime={entry.occurred_at} title={formatDateTime(entry.occurred_at)}>{formatDateTime(entry.occurred_at)} · {formatRelativeTime(entry.occurred_at)}</time>{entry.severity ? <StatusBadge tone={entry.severity==="critical" ? "critical" : entry.severity==="warning" ? "warning" : "info"} label={entry.severity}/> : null}{entry.status ? <StatusBadge tone="neutral" label={entry.status}/> : null}</li>)}</ol> : <p>{t("admin.system.noRecentActivity")}</p>}<Link href="/admin/audit">{t("admin.system.viewAuditLog")}<ArrowRight aria-hidden className="size-4"/></Link></div>
            </details>
          </section>
          <nav aria-label={t("admin.system.quickActions")} className={styles.quickActions}>
            {([["/admin/users",Users,t("admin.system.manageUsers")],["/admin/facility-management",Building2,t("admin.system.addFacility")],["/admin/devices",Tablet,t("admin.system.registerDevice")],["/admin/audit",ClipboardList,t("admin.system.viewAuditLog")]] as const).map(([href,Icon,label])=><Link key={href} href={href}><Icon aria-hidden className="size-4"/><span>{label}</span><ArrowUpRight aria-hidden className="size-3"/></Link>)}
          </nav>
        </div>
      </div>
      <details className={styles.context}><summary>{t("overview.visual.workspaceDetails")}<ChevronDown aria-hidden className="size-3"/></summary><div className={styles.contextBody}>
        <section><h2>{t("overview.accounts")}</h2>{usersQuery.isError||!users ? <p>{usersQuery.isError ? t("redesign.unavailable") : t("common.loading")}</p> : <><p>{userStats.total} {t("overview.total")} · {userStats.active} {t("overview.active")} · {userStats.inactive} {t("overview.inactive")}</p><div className={styles.contextLinks}>{Object.entries(userStats.byRole).map(([role,count])=><Link key={role} href={role==="patient" ? "/admin/patients" : "/admin/users"}>{t(`personnel.role.${role==="head_caregiver" ? "headCaregiver" : role}`)} <strong>{count}</strong></Link>)}</div></> }</section>
        <nav aria-label={t("overview.administration")} className={styles.contextLinks}><Link href="/admin/tasks">{t("nav.tasks")}</Link><Link href="/admin/support">{t("overview.support")}</Link><Link href="/admin/demo-control">{t("overview.simulator")}</Link></nav>
      </div></details>
    </AppPage>
  );

  function devicesUpdatedLabel(timestamp: number) {
    return timestamp ? `${t("patient.roomControls.lastUpdated")}: ${formatRelativeTime(new Date(timestamp).toISOString())}` : t("redesign.unavailable");
  }
}
