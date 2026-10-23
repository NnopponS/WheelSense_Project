"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  Activity,
  BatteryCharging,
  Footprints,
  Gauge,
  HeartPulse,
  Smartphone,
  Watch,
} from "lucide-react";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import { isDeviceOnline } from "@/lib/deviceOnline";
import { useFixedNowMs } from "@/hooks/useFixedNowMs";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type PersonType = "patient" | "staff";

type DeviceAssignmentLike = {
  id: number;
  device_id: string;
  device_role: string;
  assigned_at: string;
  is_active: boolean;
};

type MetricSnapshot = {
  timestamp?: string | null;
  battery_pct?: number | null;
  battery_v?: number | null;
  charging?: boolean | null;
  velocity_ms?: number | null;
  distance_m?: number | null;
  accel_ms2?: number | null;
  steps?: number | null;
  polar_connected?: boolean | null;
  heart_rate_bpm?: number | null;
  rr_interval_ms?: number | null;
  spo2?: number | null;
  sensor_battery?: number | null;
  ppg?: number | string | null;
};

type DeviceDetail = {
  device_id?: string;
  display_name?: string | null;
  hardware_type?: string | null;
  last_seen?: string | null;
  realtime?: MetricSnapshot | null;
  wheelchair_metrics?: MetricSnapshot | null;
  node_metrics?: MetricSnapshot | null;
  mobile_metrics?: MetricSnapshot | null;
  polar_metrics?: MetricSnapshot | null;
  polar_vitals?: MetricSnapshot | null;
};

export type PersonSensorStatusPanelProps = {
  personType: PersonType;
  personId: number;
  title?: string;
  description?: string;
  compact?: boolean;
  className?: string;
};

function asAssignments(value: unknown): DeviceAssignmentLike[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is DeviceAssignmentLike => {
    if (!item || typeof item !== "object") return false;
    const row = item as Partial<DeviceAssignmentLike>;
    return typeof row.id === "number" && typeof row.device_id === "string";
  });
}

function assignmentEndpoint(personType: PersonType, personId: number): string {
  if (personType === "staff") return `/caregivers/${encodeURIComponent(String(personId))}/devices`;
  return `/patients/${encodeURIComponent(String(personId))}/devices`;
}

function resolveHardwareType(detail: DeviceDetail | null, role: string): string {
  const raw = detail?.hardware_type;
  if (raw === "mobile_app") return "mobile_phone";
  if (raw) return raw;
  if (role === "wheelchair_sensor") return "wheelchair";
  if (role === "mobile" || role === "mobile_phone") return "mobile_phone";
  if (role === "polar_hr") return "polar_sense";
  return "unknown";
}

function hardwareIcon(hardwareType: string) {
  if (hardwareType === "mobile_phone") return Smartphone;
  if (hardwareType === "polar_sense") return Watch;
  if (hardwareType === "wheelchair") return Gauge;
  return Activity;
}

function roleLabel(role: string, t: (key: string) => string): string {
  switch (role) {
    case "wheelchair_sensor":
      return t("patient.sensors.roleWheelchair");
    case "mobile":
    case "mobile_phone":
      return t("patient.sensors.roleMobile");
    case "polar_hr":
      return t("patient.sensors.rolePolar");
    default:
      return role.replaceAll("_", " ");
  }
}

function latestMetricTimestamp(detail: DeviceDetail | null): string | null {
  if (!detail) return null;
  const candidates = [
    detail.realtime?.timestamp,
    detail.wheelchair_metrics?.timestamp,
    detail.node_metrics?.timestamp,
    detail.mobile_metrics?.timestamp,
    detail.polar_metrics?.timestamp,
    detail.polar_vitals?.timestamp,
    detail.last_seen,
  ].filter((value): value is string => Boolean(value));
  return candidates
    .map((value) => ({ value, time: new Date(value).getTime() }))
    .filter((item) => Number.isFinite(item.time))
    .sort((left, right) => right.time - left.time)[0]?.value ?? null;
}

function fmtNumber(value: number | null | undefined, digits = 1, suffix = ""): string {
  if (value == null || Number.isNaN(value)) return "-";
  return `${value.toFixed(digits)}${suffix}`;
}

function fmtInt(value: number | null | undefined, suffix = ""): string {
  if (value == null || Number.isNaN(value)) return "-";
  return `${Math.round(value)}${suffix}`;
}

function batteryFrom(detail: DeviceDetail | null): number | null {
  return (
    detail?.realtime?.battery_pct ??
    detail?.wheelchair_metrics?.battery_pct ??
    detail?.node_metrics?.battery_pct ??
    detail?.mobile_metrics?.battery_pct ??
    detail?.polar_metrics?.sensor_battery ??
    detail?.polar_vitals?.sensor_battery ??
    null
  );
}

function MetricRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function DeviceMetrics({
  detail,
  hardwareType,
  t,
}: {
  detail: DeviceDetail | null;
  hardwareType: string;
  t: (key: string) => string;
}) {
  const wheelchair = detail?.wheelchair_metrics ?? detail?.realtime ?? null;
  const mobile = detail?.mobile_metrics ?? null;
  const polar = detail?.polar_metrics ?? detail?.polar_vitals ?? null;

  if (hardwareType === "wheelchair") {
    return (
      <div className="space-y-2 border-t border-border/60 pt-3">
        <MetricRow label={t("patient.sensors.distance")} value={fmtNumber(wheelchair?.distance_m, 1, " m")} />
        <MetricRow label={t("patient.sensors.velocity")} value={fmtNumber(wheelchair?.velocity_ms, 2, " m/s")} />
        <MetricRow label={t("patient.sensors.acceleration")} value={fmtNumber(wheelchair?.accel_ms2, 2, " m/s^2")} />
      </div>
    );
  }

  if (hardwareType === "mobile_phone") {
    return (
      <div className="space-y-2 border-t border-border/60 pt-3">
        <MetricRow
          label={t("patient.sensors.polarConnected")}
          value={
            mobile?.polar_connected === true
              ? t("devicesDetail.polarConnectedYes")
              : mobile?.polar_connected === false
                ? t("devicesDetail.polarConnectedNo")
                : "-"
          }
        />
        <MetricRow
          label={t("patient.sensors.walkSteps")}
          value={
            <span className="inline-flex items-center gap-1">
              <Footprints className="h-3.5 w-3.5 text-muted-foreground" />
              {fmtInt(mobile?.steps)}
            </span>
          }
        />
      </div>
    );
  }

  if (hardwareType === "polar_sense") {
    return (
      <div className="space-y-2 border-t border-border/60 pt-3">
        <MetricRow
          label={t("patient.sensors.heartRate")}
          value={
            <span className="inline-flex items-center gap-1">
              <HeartPulse className="h-3.5 w-3.5 text-rose-500" />
              {polar?.heart_rate_bpm != null ? fmtInt(polar.heart_rate_bpm, " bpm") : "-"}
            </span>
          }
        />
        <MetricRow label="SpO2" value={polar?.spo2 != null ? fmtInt(polar.spo2, "%") : "-"} />
        <MetricRow
          label={t("patient.sensors.ppg")}
          value={
            typeof polar?.ppg === "number"
              ? fmtNumber(polar.ppg, 3)
              : polar?.ppg != null
                ? String(polar.ppg)
                : "-"
          }
        />
      </div>
    );
  }

  if (hardwareType === "node") {
    return (
      <div className="border-t border-border/60 pt-3 text-sm text-muted-foreground">
        {t("patient.sensors.nodeBlurb")}
      </div>
    );
  }

  return (
    <div className="space-y-2 border-t border-border/60 pt-3">
      <MetricRow label={t("patient.sensors.fallbackBattery")} value={batteryFrom(detail) != null ? `${Math.round(batteryFrom(detail)!)}%` : "-"} />
      <p className="text-xs text-muted-foreground">{t("patient.sensors.fallbackHint")}</p>
    </div>
  );
}

export function PersonSensorStatusPanel({
  personType,
  personId,
  title,
  description,
  compact = false,
  className,
}: PersonSensorStatusPanelProps) {
  const { t } = useTranslation();
  const nowMs = useFixedNowMs();
  const endpoint = assignmentEndpoint(personType, personId);

  const assignmentsQuery = useQuery({
    queryKey: ["person-sensor-status", personType, personId, "assignments"],
    queryFn: async () => asAssignments(await api.get(endpoint)),
    enabled: personId > 0,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const activeAssignments = useMemo(() => {
    const byDevice = new Map<string, DeviceAssignmentLike>();
    for (const row of (assignmentsQuery.data ?? []).filter((item) => item.is_active)) {
      const current = byDevice.get(row.device_id);
      if (!current || new Date(row.assigned_at).getTime() > new Date(current.assigned_at).getTime()) {
        byDevice.set(row.device_id, row);
      }
    }
    return [...byDevice.values()].sort((left, right) => left.device_id.localeCompare(right.device_id));
  }, [assignmentsQuery.data]);

  const detailQueries = useQueries({
    queries: activeAssignments.map((assignment) => ({
      queryKey: ["person-sensor-status", personType, personId, "device", assignment.device_id],
      queryFn: async () => (await api.getDeviceDetailRaw(assignment.device_id)) as DeviceDetail,
      enabled: personId > 0 && Boolean(assignment.device_id),
      staleTime: 2_500,
      refetchInterval: 12_000,
    })),
  });

  const headerTitle =
    title ??
    (personType === "staff" ? t("personSensors.staffTitle") : t("patient.sensors.title"));
  const headerDescription =
    description ??
    (personType === "staff" ? t("personSensors.staffSubtitle") : t("patient.sensors.subtitle"));

  if (assignmentsQuery.isLoading) {
    return (
      <Card className={cn("border-border/70", className)}>
        <CardHeader>
          <CardTitle className="text-lg">{headerTitle}</CardTitle>
          {!compact ? <CardDescription>{headerDescription}</CardDescription> : null}
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("patient.sensors.loadingAssignments")}</p>
        </CardContent>
      </Card>
    );
  }

  if (assignmentsQuery.isError) {
    return (
      <Card className={cn("border-destructive/40", className)}>
        <CardHeader>
          <CardTitle className="text-lg">{headerTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{t("patient.sensors.assignmentsError")}</p>
        </CardContent>
      </Card>
    );
  }

  if (activeAssignments.length === 0) {
    return (
      <Card className={cn("border-border/70", className)}>
        <CardHeader>
          <CardTitle className="text-lg">{headerTitle}</CardTitle>
          {!compact ? <CardDescription>{headerDescription}</CardDescription> : null}
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {personType === "staff" ? t("personSensors.staffEmpty") : t("patient.sensors.empty")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className={cn("space-y-3", className)}>
      <div>
        <h3 className="text-lg font-semibold text-foreground">{headerTitle}</h3>
        {!compact ? <p className="text-sm text-muted-foreground">{headerDescription}</p> : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {activeAssignments.map((assignment, index) => {
          const query = detailQueries[index];
          const detail = (query?.data ?? null) as DeviceDetail | null;
          const hardwareType = resolveHardwareType(detail, assignment.device_role);
          const Icon = hardwareIcon(hardwareType);
          const batteryPct = batteryFrom(detail);
          const online = detail ? isDeviceOnline(detail.last_seen ?? null, nowMs) : false;
          const lastMetricAt = latestMetricTimestamp(detail);
          const titleText = detail?.display_name?.trim() || detail?.device_id || assignment.device_id;

          return (
            <Card key={assignment.device_id} className="overflow-hidden border-border/70">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base font-semibold">{titleText}</CardTitle>
                      <p className="truncate text-xs text-muted-foreground">{assignment.device_id}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant={online ? "success" : "warning"}>
                      {online ? t("devices.online") : t("devices.offline")}
                    </Badge>
                    <Badge variant="outline" className="capitalize">
                      {roleLabel(assignment.device_role, t)}
                    </Badge>
                  </div>
                </div>
                {batteryPct != null ? (
                  <div className="mt-3 space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <BatteryCharging className="h-3.5 w-3.5" />
                        {t("patient.sensors.battery")}
                      </span>
                      <span>{Math.round(batteryPct)}%</span>
                    </div>
                    <Progress value={Math.min(100, Math.max(0, batteryPct))} className="h-1.5" />
                  </div>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {query?.isLoading ? (
                  <p className="text-xs text-muted-foreground">{t("patient.sensors.fetchingReadings")}</p>
                ) : query?.isError ? (
                  <p className="text-xs text-destructive">{t("patient.sensors.deviceReadingsError")}</p>
                ) : (
                  <DeviceMetrics detail={detail} hardwareType={hardwareType} t={t} />
                )}
                <div className="grid gap-1 border-t border-border/50 pt-2 text-xs text-muted-foreground">
                  <span>
                    {t("personSensors.lastSeen")}:{" "}
                    {detail?.last_seen ? `${formatRelativeTime(detail.last_seen)} (${formatDateTime(detail.last_seen)})` : "-"}
                  </span>
                  <span>
                    {t("personSensors.lastTelemetry")}:{" "}
                    {lastMetricAt ? `${formatRelativeTime(lastMetricAt)} (${formatDateTime(lastMetricAt)})` : "-"}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
