"use client";

import { useMemo, type ComponentType } from "react";
import { useQuery } from "@/hooks/useQuery";
import { useFixedNowMs } from "@/hooks/useFixedNowMs";
import type { Device, VitalReading } from "@/lib/types";
import { AlertTriangle, LocateFixed, Signal, Tablet } from "lucide-react";

type RoomPrediction = {
  device_id: string;
  timestamp: string | null;
  predicted_room_id: number | null;
  predicted_room_name: string | null;
  confidence: number | null;
};

type AlertLite = {
  id: number;
  device_id: string | null;
  severity: "info" | "warning" | "critical";
};

export default function ObserverDevicesPage() {
  const nowMs = useFixedNowMs();
  const { data: devices, isLoading } = useQuery<Device[]>("/devices");
  const { data: predictions } = useQuery<RoomPrediction[]>(
    "/localization/predictions?limit=120",
  );
  const { data: activeAlerts } = useQuery<AlertLite[]>("/alerts?status=active&limit=120");
  const { data: vitals } = useQuery<VitalReading[]>("/vitals/readings?limit=200");

  const deviceList = devices ?? [];
  const alertsList = activeAlerts ?? [];
  const latestPredictionByDevice = useMemo(() => {
    const latest = new Map<string, RoomPrediction>();
    for (const prediction of predictions ?? []) {
      if (!latest.has(prediction.device_id)) {
        latest.set(prediction.device_id, prediction);
      }
    }
    return latest;
  }, [predictions]);
  const onlineCutoffMs = 5 * 60 * 1000;
  const onlineCount = deviceList.filter((device) => {
    if (!device.last_seen) return false;
    return nowMs - new Date(device.last_seen).getTime() <= onlineCutoffMs;
  }).length;
  const offlineCount = deviceList.length - onlineCount;
  const latestVitalByDevice = useMemo(() => {
    const m = new Map<string, VitalReading>();
    for (const v of vitals ?? []) {
      if (!m.has(v.device_id)) m.set(v.device_id, v);
    }
    return m;
  }, [vitals]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-on-surface">Device status</h2>
        <p className="text-sm text-on-surface-variant mt-1">
          Connectivity, latest room prediction, and active alert load by device.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Summary icon={Tablet} label="Total devices" value={deviceList.length} />
        <Summary icon={Signal} label="Online now" value={onlineCount} />
        <Summary icon={AlertTriangle} label="Offline or stale" value={offlineCount} />
      </div>

      {deviceList.length === 0 ? (
        <div className="surface-card p-6 text-center text-on-surface-variant text-sm">
          No devices are registered in this workspace.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {deviceList.map((device) => {
            const prediction = latestPredictionByDevice.get(device.device_id);
            const seenAtMs = device.last_seen ? new Date(device.last_seen).getTime() : null;
            const minutesAgo =
              seenAtMs == null ? null : Math.floor((nowMs - seenAtMs) / 60000);
            const isOnline = minutesAgo != null && minutesAgo <= 5;
            const alertCount = alertsList.filter(
              (alert) => alert.device_id === device.device_id,
            ).length;

            return (
              <article key={device.id} className="surface-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-on-surface truncate">
                      {device.device_id}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      {device.hardware_type}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                      isOnline ? "bg-success-bg text-success" : "bg-critical-bg text-critical"
                    }`}
                  >
                    {isOnline ? "Online" : "Offline"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
                  <DataPoint
                    label="Last seen"
                    value={
                      minutesAgo == null
                        ? "Never"
                        : `${minutesAgo} min ago`
                    }
                  />
                  <DataPoint label="Active alerts" value={alertCount} />
                </div>

                <div className="mt-2 rounded-lg bg-surface-container-low px-3 py-2 text-xs">
                  {device.hardware_type === "polar_sense" ? (
                    <p className="text-on-surface-variant">
                      Polar battery:{" "}
                      <span className="text-on-surface font-medium">
                        {latestVitalByDevice.get(device.device_id)?.sensor_battery ?? "—"}%
                      </span>
                      {" · "}HR:{" "}
                      <span className="text-on-surface font-medium">
                        {latestVitalByDevice.get(device.device_id)?.heart_rate_bpm ?? "—"}
                      </span>
                    </p>
                  ) : device.hardware_type === "mobile_phone" ? (
                    <p className="text-on-surface-variant">
                      Mobile walk stream:{" "}
                      <span className="text-on-surface font-medium">
                        {isOnline ? "active" : "offline"}
                      </span>
                    </p>
                  ) : (
                    <p className="text-on-surface-variant">
                      Sensor stream:{" "}
                      <span className="text-on-surface font-medium">
                        {isOnline ? "healthy" : "stale"}
                      </span>
                    </p>
                  )}
                </div>

                <div className="mt-4 rounded-lg bg-surface-container-low px-3 py-2.5">
                  <p className="text-xs text-on-surface-variant flex items-center gap-1.5">
                    <LocateFixed className="w-3.5 h-3.5" />
                    Latest predicted location
                  </p>
                  <p className="text-sm text-on-surface mt-1">
                    {prediction?.predicted_room_name || "No prediction"}
                  </p>
                  <p className="text-[11px] text-on-surface-variant mt-1">
                    {prediction?.confidence != null
                      ? `Confidence ${Math.round(prediction.confidence * 100)}%`
                      : "Confidence unavailable"}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Summary({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="surface-card p-4">
      <p className="text-sm text-on-surface-variant flex items-center gap-2">
        <Icon className="w-4 h-4" />
        {label}
      </p>
      <p className="text-2xl font-bold text-on-surface mt-2">{value}</p>
    </div>
  );
}

function DataPoint({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-on-surface-variant">{label}</p>
      <p className="text-sm font-semibold text-on-surface mt-0.5">{value}</p>
    </div>
  );
}
