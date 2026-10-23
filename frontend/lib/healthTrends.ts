import type { TrendRange } from "@/components/patients/healthAnalysisParts";

type VitalTrendReading = {
  timestamp: string;
  heart_rate_bpm: number | null;
  spo2: number | null;
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
  distance_m: number | null;
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
  return { day: 24, week: 168, month: 720, year: 8760, all: null }[range];
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
    distance_m: null,
  };
  map.set(base.key, next);
  return next;
}

export function buildTrendSeries(
  vitals: VitalTrendReading[],
  imuRows: ImuTelemetryRow[],
  range: TrendRange,
  now = Date.now(),
): TrendPoint[] {
  const hours = rangeHours(range);
  const cutoff = hours == null ? 0 : now - hours * 60 * 60 * 1000;
  const buckets = new Map<string, TrendBucket>();

  for (const row of vitals) {
    const time = new Date(row.timestamp).getTime();
    if (!Number.isFinite(time) || time < cutoff || time > now) continue;
    const bucket = upsertBucket(buckets, new Date(time), range);
    if (row.heart_rate_bpm != null && Number.isFinite(row.heart_rate_bpm)) {
      bucket.heartRateTotal += row.heart_rate_bpm;
      bucket.heartRateCount += 1;
    }
    if (row.spo2 != null && Number.isFinite(row.spo2)) {
      bucket.spo2Total += row.spo2;
      bucket.spo2Count += 1;
    }
  }

  for (const row of imuRows) {
    const rawTime = row.timestamp;
    if (!rawTime) continue;
    const time = new Date(rawTime).getTime();
    if (!Number.isFinite(time) || time < cutoff || time > now) continue;
    const distance = row.motion?.distance_m;
    if (distance == null || !Number.isFinite(distance) || distance < 0) continue;
    const bucket = upsertBucket(buckets, new Date(time), range);
    bucket.distance_m = Math.max(bucket.distance_m ?? 0, distance);
  }

  const points: TrendPoint[] = [...buckets.values()]
    .sort((left, right) => left.time - right.time)
    .map((bucket) => {
      const heartRate =
        bucket.heartRateCount > 0 ? Math.round(bucket.heartRateTotal / bucket.heartRateCount) : null;
      const spo2 = bucket.spo2Count > 0 ? Math.round(bucket.spo2Total / bucket.spo2Count) : null;
      const distance = bucket.distance_m != null ? Math.round(bucket.distance_m) : null;
      return {
        key: bucket.key,
        label: bucket.label,
        time: bucket.time,
        heart_rate_bpm: heartRate,
        spo2,
        // History does not supply calories; never estimate clinical activity from heart-rate samples.
        calories_kcal: null,
        distance_m: distance,
      };
    });
  return points.flatMap((point, index) => {
    if (!index) return [point];
    const next = new Date(points[index - 1].time);
    if (range === "day") next.setHours(next.getHours() + 1);
    else if (range === "year" || range === "all") next.setMonth(next.getMonth() + 1);
    else next.setDate(next.getDate() + 1);
    if (point.time <= next.getTime()) return [point];
    return [{ key: next.toISOString(), label: bucketFor(next, range).label, time: next.getTime(), heart_rate_bpm: null, spo2: null, distance_m: null, calories_kcal: null }, point];
  });
}

