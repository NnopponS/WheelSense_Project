"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import type { PatientHealthAnalysis } from "@/lib/patientHealthAnalysis";
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
      <DataState kind={query.isError ? "error" : "empty"} title={t("patient.health.notAvailable")}
        actionLabel={t("redesign.retry")} onAction={() => void query.refetch()} className={className} />
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <AnomalyInsightCard
        data={data}
        aiProvider={aiProvider}
        aiModel={aiModel}
        aiConfigured={aiConfigured}
        isRefreshing={isRefreshing}
        isFetching={query.isFetching}
        onRefresh={() => void refreshAnalysis()}
      />
      <HealthBaselineRow data={data} />
      {(vitalsTrendQuery.isError || imuTrendQuery.isError) ? <DataState kind="error" title={t("redesign.unavailable")} actionLabel={t("redesign.retry")} onAction={() => void refreshAnalysis()} /> : null}
      <HealthTrendsWorkspace
        trendRange={trendRange}
        onTrendRangeChange={setTrendRange}
        trendSeries={trendSeries}
      />
      <AdlAnalysisCard patientId={patientId} />
      {!compact && (
        <>
          <RiskFactorsTable riskFactors={data.risk_factors} />
          <OptimizeHealthPlanSection recommendations={data.recommendations} />
        </>
      )}
    </div>
  );
}
