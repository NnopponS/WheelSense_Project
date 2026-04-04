"use client";

import Link from "next/link";
import { useMemo, type ComponentType } from "react";
import { useQuery } from "@/hooks/useQuery";
import type { Alert, Patient, Room } from "@/lib/types";
import { AlertTriangle, MapPin, Radio, Siren } from "lucide-react";

interface LocalizationPrediction {
  id: number;
  device_id: string;
  timestamp: string | null;
  predicted_room_id: number | null;
  predicted_room_name: string | null;
  confidence: number | null;
  model_type: string;
}

export default function SupervisorEmergencyPage() {
  const { data: alerts } = useQuery<Alert[]>("/alerts");
  const { data: rooms } = useQuery<Room[]>("/rooms");
  const { data: predictions } = useQuery<LocalizationPrediction[]>(
    "/localization/predictions?limit=120",
  );
  const { data: patients } = useQuery<Patient[]>("/patients");

  const patientById = useMemo(
    () => new Map((patients ?? []).map((patient) => [patient.id, patient])),
    [patients],
  );

  const activeCriticalAlerts = useMemo(
    () => (alerts ?? []).filter((alert) => alert.status === "active" && alert.severity === "critical"),
    [alerts],
  );

  const latestPredictionByDevice = useMemo(() => {
    const map = new Map<string, LocalizationPrediction>();
    for (const prediction of predictions ?? []) {
      if (!map.has(prediction.device_id)) {
        map.set(prediction.device_id, prediction);
      }
    }
    return Array.from(map.values());
  }, [predictions]);

  const occupancyByRoom = useMemo(() => {
    const map = new Map<string, { devices: number; avgConfidence: number; latestSeen: string | null }>();
    for (const prediction of latestPredictionByDevice) {
      const roomName = prediction.predicted_room_name ?? "Unknown room";
      const existing = map.get(roomName);
      const confidence = prediction.confidence ?? 0;
      if (!existing) {
        map.set(roomName, {
          devices: 1,
          avgConfidence: confidence,
          latestSeen: prediction.timestamp,
        });
        continue;
      }
      const nextDevices = existing.devices + 1;
      map.set(roomName, {
        devices: nextDevices,
        avgConfidence: (existing.avgConfidence * existing.devices + confidence) / nextDevices,
        latestSeen:
          prediction.timestamp && (!existing.latestSeen || prediction.timestamp > existing.latestSeen)
            ? prediction.timestamp
            : existing.latestSeen,
      });
    }
    return map;
  }, [latestPredictionByDevice]);

  const criticalRooms = useMemo(() => {
    const names = new Set<string>();
    for (const alert of activeCriticalAlerts) {
      const payload = alert.data as Record<string, unknown>;
      const roomName = typeof payload.room_name === "string" ? payload.room_name : null;
      if (roomName) names.add(roomName);
    }
    return names;
  }, [activeCriticalAlerts]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-on-surface">Emergency Monitoring</h2>
        <p className="text-sm text-on-surface-variant mt-1">
          Track room-level risk using active critical alerts and live localization predictions.
        </p>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <EmergencyStat
          icon={Siren}
          label="Active critical alerts"
          value={activeCriticalAlerts.length}
          tone={activeCriticalAlerts.length > 0 ? "critical" : "success"}
        />
        <EmergencyStat
          icon={Radio}
          label="Tracked devices"
          value={latestPredictionByDevice.length}
          tone="info"
        />
        <EmergencyStat
          icon={MapPin}
          label="Rooms with live signals"
          value={occupancyByRoom.size}
          tone="warning"
        />
      </section>

      <section className="surface-card p-5">
        <h3 className="text-sm font-semibold text-on-surface uppercase tracking-wide mb-4">
          Critical Alert Queue
        </h3>
        {activeCriticalAlerts.length === 0 ? (
          <p className="text-sm text-on-surface-variant">
            No active critical alerts at this time.
          </p>
        ) : (
          <div className="space-y-2">
            {activeCriticalAlerts.slice(0, 10).map((alert) => {
              const patient = alert.patient_id ? patientById.get(alert.patient_id) : null;
              const targetHref = alert.patient_id
                ? `/supervisor/patients/${alert.patient_id}`
                : "/supervisor/patients";
              return (
                <Link
                  key={alert.id}
                  href={targetHref}
                  className="block rounded-xl bg-surface-container-low p-4 hover:bg-surface-container transition-smooth"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-on-surface flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-critical shrink-0" />
                        {alert.title}
                      </p>
                      <p className="text-xs text-on-surface-variant mt-1">{alert.description}</p>
                      <p className="text-xs text-on-surface-variant mt-2">
                        {patient
                          ? `${patient.first_name} ${patient.last_name}`
                          : "Patient not linked"}
                        {" · "}
                        {new Date(alert.timestamp).toLocaleString()}
                      </p>
                    </div>
                    <span className="text-xs text-primary font-medium shrink-0">
                      Open patient
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="surface-card p-5">
        <h3 className="text-sm font-semibold text-on-surface uppercase tracking-wide mb-4">
          Floor Coverage by Room
        </h3>
        {rooms && rooms.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {rooms.map((room) => {
              const occupancy = occupancyByRoom.get(room.name);
              const isCritical = criticalRooms.has(room.name);
              return (
                <div
                  key={room.id}
                  className={`rounded-xl border p-4 ${
                    isCritical
                      ? "border-critical/40 bg-critical-bg/40"
                      : "border-outline-variant/30 bg-surface-container-low"
                  }`}
                >
                  <p className="text-sm font-semibold text-on-surface">{room.name}</p>
                  <p className="text-xs text-on-surface-variant mt-1 capitalize">
                    {room.room_type || "room"}
                  </p>
                  <div className="mt-3 space-y-1 text-xs text-on-surface-variant">
                    <p>Localized devices: {occupancy?.devices ?? 0}</p>
                    <p>
                      Avg confidence:{" "}
                      {typeof occupancy?.avgConfidence === "number"
                        ? `${Math.round(occupancy.avgConfidence * 100)}%`
                        : "—"}
                    </p>
                    <p>
                      Last signal:{" "}
                      {occupancy?.latestSeen
                        ? new Date(occupancy.latestSeen).toLocaleTimeString()
                        : "No recent signal"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant">
            No rooms are available for this workspace.
          </p>
        )}
      </section>

      <section className="surface-card p-5">
        <h3 className="text-sm font-semibold text-on-surface uppercase tracking-wide mb-4">
          Live Device Localization Feed
        </h3>
        {latestPredictionByDevice.length === 0 ? (
          <p className="text-sm text-on-surface-variant">
            No localization predictions are currently streaming.
          </p>
        ) : (
          <div className="space-y-2">
            {[...latestPredictionByDevice]
              .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
              .slice(0, 12)
              .map((prediction) => (
                <div
                  key={prediction.device_id}
                  className="rounded-xl bg-surface-container-low p-3 flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-on-surface">{prediction.device_id}</p>
                    <p className="text-xs text-on-surface-variant">
                      {prediction.predicted_room_name ?? "Unknown room"}
                      {" · "}
                      {prediction.timestamp
                        ? new Date(prediction.timestamp).toLocaleTimeString()
                        : "No timestamp"}
                    </p>
                  </div>
                  <span className="text-xs text-on-surface-variant">
                    Confidence{" "}
                    {typeof prediction.confidence === "number"
                      ? `${Math.round(prediction.confidence * 100)}%`
                      : "—"}
                  </span>
                </div>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EmergencyStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: "critical" | "warning" | "success" | "info";
}) {
  const toneClass =
    tone === "critical"
      ? "bg-critical-bg text-critical"
      : tone === "warning"
      ? "bg-warning-bg text-warning"
      : tone === "success"
      ? "bg-success-bg text-success"
      : "bg-info-bg text-info";

  return (
    <div className="surface-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-on-surface-variant">{label}</p>
          <p className="text-2xl font-bold text-on-surface mt-1">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${toneClass}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}
