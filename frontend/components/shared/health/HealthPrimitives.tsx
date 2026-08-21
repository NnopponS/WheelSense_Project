"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { HealthRiskLevel, HealthRiskSeverity } from "@/lib/patientHealthAnalysis";

/* ── RiskBadge ───────────────────────────────────────────────────────────── */

export type RiskTone = "normal" | "watch" | "warning" | "critical";

const riskToneConfig: Record<RiskTone, { bg: string; text: string; dot: string; label: string }> = {
  normal: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", label: "Normal" },
  watch: { bg: "bg-sky-50", text: "text-sky-700", dot: "bg-sky-500", label: "Watch" },
  warning: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", label: "Moderate" },
  critical: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500", label: "High Risk" },
};

export function riskToneFromLevel(level: HealthRiskLevel): RiskTone {
  if (level === "critical") return "critical";
  if (level === "warning") return "warning";
  if (level === "watch") return "watch";
  return "normal";
}

export function riskToneFromSeverity(severity: HealthRiskSeverity): RiskTone {
  if (severity === "critical") return "critical";
  if (severity === "warning") return "warning";
  if (severity === "watch") return "watch";
  return "normal";
}

export function RiskBadge({
  tone,
  label,
  size = "sm",
  className,
}: {
  tone: RiskTone;
  label?: string;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const cfg = riskToneConfig[tone];
  const sizeClass = size === "xs" ? "text-[10px] px-2 py-0.5" : size === "md" ? "text-xs px-3 py-1" : "text-[11px] px-2.5 py-0.5";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full font-semibold uppercase tracking-wide", cfg.bg, cfg.text, sizeClass, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
      {label ?? cfg.label}
    </span>
  );
}

/* ── SectionHeader ───────────────────────────────────────────────────────── */

export function SectionHeader({
  title,
  subtitle,
  action,
  icon: Icon,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-3", className)}>
      <div className="flex items-center gap-2.5 min-w-0">
        {Icon ? (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-foreground/5">
            <Icon className="h-4 w-4 text-foreground/60" aria-hidden />
          </div>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-base font-bold tracking-tight text-foreground truncate">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground truncate">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* ── HealthMetricCard ────────────────────────────────────────────────────── */

export function HealthMetricCard({
  label,
  value,
  unit,
  trend,
  trendDirection,
  icon: Icon,
  status,
  className,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  trend?: string;
  trendDirection?: "up" | "down" | "stable" | "unknown";
  icon?: LucideIcon;
  status?: "normal" | "warning" | "critical" | "unknown";
  className?: string;
}) {
  const trendColor =
    trendDirection === "up" ? "text-red-500" :
    trendDirection === "down" ? "text-sky-500" :
    "text-muted-foreground";
  const statusDot =
    status === "normal" ? "bg-emerald-500" :
    status === "warning" ? "bg-amber-500" :
    status === "critical" ? "bg-red-500" :
    "bg-muted-foreground/40";

  return (
    <div className={cn("rounded-xl border border-border/60 bg-card p-4 transition-colors hover:border-border", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground truncate">{label}</p>
        </div>
        <span className={cn("h-2 w-2 shrink-0 rounded-full", statusDot)} />
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <p className="text-2xl font-bold tabular-nums leading-none text-foreground">
          {value ?? "—"}
        </p>
        {unit ? <span className="text-xs font-medium text-muted-foreground">{unit}</span> : null}
      </div>
      {trend ? (
        <p className={cn("mt-1.5 text-xs font-medium", trendColor)}>{trend}</p>
      ) : null}
    </div>
  );
}

/* ── AnomalyCard ─────────────────────────────────────────────────────────── */

export function AnomalyCard({
  title,
  riskTone,
  riskLabel,
  concerns,
  riskScore,
  riskScoreMax = 100,
  analysisWindow,
  confidence,
  updatedAt,
  primaryCta,
  secondaryCta,
  onPrimaryCta,
  onSecondaryCta,
  secondaryCtaBusy,
  className,
}: {
  title: string;
  riskTone: RiskTone;
  riskLabel: string;
  concerns: string[];
  riskScore?: number;
  riskScoreMax?: number;
  analysisWindow?: string;
  confidence?: string;
  updatedAt?: string;
  primaryCta?: string;
  secondaryCta?: string;
  onPrimaryCta?: () => void;
  onSecondaryCta?: () => void;
  secondaryCtaBusy?: boolean;
  className?: string;
}) {
  const cfg = riskToneConfig[riskTone];
  return (
    <div className={cn("rounded-xl border p-5", cfg.bg, "border-current/20", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground/50">Predicting Anomaly</p>
          <h3 className="mt-1 text-lg font-bold leading-snug text-foreground">{title}</h3>
        </div>
        <RiskBadge tone={riskTone} label={riskLabel} size="md" />
      </div>

      {concerns.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {concerns.map((c) => (
            <span key={c} className={cn("rounded-full px-2.5 py-1 text-xs font-medium", cfg.bg, cfg.text, "border border-current/15")}>
              {c}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 border-t border-current/10 pt-4">
        {riskScore != null ? (
          <div>
            <p className="text-[11px] text-foreground/50">Risk Score</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums leading-none text-foreground">
              {riskScore}<span className="text-sm font-normal text-foreground/50">/{riskScoreMax}</span>
            </p>
          </div>
        ) : null}
        {analysisWindow ? (
          <div>
            <p className="text-[11px] text-foreground/50">Analysis Window</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums leading-none text-foreground">{analysisWindow}</p>
          </div>
        ) : null}
        {confidence ? (
          <div>
            <p className="text-[11px] text-foreground/50">Confidence</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums leading-none text-foreground">{confidence}</p>
          </div>
        ) : null}
        {updatedAt ? (
          <div className="ml-auto flex items-end">
            <p className="text-[10px] text-foreground/40">Updated {updatedAt}</p>
          </div>
        ) : null}
      </div>

      {(primaryCta || secondaryCta) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {primaryCta ? (
            <button
              type="button"
              onClick={onPrimaryCta}
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background hover:bg-foreground/90 transition-colors"
            >
              {primaryCta}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {secondaryCta ? (
            <button
              type="button"
              onClick={onSecondaryCta}
              disabled={secondaryCtaBusy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-current/20 bg-white/60 px-4 py-2 text-sm font-semibold text-foreground hover:bg-white transition-colors disabled:opacity-60"
            >
              {secondaryCtaBusy ? "…" : secondaryCta}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ── HealthPlanCard ──────────────────────────────────────────────────────── */

export function HealthPlanCard({
  title,
  rationale,
  recommendation,
  priority,
  onComplete,
  completed,
  className,
}: {
  title: string;
  rationale: string;
  recommendation: string;
  priority: RiskTone;
  onComplete?: () => void;
  completed?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border/60 bg-card p-4 transition-colors", completed && "opacity-60", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-bold leading-snug text-foreground">{title}</p>
        <RiskBadge tone={priority} size="xs" />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{rationale}</p>
      <div className="mt-3 rounded-lg bg-muted/40 px-3 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Recommendation</p>
        <p className="mt-0.5 text-sm font-medium text-foreground">{recommendation}</p>
      </div>
      {onComplete ? (
        <button
          type="button"
          onClick={onComplete}
          className={cn(
            "mt-3 inline-flex items-center gap-1.5 text-xs font-semibold transition-colors",
            completed ? "text-emerald-600" : "text-primary hover:text-primary/80",
          )}
        >
          {completed ? "✓ Completed" : "Mark completed"}
        </button>
      ) : null}
    </div>
  );
}

/* ── DeviceStatusCard ────────────────────────────────────────────────────── */

export function DeviceStatusCard({
  deviceName,
  online,
  battery,
  lastSync,
  metrics,
  onView,
  className,
}: {
  deviceName: string;
  online: boolean;
  battery?: number | null;
  lastSync?: string;
  metrics: Array<{ label: string; value: string }>;
  onView?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border/60 bg-card p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", online ? "bg-emerald-500" : "bg-muted-foreground/40")} />
          <p className="text-sm font-bold text-foreground truncate">{deviceName}</p>
        </div>
        <span className={cn("text-[10px] font-semibold uppercase tracking-wide", online ? "text-emerald-600" : "text-muted-foreground")}>
          {online ? "Online" : "Offline"}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
        {battery != null ? (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Battery</p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-foreground">{battery}%</p>
          </div>
        ) : null}
        {lastSync ? (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Last Sync</p>
            <p className="mt-0.5 text-sm font-bold text-foreground">{lastSync}</p>
          </div>
        ) : null}
        {metrics.map((m) => (
          <div key={m.label}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{m.label}</p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-foreground">{m.value}</p>
          </div>
        ))}
      </div>
      {onView ? (
        <button type="button" onClick={onView} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
          View device <ChevronRight className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}

/* ── FilterChip ──────────────────────────────────────────────────────────── */

export function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
      )}
    >
      {label}
      {count != null ? <span className={cn("tabular-nums", active ? "text-background/70" : "text-muted-foreground/60")}>{count}</span> : null}
    </button>
  );
}

/* ── TimelineItem ────────────────────────────────────────────────────────── */

export function TimelineItem({
  time,
  title,
  detail,
  status,
}: {
  time: string;
  title: string;
  detail?: string;
  status: "completed" | "upcoming" | "suggested";
}) {
  const dotColor =
    status === "completed" ? "bg-emerald-500" :
    status === "upcoming" ? "bg-sky-500" :
    "bg-muted-foreground/40";
  const statusLabel =
    status === "completed" ? "Completed" :
    status === "upcoming" ? "Upcoming" :
    "Suggested";
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="flex flex-col items-center">
        <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", dotColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <span className="shrink-0 text-xs font-bold tabular-nums text-muted-foreground">{time}</span>
        </div>
        {detail ? <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p> : null}
        <span className={cn("mt-1 inline-block text-[10px] font-semibold uppercase tracking-wide",
          status === "completed" ? "text-emerald-600" : status === "upcoming" ? "text-sky-600" : "text-muted-foreground")}>
          {statusLabel}
        </span>
      </div>
    </div>
  );
}

/* ── ClickableRow ────────────────────────────────────────────────────────── */

export function ClickableRow({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3.5 transition-all hover:border-foreground/20 hover:shadow-sm",
        className,
      )}
    >
      {children}
      <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
