"use client";

import { Activity, AlertTriangle, HeartPulse, Phone, Siren, Sparkles } from "lucide-react";
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
  red: { ring: "hover:border-red-400", iconBg: "bg-red-50", iconText: "text-red-500" },
  green: { ring: "hover:border-emerald-400", iconBg: "bg-emerald-50", iconText: "text-emerald-600" },
  emergency: { ring: "hover:border-red-500", iconBg: "bg-red-100", iconText: "text-red-600" },
};

const STATUS_STYLES: Record<NonNullable<FeatureCardProps["statusTone"]>, string> = {
  neutral: "bg-surface-container-high text-foreground-variant",
  warning: "bg-amber-100 text-amber-700",
  critical: "bg-red-100 text-red-700",
  success: "bg-emerald-100 text-emerald-700",
};

function FeatureCard({ title, subtitle, icon: Icon, accent, targetId, status, statusTone = "neutral", children }: FeatureCardProps) {
  const accentStyle = ACCENT_STYLES[accent];
  return (
    <button
      type="button"
      onClick={() => {
        const el = document.getElementById(targetId);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
      className={cn(
        "group flex w-full flex-col gap-2 rounded-xl border border-outline-variant/20 bg-card p-4 text-left shadow-sm transition-colors",
        accentStyle.ring,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", accentStyle.iconBg)}>
          <Icon className={cn("h-4.5 w-4.5", accentStyle.iconText)} aria-hidden />
        </div>
        {status && (
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", STATUS_STYLES[statusTone])}>
            {status}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-tight text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {children}
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
          : t("patient.health.risk.normal");
  const anomalyTone: FeatureCardProps["statusTone"] =
    riskLevel === "critical" ? "critical"
      : riskLevel === "warning" ? "warning"
        : riskLevel === "watch" ? "neutral"
          : "success";

  const emergencyStatus = severeAnomalyActive
    ? t("patient.feature.criticalCondition")
    : hasEmergencyContact ? t("patients.statusActive") : t("patient.feature.noContact");
  const emergencyTone: FeatureCardProps["statusTone"] = severeAnomalyActive
    ? "critical"
    : hasEmergencyContact ? "success" : "warning";

  return (
    <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}>
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
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Activity className="h-3 w-3" aria-hidden />
            {riskFactorCount} {t("patient.health.riskFactors").toLowerCase()}
          </p>
        )}
      </FeatureCard>

      {/* Optimize Daily Health Plan — green */}
      <FeatureCard
        title={t("patient.feature.optimizePlan")}
        subtitle={t("patient.feature.optimizePlanSub")}
        icon={Sparkles}
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
          <p className="flex items-center gap-1 text-[11px] text-amber-600">
            <Phone className="h-3 w-3" aria-hidden />
            {t("patient.feature.addContact")}
          </p>
        )}
      </FeatureCard>
    </div>
  );
}
