import { buildTrendSeries } from "./healthTrends";

const now = new Date("2026-10-18T12:00:00Z").getTime();

describe("recorded health trends", () => {
  it("keeps a gap when hours of readings are missing", () => {
    const result = buildTrendSeries([
      { timestamp: "2026-10-18T08:00:00Z", heart_rate_bpm: 70, spo2: 97 },
      { timestamp: "2026-10-18T11:00:00Z", heart_rate_bpm: 80, spo2: 98 },
    ], [], "day", now);
    expect(result.map(point => point.heart_rate_bpm)).toEqual([70, null, 80]);
    expect(result.every(point => point.calories_kcal === null)).toBe(true);
  });

  it("preserves measured zero distance and does not derive calories from motion", () => {
    const result = buildTrendSeries([], [{ timestamp: "2026-10-18T11:00:00Z", motion: { distance_m: 0 } }], "day", now);
    expect(result[0]).toMatchObject({ distance_m: 0, heart_rate_bpm: null, calories_kcal: null });
  });

  it("ignores future, invalid and non-finite measurements", () => {
    const result = buildTrendSeries([
      { timestamp: "invalid", heart_rate_bpm: 90, spo2: 95 },
      { timestamp: "2026-10-19T11:00:00Z", heart_rate_bpm: 90, spo2: 95 },
      { timestamp: "2026-10-18T11:00:00Z", heart_rate_bpm: NaN, spo2: Infinity },
    ], [], "day", now);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ heart_rate_bpm: null, spo2: null });
  });
});
