"use client";

import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import type { Alert, Patient, SmartDevice, VitalReading } from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Heart, MessageCircle, Siren, Sparkles } from "lucide-react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";

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
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t } = useTranslation();
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
  const [adminPickerPatients, setAdminPickerPatients] = useState<Patient[] | null>(null);

  const previewRaw = searchParams.get("previewAs");
  const previewNum = previewRaw != null && previewRaw !== "" ? Number(previewRaw) : NaN;
  const hasValidPreview = Number.isFinite(previewNum) && previewNum > 0;
  const previewPatientId = hasValidPreview ? Math.floor(previewNum) : null;

  const isAdminPreview =
    user?.role === "admin" && previewPatientId != null && previewPatientId > 0;

  const effectivePatientId = useMemo(() => {
    if (user?.role === "admin" && previewPatientId != null) return previewPatientId;
    return user?.patient_id ?? null;
  }, [user?.role, user?.patient_id, previewPatientId]);

  const showAdminPatientPicker =
    user?.role === "admin" && user.patient_id == null && !hasValidPreview;

  useEffect(() => {
    if (!showAdminPatientPicker) {
      setAdminPickerPatients(null);
      return;
    }
    let cancelled = false;
    api
      .get<Patient[]>("/patients")
      .then((list) => {
        if (!cancelled) setAdminPickerPatients(list);
      })
      .catch(() => {
        if (!cancelled) setAdminPickerPatients([]);
      });
    return () => {
      cancelled = true;
    };
  }, [showAdminPatientPicker]);

  const fetchDashboard = useCallback(async () => {
    if (showAdminPatientPicker) {
      setLoading(false);
      setError(null);
      setPatient(null);
      return;
    }

    if (!effectivePatientId) {
      setError("Your account is not linked to a patient record.");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const pid = effectivePatientId;
      const [patientData, vitalsData, alertsData, messagesData, devicesData] =
        await Promise.all([
          api.get<Patient>(`/patients/${pid}`),
          api.get<VitalReading[]>(`/vitals/readings?patient_id=${pid}&limit=24`),
          api.get<Alert[]>(`/alerts?status=active&limit=8&patient_id=${pid}`),
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
  }, [effectivePatientId, showAdminPatientPicker]);

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

  if (showAdminPatientPicker) {
    if (adminPickerPatients === null) {
      return (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 animate-spin rounded-full border-3 border-primary border-t-transparent" />
        </div>
      );
    }
    return (
      <div className="surface-card mx-auto max-w-lg space-y-4 rounded-2xl border border-outline-variant/20 p-6">
        <h2 className="text-xl font-bold text-on-surface">{t("patientPortal.choosePatient")}</h2>
        <p className="text-sm text-on-surface-variant">{t("patientPortal.adminPickHint")}</p>
        <select
          className="input-field w-full rounded-xl py-2.5 text-sm"
          defaultValue=""
          aria-label={t("patientPortal.choosePatient")}
          onChange={(e) => {
            const v = e.target.value;
            if (v) router.push(`/patient?previewAs=${v}`);
          }}
        >
          <option value="" disabled>
            —
          </option>
          {adminPickerPatients.map((p) => (
            <option key={p.id} value={p.id}>
              {p.first_name} {p.last_name} (#{p.id})
            </option>
          ))}
        </select>
      </div>
    );
  }

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
      {isAdminPreview ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
          <p className="text-on-surface">{t("patientPortal.previewBanner")}</p>
          <Link
            href="/patient"
            className="shrink-0 font-semibold text-primary hover:underline"
          >
            {t("patientPortal.previewClear")}
          </Link>
        </div>
      ) : null}
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
        <h3 className="text-lg font-semibold text-on-surface mb-2">Device health</h3>
        <p className="text-sm text-on-surface-variant">
          Polar battery: {latest?.sensor_battery ?? "--"}% · Room smart devices:{" "}
          {roomDevices.length}
        </p>
      </section>

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
