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
  LucideIcon,
  Smartphone,
  Watch,
} from "lucide-react";
import { api } from "@/lib/api";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import type { ListPatientDeviceAssignmentsResponse } from "@/lib/api/task-scope-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type DeviceDetail = {
  device_id?: string;
  display_name?: string | null;
  hardware_type?: string | null;
  wheelchair_metrics?: Record<string, unknown> | null;
  mobile_metrics?: Record<string, unknown> | null;
  polar_metrics?: Record<string, unknown> | null;
};

function fmtNumber(value: unknown, digits = 1, suffix = ""): string {
  if (value == null || typeof value !== "number" || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}${suffix}`;
}

function fmtBatteryPct(value: unknown): string {
  if (value == null || typeof value !== "number" || Number.isNaN(value)) return "—";
  return `${Math.round(value)}%`;
}

function fmtInt(value: unknown): string {
  if (value == null || typeof value !== "number" || Number.isNaN(value)) return "—";
  return String(Math.round(value));
}

function roleLabel(role: string, t: (key: TranslationKey) => string): string {
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

function hardwareIcon(hw: string | null | undefined): LucideIcon {
  switch (hw) {
    case "mobile_phone":
      return Smartphone;
    case "polar_sense":
      return Watch;
    case "wheelchair":
      return Gauge;
    default:
      return Activity;
  }
}

function MetricRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="font-medium tabular-nums text-foreground text-right">{value}</div>
    </div>
  );
}

export function PatientMySensors({ patientId }: { patientId: number }) {
  const { t } = useTranslation();
  const assignmentsQuery = useQuery({
    queryKey: ["patient", "my-sensors", "assignments", patientId],
    queryFn: () => api.listPatientDeviceAssignments(patientId),
    enabled: patientId > 0,
  });

  const activeAssignments = useMemo(() => {
    const rows = (assignmentsQuery.data ?? []) as ListPatientDeviceAssignmentsResponse;
    const dedup: typeof rows = [];
    const seen = new Set<string>();
    for (const row of rows.filter((r) => r.is_active)) {
      if (seen.has(row.device_id)) continue;
      seen.add(row.device_id);
      dedup.push(row);
    }
    return dedup;
  }, [assignmentsQuery.data]);

  const detailQueries = useQueries({
    queries: activeAssignments.map((a) => ({
      queryKey: ["patient", "my-sensors", "device", patientId, a.device_id],
      queryFn: async () => {
        const raw = await api.getDeviceDetailRaw(a.device_id);
        return raw as DeviceDetail;
      },
      enabled: patientId > 0 && Boolean(a.device_id),
      refetchInterval: 12_000,
    })),
  });

  if (assignmentsQuery.isLoading) {
    return (
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-lg">{t("patient.sensors.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("patient.sensors.loadingAssignments")}</p>
        </CardContent>
      </Card>
    );
  }

  if (assignmentsQuery.isError) {
    return (
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-lg">{t("patient.sensors.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{t("patient.sensors.assignmentsError")}</p>
        </CardContent>
      </Card>
    );
  }

  if (activeAssignments.length === 0) {
    return (
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-lg">{t("patient.sensors.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("patient.sensors.empty")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold text-foreground">{t("patient.sensors.title")}</h3>
        <p className="text-sm text-muted-foreground">{t("patient.sensors.subtitle")}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {activeAssignments.map((assignment, idx) => {
          const q = detailQueries[idx];
          const detail = (q?.data ?? null) as DeviceDetail | null;
          const hw = detail?.hardware_type ?? null;
          const Icon = hardwareIcon(
            hw ||
              (assignment.device_role === "wheelchair_sensor"
                ? "wheelchair"
                : assignment.device_role === "mobile"
                  ? "mobile_phone"
                  : assignment.device_role === "polar_hr"
                    ? "polar_sense"
                    : null),
          );
          const title =
            (detail?.display_name && String(detail.display_name).trim()) ||
            assignment.device_id;
          const wm = detail?.wheelchair_metrics ?? null;
          const mm = detail?.mobile_metrics ?? null;
          const pm = detail?.polar_metrics ?? null;

          const primaryHw =
            hw ||
            (assignment.device_role === "wheelchair_sensor"
              ? "wheelchair"
              : assignment.device_role === "mobile"
                ? "mobile_phone"
                : assignment.device_role === "polar_hr"
                  ? "polar_sense"
                  : null);

          const batteryPct =
            typeof wm?.battery_pct === "number"
              ? wm.battery_pct
              : typeof mm?.battery_pct === "number"
                ? mm.battery_pct
                : primaryHw === "polar_sense" && typeof pm?.sensor_battery === "number"
                  ? pm.sensor_battery
                  : null;

          let body: ReactNode = null;
          if (primaryHw === "wheelchair") {
            body = (
              <div className="space-y-2 pt-1 border-t border-border/60">
                <MetricRow label={t("patient.sensors.distance")} value={`${fmtNumber(wm?.distance_m, 1, " m")}`} />
                <MetricRow label={t("patient.sensors.velocity")} value={`${fmtNumber(wm?.velocity_ms, 2, " m/s")}`} />
                <MetricRow
                  label={t("patient.sensors.acceleration")}
                  value={`${fmtNumber(wm?.accel_ms2, 2, " m/s²")}`}
                />
              </div>
            );
          } else if (primaryHw === "mobile_phone") {
            body = (
              <div className="space-y-2 pt-1 border-t border-border/60">
                <MetricRow
                  label={t("patient.sensors.polarConnected")}
                  value={
                    mm?.polar_connected === true
                      ? t("devicesDetail.polarConnectedYes")
                      : mm?.polar_connected === false
                        ? t("devicesDetail.polarConnectedNo")
                        : "—"
                  }
                />
                <MetricRow
                  label={t("patient.sensors.walkSteps")}
                  value={
                    <span className="inline-flex items-center gap-1">
                      <Footprints className="h-3.5 w-3.5 text-muted-foreground" />
                      {fmtInt(mm?.steps)}
                    </span>
                  }
                />
              </div>
            );
          } else if (primaryHw === "polar_sense") {
            body = (
              <div className="space-y-2 pt-1 border-t border-border/60">
                <MetricRow
                  label={t("patient.sensors.heartRate")}
                  value={
                    <span className="inline-flex items-center gap-1">
                      <HeartPulse className="h-3.5 w-3.5 text-rose-500" />
                      {pm?.heart_rate_bpm != null ? `${fmtInt(pm.heart_rate_bpm)} bpm` : "—"}
                    </span>
                  }
                />
                <MetricRow
                  label={t("patient.sensors.ppg")}
                  value={
                    typeof pm?.ppg === "number" && !Number.isNaN(pm.ppg)
                      ? fmtNumber(pm.ppg, 3)
                      : pm?.ppg != null && typeof pm.ppg !== "object"
                        ? String(pm.ppg)
                        : "—"
                  }
                />
                {batteryPct == null ? (
                  <MetricRow label={t("patient.sensors.sensorBattery")} value={fmtBatteryPct(pm?.sensor_battery)} />
                ) : null}
              </div>
            );
          } else if (primaryHw === "node") {
            body = (
              <div className="space-y-2 pt-1 border-t border-border/60 text-sm text-muted-foreground">
                {t("patient.sensors.nodeBlurb")}
              </div>
            );
          } else if (q?.data && !q.isLoading && !q.isError) {
            body = (
              <div className="space-y-2 pt-1 border-t border-border/60 text-sm text-muted-foreground">
                <MetricRow
                  label={t("patient.sensors.fallbackBattery")}
                  value={fmtBatteryPct(wm?.battery_pct ?? mm?.battery_pct ?? pm?.sensor_battery)}
                />
                <p className="text-xs">{t("patient.sensors.fallbackHint")}</p>
              </div>
            );
          }

          return (
            <Card key={assignment.device_id} className="border-border/70 overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base font-semibold truncate">{title}</CardTitle>
                      <p className="text-xs text-muted-foreground truncate">{assignment.device_id}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0 capitalize">
                    {roleLabel(assignment.device_role, t)}
                  </Badge>
                </div>
                {batteryPct != null && (
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
                )}
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {q?.isLoading && (
                  <p className="text-xs text-muted-foreground">{t("patient.sensors.fetchingReadings")}</p>
                )}
                {q?.isError && (
                  <p className="text-xs text-destructive">{t("patient.sensors.deviceReadingsError")}</p>
                )}
                {!q?.isLoading && !q?.isError ? body : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
