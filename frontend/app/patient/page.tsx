"use client";

import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import type { Alert, Patient, SmartDevice, VitalReading } from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Heart, MessageCircle, Siren, Sparkles } from "lucide-react";
import Link from "next/link";

type CareTask = {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  due_at: string | null;
};

type RoleMessage = {
  id: number;
  subject: string;
  body: string;
  is_read: boolean;
  created_at: string;
};

type AssistanceKind = "assistance" | "sos";

export default function PatientDashboard() {
  const { user } = useAuth();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [vitals, setVitals] = useState<VitalReading[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [devices, setDevices] = useState<SmartDevice[]>([]);
  const [messages, setMessages] = useState<RoleMessage[]>([]);
  const [tasks, setTasks] = useState<CareTask[]>([]);
  const [tasksRestricted, setTasksRestricted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittingAlert, setSubmittingAlert] = useState<AssistanceKind | null>(null);
  const [controllingDeviceId, setControllingDeviceId] = useState<number | null>(null);

  const patientId = user?.patient_id ?? null;

  const fetchDashboard = useCallback(async () => {
    if (!patientId) {
      setError("Your account is not linked to a patient record.");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [patientData, vitalsData, alertsData, messagesData, devicesData] =
        await Promise.all([
          api.get<Patient>(`/patients/${patientId}`),
          api.get<VitalReading[]>(`/vitals/readings?patient_id=${patientId}&limit=24`),
          api.get<Alert[]>(`/alerts?status=active&limit=8`),
          api.get<RoleMessage[]>("/workflow/messages?inbox_only=true&limit=5"),
          api.get<SmartDevice[]>("/ha/devices"),
        ]);

      let taskData: CareTask[] = [];
      let restricted = false;
      try {
        taskData = await api.get<CareTask[]>("/workflow/tasks?limit=5");
      } catch {
        restricted = true;
      }

      setPatient(patientData);
      setVitals(vitalsData);
      setAlerts(alertsData);
      setMessages(messagesData);
      setDevices(devicesData);
      setTasks(taskData);
      setTasksRestricted(restricted);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load your dashboard.",
      );
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  const latest = vitals[0] ?? null;
  const heartRateTrend = useMemo(
    () =>
      vitals
        .slice(0, 8)
        .map((reading) => reading.heart_rate_bpm)
        .filter((value): value is number => value != null)
        .reverse(),
    [vitals],
  );

  const roomDevices = useMemo(() => {
    if (!patient?.room_id) return [];
    return devices.filter(
      (device) => device.room_id === patient.room_id && device.is_active,
    );
  }, [devices, patient?.room_id]);

  async function raiseAssistance(kind: AssistanceKind) {
    if (!patient) return;
    const isEmergency = kind === "sos";
    const confirmed = window.confirm(
      isEmergency
        ? "Confirm emergency SOS alert to care staff?"
        : "Confirm assistance request to care staff?",
    );
    if (!confirmed) return;

    setSubmittingAlert(kind);
    try {
      await api.post<Alert>("/alerts", {
        patient_id: patient.id,
        alert_type: isEmergency ? "fall" : "zone_violation",
        severity: isEmergency ? "critical" : "warning",
        title: isEmergency ? "Emergency SOS from patient" : "Patient assistance request",
        description: isEmergency
          ? "Patient pressed emergency SOS from patient dashboard."
          : "Patient requested non-emergency assistance from patient dashboard.",
        data: {
          source: "patient_dashboard",
          kind,
        },
      });
      await fetchDashboard();
    } finally {
      setSubmittingAlert(null);
    }
  }

  async function controlDevice(deviceId: number, action: "turn_on" | "turn_off" | "toggle") {
    setControllingDeviceId(deviceId);
    try {
      await api.post(`/ha/devices/${deviceId}/control`, { action, parameters: {} });
      await fetchDashboard();
    } finally {
      setControllingDeviceId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="bg-error-container/40 border border-error/20 rounded-2xl p-6 text-error">
        {error ?? "Unable to load patient dashboard."}
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold text-on-surface">
            Welcome, {patient.nickname || patient.first_name}
          </h2>
          <p className="text-on-surface-variant mt-2 text-sm">
            Room {patient.room_id ?? "Unassigned"} - Care level {patient.care_level}
          </p>
        </div>
        <button
          onClick={() => void fetchDashboard()}
          className="px-4 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface text-sm font-medium transition-smooth"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Heart Rate"
          value={latest?.heart_rate_bpm != null ? `${latest.heart_rate_bpm}` : "--"}
          unit="bpm"
          icon={Heart}
        />
        <MetricCard
          title="SpO2"
          value={latest?.spo2 != null ? `${latest.spo2}` : "--"}
          unit="%"
          icon={Sparkles}
        />
        <MetricCard
          title="Skin Temp"
          value={
            latest?.skin_temperature != null ? `${latest.skin_temperature.toFixed(1)}` : "--"
          }
          unit="C"
          icon={Bell}
        />
      </div>

      <section className="bg-surface-container shadow-sm border border-outline-variant/20 rounded-3xl p-6">
        <h3 className="text-lg font-semibold text-on-surface mb-3">My Vitals Trend</h3>
        {heartRateTrend.length > 0 ? (
          <div className="flex items-end gap-2 h-28">
            {heartRateTrend.map((value, index) => (
              <div
                key={`${value}-${index}`}
                className="flex-1 rounded-md bg-primary/20 relative overflow-hidden"
                title={`${value} bpm`}
              >
                <div
                  className="absolute bottom-0 inset-x-0 bg-primary rounded-md"
                  style={{ height: `${Math.min(Math.max(value, 40), 130) - 35}%` }}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant">No heart-rate readings available yet.</p>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-surface-container shadow-sm border border-outline-variant/20 rounded-3xl p-6 space-y-3">
          <h3 className="text-lg font-semibold text-on-surface">Assistance and SOS</h3>
          <p className="text-sm text-on-surface-variant">
            Send a request directly to your care team.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => void raiseAssistance("assistance")}
              disabled={submittingAlert !== null}
              className="py-4 rounded-xl bg-primary text-white font-semibold hover:opacity-90 disabled:opacity-60 transition-smooth"
            >
              {submittingAlert === "assistance"
                ? "Sending request..."
                : "Request Assistance"}
            </button>
            <button
              onClick={() => void raiseAssistance("sos")}
              disabled={submittingAlert !== null}
              className="py-4 rounded-xl bg-error text-white font-semibold hover:opacity-90 disabled:opacity-60 transition-smooth flex items-center justify-center gap-2"
            >
              <Siren className="w-5 h-5" />
              {submittingAlert === "sos" ? "Sending SOS..." : "Emergency SOS"}
            </button>
          </div>
        </section>

        <section className="bg-surface-container shadow-sm border border-outline-variant/20 rounded-3xl p-6">
          <h3 className="text-lg font-semibold text-on-surface mb-3">Active Alerts</h3>
          <div className="space-y-2">
            {alerts.length > 0 ? (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/20"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-on-surface text-sm">{alert.title}</p>
                    <span className="text-xs uppercase text-on-surface-variant">
                      {alert.severity}
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-1">{alert.description}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-on-surface-variant">No active alerts right now.</p>
            )}
          </div>
        </section>

        <section className="bg-surface-container shadow-sm border border-outline-variant/20 rounded-3xl p-6">
          <h3 className="text-lg font-semibold text-on-surface mb-3">Room Control</h3>
          <div className="space-y-3">
            {roomDevices.length > 0 ? (
              roomDevices.map((device) => (
                <div
                  key={device.id}
                  className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/20"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-on-surface">{device.name}</p>
                      <p className="text-xs text-on-surface-variant">{device.state}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => void controlDevice(device.id, "turn_on")}
                        disabled={controllingDeviceId === device.id}
                        className="px-3 py-1.5 rounded-lg text-xs bg-primary text-white disabled:opacity-60"
                      >
                        On
                      </button>
                      <button
                        onClick={() => void controlDevice(device.id, "turn_off")}
                        disabled={controllingDeviceId === device.id}
                        className="px-3 py-1.5 rounded-lg text-xs bg-surface text-on-surface border border-outline-variant/40 disabled:opacity-60"
                      >
                        Off
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-on-surface-variant">
                No active smart-home devices are mapped to your room.
              </p>
            )}
          </div>
        </section>

        <section className="bg-surface-container shadow-sm border border-outline-variant/20 rounded-3xl p-6 space-y-3">
          <h3 className="text-lg font-semibold text-on-surface">Tasks and Messages</h3>
          <div>
            <p className="text-sm font-medium text-on-surface mb-2">Care tasks</p>
            {tasks.length > 0 ? (
              <ul className="space-y-2">
                {tasks.map((task) => (
                  <li
                    key={task.id}
                    className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/20"
                  >
                    <p className="text-sm font-medium text-on-surface">{task.title}</p>
                    <p className="text-xs text-on-surface-variant mt-1">{task.status}</p>
                  </li>
                ))}
              </ul>
            ) : tasksRestricted ? (
              <p className="text-sm text-on-surface-variant">
                Care tasks are managed by staff for your account.
              </p>
            ) : (
              <p className="text-sm text-on-surface-variant">
                No open care tasks assigned at this time.
              </p>
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-on-surface mb-2">Latest messages</p>
            {messages.length > 0 ? (
              <ul className="space-y-2">
                {messages.map((message) => (
                  <li
                    key={message.id}
                    className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/20"
                  >
                    <p className="text-sm font-medium text-on-surface">
                      {message.subject || "Care team update"}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">
                      {message.body}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-on-surface-variant">No messages in your inbox.</p>
            )}
            <Link
              href="/patient/messages"
              className="inline-flex items-center gap-2 mt-3 text-sm text-primary hover:underline"
            >
              <MessageCircle className="w-4 h-4" />
              Open messages
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  unit,
  icon: Icon,
}: {
  title: string;
  value: string;
  unit: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-surface-container shadow-sm border border-outline-variant/20 rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm text-on-surface-variant">{title}</h3>
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="flex items-end gap-2 mt-2">
        <span className="text-3xl font-bold text-on-surface">{value}</span>
        <span className="text-sm text-outline pb-1">{unit}</span>
      </div>
    </div>
  );
}
