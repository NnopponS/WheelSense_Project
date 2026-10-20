"use client";

import { useState, type ReactNode } from "react";
import {
  ArrowRight,
  Activity,
  ChevronDown,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
  { key: "heart_rate_bpm", labelKey: "patient.health.metric.heartRate" as const, unit: "bpm", stroke: "var(--chart-1)" },
  { key: "spo2", labelKey: "patient.health.metric.spo2" as const, unit: "%", stroke: "var(--chart-2)" },
  { key: "calories_kcal", labelKey: "patient.health.metric.calories" as const, unit: "kcal", stroke: "var(--chart-3)" },
  { key: "distance_m", labelKey: "patient.health.metric.distance" as const, unit: "m", stroke: "var(--chart-4)" },
] as const;

type StatusDot = "recorded" | "warning" | "critical" | "unknown";

function statusDot(severity?: HealthRiskSeverity): StatusDot {
  if (severity === "critical") return "critical";
  if (severity === "warning") return "warning";
  if (severity === "info") return "recorded";
  return "unknown";
}

function StatusDotBadge({ status, label }: { status: StatusDot; label: string }) {
  const colors: Record<StatusDot, string> = {
    recorded: "text-muted-foreground",
    warning: "text-warning",
    critical: "text-critical",
    unknown: "text-muted-foreground",
  };
  const dots: Record<StatusDot, string> = {
    recorded: "bg-muted-foreground",
    warning: "bg-warning",
    critical: "bg-critical",
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
    return <span className="rounded-full bg-critical-bg px-2.5 py-0.5 text-xs font-semibold uppercase text-critical-foreground">{t("patient.health.severity.critical")}</span>;
  if (severity === "warning")
    return <span className="rounded-full bg-warning-bg px-2.5 py-0.5 text-xs font-semibold uppercase text-warning-foreground">{t("patient.health.severity.warning")}</span>;
  if (severity === "watch")
    return <span className="rounded-full bg-info-bg px-2.5 py-0.5 text-xs font-semibold uppercase text-info-foreground">{t("patient.health.severity.watch")}</span>;
  return <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold uppercase text-muted-foreground">{t("patient.health.severity.info")}</span>;
}

function riskBannerColors(level: PatientHealthAnalysis["risk_level"]) {
  if (level === "critical") return { banner: "bg-critical-bg border-critical/35", badge: "bg-critical-bg text-critical-foreground", icon: "text-critical" };
  if (level === "warning") return { banner: "bg-warning-bg border-warning/35", badge: "bg-warning-bg text-warning-foreground", icon: "text-warning" };
  if (level === "watch") return { banner: "bg-info-bg border-info/35", badge: "bg-info-bg text-info-foreground", icon: "text-info" };
  return { banner: "bg-success-bg border-success/35", badge: "bg-success-bg text-success-foreground", icon: "text-success" };
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
  const insufficient = data.data_quality === "insufficient";
  const colors = insufficient ? {banner:"bg-card border-border",badge:"bg-muted text-muted-foreground",icon:"text-muted-foreground"} : riskBannerColors(data.risk_level);
  const levels = ["normal", "watch", "warning", "critical"] as const;
  const levelLabel = (level: (typeof levels)[number]) => level === "normal" ? t("patient.health.risk.normal") : t(`patient.health.severity.${level}`);
  const severityLabel = insufficient ? t("patient.health.insufficientData") : levelLabel(data.risk_level);
  const concernColors = {normal:"bg-success",watch:"bg-info",warning:"bg-warning",critical:"bg-critical"};

  return (
    <section id="predicting-anomaly" aria-labelledby="anomaly-title" className={cn("scroll-mt-32 overflow-hidden rounded-[var(--radius)] border", colors.banner, className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
        <div className="flex min-w-0 items-center gap-2">
          <AlertTriangle className={cn("size-4 shrink-0", colors.icon)} aria-hidden />
          <h3 id="anomaly-title" className="font-semibold text-foreground">{t("patient.health.predictiveAnomaly")}</h3>
          <Badge variant="secondary" className={colors.badge}>{severityLabel}</Badge>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing || isFetching}>
          <RefreshCw className={cn((isRefreshing || isFetching) && "animate-spin motion-reduce:animate-none")} aria-hidden />
          {isRefreshing || isFetching ? t("patient.health.refreshingAi") : t("patient.health.refreshAi")}
        </Button>
      </div>
      <div role="note" className="mx-4 mt-3 flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-bg/60 px-3 py-2.5 text-xs leading-relaxed text-warning-foreground">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>{t("patient.health.aiScreeningDisclaimer")}</p>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div role="img" aria-label={`${t("patient.health.reportedSeverity")}: ${severityLabel}`} className="grid grid-cols-4 gap-1.5">
          {levels.map(level => <div key={level} className="flex min-w-0 flex-col gap-1.5">
            <span className={cn("h-2 rounded-sm", !insufficient && level === data.risk_level ? concernColors[level] : "bg-border")} />
            <span className={cn("text-xs", !insufficient && level === data.risk_level ? "font-semibold text-foreground" : "text-muted-foreground")}>{levelLabel(level)}</span>
          </div>)}
        </div>
        <div className="flex min-w-0 flex-col gap-1.5 text-xs">
          {data.risk_factors.slice(0,2).map(factor => <span key={`${factor.label}-${factor.evidence}`} className="flex items-center gap-2 text-foreground"><Activity className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />{factor.label}</span>)}
          <span className="text-muted-foreground">{qualityText(data.data_quality,t)} · <time dateTime={data.generated_at}>{new Date(data.generated_at).toLocaleString()}</time></span>
        </div>
      </div>
      <details className="group border-t border-border">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-4 py-2 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring">{t("patient.health.analysisDetails")}<ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden /></summary>
        <div className="flex flex-col gap-3 px-4 pb-4 text-sm">
          <p className="leading-relaxed text-foreground">{data.trend_summary}</p>
          {data.risk_factors.length > 0 ? <ul className="flex flex-col gap-2">{data.risk_factors.map(factor => <li key={`${factor.label}-${factor.evidence}`}><strong className="font-medium">{factor.label}</strong> · {severityChip(factor.severity,t)}<p className="mt-1 text-muted-foreground">{factor.evidence} · {factor.source}</p></li>)}</ul> : null}
        </div>
      {/* Score / window / evidence / AI meta row */}
      <div className="grid grid-cols-2 gap-px border-t border-border bg-border/60 sm:grid-cols-3 lg:grid-cols-6">
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

      </details>

      {data.data_quality === "insufficient" && (
        <div className="m-5 rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-warning-foreground">
          {t("patient.health.needRecentVitals")}
        </div>
      )}
    </section>
  );
}

function ScoreCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-card/60 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
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
  const dot = metric?.value == null ? "unknown" : statusDot(metric.status ?? "info");
  const dotLabel = dot === "recorded" ? t("redesign.recordedBaseline") : dot === "warning" ? t("patient.health.status.caution") : dot === "critical" ? t("patient.health.status.critical") : t("patient.health.status.noData");
  const Icon = metricKey === "heart_rate_bpm" ? Heart : Droplets;
  const isAbnormal = dot === "critical" || dot === "warning";
  return (
    <div className={cn(
      "flex items-center gap-3 bg-card p-4",
      isAbnormal ? (dot === "critical" ? "border-critical/30" : "border-warning/30") : "border-border/60",
    )}>
      <div className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
        isAbnormal ? (dot === "critical" ? "bg-critical-bg" : "bg-warning-bg") : "bg-primary/10",
      )}>
        <Icon className={cn("h-5 w-5", isAbnormal ? (dot === "critical" ? "text-critical" : "text-warning") : "text-primary")} aria-hidden />
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
    <div className="flex items-center gap-3 bg-card p-4">
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
              <StatusDotBadge status="unknown" label={value == null ? t("patient.health.status.noData") : t("redesign.recorded")} />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-start gap-1 py-1">
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold uppercase text-muted-foreground">{t("patient.health.notConnected")}</span>
            <p className="text-xs text-muted-foreground">{t("patient.health.sensorNotLinked")}</p>
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
    <section id="health-profile" className={cn("scroll-mt-32 rounded-[var(--radius)] border border-border/60 bg-card shadow-sm", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border/50 px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
            <HeartPulse className="h-4 w-4 text-primary" aria-hidden />
          </div>
          <h2 className="font-semibold text-foreground">{t("redesign.observations")}</h2>
        </div>
        <div className="flex items-center gap-2">
          {activity.polar_connected && (
            <span className="rounded-full bg-success-bg px-2 py-0.5 text-xs font-semibold text-success-foreground">{t("patient.health.polarConnected")}</span>
          )}
          <p className="text-xs text-muted-foreground">
            {t("patient.health.updated")}: <time dateTime={data.generated_at}>{new Date(data.generated_at).toLocaleString()}</time>
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 divide-x divide-border md:grid-cols-4">
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
            <span className="ml-2 text-xs uppercase tracking-wide">{t("patient.health.via")} {activity.source}</span>
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
  const readingCount = data.filter(point => point[metric.key] != null).length;
  const hasData = readingCount > 0;
  return (
    <div className="ws-insight-chart p-1 sm:p-2">
      <div className="mb-3">
        <p className="text-sm font-semibold text-foreground">{t(metric.labelKey)}</p>
        <p className="text-xs text-muted-foreground">{metric.unit}</p>
      </div>
      {hasData ? (
        <div className="h-64 min-h-64 min-w-0">
          <ResponsiveContainer width="100%" height={256} minWidth={0} minHeight={256}>
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" opacity={0.55} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                minTickGap={30}
                interval="preserveStartEnd"
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={40}
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              />
              <Tooltip
                cursor={{ stroke: metric.stroke, strokeOpacity: 0.2 }}
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  color: "var(--foreground)",
                  fontSize: 12,
                }}
                formatter={(value) => [`${value} ${metric.unit}`, t(metric.labelKey)]}
              />
              <Line
                type="linear"
                dataKey={metric.key}
                stroke={metric.stroke}
                strokeWidth={2}
                dot={readingCount === 1 ? {r:3,fill:metric.stroke,stroke:"var(--card)",strokeWidth:1} : false}
                connectNulls={false}
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
    <section id="health-trends" className={cn("ws-chart-surface scroll-mt-32 min-w-0 rounded-[var(--radius)] border border-border bg-card text-card-foreground", className)}>
      <div className="flex flex-col gap-3 border-b border-border/50 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
            <TrendingUp className="h-4 w-4 text-primary" aria-hidden />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">{t("patient.health.trendsTitle")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("redesign.history")}</p>
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
              aria-pressed={trendRange === option.value}
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
        {trendSeries.some(point => point[selectedMetric.key] != null) ? (
          <details className="mt-3 border-t border-border pt-2">
            <summary className="flex min-h-11 cursor-pointer items-center rounded-md text-sm text-primary">{t("redesign.historyTable")}</summary>
            <div className="max-h-64 overflow-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">{t(selectedMetric.labelKey)}</caption>
                <thead><tr><th scope="col" className="py-2">{t("patient.health.updated")}</th><th scope="col" className="py-2 text-right">{t(selectedMetric.labelKey)} ({selectedMetric.unit})</th></tr></thead>
                <tbody>{trendSeries.map(point => <tr key={point.key} className="border-t border-border">
                  <td className="py-2"><time dateTime={new Date(point.time).toISOString()}>{new Date(point.time).toLocaleString()}</time></td>
                  <td className="py-2 text-right tabular-nums">{point[selectedMetric.key] ?? "—"}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </details>
        ) : null}
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
  const priorityIconColor = isUrgent ? "text-critical" : isMod ? "text-warning" : "text-info";
  return (
    <div className={cn(
      "flex flex-col justify-between gap-3 rounded-xl border p-4",
      isUrgent ? "border-critical/30 bg-critical-bg/60" : isMod ? "border-warning/30 bg-warning-bg/60" : "border-border/60 bg-muted/20",
    )}>
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          {severityChip(item.priority, t)}
          <span className={cn("flex h-7 w-7 items-center justify-center rounded-full bg-card/70", priorityIconColor)} aria-hidden>
            <Activity className="h-4 w-4" />
          </span>
        </div>
        <p className={cn("text-sm font-semibold leading-snug", isUrgent ? "text-critical-foreground" : isMod ? "text-warning-foreground" : "text-foreground")}>
          {item.title}
        </p>
      </div>
      <div className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <p className="rounded-lg bg-card/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">{item.rationale}</p>
        <ArrowRight className="mx-auto h-4 w-4 rotate-90 text-muted-foreground sm:rotate-0" aria-hidden />
        <div className="rounded-lg bg-card/80 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Activity className="h-3.5 w-3.5 text-primary" aria-hidden />
            {t("patient.health.personalizedCareActions")}
          </p>
          <p className="mt-0.5 text-xs font-medium leading-tight text-foreground/80">{item.suggested_action}</p>
        </div>
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
  const priorityGroups = [
    { severity: "critical", color: "bg-critical" },
    { severity: "warning", color: "bg-warning" },
    { severity: "watch", color: "bg-info" },
    { severity: "info", color: "bg-muted-foreground/40" },
  ].map((group) => ({
    ...group,
    count: recommendations.filter((item) => item.priority === group.severity).length,
  })).filter((group) => group.count > 0);
  return (
    <section id="optimize-health-plan" className={cn("scroll-mt-32 rounded-[var(--radius)] border border-border/60 bg-card shadow-sm", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border/50 px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success-bg">
            <TrendingUp className="h-4 w-4 text-success" aria-hidden />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">{t("patient.health.recommendations")}</h2>
            <p className="text-xs text-muted-foreground">{t("patient.health.personalizedCareActions")}</p>
          </div>
        </div>
        <span className="rounded-full bg-success-bg px-2.5 py-0.5 text-xs font-bold text-success-foreground">
          {recommendations.length}
        </span>
      </div>
      <div className="space-y-3 px-4 pt-3">
        <div
          role="img"
          aria-label={priorityGroups.map((group) => `${t(`patient.health.severity.${group.severity}`)}: ${group.count}`).join(", ")}
          className="flex h-2.5 overflow-hidden rounded-full bg-muted"
        >
          {priorityGroups.map((group) => (
            <div key={group.severity} className={group.color} style={{ width: `${(group.count / recommendations.length) * 100}%` }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden>
          {priorityGroups.map((group) => (
            <span key={group.severity} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", group.color)} />
              {t(`patient.health.severity.${group.severity}`)} <strong className="font-semibold text-foreground">{group.count}</strong>
            </span>
          ))}
        </div>
      </div>
      <div className={cn("grid gap-3 p-4", recommendations.length === 1 ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-3")}>
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
    <section id="risk-factors" className={cn("scroll-mt-32 rounded-[var(--radius)] border border-border/60 bg-card shadow-sm", className)}>
      <div className="flex items-center gap-2 border-b border-border/50 px-5 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-critical-bg">
          <ShieldAlert className="h-4 w-4 text-critical" aria-hidden />
        </div>
        <h2 className="font-semibold text-foreground">{t("patient.health.riskFactors")}</h2>
        <span className="ml-auto rounded-full bg-critical-bg px-2.5 py-0.5 text-xs font-bold text-critical-foreground">
          {riskFactors.length}
        </span>
      </div>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("patient.health.riskFactors")}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
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
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs uppercase tracking-wide text-muted-foreground">{factor.source}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-2.5 text-xs text-muted-foreground">
        <HeartPulse className="mr-1 inline h-3 w-3" aria-hidden />
        {t("patient.health.operationalOnly")}
      </p>
    </section>
  );
}
