import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { HealthTrendsWorkspace, type TrendPoint } from "./healthAnalysisParts";

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
