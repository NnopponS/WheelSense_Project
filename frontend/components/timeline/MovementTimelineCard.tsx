"use client";

import { useMemo } from "react";
import { Footprints, MapPin, Route } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { TimelineEventOut } from "@/lib/api/task-scope-types";
import { useTranslation } from "@/lib/i18n";

type TimelineEventLike = Partial<TimelineEventOut> & {
  id?: number | string;
  timestamp?: string | null;
  event_type?: string | null;
  room_id?: number | null;
  room_name?: string | null;
  description?: string | null;
  data?: Record<string, unknown> | null;
  source?: string | null;
  provenance?: string | null;
};

type MovementTimelineCardProps = {
  events: TimelineEventLike[];
  patientName?: string | null;
  patientMeta?: string | null;
  roomLabel?: string | null;
  limit?: number;
  compact?: boolean;
  embedded?: boolean;
  className?: string;
};

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function eventTimestampMs(event: TimelineEventLike): number {
  if (!event.timestamp) return 0;
  const ms = Date.parse(event.timestamp);
  return Number.isFinite(ms) ? ms : 0;
}

function eventTimeLabel(event: TimelineEventLike): string {
  if (!event.timestamp) return "--:--";
  const date = new Date(event.timestamp);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function prettyEventType(value: string | null | undefined): string {
  const raw = (value || "activity").trim();
  if (!raw) return "Activity";
  return raw
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function eventLocation(event: TimelineEventLike): string {
  const data = event.data ?? {};
  const roomName =
    event.room_name ||
    (typeof data.room_name === "string" ? data.room_name : "") ||
    (typeof data.predicted_room_name === "string" ? data.predicted_room_name : "");
  if (roomName.trim()) return roomName.trim();
  if (event.room_id != null) return `Room ${event.room_id}`;
  if (event.description?.trim()) return event.description.trim();
  return prettyEventType(event.event_type);
}

function eventDistance(event: TimelineEventLike): number {
  const data = event.data ?? {};
  return (
    asNumber(data.distance_m) ??
    asNumber(data.distance_meters) ??
    asNumber(data.distance) ??
    0
  );
}

type GeometryPoint = {
  key: string;
  x: number;
  y: number;
  label: string;
  time: string;
};

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = asNumber(value);
    if (parsed != null) return parsed;
  }
  return null;
}

function normalizeMapCoordinate(value: number, size: number | null): number {
  if (value >= 0 && value <= 1) return value * 100;
  if (size && size > 100 && value > 100) return Math.min(100, Math.max(0, (value / size) * 100));
  return Math.min(100, Math.max(0, value));
}

function eventGeometryPoint(event: TimelineEventLike, index: number): GeometryPoint | null {
  const data = event.data ?? {};
  const x = firstNumber(
    data.x,
    data.map_x,
    data.floorplan_x,
    data.position_x,
    data.coordinate_x,
    data.normalized_x,
  );
  const y = firstNumber(
    data.y,
    data.map_y,
    data.floorplan_y,
    data.position_y,
    data.coordinate_y,
    data.normalized_y,
  );
  if (x == null || y == null) return null;

  const width = firstNumber(data.map_width, data.floorplan_width, data.width);
  const height = firstNumber(data.map_height, data.floorplan_height, data.height);
  return {
    key: `${event.id ?? index}-${event.timestamp ?? index}`,
    x: normalizeMapCoordinate(x, width),
    y: normalizeMapCoordinate(y, height),
    label: eventLocation(event),
    time: eventTimeLabel(event),
  };
}

function eventSourceLabel(event: TimelineEventLike): string {
  const data = event.data ?? {};
  return (
    event.provenance ||
    event.source ||
    (typeof data.source === "string" ? data.source : "") ||
    (typeof data.provenance === "string" ? data.provenance : "") ||
    (typeof data.provider === "string" ? data.provider : "") ||
    (typeof data.tool_name === "string" ? data.tool_name : "") ||
    "Source not reported"
  );
}

function markerTone(index: number): string {
  const tones = [
    "bg-primary text-primary-foreground",
    "bg-emerald-500 text-white",
    "bg-amber-500 text-white",
    "bg-sky-500 text-white",
    "bg-violet-500 text-white",
  ];
  return tones[index % tones.length] ?? tones[0];
}

export function MovementTimelineCard({
  events,
  patientName,
  patientMeta,
  roomLabel,
  limit = 8,
  compact = false,
  embedded = false,
  className,
}: MovementTimelineCardProps) {
  const { t } = useTranslation();
  const sortedEvents = useMemo(() => {
    return [...events]
      .filter((event) => Boolean(event.timestamp || event.description || event.event_type))
      .sort((left, right) => eventTimestampMs(left) - eventTimestampMs(right))
      .slice(-limit);
  }, [events, limit]);

  const totalDistance = useMemo(
    () => sortedEvents.reduce((sum, event) => sum + eventDistance(event), 0),
    [sortedEvents],
  );
  const geometryPoints = useMemo(
    () => sortedEvents.map((event, index) => eventGeometryPoint(event, index)).filter(Boolean) as GeometryPoint[],
    [sortedEvents],
  );

  const latest = sortedEvents[sortedEvents.length - 1] ?? null;
  const title = roomLabel?.trim()
    ? `${t("timeline.movementHistory")} - ${roomLabel.trim()}`
    : t("timeline.movementHistory");
  const shellClass = embedded
    ? "rounded-xl border border-outline-variant/25 bg-surface/70"
    : "rounded-2xl border border-outline-variant/25 bg-surface shadow-sm";

  return (
    <section id="timeline" className={cn(shellClass, compact ? "p-3" : "p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <MapPin className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 className={cn("font-semibold text-foreground", compact ? "text-sm" : "text-base")}>{title}</h3>
              {patientName ? (
                <p className="truncate text-sm font-medium text-foreground">{patientName}</p>
              ) : null}
              {patientMeta ? (
                <p className="truncate text-xs text-muted-foreground">{patientMeta}</p>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-start gap-1 text-xs text-muted-foreground sm:items-end">
          <span>{latest?.timestamp ? formatDateTime(latest.timestamp) : t("timeline.noTimestamp")}</span>
          <Badge variant="outline" className="rounded-full">
            {t("timeline.latestEvents")} {sortedEvents.length}
          </Badge>
        </div>
      </div>

      {sortedEvents.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-outline-variant/40 bg-muted/20 p-4 text-sm text-muted-foreground">
          {t("timeline.movementEmpty")}
        </div>
      ) : (
        <div className={cn("mt-4 grid gap-4", !compact && geometryPoints.length > 0 ? "lg:grid-cols-[0.95fr_1.05fr]" : "grid-cols-1")}>
          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low/45 p-3">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Route className="h-4 w-4 text-primary" />
              {t("timeline.movementTitle")}
            </div>
            <ol className="space-y-0">
              {sortedEvents.map((event, index) => (
                <li key={`${event.id ?? index}-${event.timestamp ?? index}`} className="grid grid-cols-[3rem_1rem_minmax(0,1fr)] gap-3">
                  <time className="pt-0.5 text-xs tabular-nums text-muted-foreground">{eventTimeLabel(event)}</time>
                  <div className="flex flex-col items-center">
                    <span className={cn("mt-0.5 h-3 w-3 rounded-full ring-4 ring-surface", markerTone(index))} />
                    {index < sortedEvents.length - 1 ? <span className="h-9 w-0.5 bg-primary/30" /> : null}
                  </div>
                  <div className="min-w-0 pb-3">
                    <p className="truncate text-sm font-medium text-foreground">{eventLocation(event)}</p>
                    <p className="truncate text-xs text-muted-foreground">{prettyEventType(event.event_type)}</p>
                    <p className="truncate text-[11px] text-muted-foreground/80">
                      {t("timeline.provenance")}: {eventSourceLabel(event)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-sm font-semibold text-foreground">
              <Footprints className="h-4 w-4 text-primary" />
              <span>{t("timeline.totalDistance")}:</span>
              <span className="tabular-nums">
                {totalDistance > 0
                  ? `${Math.round(totalDistance)} ${t("timeline.meters")}`
                  : t("timeline.notReported")}
              </span>
            </div>
          </div>

          {!compact && geometryPoints.length > 0 ? (
            <div className="relative min-h-64 overflow-hidden rounded-xl border border-outline-variant/20 bg-[linear-gradient(135deg,rgba(248,250,252,0.96),rgba(239,246,255,0.96))] p-4">
              <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(to_right,rgba(100,116,139,0.16)_1px,transparent_1px),linear-gradient(to_bottom,rgba(100,116,139,0.16)_1px,transparent_1px)] [background-size:64px_54px]" />
              <div className="relative h-full min-h-56">
                <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                  {geometryPoints.length > 1 ? (
                    <polyline
                      points={geometryPoints.map((point) => `${point.x},${point.y}`).join(" ")}
                      vectorEffect="non-scaling-stroke"
                      fill="none"
                      stroke="currentColor"
                      strokeDasharray="5 5"
                      strokeWidth="2"
                      className="text-primary/70"
                    />
                  ) : null}
                </svg>
                {geometryPoints.map((point, index) => (
                  <div
                    key={point.key}
                    className={cn(
                      "absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-semibold shadow-md ring-4 ring-white/80",
                      markerTone(index),
                    )}
                    style={{ left: `${point.x}%`, top: `${point.y}%` }}
                    aria-label={`${point.time} ${point.label}`}
                    title={`${point.time} - ${point.label}`}
                  >
                    {index + 1}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
