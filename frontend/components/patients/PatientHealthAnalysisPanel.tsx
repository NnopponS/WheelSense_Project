"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Droplets,
  Flame,
  Footprints,
  Heart,
  HeartPulse,
  RefreshCw,
  Route,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import type { PatientHealthAnalysis, HealthRiskSeverity } from "@/lib/patientHealthAnalysis";
import { cn } from "@/lib/utils";

/* ── helpers ─────────────────────────────────────────────────────────────── */

type TrendRange = "day" | "week" | "month" | "year" | "all";

type AISettingsOut = {
  provider?: "ollama" | "copilot";
  model?: string;
  workspace_default_provider?: "ollama" | "copilot";
  workspace_default_model?: string;
};

type AIHealthOut = {
  default_provider?: "ollama" | "copilot";
  ollama_configured?: boolean;
  copilot_configured?: boolean;
};

type VitalTrendReading = {
  timestamp: string;
  heart_rate_bpm: number | null;
  spo2: number | null;
};

type DeviceAssignmentLike = {
  device_id: string;
  device_role: string;
  is_active: boolean;
};

type ImuTelemetryRow = {
  timestamp?: string | null;
  motion?: {
    distance_m?: number | null;
  } | null;
};

type TrendBucket = {
  key: string;
  label: string;
  time: number;
  heartRateTotal: number;
  heartRateCount: number;
  spo2Total: number;
  spo2Count: number;
  distance_m: number;
};

type TrendPoint = {
  key: string;
  label: string;
  time: number;
  heart_rate_bpm: number | null;
  spo2: number | null;
  calories_kcal: number | null;
  distance_m: number | null;
};

const TREND_RANGE_OPTIONS: Array<{ value: TrendRange; hours: number | null; labelKey: string }> = [
  { value: "day", hours: 24, labelKey: "patient.health.trend.day" },
  { value: "week", hours: 24 * 7, labelKey: "patient.health.trend.week" },
  { value: "month", hours: 24 * 30, labelKey: "patient.health.trend.month" },
  { value: "year", hours: 24 * 365, labelKey: "patient.health.trend.year" },
  { value: "all", hours: null, labelKey: "patient.health.trend.all" },
];

const TREND_METRICS = [
  { key: "heart_rate_bpm", labelKey: "patient.health.metric.heartRate", unit: "bpm", stroke: "#e11d48" },
  { key: "spo2", labelKey: "patient.health.metric.spo2", unit: "%", stroke: "#0284c7" },
  { key: "calories_kcal", labelKey: "patient.health.metric.calories", unit: "kcal", stroke: "#f97316" },
  { key: "distance_m", labelKey: "patient.health.metric.distance", unit: "m", stroke: "#059669" },
] as const;

function rangeHours(range: TrendRange): number | null {
  return TREND_RANGE_OPTIONS.find((option) => option.value === range)?.hours ?? null;
}

function bucketFor(date: Date, range: TrendRange): { key: string; label: string; time: number } {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  const h = date.getHours();

  if (range === "day") {
    const bucket = new Date(y, m, d, h);
    return {
      key: bucket.toISOString(),
      label: bucket.toLocaleTimeString(undefined, { hour: "2-digit" }),
      time: bucket.getTime(),
    };
  }

  if (range === "year" || range === "all") {
    const bucket = new Date(y, m, 1);
    return {
      key: `${y}-${String(m + 1).padStart(2, "0")}`,
      label: bucket.toLocaleDateString(undefined, { month: "short", year: range === "all" ? "2-digit" : undefined }),
      time: bucket.getTime(),
    };
  }

  const bucket = new Date(y, m, d);
  return {
    key: bucket.toISOString(),
    label: bucket.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    time: bucket.getTime(),
  };
}

function upsertBucket(map: Map<string, TrendBucket>, date: Date, range: TrendRange): TrendBucket {
  const base = bucketFor(date, range);
  const existing = map.get(base.key);
  if (existing) return existing;
  const next: TrendBucket = {
    ...base,
    heartRateTotal: 0,
    heartRateCount: 0,
    spo2Total: 0,
    spo2Count: 0,
    distance_m: 0,
  };
  map.set(base.key, next);
  return next;
}

function buildTrendSeries(
  vitals: VitalTrendReading[],
  imuRows: ImuTelemetryRow[],
  range: TrendRange,
): TrendPoint[] {
  const hours = rangeHours(range);
  const cutoff = hours == null ? 0 : Date.now() - hours * 60 * 60 * 1000;
  const buckets = new Map<string, TrendBucket>();

  for (const row of vitals) {
    const time = new Date(row.timestamp).getTime();
    if (!Number.isFinite(time) || time < cutoff) continue;
    const bucket = upsertBucket(buckets, new Date(time), range);
    if (row.heart_rate_bpm != null) {
      bucket.heartRateTotal += row.heart_rate_bpm;
      bucket.heartRateCount += 1;
    }
    if (row.spo2 != null) {
      bucket.spo2Total += row.spo2;
      bucket.spo2Count += 1;
    }
  }

  for (const row of imuRows) {
    const rawTime = row.timestamp;
    if (!rawTime) continue;
    const time = new Date(rawTime).getTime();
    if (!Number.isFinite(time) || time < cutoff) continue;
    const distance = row.motion?.distance_m;
    if (distance == null || !Number.isFinite(distance) || distance < 0) continue;
    const bucket = upsertBucket(buckets, new Date(time), range);
    bucket.distance_m = Math.max(bucket.distance_m, distance);
  }

  return [...buckets.values()]
    .sort((left, right) => left.time - right.time)
    .map((bucket) => {
      const heartRate =
        bucket.heartRateCount > 0 ? Math.round(bucket.heartRateTotal / bucket.heartRateCount) : null;
      const spo2 = bucket.spo2Count > 0 ? Math.round(bucket.spo2Total / bucket.spo2Count) : null;
      const distance = bucket.distance_m > 0 ? Math.round(bucket.distance_m) : null;
      const calories =
        distance != null
          ? Math.max(1, Math.round(distance * 0.04))
          : heartRate != null
            ? Math.max(1, Math.round(heartRate * bucket.heartRateCount * 0.03))
            : null;
      return {
        key: bucket.key,
        label: bucket.label,
        time: bucket.time,
        heart_rate_bpm: heartRate,
        spo2,
        calories_kcal: calories,
        distance_m: distance,
      };
    });
}

function metricLabel(key: string, t: (key: string) => string) {
  const labels: Record<string, string> = {
    heart_rate_bpm: t("patient.health.metric.heartRate"),
    spo2: "SpO\u2082",
    steps: t("patient.health.metric.steps"),
    distance_m: t("patient.health.metric.distance"),
    calories_kcal: t("patient.health.metric.calories"),
    rr_interval_ms: t("patient.health.metric.rrInterval"),
    bmi: "BMI",
  };
  return labels[key] ?? key.replace(/_/g, " ");
}

type StatusDot = "normal" | "warning" | "critical" | "unknown";

function statusDot(severity?: HealthRiskSeverity): StatusDot {
  if (severity === "critical") return "critical";
  if (severity === "warning") return "warning";
  if (severity === "info") return "normal";
  return "unknown";
}

function StatusDotBadge({ status, label }: { status: StatusDot; label: string }) {
  const colors: Record<StatusDot, string> = {
    normal: "text-emerald-600",
    warning: "text-amber-600",
    critical: "text-red-600",
    unknown: "text-muted-foreground",
  };
  const dots: Record<StatusDot, string> = {
    normal: "bg-emerald-500",
    warning: "bg-amber-500",
    critical: "bg-red-500",
    unknown: "bg-muted-foreground/50",
  };
  return (
    <span className={cn("flex items-center gap-1 text-xs font-medium", colors[status])}>
      <span className={cn("h-2 w-2 rounded-full", dots[status])} />
      {label}
    </span>
  );
}

function ActivityNotConnected({ t }: { t: (key: string) => string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 py-3 text-center">
      <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{t("patient.health.notConnected")}</span>
      <p className="text-[11px] text-muted-foreground">{t("patient.health.sensorNotLinked")}</p>
    </div>
  );
}

function severityChip(severity: HealthRiskSeverity, t: (key: string) => string) {
  if (severity === "critical")
    return <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase text-red-700">{t("patient.health.severity.critical")}</span>;
  if (severity === "warning")
    return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700">{t("patient.health.severity.warning")}</span>;
  if (severity === "watch")
    return <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase text-sky-700">{t("patient.health.severity.watch")}</span>;
  return <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{t("patient.health.severity.info")}</span>;
}

function riskBannerColors(level: PatientHealthAnalysis["risk_level"]) {
  if (level === "critical") return { banner: "bg-red-50 border-red-200", badge: "bg-red-500 text-white", icon: "text-red-500", text: "text-red-700", sub: "text-red-600/80" };
  if (level === "warning") return { banner: "bg-amber-50 border-amber-200", badge: "bg-amber-500 text-white", icon: "text-amber-500", text: "text-amber-800", sub: "text-amber-700/80" };
  if (level === "watch") return { banner: "bg-sky-50 border-sky-200", badge: "bg-sky-500 text-white", icon: "text-sky-500", text: "text-sky-800", sub: "text-sky-700/80" };
  return { banner: "bg-emerald-50 border-emerald-200", badge: "bg-emerald-500 text-white", icon: "text-emerald-500", text: "text-emerald-800", sub: "text-emerald-700/80" };
}

function riskLevelLabel(level: PatientHealthAnalysis["risk_level"], t: (key: string) => string) {
  if (level === "critical") return t("patient.health.risk.high");
  if (level === "warning") return t("patient.health.risk.moderate");
  if (level === "watch") return t("patient.health.risk.watch");
  return t("patient.health.risk.normal");
}

function qualityText(value: PatientHealthAnalysis["data_quality"], t: (key: string) => string) {
  if (value === "complete") return t("patient.health.quality.complete");
  if (value === "partial") return t("patient.health.quality.partial");
  return t("patient.health.quality.insufficient");
}

/* ── Vitals baseline card (HR / SpO2) ───────────────────────────────────── */
function VitalCard({
  metricKey,
  metric,
  t,
}: {
  metricKey: string;
  metric?: PatientHealthAnalysis["baseline"][string];
  t: (key: string) => string;
}) {
  const dot = statusDot(metric?.status);
  const dotLabel = dot === "normal" ? t("patient.health.status.normal") : dot === "warning" ? t("patient.health.status.caution") : dot === "critical" ? t("patient.health.status.critical") : t("patient.health.status.noData");
  const Icon = metricKey === "heart_rate_bpm" ? Heart : Droplets;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Icon className="h-5 w-5 text-primary" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{metricLabel(metricKey, t)}</p>
        <p className="mt-0.5 text-xl font-bold tabular-nums leading-none text-foreground">
          {metric?.value ?? "—"}
          <span className="ml-1 text-xs font-normal text-muted-foreground">{metric?.unit ?? ""}</span>
        </p>
        <div className="mt-1.5"><StatusDotBadge status={dot} label={dotLabel} /></div>
      </div>
    </div>
  );
}

/* ── Activity card (Calories / Distance) ────────────────────────────────── */
function ActivityCard({
  icon,
  label,
  value,
  unit,
  connected,
  t,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  unit: string;
  connected: boolean;
  t: (key: string) => string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        {connected ? (
          <>
            <p className="mt-0.5 text-xl font-bold tabular-nums leading-none text-foreground">
              {value != null ? value.toLocaleString() : "—"}
              <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>
            </p>
            <div className="mt-1.5">
              <StatusDotBadge status="normal" label={t("patient.health.live")} />
            </div>
          </>
        ) : (
          <ActivityNotConnected t={t} />
        )}
      </div>
    </div>
  );
}

/* ── Recommendation action card (ref: Health Plan Optimization row) ────────── */
function HealthTrendChart({
  metric,
  data,
  t,
}: {
  metric: (typeof TREND_METRICS)[number];
  data: TrendPoint[];
  t: (key: string) => string;
}) {
  const hasData = data.some((point) => point[metric.key] != null);
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="mb-3">
        <p className="text-sm font-semibold text-foreground">{t(metric.labelKey)}</p>
        <p className="text-[11px] text-muted-foreground">{metric.unit}</p>
      </div>
      {hasData ? (
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.55} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                minTickGap={18}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={36}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              />
              <Tooltip
                cursor={{ stroke: metric.stroke, strokeOpacity: 0.2 }}
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--card))",
                  color: "hsl(var(--foreground))",
                  fontSize: 12,
                }}
                formatter={(value) => [`${value} ${metric.unit}`, t(metric.labelKey)]}
              />
              <Line
                type="monotone"
                dataKey={metric.key}
                stroke={metric.stroke}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/10 text-xs text-muted-foreground">
          {t("patient.health.trendsEmpty")}
        </div>
      )}
    </div>
  );
}

function RecommendationCard({ item, t }: { item: PatientHealthAnalysis["recommendations"][number]; t: (key: string) => string }) {
  const isUrgent = item.priority === "critical";
  const isMod = item.priority === "warning";
  return (
    <div className={cn(
      "flex flex-col justify-between gap-3 rounded-xl border p-4",
      isUrgent ? "border-red-200 bg-red-50/60" : isMod ? "border-amber-200 bg-amber-50/60" : "border-border/60 bg-muted/20"
    )}>
      <div>
        <p className={cn("text-sm font-semibold leading-snug", isUrgent ? "text-red-800" : isMod ? "text-amber-800" : "text-foreground")}>
          {item.title}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{item.rationale}</p>
      </div>
      <div className="flex items-center justify-between gap-2">
        {severityChip(item.priority, t)}
        <span className="text-[11px] font-medium text-foreground/70 text-right leading-tight">{item.suggested_action}</span>
      </div>
    </div>
  );
}

/* ── Main export ──────────────────────────────────────────────────────────── */
export function PatientHealthAnalysisPanel({
  patientId,
  compact = false,
  className,
}: {
  patientId: number;
  compact?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const [trendRange, setTrendRange] = useState<TrendRange>("week");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const query = useQuery({
    queryKey: ["patient", "health-analysis", patientId],
    queryFn: () => api.getPatientHealthAnalysis(patientId),
    refetchInterval: 30_000,
  });
  const aiSettingsQuery = useQuery({
    queryKey: ["patient", "health-analysis", patientId, "ai-settings"],
    queryFn: () => api.get<AISettingsOut>("/settings/ai"),
    staleTime: 60_000,
    retry: false,
  });
  const aiHealthQuery = useQuery({
    queryKey: ["patient", "health-analysis", patientId, "ai-health"],
    queryFn: () => api.get<AIHealthOut>("/settings/ai/health"),
    staleTime: 60_000,
    retry: false,
  });
  const vitalsTrendQuery = useQuery({
    queryKey: ["patient", "health-analysis", patientId, "vitals-trend"],
    queryFn: () => api.listVitalReadings({ patient_id: patientId, limit: 500 }),
    enabled: patientId > 0,
    staleTime: 30_000,
  });
  const assignmentsTrendQuery = useQuery({
    queryKey: ["patient", "health-analysis", patientId, "device-assignments"],
    queryFn: () => api.listPatientDeviceAssignments(patientId),
    enabled: patientId > 0,
    staleTime: 30_000,
  });
  const imuDeviceIds = useMemo(() => {
    const assignments = (assignmentsTrendQuery.data ?? []) as DeviceAssignmentLike[];
    return [...new Set(
      assignments
        .filter((assignment) => assignment.is_active)
        .filter((assignment) =>
          ["wheelchair_sensor", "wheelchair", "mobile", "mobile_phone"].includes(assignment.device_role),
        )
        .map((assignment) => assignment.device_id),
    )];
  }, [assignmentsTrendQuery.data]);
  const imuTrendQuery = useQuery({
    queryKey: ["patient", "health-analysis", patientId, "imu-trend", imuDeviceIds.join("|")],
    queryFn: async () => {
      const results = await Promise.all(
        imuDeviceIds.map((deviceId) =>
          api.get<ImuTelemetryRow[]>(
            `/telemetry/imu?device_id=${encodeURIComponent(deviceId)}&limit=500`,
          ).catch(() => []),
        ),
      );
      return results.flat();
    },
    enabled: imuDeviceIds.length > 0,
    staleTime: 30_000,
  });

  const data = query.data as PatientHealthAnalysis | undefined;
  const trendSeries = useMemo(
    () =>
      buildTrendSeries(
        (vitalsTrendQuery.data ?? []) as VitalTrendReading[],
        (imuTrendQuery.data ?? []) as ImuTelemetryRow[],
        trendRange,
      ),
    [imuTrendQuery.data, trendRange, vitalsTrendQuery.data],
  );
  const aiProvider =
    aiSettingsQuery.data?.provider ??
    aiSettingsQuery.data?.workspace_default_provider ??
    aiHealthQuery.data?.default_provider ??
    null;
  const aiModel =
    aiSettingsQuery.data?.model ?? aiSettingsQuery.data?.workspace_default_model ?? null;
  const aiConfigured =
    aiProvider === "copilot"
      ? aiHealthQuery.data?.copilot_configured
      : aiProvider === "ollama"
        ? aiHealthQuery.data?.ollama_configured
        : undefined;

  async function refreshAnalysis() {
    setIsRefreshing(true);
    try {
      await Promise.all([
        query.refetch(),
        aiSettingsQuery.refetch(),
        aiHealthQuery.refetch(),
        vitalsTrendQuery.refetch(),
        assignmentsTrendQuery.refetch(),
        imuTrendQuery.refetch(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }

  if (query.isLoading) {
    return (
      <div className={cn("space-y-3 rounded-2xl border border-border/60 bg-card p-5", className)}>
        <div className="h-20 animate-pulse rounded-xl bg-muted/50" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/40" />)}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={cn("rounded-2xl border border-border/60 bg-card p-5 text-sm text-muted-foreground", className)}>
        {t("patient.health.notAvailable")}
      </div>
    );
  }

  const colors = riskBannerColors(data.risk_level);
  const activity = data.activity ?? { steps: null, distance_m: null, calories_kcal: null, polar_connected: false, source: "none" };
  const activityConnected = activity.source !== "none";
  const baseline = data.baseline ?? {};

  return (
    <div className={cn("space-y-4", className)}>

      {/* ── 1. Predictive Anomaly Banner ──────────────────────────────────── */}
      <div className={cn("relative overflow-hidden rounded-2xl border p-5", colors.banner)}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/70 shadow-sm">
              <AlertTriangle className={cn("h-4 w-4", colors.icon)} aria-hidden />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground/60">{t("patient.health.predictiveAnomaly")}</p>
              <h3 className="mt-0.5 text-lg font-bold leading-snug text-foreground">
                {data.trend_summary}
                <span className={cn("ml-2 inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold", colors.badge)}>
                  {riskLevelLabel(data.risk_level, t)}
                </span>
              </h3>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/70 px-3 py-1 text-[11px] font-semibold text-foreground shadow-sm transition-colors hover:bg-white disabled:opacity-60"
              onClick={() => void refreshAnalysis()}
              disabled={isRefreshing || query.isFetching}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", (isRefreshing || query.isFetching) && "animate-spin")} />
              {isRefreshing || query.isFetching ? t("patient.health.refreshingAi") : t("patient.health.refreshAi")}
            </button>
            <span className={cn("rounded-full px-3 py-1 text-[11px] font-semibold", colors.badge)}>
              {t("patient.health.aiRiskAssessment")}
            </span>
          </div>
        </div>

        {/* Score metrics row */}
        <div className="mt-4 flex flex-wrap gap-6 border-t border-black/5 pt-4">
          <div>
            <p className="text-[11px] text-muted-foreground">{t("patient.health.riskScore")}</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums leading-none text-foreground">
              {data.overall_score}<span className="text-sm font-normal text-muted-foreground">/100</span>
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">{t("patient.health.dataQuality")}</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums leading-none text-foreground">
              {qualityText(data.data_quality, t)}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">{t("patient.health.analysisWindow")}</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums leading-none text-foreground">
              {data.window_hours}<span className="text-sm font-normal text-muted-foreground"> {t("patient.health.hoursShort")}</span>
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">{t("patient.health.aiProvider")}</p>
            <p className="mt-0.5 text-sm font-bold leading-tight text-foreground">
              {aiProvider ? `${aiProvider}${aiModel ? ` / ${aiModel}` : ""}` : "-"}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">{t("patient.health.aiStatus")}</p>
            <p className="mt-0.5 text-sm font-bold leading-tight text-foreground">
              {aiConfigured === true
                ? t("patient.health.configured")
                : aiConfigured === false
                  ? t("patient.health.notConfigured")
                  : "-"}
            </p>
          </div>
          <div className="ml-auto flex items-end">
            <p className="text-[10px] text-muted-foreground">
              <Activity className="mr-1 inline h-3 w-3" aria-hidden />
              {new Date(data.generated_at).toLocaleString()}
            </p>
          </div>
        </div>

        {data.data_quality === "insufficient" && (
          <div className="mt-3 rounded-lg border border-amber-400/40 bg-amber-50/80 px-3 py-2 text-xs text-amber-800">
            {t("patient.health.needRecentVitals")}
          </div>
        )}
      </div>

      {/* ── 2. Personalized Health Baseline ───────────────────────────────── */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border/50 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <HeartPulse className="h-4 w-4 text-primary" aria-hidden />
            </div>
            <h2 className="font-semibold text-foreground">{t("patient.health.baselineTitle")}</h2>
          </div>
          <div className="flex items-center gap-2">
            {activity.polar_connected && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">{t("patient.health.polarConnected")}</span>
            )}
            <p className="text-xs text-muted-foreground">
              {t("patient.health.updated")}: {new Date(data.generated_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-4">
          <VitalCard metricKey="heart_rate_bpm" metric={baseline["heart_rate_bpm"]} t={t} />
          <VitalCard metricKey="spo2" metric={baseline["spo2"]} t={t} />
          <ActivityCard
            icon={<Flame className="h-5 w-5 text-primary" aria-hidden />}
            label={t("patient.health.caloriesEstimated")}
            value={activity.calories_kcal}
            unit="kcal"
            connected={activityConnected}
            t={t}
          />
          <ActivityCard
            icon={<Route className="h-5 w-5 text-primary" aria-hidden />}
            label={t("patient.health.distanceToday")}
            value={activity.distance_m != null ? Math.round(activity.distance_m) : null}
            unit="m"
            connected={activityConnected}
            t={t}
          />
        </div>
        {activityConnected && activity.steps != null && (
          <div className="flex items-center gap-2 border-t border-border/40 px-5 py-2.5">
            <Footprints className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <p className="text-xs text-muted-foreground">
              {t("patient.health.stepsToday")}: <span className="font-semibold text-foreground">{activity.steps.toLocaleString()}</span>
              <span className="ml-2 text-[10px] uppercase tracking-wide">{t("patient.health.via")} {activity.source}</span>
            </p>
          </div>
        )}
      </div>

      {/* ── 3. Risk Factors + Recommendations ────────────────────────────── */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <TrendingUp className="h-4 w-4 text-primary" aria-hidden />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">{t("patient.health.trendsTitle")}</h2>
              <p className="text-xs text-muted-foreground">{t("patient.health.trendsDesc")}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1 rounded-full border border-border/60 bg-muted/20 p-1">
            {TREND_RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                  trendRange === option.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-background hover:text-foreground",
                )}
                onClick={() => setTrendRange(option.value)}
              >
                {t(option.labelKey)}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-2">
          {TREND_METRICS.map((metric) => (
            <HealthTrendChart key={metric.key} metric={metric} data={trendSeries} t={t} />
          ))}
        </div>
      </div>

      {!compact && (
        <>
          {/* Risk factors */}
          {data.risk_factors.length > 0 && (
            <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
              <div className="flex items-center gap-2 border-b border-border/50 px-5 py-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-50">
                  <ShieldAlert className="h-4 w-4 text-red-500" aria-hidden />
                </div>
                <h2 className="font-semibold text-foreground">{t("patient.health.riskFactors")}</h2>
                <span className="ml-auto rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-bold text-red-700">
                  {data.risk_factors.length}
                </span>
              </div>
              <div className="divide-y divide-border/40">
                {data.risk_factors.slice(0, 5).map((factor) => (
                  <div key={`${factor.label}-${factor.evidence}`} className="flex items-start gap-3 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{factor.label}</p>
                        {severityChip(factor.severity, t)}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{factor.evidence}</p>
                    </div>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{factor.source}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {data.recommendations.length > 0 && (
            <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-border/50 px-5 py-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                    <TrendingUp className="h-4 w-4 text-primary" aria-hidden />
                  </div>
                  <h2 className="font-semibold text-foreground">{t("patient.health.recommendations")}</h2>
                </div>
                <span className="text-xs font-semibold text-primary">{t("patient.health.personalizedCareActions")}</span>
              </div>
              <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
                {data.recommendations.slice(0, 6).map((item) => (
                  <RecommendationCard key={item.title} item={item} t={t} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <p className="px-1 text-[11px] text-muted-foreground">
        <HeartPulse className="mr-1 inline h-3 w-3" aria-hidden />
        {t("patient.health.operationalOnly")}
      </p>
    </div>
  );
}
