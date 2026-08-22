# lib/patientHealthAnalysis.ts

- HealthRiskLevel · type · L1-L1 — type HealthRiskLevel = "normal" | "watch" | "warning" | "critical";
- HealthRiskSeverity · type · L2-L2 — type HealthRiskSeverity = "info" | "watch" | "warning" | "critical";
- HealthDataQuality · type · L3-L3 — type HealthDataQuality = "complete" | "partial" | "insufficient";
- HealthMetricSummary · type · L5-L10 — type HealthMetricSummary = { value: number | null; unit: string; status: HealthRiskSeverity; trend: "up" | "down" | "stable" | "unknown"; };
- ActivitySummary · type · L12-L18 — type ActivitySummary = { steps: number | null; distance_m: number | null; calories_kcal: number | null; polar_connected: boolean; source: "mobile" | "imu" | "mobile+imu" | "none"; };
- PatientHealthAnalysis · type · L20-L43 — type PatientHealthAnalysis = { patient_id: number; generated_at: string; window_hours: number; overall_score: number; risk_level: HealthRiskLevel; data_quality: HealthDataQuality; latest_vitals: Record<string, HealthMetricSummary>; baseline: Record<string, HealthMetricSummary>; trend_summary: string; risk_factors: Array<{ label: string; severity: HealthRiskSeverity; evidence: string; source: string; }>; recommendations: Array<{ title: string; priority: HealthRiskSeverity; rationale: string; suggested_action: string; }>; activity: ActivitySummary; };
