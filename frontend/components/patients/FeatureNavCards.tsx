"use client";

import { Activity, AlertTriangle, ClipboardCheck, HeartPulse, Phone, Siren } from "lucide-react";
import type { HealthRiskLevel } from "@/lib/patientHealthAnalysis";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type FeatureCardProps = {
  title: string;
  subtitle: string;
  icon: typeof HeartPulse;
  accent: "blue" | "red" | "green" | "emergency";
  targetId: string;
  status?: string;
  statusTone?: "neutral" | "warning" | "critical" | "success";
  children?: React.ReactNode;
};

const ACCENT_STYLES: Record<FeatureCardProps["accent"], { ring: string; iconBg: string; iconText: string }> = {
  blue: { ring: "hover:border-primary/40", iconBg: "bg-primary/10", iconText: "text-primary" },
  red: { ring: "hover:border-critical", iconBg: "bg-critical-bg", iconText: "text-critical" },
  green: { ring: "hover:border-success", iconBg: "bg-success-bg", iconText: "text-success" },
  emergency: { ring: "hover:border-critical", iconBg: "bg-critical-bg", iconText: "text-critical" },
};

const STATUS_STYLES: Record<NonNullable<FeatureCardProps["statusTone"]>, string> = {
  neutral: "bg-surface-container-high text-foreground-variant",
  warning: "bg-warning-bg text-warning-foreground",
  critical: "bg-critical-bg text-critical-foreground",
  success: "bg-success-bg text-success-foreground",
};

function FeatureCard({ title, subtitle, icon: Icon, accent, targetId, status, statusTone = "neutral", children }: FeatureCardProps) {
  const accentStyle = ACCENT_STYLES[accent];
  return (
    <button
      type="button"
      onClick={() => {
        const el = document.getElementById(targetId);
        if (el) el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      }}
      className={cn(
        "group flex min-h-11 w-full flex-col gap-1 rounded-lg px-3 py-3 text-left transition-colors hover:bg-muted sm:gap-2",
        accentStyle.ring,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9", accentStyle.iconBg)}>
          <Icon className={cn("h-4.5 w-4.5", accentStyle.iconText)} aria-hidden />
        </div>
        {status && (
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold uppercase", STATUS_STYLES[statusTone])}>
            {status}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-tight text-foreground">{title}</p>
        <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">{subtitle}</p>
      </div>
      {children ? <div className="hidden sm:block">{children}</div> : null}
    </button>
  );
}

export function FeatureNavCards({
  riskLevel,
  riskFactorCount,
  recommendationCount,
  hasEmergencyContact,
  severeAnomalyActive,
  className,
}: {
  riskLevel: HealthRiskLevel | null;
  riskFactorCount: number;
  recommendationCount: number;
  hasEmergencyContact: boolean;
  severeAnomalyActive: boolean;
  className?: string;
}) {
  const { t } = useTranslation();

  const anomalyStatus =
    riskLevel === "critical" ? t("patient.health.risk.high")
      : riskLevel === "warning" ? t("patient.health.risk.moderate")
        : riskLevel === "watch" ? t("patient.health.risk.watch")
          : riskLevel == null ? t("redesign.noRisk") : t("patient.health.risk.normal");
  const anomalyTone: FeatureCardProps["statusTone"] =
    riskLevel === "critical" ? "critical"
      : riskLevel === "warning" ? "warning"
        : riskLevel === "watch" ? "neutral"
          : riskLevel == null ? "neutral" : "success";

  const emergencyStatus = severeAnomalyActive
    ? t("patient.feature.criticalCondition")
    : hasEmergencyContact ? t("patients.statusActive") : t("patient.feature.noContact");
  const emergencyTone: FeatureCardProps["statusTone"] = severeAnomalyActive
    ? "critical"
    : hasEmergencyContact ? "success" : "warning";

  return (
    <div className={cn("grid grid-cols-2 gap-1 border-b border-border pb-3 lg:grid-cols-4", className)}>
      {/* Health Profile — blue */}
      <FeatureCard
        title={t("patient.feature.healthProfile")}
        subtitle={t("patient.feature.healthProfileSub")}
        icon={HeartPulse}
        accent="blue"
        targetId="health-profile"
        status={t("patient.health.baselineTitle")}
        statusTone="neutral"
      />

      {/* Predicting Anomaly — red when active */}
      <FeatureCard
        title={t("patient.feature.predictingAnomaly")}
        subtitle={t("patient.feature.predictingAnomalySub")}
        icon={AlertTriangle}
        accent={riskLevel === "critical" ? "red" : "blue"}
        targetId="predicting-anomaly"
        status={anomalyStatus}
        statusTone={anomalyTone}
      >
        {riskFactorCount > 0 && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Activity className="h-3 w-3" aria-hidden />
            {riskFactorCount} {t("patient.health.riskFactors").toLowerCase()}
          </p>
        )}
      </FeatureCard>

      {/* Optimize Daily Health Plan — green */}
      <FeatureCard
        title={t("patient.feature.optimizePlan")}
        subtitle={t("patient.feature.optimizePlanSub")}
        icon={ClipboardCheck}
        accent="green"
        targetId="optimize-health-plan"
        status={recommendationCount > 0 ? String(recommendationCount) : "—"}
        statusTone={recommendationCount > 0 ? "success" : "neutral"}
      />

      {/* Emergency Alert — red */}
      <FeatureCard
        title={t("patient.feature.emergencyAlert")}
        subtitle={t("patient.feature.emergencyAlertSub")}
        icon={Siren}
        accent={severeAnomalyActive ? "emergency" : "blue"}
        targetId="emergency-alert"
        status={emergencyStatus}
        statusTone={emergencyTone}
      >
        {!hasEmergencyContact && (
          <p className="flex items-center gap-1 text-xs text-warning">
            <Phone className="h-3 w-3" aria-hidden />
            {t("patient.feature.addContact")}
          </p>
        )}
      </FeatureCard>
    </div>
  );
}
