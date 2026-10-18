import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { HealthBaselineRow, HealthTrendsWorkspace, type TrendPoint } from "./healthAnalysisParts";
import type { PatientHealthAnalysis } from "@/lib/patientHealthAnalysis";

jest.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Line: () => null,
}));

const points: TrendPoint[] = [
  {
    key: "1",
    label: "10:00",
    time: 1,
    heart_rate_bpm: 88,
    spo2: 97,
    calories_kcal: 120,
    distance_m: 20,
  },
];

describe("HealthTrendsWorkspace", () => {
  it("renders one selected chart and switches metrics", () => {
    render(
      <I18nProvider>
        <HealthTrendsWorkspace trendRange="day" onTrendRangeChange={jest.fn()} trendSeries={points} />
      </I18nProvider>,
    );

    expect(screen.getAllByTestId("line-chart")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Heart Rate" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "SpO2" }));

    expect(screen.getAllByTestId("line-chart")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "SpO2" })).toHaveAttribute("aria-pressed", "true");
  });
});

it("does not describe missing observations as normal or aggregates as live", () => {
  const data: PatientHealthAnalysis = {
    patient_id: 1, generated_at: "2026-10-18T10:00:00Z", window_hours: 24,
    overall_score: 0, risk_level: "normal", data_quality: "insufficient",
    latest_vitals: {}, baseline: { heart_rate_bpm: { value: 115.7, unit: "bpm", status: "info", trend: "unknown" } },
    trend_summary: "No recent readings", risk_factors: [], recommendations: [],
    activity: { steps: null, distance_m: null, calories_kcal: null, polar_connected: false, source: "imu" },
  };
  render(<I18nProvider><HealthBaselineRow data={data} /></I18nProvider>);
  expect(screen.queryByText("Live")).not.toBeInTheDocument();
  expect(screen.queryByText("Normal", { exact: true })).not.toBeInTheDocument();
  expect(screen.getByText("Recorded baseline")).toBeInTheDocument();
});
