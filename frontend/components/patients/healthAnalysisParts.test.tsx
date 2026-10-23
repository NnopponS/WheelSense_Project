import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { AnomalyInsightCard, HealthBaselineRow, HealthTrendsWorkspace, type TrendPoint } from "./healthAnalysisParts";
import type { PatientHealthAnalysis } from "@/lib/patientHealthAnalysis";

jest.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Line: ({dot}:{dot:boolean|object}) => <span data-testid="series-line" data-points={String(Boolean(dot))} />,
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
  it("keeps range controls and recorded values available on a theme-aware surface",()=>{
    const onChange=jest.fn();
    const {container}=render(<I18nProvider><HealthTrendsWorkspace trendRange="week" onTrendRangeChange={onChange} trendSeries={points}/></I18nProvider>);
    expect(container.querySelector("#health-trends")).not.toHaveClass("ws-insight");
    fireEvent.click(screen.getByRole("button",{name:"Month"}));
    expect(onChange).toHaveBeenCalledWith("month");
    expect(screen.getByText("View recorded values")).toBeInTheDocument();
  });
  it("renders one selected chart and switches metrics", () => {
    render(
      <I18nProvider>
        <HealthTrendsWorkspace trendRange="day" onTrendRangeChange={jest.fn()} trendSeries={points} />
      </I18nProvider>,
    );

    expect(screen.getAllByTestId("line-chart")).toHaveLength(1);
    expect(screen.getByTestId("series-line")).toHaveAttribute("data-points","true");
    expect(screen.getByRole("button", { name: "Heart Rate" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "SpO2" }));

    expect(screen.getAllByTestId("line-chart")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "SpO2" })).toHaveAttribute("aria-pressed", "true");
  });
});

const analysis:PatientHealthAnalysis={patient_id:1,generated_at:"2026-10-18T10:00:00Z",window_hours:24,overall_score:42,risk_level:"watch",data_quality:"partial",latest_vitals:{},baseline:{},trend_summary:"Full recorded summary that should stay available through expansion.",risk_factors:[{label:"Low movement",severity:"watch",evidence:"Recorded distance: 0 m",source:"imu"},{label:"Concern two",severity:"info",evidence:"Second evidence",source:"vitals"},{label:"Concern three",severity:"warning",evidence:"Third evidence",source:"timeline"}],recommendations:[],activity:{steps:null,distance_m:0,calories_kcal:null,polar_connected:false,source:"imu"}};
const anomalyProps={aiProvider:"ollama",aiModel:"recorded-model",aiConfigured:true,isRefreshing:false,isFetching:false,onRefresh:jest.fn()};
it.each(["normal","watch","warning","critical"] as const)("shows reported %s severity visually while preserving full evidence",risk_level=>{
 const {container}=render(<I18nProvider><AnomalyInsightCard {...anomalyProps} data={{...analysis,risk_level}}/></I18nProvider>);
 expect(screen.getByRole("img",{name:/Reported severity/})).toBeInTheDocument();
 const details=container.querySelector("#predicting-anomaly details")!;
 expect(details).not.toHaveAttribute("open");
 expect(details).toHaveTextContent(analysis.trend_summary);
 expect(details).toHaveTextContent("Third evidence");
 expect(screen.queryByRole("heading",{name:analysis.trend_summary})).not.toBeInTheDocument();
 fireEvent.click(screen.getByText("Analysis details"));
 expect(details).toHaveTextContent("recorded-model");
 fireEvent.click(screen.getByRole("button",{name:"Refresh AI"}));
 expect(anomalyProps.onRefresh).toHaveBeenCalled();
});
it("does not imply normal severity when data is insufficient and keeps refresh disabled",()=>{
 render(<I18nProvider><AnomalyInsightCard {...anomalyProps} isFetching data={{...analysis,data_quality:"insufficient",risk_level:"normal",risk_factors:[]}}/></I18nProvider>);
 expect(screen.queryByRole("img",{name:/Reported severity: Normal/})).not.toBeInTheDocument();
 expect(screen.getByRole("img",{name:/Insufficient/})).toBeInTheDocument();
 expect(screen.getByRole("button",{name:/Refreshing/})).toBeDisabled();
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
