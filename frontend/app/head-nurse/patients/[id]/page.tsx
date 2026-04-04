"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@/hooks/useQuery";
import type {
  Alert,
  DeviceAssignment,
  Patient,
  TimelineEvent,
  VitalReading,
} from "@/lib/types";
import { Activity, Bell, HeartPulse, Tablet } from "lucide-react";

export default function HeadNursePatientDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const { data: patient, isLoading } = useQuery<Patient>(
    Number.isFinite(id) ? `/patients/${id}` : null,
  );
  const { data: vitals } = useQuery<VitalReading[]>(
    Number.isFinite(id) ? `/vitals/readings?patient_id=${id}&limit=12` : null,
  );
  const { data: alerts } = useQuery<Alert[]>(
    Number.isFinite(id) ? `/alerts?patient_id=${id}` : null,
  );
  const { data: timeline } = useQuery<TimelineEvent[]>(
    Number.isFinite(id) ? `/timeline?patient_id=${id}&limit=12` : null,
  );
  const { data: assignments } = useQuery<DeviceAssignment[]>(
    Number.isFinite(id) ? `/patients/${id}/devices` : null,
  );

  if (isLoading || !patient) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-on-surface">
        {patient.first_name} {patient.last_name}
      </h2>
      <p className="text-sm text-on-surface-variant">Patient care detail with live monitoring.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="surface-card p-4">
          <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2 mb-2">
            <HeartPulse className="w-4 h-4 text-critical" />
            Recent vitals
          </h3>
          <div className="space-y-2">
            {(vitals ?? []).slice(0, 6).map((item) => (
              <div key={item.id} className="rounded-lg bg-surface-container-low px-3 py-2 text-sm">
                <p className="text-on-surface font-medium">
                  HR {item.heart_rate_bpm ?? "—"} · SpO2 {item.spo2 ?? "—"}%
                </p>
                <p className="text-xs text-on-surface-variant">
                  {new Date(item.timestamp).toLocaleString()}
                </p>
              </div>
            ))}
            {(vitals ?? []).length === 0 && (
              <p className="text-sm text-on-surface-variant py-2">No vitals captured.</p>
            )}
          </div>
        </section>

        <section className="surface-card p-4">
          <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2 mb-2">
            <Bell className="w-4 h-4 text-warning" />
            Alerts
          </h3>
          <div className="space-y-2">
            {(alerts ?? []).slice(0, 6).map((item) => (
              <div key={item.id} className="rounded-lg bg-surface-container-low px-3 py-2 text-sm">
                <p className="text-on-surface font-medium">{item.alert_type}</p>
                <p className="text-xs text-on-surface-variant">{item.description}</p>
              </div>
            ))}
            {(alerts ?? []).length === 0 && (
              <p className="text-sm text-on-surface-variant py-2">No alert history.</p>
            )}
          </div>
        </section>

        <section className="surface-card p-4">
          <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-info" />
            Activity timeline
          </h3>
          <div className="space-y-2">
            {(timeline ?? []).slice(0, 6).map((item) => (
              <div key={item.id} className="rounded-lg bg-surface-container-low px-3 py-2 text-sm">
                <p className="text-on-surface font-medium">{item.event_type}</p>
                <p className="text-xs text-on-surface-variant">{item.description}</p>
              </div>
            ))}
            {(timeline ?? []).length === 0 && (
              <p className="text-sm text-on-surface-variant py-2">No timeline events.</p>
            )}
          </div>
        </section>

        <section className="surface-card p-4">
          <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2 mb-2">
            <Tablet className="w-4 h-4 text-primary" />
            Device assignments
          </h3>
          <div className="space-y-2">
            {(assignments ?? []).map((item) => (
              <div key={item.id} className="rounded-lg bg-surface-container-low px-3 py-2 text-sm">
                <p className="text-on-surface font-medium">{item.device_id}</p>
                <p className="text-xs text-on-surface-variant">
                  {item.device_role} · {item.is_active ? "active" : "inactive"}
                </p>
              </div>
            ))}
            {(assignments ?? []).length === 0 && (
              <p className="text-sm text-on-surface-variant py-2">No connected devices.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
