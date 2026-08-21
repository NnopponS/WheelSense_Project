"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Droplets,
  Flame,
  Footprints,
  Heart,
  HeartPulse,
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
import {
  AnomalyCard,
  HealthMetricCard,
  HealthPlanCard,
  RiskBadge,
  SectionHeader,
  riskToneFromLevel,
  riskToneFromSeverity,
} from "@/components/shared/health/HealthPrimitives";

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

type StatusDot = "normal" | "warning" | "critical" | "unknown";

function statusDot(severity?: HealthRiskSeverity): StatusDot {
  if (severity === "critical") return "critical";
  if (severity === "warning") return "warning";
  if (severity === "info") return "normal";
  return "unknown";
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
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold text-foreground">{t(metric.labelKey)}</p>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{metric.unit}</span>
      </div>
      {hasData ? (
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                minTickGap={20}
                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={32}
                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              />
              <Tooltip
                cursor={{ stroke: metric.stroke, strokeOpacity: 0.2 }}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--card))",
                  color: "hsl(var(--foreground))",
                  fontSize: 11,
                }}
                formatter={(value) => [`${value} ${metric.unit}`, t(metric.labelKey)]}
              />
              <Line
                type="monotone"
                dataKey={metric.key}
                stroke={metric.stroke}
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/10 text-xs text-muted-foreground">
          {t("patient.health.trendsEmpty")}
        </div>
      )}
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

  const activity = data.activity ?? { steps: null, distance_m: null, calories_kcal: null, polar_connected: false, source: "none" };
  const activityConnected = activity.source !== "none";
  const baseline = data.baseline ?? {};

  const riskTone = riskToneFromLevel(data.risk_level);
  const concerns = data.risk_factors.slice(0, 4).map((f) => f.label);

  return (
    <div className={cn("space-y-5", className)}>

      {/* ── 1. Predicting Anomaly ─────────────────────────────────────────── */}
      <AnomalyCard
        title={data.trend_summary}
        riskTone={riskTone}
        riskLabel={riskLevelLabel(data.risk_level, t)}
        concerns={concerns}
        riskScore={data.overall_score}
        analysisWindow={`${data.window_hours}h`}
        confidence={qualityText(data.data_quality, t)}
        updatedAt={new Date(data.generated_at).toLocaleString()}
        secondaryCta={isRefreshing || query.isFetching ? t("patient.health.refreshingAi") : t("patient.health.refreshAi")}
        onSecondaryCta={() => void refreshAnalysis()}
        secondaryCtaBusy={isRefreshing || query.isFetching}
      />

      {data.data_quality === "insufficient" && (
        <div className="rounded-lg border border-amber-400/40 bg-amber-50/80 px-3 py-2 text-xs text-amber-800">
          {t("patient.health.needRecentVitals")}
        </div>
      )}

      {/* ── 2. Daily Health Summary ──────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeader title={t("patient.health.baselineTitle")} subtitle={t("patient.health.trendsDesc")} icon={HeartPulse} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <HealthMetricCard
            label={t("patient.health.metric.heartRate")}
            value={baseline["heart_rate_bpm"]?.value ?? null}
            unit={baseline["heart_rate_bpm"]?.unit ?? "bpm"}
            icon={Heart}
            status={statusDot(baseline["heart_rate_bpm"]?.status)}
            trend={baseline["heart_rate_bpm"]?.trend === "up" ? "↑ Above baseline" : baseline["heart_rate_bpm"]?.trend === "down" ? "↓ Below baseline" : undefined}
            trendDirection={baseline["heart_rate_bpm"]?.trend}
          />
          <HealthMetricCard
            label="SpO₂"
            value={baseline["spo2"]?.value ?? null}
            unit={baseline["spo2"]?.unit ?? "%"}
            icon={Droplets}
            status={statusDot(baseline["spo2"]?.status)}
            trend={baseline["spo2"]?.trend === "down" ? "↓ Below baseline" : baseline["spo2"]?.trend === "up" ? "↑ Above baseline" : undefined}
            trendDirection={baseline["spo2"]?.trend}
          />
          <HealthMetricCard
            label={t("patient.health.caloriesEstimated")}
            value={activityConnected ? (activity.calories_kcal != null ? activity.calories_kcal.toLocaleString() : null) : null}
            unit="kcal"
            icon={Flame}
            status={activityConnected ? "normal" : "unknown"}
            trend={activityConnected ? "Today" : t("patient.health.notConnected")}
          />
          <HealthMetricCard
            label={t("patient.health.distanceToday")}
            value={activityConnected ? (activity.distance_m != null ? Math.round(activity.distance_m).toLocaleString() : null) : null}
            unit="m"
            icon={Route}
            status={activityConnected ? "normal" : "unknown"}
            trend={activityConnected ? (activity.distance_m != null && activity.distance_m < 100 ? "Below baseline" : "Today") : t("patient.health.notConnected")}
          />
        </div>
        {activityConnected && activity.steps != null && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Footprints className="h-3.5 w-3.5" aria-hidden />
            {t("patient.health.stepsToday")}: <span className="font-semibold text-foreground">{activity.steps.toLocaleString()}</span>
            <span className="text-[10px] uppercase tracking-wide">{t("patient.health.via")} {activity.source}</span>
            {activity.polar_connected && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">{t("patient.health.polarConnected")}</span>}
          </div>
        )}
      </div>

      {/* ── 3. Health Trends ─────────────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeader
          title={t("patient.health.trendsTitle")}
          subtitle={t("patient.health.trendsDesc")}
          icon={TrendingUp}
          action={
            <div className="flex flex-wrap gap-1 rounded-full border border-border/60 bg-muted/20 p-1">
              {TREND_RANGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
                    trendRange === option.value
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-background hover:text-foreground",
                  )}
                  onClick={() => setTrendRange(option.value)}
                >
                  {t(option.labelKey)}
                </button>
              ))}
            </div>
          }
        />
        <div className="grid gap-3 md:grid-cols-2">
          {TREND_METRICS.map((metric) => (
            <HealthTrendChart key={metric.key} metric={metric} data={trendSeries} t={t} />
          ))}
        </div>
      </div>

      {/* ── 4. Optimize Daily Health Plan ────────────────────────────────── */}
      {!compact && data.recommendations.length > 0 && (
        <div className="space-y-3">
          <SectionHeader
            title={t("patient.health.recommendations")}
            subtitle={t("patient.health.personalizedCareActions")}
            icon={TrendingUp}
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.recommendations.slice(0, 6).map((item) => (
              <HealthPlanCard
                key={item.title}
                title={item.title}
                rationale={item.rationale}
                recommendation={item.suggested_action}
                priority={riskToneFromSeverity(item.priority)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── 5. Risk Factors ──────────────────────────────────────────────── */}
      {!compact && data.risk_factors.length > 0 && (
        <div className="space-y-3">
          <SectionHeader
            title={t("patient.health.riskFactors")}
            icon={ShieldAlert}
            action={
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-bold text-red-700">
                {data.risk_factors.length}
              </span>
            }
          />
          <div className="rounded-xl border border-border/60 bg-card divide-y divide-border/40">
            {data.risk_factors.slice(0, 5).map((factor) => (
              <div key={`${factor.label}-${factor.evidence}`} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{factor.label}</p>
                    <RiskBadge tone={riskToneFromSeverity(factor.severity)} size="xs" />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{factor.evidence}</p>
                </div>
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{factor.source}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <p className="px-1 text-[11px] text-muted-foreground">
        <HeartPulse className="mr-1 inline h-3 w-3" aria-hidden />
        {t("patient.health.operationalOnly")}
      </p>
    </div>
  );
}
