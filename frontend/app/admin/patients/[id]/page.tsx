"use client";

import { useEffect, useState, useCallback, use } from "react";
import { api } from "@/lib/api";
import type { Patient, VitalReading, Alert, TimelineEvent, DeviceAssignment } from "@/lib/types";
import {
  ArrowLeft,
  Heart,
  Activity,
  Bell,
  Clock,
  Tablet,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { ageYears } from "@/lib/age";
import { useFixedNowMs } from "@/hooks/useFixedNowMs";

export default function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const nowMs = useFixedNowMs();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [vitals, setVitals] = useState<VitalReading[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [assignments, setAssignments] = useState<DeviceAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [p, v, a, t, d] = await Promise.all([
        api.get<Patient>(`/patients/${id}`),
        api
          .get<VitalReading[]>(`/vitals/readings?patient_id=${id}&limit=20`)
          .catch(() => []),
        api.get<Alert[]>(`/alerts?patient_id=${id}`).catch(() => []),
        api.get<TimelineEvent[]>(`/timeline?patient_id=${id}`).catch(() => []),
        api.get<DeviceAssignment[]>(`/patients/${id}/devices`).catch(() => []),
      ]);
      setPatient(p);
      setVitals(v);
      setAlerts(a);
      setTimeline(t);
      setAssignments(d);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ไม่พบข้อมูลผู้ป่วย");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-surface-dim rounded-lg animate-pulse" />
        <div className="h-60 bg-surface-card rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="w-12 h-12 text-critical mb-3" />
        <p className="text-text-primary font-medium">{error || "ไม่พบผู้ป่วย"}</p>
        <Link
          href="/admin/patients"
          className="text-sm text-primary-500 mt-3 hover:underline"
        >
          กลับไปหน้ารายชื่อผู้ป่วย
        </Link>
      </div>
    );
  }

  const age = ageYears(patient.date_of_birth, nowMs);

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <Link
        href="/admin/patients"
        className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-primary-500 transition-smooth"
      >
        <ArrowLeft className="w-4 h-4" />
        กลับไปรายชื่อผู้ป่วย
      </Link>

      {/* Patient header */}
      <div className="bg-surface-card rounded-xl shadow-card p-6">
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 bg-primary-50 rounded-2xl flex items-center justify-center text-primary font-bold text-xl">
            {patient.first_name?.[0]}
            {patient.last_name?.[0]}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-text-primary">
              {patient.first_name} {patient.last_name}
            </h1>
            <p className="text-text-secondary text-sm mt-1">
              {patient.nickname || "—"} {age != null && `· ${age} ปี`} ·{" "}
              {patient.gender === "male" ? "ชาย" : patient.gender === "female" ? "หญิง" : patient.gender}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className={`text-xs px-3 py-1 rounded-full font-medium care-${patient.care_level}`}>
                {patient.care_level}
              </span>
              {patient.mobility_type && (
                <span className="text-xs px-3 py-1 rounded-full bg-surface-dim text-text-secondary">
                  {patient.mobility_type}
                </span>
              )}
              {patient.blood_type && (
                <span className="text-xs px-3 py-1 rounded-full bg-surface-dim text-text-secondary">
                  กรุ๊ปเลือด: {patient.blood_type}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Patient info grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-border">
          <InfoItem label="ส่วนสูง" value={patient.height_cm ? `${patient.height_cm} ซม.` : "—"} />
          <InfoItem label="น้ำหนัก" value={patient.weight_kg ? `${patient.weight_kg} กก.` : "—"} />
          <InfoItem
            label="วันที่เข้ารับ"
            value={patient.admitted_at ? new Date(patient.admitted_at).toLocaleDateString("th-TH") : "—"}
          />
          <InfoItem label="สถานะ" value={patient.is_active ? "Active" : "Inactive"} />
        </div>
      </div>

      {/* Tabs: Vitals, Alerts, Timeline, Devices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Latest vitals */}
        <SectionCard icon={Heart} title="สัญญาณชีพล่าสุด" iconColor="text-critical">
          {vitals.length === 0 ? (
            <p className="text-sm text-text-muted py-4">ยังไม่มีข้อมูลสัญญาณชีพ</p>
          ) : (
            <div className="space-y-2">
              {vitals.slice(0, 5).map((v) => (
                <div key={v.id} className="flex items-center justify-between p-3 rounded-lg bg-surface-dim/50 text-sm">
                  <span className="text-text-secondary">
                    {new Date(v.timestamp).toLocaleString("th-TH")}
                  </span>
                  <div className="flex gap-4 text-text-primary font-medium">
                    {v.heart_rate_bpm && <span>HR: {v.heart_rate_bpm}</span>}
                    {v.spo2 && <span>SpO2: {v.spo2}%</span>}
                    {v.skin_temperature && <span>Temp: {v.skin_temperature}°C</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Alerts */}
        <SectionCard icon={Bell} title="การแจ้งเตือน" iconColor="text-warning">
          {alerts.length === 0 ? (
            <p className="text-sm text-text-muted py-4">ไม่มีการแจ้งเตือน</p>
          ) : (
            <div className="space-y-2">
              {alerts.slice(0, 5).map((a) => (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg bg-surface-dim/50 text-sm">
                  <div className={`w-2 h-2 rounded-full ${a.severity === "critical" ? "bg-critical" : a.severity === "warning" ? "bg-warning" : "bg-info"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-text-primary truncate">{a.title}</p>
                    <p className="text-xs text-text-muted truncate">{a.description}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium severity-${a.severity}`}>
                    {a.severity}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Timeline */}
        <SectionCard icon={Clock} title="ไทม์ไลน์กิจกรรม" iconColor="text-info">
          {timeline.length === 0 ? (
            <p className="text-sm text-text-muted py-4">ยังไม่มีกิจกรรม</p>
          ) : (
            <div className="space-y-2">
              {timeline.slice(0, 5).map((t) => (
                <div key={t.id} className="flex items-start gap-3 p-3 rounded-lg bg-surface-dim/50 text-sm">
                  <Activity className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-text-primary">{t.event_type}</p>
                    <p className="text-xs text-text-muted">{t.description}</p>
                    <p className="text-xs text-text-muted mt-1">
                      {new Date(t.timestamp).toLocaleString("th-TH")}
                      {t.room_name ? ` · ${t.room_name}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Devices */}
        <SectionCard icon={Tablet} title="อุปกรณ์ที่เชื่อมต่อ" iconColor="text-primary-500">
          {assignments.length === 0 ? (
            <p className="text-sm text-text-muted py-4">ยังไม่มีอุปกรณ์ที่เชื่อมต่อ</p>
          ) : (
            <div className="space-y-2">
              {assignments.map((d) => (
                <div key={d.id} className="flex items-center justify-between p-3 rounded-lg bg-surface-dim/50 text-sm">
                  <div className="flex items-center gap-2">
                    <Tablet className="w-4 h-4 text-text-muted" />
                    <span className="text-text-primary font-medium">{d.device_id}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-1 rounded-full bg-surface-dim text-text-secondary">
                      {d.device_role}
                    </span>
                    <span className={`w-2 h-2 rounded-full ${d.is_active ? "bg-success" : "bg-text-muted"}`} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-sm font-medium text-text-primary mt-0.5">{value}</p>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  iconColor,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  iconColor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface-card rounded-xl shadow-card p-6">
      <h2 className="font-semibold text-text-primary flex items-center gap-2 mb-4">
        <Icon className={`w-5 h-5 ${iconColor}`} />
        {title}
      </h2>
      {children}
    </div>
  );
}
