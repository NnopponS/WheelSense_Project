"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import type { PatientHealthAnalysis, PatientHealthView } from "@/lib/patientHealthAnalysis";
import { buildTrendSeries } from "@/lib/healthTrends";
import { DataState } from "@/components/layout/DataState";
import { cn } from "@/lib/utils";
import {
  AnomalyInsightCard,
  HealthBaselineRow,
  HealthTrendsWorkspace,
  OptimizeHealthPlanSection,
  RiskFactorsTable,
  type TrendRange,
} from "@/components/patients/healthAnalysisParts";
import { AdlAnalysisCard } from "@/components/patients/AdlAnalysisCard";

const HEALTH_VIEWS: PatientHealthView[] = ["baseline", "anomaly", "plan"];

/* ── helpers ─────────────────────────────────────────────────────────────── */

type AISettingsOut = {
  provider?: "ollama" | "copilot" | "openai" | "openrouter";
  model?: string;
  workspace_default_provider?: "ollama" | "copilot" | "openai" | "openrouter";
  workspace_default_model?: string;
  openai_configured?: boolean;
  openrouter_configured?: boolean;
};

type AIHealthOut = {
  default_provider?: "ollama" | "copilot" | "openai" | "openrouter";
  ollama_configured?: boolean;
  copilot_configured?: boolean;
};

type DeviceAssignmentLike = { device_id: string; device_role: string; is_active: boolean };
/* ── Main export ──────────────────────────────────────────────────────────── */
export function PatientHealthAnalysisPanel({
  patientId,
  compact = false,
  activeView,
  onViewChange,
  className,
}: {
  patientId: number;
  compact?: boolean;
  activeView?: PatientHealthView;
  onViewChange?: (view: PatientHealthView) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const [internalView, setInternalView] = useState<PatientHealthView>("baseline");
  const view = activeView ?? internalView;
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
          api.get<Parameters<typeof buildTrendSeries>[1]>(
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
        (vitalsTrendQuery.data ?? []) as Parameters<typeof buildTrendSeries>[0],
        (imuTrendQuery.data ?? []) as Parameters<typeof buildTrendSeries>[1],
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
        : aiProvider === "openai" || aiProvider === "openrouter"
          ? aiSettingsQuery.data?.[`${aiProvider}_configured`]
          : undefined;
  const viewIndex = HEALTH_VIEWS.indexOf(view);
  const viewTitle = view === "baseline"
    ? t("patient.feature.healthProfile")
    : view === "anomaly"
      ? t("patient.feature.predictingAnomaly")
      : t("patient.feature.optimizePlan");
  const viewSubtitle = view === "baseline"
    ? t("patient.feature.healthProfileSub")
    : view === "anomaly"
      ? t("patient.feature.predictingAnomalySub")
      : t("patient.feature.optimizePlanSub");
  const setView = (next: PatientHealthView) => {
    setInternalView(next);
    onViewChange?.(next);
  };

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
      <div id="patient-health-dashboard" className={cn("scroll-mt-32 space-y-3 rounded-2xl border border-border/60 bg-card p-5", className)}>
        <div className="h-20 animate-pulse rounded-xl bg-muted/50" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/40" />)}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div id="patient-health-dashboard" className="scroll-mt-32">
        <DataState kind={query.isError ? "error" : "empty"} title={t("patient.health.notAvailable")}
          actionLabel={t("redesign.retry")} onAction={() => void query.refetch()} className={className} />
      </div>
    );
  }

  return (
    <section id="patient-health-dashboard" className={cn("scroll-mt-32 space-y-4", className)} aria-roledescription="carousel" aria-label={viewTitle}>
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-3 py-2.5 sm:px-4">
        <div className="min-w-0" aria-live="polite">
          <h2 className="truncate text-sm font-semibold text-foreground">{viewTitle}</h2>
          <p className="text-xs text-muted-foreground">{viewSubtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" size="icon" aria-label={t("calendar.previous")} onClick={() => setView(HEALTH_VIEWS[(viewIndex + HEALTH_VIEWS.length - 1) % HEALTH_VIEWS.length])}>
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <span className="min-w-10 text-center text-xs tabular-nums text-muted-foreground" aria-live="polite">{viewIndex + 1} / {HEALTH_VIEWS.length}</span>
          <Button type="button" variant="outline" size="icon" aria-label={t("calendar.next")} onClick={() => setView(HEALTH_VIEWS[(viewIndex + 1) % HEALTH_VIEWS.length])}>
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </header>
      {(vitalsTrendQuery.isError || imuTrendQuery.isError) ? <DataState kind="error" title={t("redesign.unavailable")} actionLabel={t("redesign.retry")} onAction={() => void refreshAnalysis()} /> : null}
      {view === "anomaly" ? (
        <>
          <AnomalyInsightCard
            data={data}
            aiProvider={aiProvider}
            aiModel={aiModel}
            aiConfigured={aiConfigured}
            isRefreshing={isRefreshing}
            isFetching={query.isFetching}
            onRefresh={() => void refreshAnalysis()}
          />
          {!compact ? <RiskFactorsTable riskFactors={data.risk_factors} /> : null}
        </>
      ) : null}
      {view === "baseline" ? (
        <>
          <HealthBaselineRow data={data} />
          <HealthTrendsWorkspace
            trendRange={trendRange}
            onTrendRangeChange={setTrendRange}
            trendSeries={trendSeries}
          />
        </>
      ) : null}
      {view === "plan" ? (
        <>
          <AdlAnalysisCard patientId={patientId} />
          {!compact ? <OptimizeHealthPlanSection recommendations={data.recommendations} /> : null}
        </>
      ) : null}
    </section>
  );
}
