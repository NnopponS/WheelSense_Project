"use client";

import { useState, type ReactNode } from "react";
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
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import type {
  PatientHealthAnalysis,
  HealthRiskSeverity,
} from "@/lib/patientHealthAnalysis";
import { cn } from "@/lib/utils";

/* ── shared helpers ──────────────────────────────────────────────────────── */

export type TrendRange = "day" | "week" | "month" | "year" | "all";

export type TrendPoint = {
  key: string;
  label: string;
  time: number;
  heart_rate_bpm: number | null;
  spo2: number | null;
  calories_kcal: number | null;
  distance_m: number | null;
};

export const TREND_RANGE_OPTIONS: Array<{
  value: TrendRange;
  hours: number | null;
  labelKey: TranslationKey;
}> = [
  { value: "day", hours: 24, labelKey: "patient.health.trend.day" },
  { value: "week", hours: 24 * 7, labelKey: "patient.health.trend.week" },
  { value: "month", hours: 24 * 30, labelKey: "patient.health.trend.month" },
  { value: "year", hours: 24 * 365, labelKey: "patient.health.trend.year" },
  { value: "all", hours: null, labelKey: "patient.health.trend.all" },
];

export const TREND_METRICS = [
  { key: "heart_rate_bpm", labelKey: "patient.health.metric.heartRate" as const, unit: "bpm", stroke: "#e11d48" },
  { key: "spo2", labelKey: "patient.health.metric.spo2" as const, unit: "%", stroke: "#0284c7" },
  { key: "calories_kcal", labelKey: "patient.health.metric.calories" as const, unit: "kcal", stroke: "#f97316" },
  { key: "distance_m", labelKey: "patient.health.metric.distance" as const, unit: "m", stroke: "#059669" },
] as const;

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

export function severityChip(severity: HealthRiskSeverity, t: (key: string) => string) {
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

/* ── 1. AnomalyInsightCard ───────────────────────────────────────────────── */

export function AnomalyInsightCard({
  data,
  aiProvider,
  aiModel,
  aiConfigured,
  isRefreshing,
  isFetching,
  onRefresh,
  className,
}: {
  data: PatientHealthAnalysis;
  aiProvider: string | null;
  aiModel: string | null;
  aiConfigured: boolean | undefined;
  isRefreshing: boolean;
  isFetching: boolean;
  onRefresh: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const colors = riskBannerColors(data.risk_level);
  const concerns = data.risk_factors.slice(0, 4);

  return (
    <section id="predicting-anomaly" className={cn("scroll-mt-32 overflow-hidden rounded-2xl border", colors.banner, className)}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-4 p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/70 shadow-sm">
            <AlertTriangle className={cn("h-4 w-4", colors.icon)} aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground/60">
              {t("patient.health.predictiveAnomaly")}
            </p>
            <h3 className="mt-0.5 text-lg font-bold leading-snug text-foreground">
              {data.trend_summary}
            </h3>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold", colors.badge)}>
            {riskLevelLabel(data.risk_level, t)}
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/70 px-3 py-1 text-[11px] font-semibold text-foreground shadow-sm transition-colors hover:bg-white disabled:opacity-60"
            onClick={onRefresh}
            disabled={isRefreshing || isFetching}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", (isRefreshing || isFetching) && "animate-spin")} />
            {isRefreshing || isFetching ? t("patient.health.refreshingAi") : t("patient.health.refreshAi")}
          </button>
        </div>
      </div>

      {/* Main concerns chips */}
      {concerns.length > 0 && (
        <div className="flex flex-wrap gap-2 px-5 pb-4">
          {concerns.map((factor) => (
            <span
              key={`${factor.label}-${factor.evidence}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
                factor.severity === "critical"
                  ? "border-red-300 bg-white/80 text-red-700"
                  : factor.severity === "warning"
                    ? "border-amber-300 bg-white/80 text-amber-700"
                    : "border-sky-300 bg-white/80 text-sky-700",
              )}
            >
              <span className={cn(
                "h-1.5 w-1.5 rounded-full",
                factor.severity === "critical" ? "bg-red-500" : factor.severity === "warning" ? "bg-amber-500" : "bg-sky-500",
              )} />
              {factor.label}
            </span>
          ))}
        </div>
      )}

      {/* Score / window / evidence / AI meta row */}
      <div className="grid grid-cols-2 gap-px border-t border-black/5 bg-black/[0.03] sm:grid-cols-3 lg:grid-cols-6">
        <ScoreCell label={t("patient.health.riskScore")}>
          {data.overall_score}<span className="text-sm font-normal text-muted-foreground">/100</span>
        </ScoreCell>
        <ScoreCell label={t("patient.health.analysisWindow")}>
          {data.window_hours}<span className="text-sm font-normal text-muted-foreground"> {t("patient.health.hoursShort")}</span>
        </ScoreCell>
        <ScoreCell label={t("patient.health.dataQuality")}>
          {qualityText(data.data_quality, t)}
        </ScoreCell>
        <ScoreCell label={t("patient.health.aiProvider")}>
          <span className="text-sm">{aiProvider ? `${aiProvider}${aiModel ? ` / ${aiModel}` : ""}` : "—"}</span>
        </ScoreCell>
        <ScoreCell label={t("patient.health.aiStatus")}>
          <span className="text-sm">
            {aiConfigured === true
              ? t("patient.health.configured")
              : aiConfigured === false
                ? t("patient.health.notConfigured")
                : "—"}
          </span>
        </ScoreCell>
        <ScoreCell label={t("patient.health.updated")}>
          <span className="flex items-center gap-1 text-xs">
            <Activity className="h-3 w-3" aria-hidden />
            {new Date(data.generated_at).toLocaleString()}
          </span>
        </ScoreCell>
      </div>

      {data.data_quality === "insufficient" && (
        <div className="m-5 rounded-lg border border-amber-400/40 bg-amber-50/80 px-3 py-2 text-xs text-amber-800">
          {t("patient.health.needRecentVitals")}
        </div>
      )}
    </section>
  );
}

function ScoreCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-white/40 px-4 py-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums leading-none text-foreground">{children}</p>
    </div>
  );
}

/* ── 2. HealthBaselineRow ────────────────────────────────────────────────── */

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
  const isAbnormal = dot === "critical" || dot === "warning";
  return (
    <div className={cn(
      "flex items-center gap-3 rounded-xl border bg-card p-4",
      isAbnormal ? (dot === "critical" ? "border-red-200" : "border-amber-200") : "border-border/60",
    )}>
      <div className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
        isAbnormal ? (dot === "critical" ? "bg-red-50" : "bg-amber-50") : "bg-primary/10",
      )}>
        <Icon className={cn("h-5 w-5", isAbnormal ? (dot === "critical" ? "text-red-500" : "text-amber-500") : "text-primary")} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{metricLabel(metricKey, t)}</p>
        <p className="mt-0.5 text-2xl font-bold tabular-nums leading-none text-foreground">
          {metric?.value ?? "—"}
          <span className="ml-1 text-xs font-normal text-muted-foreground">{metric?.unit ?? ""}</span>
        </p>
        <div className="mt-1.5"><StatusDotBadge status={dot} label={dotLabel} /></div>
      </div>
    </div>
  );
}

function ActivityCard({
  icon,
  label,
  value,
  unit,
  connected,
  t,
}: {
  icon: ReactNode;
  label: string;
  value: number | null;
  unit: string;
  connected: boolean;
  t: (key: string) => string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        {connected ? (
          <>
            <p className="mt-0.5 text-2xl font-bold tabular-nums leading-none text-foreground">
              {value != null ? value.toLocaleString() : "—"}
              <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>
            </p>
            <div className="mt-1.5">
              <StatusDotBadge status="normal" label={t("patient.health.live")} />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-start gap-1 py-1">
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{t("patient.health.notConnected")}</span>
            <p className="text-[11px] text-muted-foreground">{t("patient.health.sensorNotLinked")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function HealthBaselineRow({
  data,
  className,
}: {
  data: PatientHealthAnalysis;
  className?: string;
}) {
  const { t } = useTranslation();
  const activity = data.activity ?? { steps: null, distance_m: null, calories_kcal: null, polar_connected: false, source: "none" };
  const activityConnected = activity.source !== "none";
  const baseline = data.baseline ?? {};

  return (
    <section id="health-profile" className={cn("scroll-mt-32 rounded-2xl border border-border/60 bg-card shadow-sm", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border/50 px-5 py-3">
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
      <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
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
    </section>
  );
}

/* ── 3. HealthTrendsWorkspace ────────────────────────────────────────────── */

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
      <div className="mb-3">
        <p className="text-sm font-semibold text-foreground">{t(metric.labelKey)}</p>
        <p className="text-[11px] text-muted-foreground">{metric.unit}</p>
      </div>
      {hasData ? (
        <div className="h-64 min-h-64 min-w-0">
          <ResponsiveContainer width="100%" height={256} minWidth={0} minHeight={256}>
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.55} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                minTickGap={30}
                interval="preserveStartEnd"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={40}
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
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/10 text-xs text-muted-foreground">
          {t("patient.health.trendsEmpty")}
        </div>
      )}
    </div>
  );
}

export function HealthTrendsWorkspace({
  trendRange,
  onTrendRangeChange,
  trendSeries,
  className,
}: {
  trendRange: TrendRange;
  onTrendRangeChange: (range: TrendRange) => void;
  trendSeries: TrendPoint[];
  className?: string;
}) {
  const { t } = useTranslation();
  const [selectedMetricKey, setSelectedMetricKey] = useState<(typeof TREND_METRICS)[number]["key"]>("heart_rate_bpm");
  const selectedMetric = TREND_METRICS.find((metric) => metric.key === selectedMetricKey) ?? TREND_METRICS[0];
  return (
    <section id="health-trends" className={cn("scroll-mt-32 rounded-2xl border border-border/60 bg-card shadow-sm", className)}>
      <div className="flex flex-col gap-3 border-b border-border/50 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
            <TrendingUp className="h-4 w-4 text-primary" aria-hidden />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">{t("patient.health.trendsTitle")}</h2>
            <p className="text-xs text-muted-foreground">{t("patient.health.trendsDesc")}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg border border-border/60 bg-muted/20 p-1">
          {TREND_RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(
                "min-h-11 rounded-md px-3 py-2 text-xs font-semibold transition-colors",
                trendRange === option.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background hover:text-foreground",
              )}
              onClick={() => onTrendRangeChange(option.value)}
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>
      </div>
      <div className="border-b border-border/50 px-4 py-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label={t("patient.health.metricSelector")}>
          {TREND_METRICS.map((metric) => (
            <button
              key={metric.key}
              type="button"
              className={cn(
                "min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors",
                selectedMetric.key === metric.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              aria-pressed={selectedMetric.key === metric.key}
              onClick={() => setSelectedMetricKey(metric.key)}
            >
              {t(metric.labelKey)}
            </button>
          ))}
        </div>
      </div>
      <div className="min-w-0 p-4">
        <HealthTrendChart metric={selectedMetric} data={trendSeries} t={t} />
      </div>
    </section>
  );
}

/* ── 4. OptimizeHealthPlanSection ────────────────────────────────────────── */

function RecommendationCard({
  item,
  t,
}: {
  item: PatientHealthAnalysis["recommendations"][number];
  t: (key: string) => string;
}) {
  const isUrgent = item.priority === "critical";
  const isMod = item.priority === "warning";
  return (
    <div className={cn(
      "flex flex-col justify-between gap-3 rounded-xl border p-4",
      isUrgent ? "border-red-200 bg-red-50/60" : isMod ? "border-amber-200 bg-amber-50/60" : "border-border/60 bg-muted/20",
    )}>
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          {severityChip(item.priority, t)}
        </div>
        <p className={cn("text-sm font-semibold leading-snug", isUrgent ? "text-red-800" : isMod ? "text-amber-800" : "text-foreground")}>
          {item.title}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{item.rationale}</p>
      </div>
      <div className="rounded-lg bg-white/60 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("patient.health.personalizedCareActions")}</p>
        <p className="mt-0.5 text-[11px] font-medium leading-tight text-foreground/80">{item.suggested_action}</p>
      </div>
    </div>
  );
}

export function OptimizeHealthPlanSection({
  recommendations,
  className,
}: {
  recommendations: PatientHealthAnalysis["recommendations"];
  className?: string;
}) {
  const { t } = useTranslation();
  if (recommendations.length === 0) return null;
  return (
    <section id="optimize-health-plan" className={cn("scroll-mt-32 rounded-2xl border border-border/60 bg-card shadow-sm", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border/50 px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50">
            <TrendingUp className="h-4 w-4 text-emerald-600" aria-hidden />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">{t("patient.health.recommendations")}</h2>
            <p className="text-xs text-muted-foreground">{t("patient.health.personalizedCareActions")}</p>
          </div>
        </div>
        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
          {recommendations.length}
        </span>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {recommendations.slice(0, 6).map((item) => (
          <RecommendationCard key={item.title} item={item} t={t} />
        ))}
      </div>
    </section>
  );
}

/* ── 5. RiskFactorsTable ─────────────────────────────────────────────────── */

export function RiskFactorsTable({
  riskFactors,
  className,
}: {
  riskFactors: PatientHealthAnalysis["risk_factors"];
  className?: string;
}) {
  const { t } = useTranslation();
  if (riskFactors.length === 0) return null;
  return (
    <section id="risk-factors" className={cn("scroll-mt-32 rounded-2xl border border-border/60 bg-card shadow-sm", className)}>
      <div className="flex items-center gap-2 border-b border-border/50 px-5 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-50">
          <ShieldAlert className="h-4 w-4 text-red-500" aria-hidden />
        </div>
        <h2 className="font-semibold text-foreground">{t("patient.health.riskFactors")}</h2>
        <span className="ml-auto rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-bold text-red-700">
          {riskFactors.length}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-2 font-medium">{t("patient.health.riskFactors")}</th>
              <th className="px-3 py-2 font-medium">Severity</th>
              <th className="px-3 py-2 font-medium">Evidence</th>
              <th className="px-5 py-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {riskFactors.slice(0, 5).map((factor) => (
              <tr key={`${factor.label}-${factor.evidence}`} className="align-top">
                <td className="px-5 py-3 font-medium text-foreground">{factor.label}</td>
                <td className="px-3 py-3">{severityChip(factor.severity, t)}</td>
                <td className="px-3 py-3 text-xs text-muted-foreground">{factor.evidence}</td>
                <td className="px-5 py-3">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{factor.source}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-2.5 text-[11px] text-muted-foreground">
        <HeartPulse className="mr-1 inline h-3 w-3" aria-hidden />
        {t("patient.health.operationalOnly")}
      </p>
    </section>
  );
}
