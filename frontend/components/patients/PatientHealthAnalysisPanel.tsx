"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import type { PatientHealthAnalysis } from "@/lib/patientHealthAnalysis";
import { cn } from "@/lib/utils";
import {
  AnomalyInsightCard,
  HealthBaselineRow,
  HealthTrendsWorkspace,
  OptimizeHealthPlanSection,
  RiskFactorsTable,
  TREND_RANGE_OPTIONS,
  type TrendRange,
} from "@/components/patients/healthAnalysisParts";
import { AdlAnalysisCard } from "@/components/patients/AdlAnalysisCard";

/* ── helpers ─────────────────────────────────────────────────────────────── */

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
      <AdlAnalysisCard patientId={patientId} />
      <HealthBaselineRow data={data} />
      <HealthTrendsWorkspace
        trendRange={trendRange}
        onTrendRangeChange={setTrendRange}
        trendSeries={trendSeries}
      />
      {!compact && (
        <>
          <RiskFactorsTable riskFactors={data.risk_factors} />
          <OptimizeHealthPlanSection recommendations={data.recommendations} />
        </>
      )}
    </div>
  );
}
