"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@/hooks/useQuery";
import type { Alert, Patient, Room } from "@/lib/types";
import { AlertTriangle, LocateFixed, Monitor, ShieldAlert } from "lucide-react";
import FloorplanRoleViewer from "@/components/floorplan/FloorplanRoleViewer";

type RoomPrediction = {
  id: number;
  device_id: string;
  timestamp: string | null;
  predicted_room_id: number | null;
  predicted_room_name: string | null;
  confidence: number | null;
  model_type: string | null;
};

type RoomSummary = {
  room: Room;
  patients: number;
  activeAlerts: number;
  trackedDevices: number;
  avgConfidence: number | null;
};

export default function ObserverZonePage() {
  const { data: rooms, isLoading: roomsLoading } = useQuery<Room[]>("/rooms");
  const { data: patients, isLoading: patientsLoading } = useQuery<Patient[]>("/patients");
  const { data: alerts, isLoading: alertsLoading } = useQuery<Alert[]>(
    "/alerts?status=active",
  );
  const { data: predictions, isLoading: predictionsLoading } = useQuery<
    RoomPrediction[]
  >("/localization/predictions?limit=120");

  const activeAlerts = useMemo(() => alerts ?? [], [alerts]);
  const latestPredictionByDevice = useMemo(() => {
    const latest = new Map<string, RoomPrediction>();
    for (const prediction of predictions ?? []) {
      if (!latest.has(prediction.device_id)) {
        latest.set(prediction.device_id, prediction);
      }
    }
    return latest;
  }, [predictions]);

  const roomSummaries = useMemo<RoomSummary[]>(() => {
    if (!rooms?.length) return [];
    const patientList = patients ?? [];
    const predictionList = Array.from(latestPredictionByDevice.values());

    return rooms.map((room) => {
      const roomPredictions = predictionList.filter(
        (prediction) =>
          prediction.predicted_room_id === room.id ||
          prediction.predicted_room_name === room.name,
      );

      const roomAlerts = activeAlerts.filter((alert) => {
        const alertRoomId = alert.data?.room_id;
        const alertRoomName = alert.data?.room_name;
        if (typeof alertRoomId === "number") return alertRoomId === room.id;
        if (typeof alertRoomName === "string") return alertRoomName === room.name;
        if (!alert.device_id) return false;
        const latest = latestPredictionByDevice.get(alert.device_id);
        if (!latest) return false;
        return (
          latest.predicted_room_id === room.id ||
          latest.predicted_room_name === room.name
        );
      });

      const confidenceValues = roomPredictions
        .map((prediction) => prediction.confidence)
        .filter((confidence): confidence is number => typeof confidence === "number");
      const avgConfidence = confidenceValues.length
        ? confidenceValues.reduce((sum, value) => sum + value, 0) /
          confidenceValues.length
        : null;

      return {
        room,
        patients: patientList.filter((patient) => patient.room_id === room.id).length,
        activeAlerts: roomAlerts.length,
        trackedDevices: roomPredictions.length,
        avgConfidence,
      };
    });
  }, [activeAlerts, latestPredictionByDevice, patients, rooms]);

  const isLoading =
    roomsLoading || patientsLoading || alertsLoading || predictionsLoading;

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!rooms?.length) {
    return (
      <div className="surface-card p-6">
        <h2 className="text-xl font-bold text-on-surface">Zone dashboard</h2>
        <p className="text-sm text-on-surface-variant mt-2">
          No rooms are configured in this workspace yet.
        </p>
      </div>
    );
  }

  const trackedDevices = latestPredictionByDevice.size;
  const highConfidenceCount = Array.from(latestPredictionByDevice.values()).filter(
    (prediction) => (prediction.confidence ?? 0) >= 0.8,
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-on-surface">Zone dashboard</h2>
        <p className="text-sm text-on-surface-variant mt-1">
          Live room status with active alerts and latest localization predictions.
        </p>
      </div>

      <FloorplanRoleViewer />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="surface-card p-4">
          <div className="flex items-center gap-2 text-on-surface-variant text-sm">
            <Monitor className="w-4 h-4" />
            Rooms monitored
          </div>
          <p className="text-2xl font-bold text-on-surface mt-2">{rooms.length}</p>
        </div>
        <div className="surface-card p-4">
          <div className="flex items-center gap-2 text-on-surface-variant text-sm">
            <ShieldAlert className="w-4 h-4" />
            Active alerts
          </div>
          <p className="text-2xl font-bold text-on-surface mt-2">
            {activeAlerts.length}
          </p>
        </div>
        <div className="surface-card p-4">
          <div className="flex items-center gap-2 text-on-surface-variant text-sm">
            <LocateFixed className="w-4 h-4" />
            Located devices
          </div>
          <p className="text-2xl font-bold text-on-surface mt-2">{trackedDevices}</p>
        </div>
        <div className="surface-card p-4">
          <div className="flex items-center gap-2 text-on-surface-variant text-sm">
            <AlertTriangle className="w-4 h-4" />
            High-confidence predictions
          </div>
          <p className="text-2xl font-bold text-on-surface mt-2">
            {highConfidenceCount}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <section className="xl:col-span-3 surface-card p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-on-surface mb-4">
            Room watchlist
          </h3>
          <div className="space-y-3">
            {roomSummaries.map((summary) => (
              <div
                key={summary.room.id}
                className="rounded-xl bg-surface-container-low p-4 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-on-surface truncate">
                    {summary.room.name}
                  </p>
                  <p className="text-xs text-on-surface-variant mt-0.5 truncate">
                    {summary.room.description || "Clinical room"}
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs min-w-[240px]">
                  <Metric label="Patients" value={summary.patients} />
                  <Metric label="Alerts" value={summary.activeAlerts} />
                  <Metric label="Devices" value={summary.trackedDevices} />
                  <Metric
                    label="Confidence"
                    value={
                      summary.avgConfidence == null
                        ? "—"
                        : `${Math.round(summary.avgConfidence * 100)}%`
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="xl:col-span-2 surface-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-on-surface">
              Active alerts
            </h3>
            <Link href="/observer/alerts" className="text-xs text-primary hover:underline">
              Open alerts
            </Link>
          </div>
          <div className="space-y-3">
            {activeAlerts.length === 0 ? (
              <p className="text-sm text-on-surface-variant py-8 text-center">
                No active alerts in the zone right now.
              </p>
            ) : (
              activeAlerts.slice(0, 8).map((alert) => (
                <div
                  key={alert.id}
                  className="rounded-xl bg-surface-container-low p-3 text-sm"
                >
                  <p className="font-medium text-on-surface truncate">{alert.title}</p>
                  <p className="text-xs text-on-surface-variant truncate mt-0.5">
                    {alert.description}
                  </p>
                  <p className="text-[11px] text-on-surface-variant mt-2">
                    {new Date(alert.timestamp).toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-on-surface-variant">{label}</p>
      <p className="text-on-surface font-semibold mt-0.5">{value}</p>
    </div>
  );
}
