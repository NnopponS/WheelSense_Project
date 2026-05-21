export type HealthRiskLevel = "normal" | "watch" | "warning" | "critical";
export type HealthRiskSeverity = "info" | "watch" | "warning" | "critical";
export type HealthDataQuality = "complete" | "partial" | "insufficient";

export type HealthMetricSummary = {
  value: number | null;
  unit: string;
  status: HealthRiskSeverity;
  trend: "up" | "down" | "stable" | "unknown";
};

export type ActivitySummary = {
  steps: number | null;
  distance_m: number | null;
  calories_kcal: number | null;
  polar_connected: boolean;
  source: "mobile" | "imu" | "mobile+imu" | "none";
};

export type PatientHealthAnalysis = {
  patient_id: number;
  generated_at: string;
  window_hours: number;
  overall_score: number;
  risk_level: HealthRiskLevel;
  data_quality: HealthDataQuality;
  latest_vitals: Record<string, HealthMetricSummary>;
  baseline: Record<string, HealthMetricSummary>;
  trend_summary: string;
  risk_factors: Array<{
    label: string;
    severity: HealthRiskSeverity;
    evidence: string;
    source: string;
  }>;
  recommendations: Array<{
    title: string;
    priority: HealthRiskSeverity;
    rationale: string;
    suggested_action: string;
  }>;
  activity: ActivitySummary;
};

