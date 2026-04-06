"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import type {
  Patient,
  User as PortalUser,
  VitalReading,
  Alert,
  TimelineEvent,
  DeviceAssignment,
  PatientContact,
  MedicalConditionEntry,
} from "@/lib/types";
import {
  ArrowLeft,
  Heart,
  Activity,
  Bell,
  Clock,
  Tablet,
  AlertCircle,
  Phone,
  Pencil,
  User,
} from "lucide-react";
import Link from "next/link";
import PatientEditorModal from "@/components/admin/patients/PatientEditorModal";
import { ageYears } from "@/lib/age";
import { useFixedNowMs } from "@/hooks/useFixedNowMs";
import { useTranslation } from "@/lib/i18n";
import { bodyMassIndex, bmiCategory } from "@/lib/patientMetrics";

function formatCondition(c: MedicalConditionEntry): string {
  if (typeof c === "string") return c;
  const o = c as Record<string, unknown>;
  if (typeof o.label === "string") return o.label;
  if (typeof o.name === "string") return o.name;
  if (typeof o.condition === "string") return o.condition;
  return String(o.type ?? "—");
}

export default function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, locale } = useTranslation();
  const nowMs = useFixedNowMs();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [contacts, setContacts] = useState<PatientContact[]>([]);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [vitals, setVitals] = useState<VitalReading[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [assignments, setAssignments] = useState<DeviceAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [allPortalUsers, setAllPortalUsers] = useState<PortalUser[]>([]);
  const [linkedPortalUsers, setLinkedPortalUsers] = useState<PortalUser[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const pid = Number(id);
      const p = await api.get<Patient>(`/patients/${id}`);
      setPatient(p);

      const [c, v, a, tl, d, allUsers] = await Promise.all([
        api.get<PatientContact[]>(`/patients/${id}/contacts`).catch(() => []),
        api
          .get<VitalReading[]>(`/vitals/readings?patient_id=${id}&limit=20`)
          .catch(() => []),
        api.get<Alert[]>(`/alerts?patient_id=${id}`).catch(() => []),
        api.get<TimelineEvent[]>(`/timeline?patient_id=${id}`).catch(() => []),
        api.get<DeviceAssignment[]>(`/patients/${id}/devices`).catch(() => []),
        api.get<PortalUser[]>("/users").catch(() => []),
      ]);
      setContacts(c);
      setVitals(v);
      setAlerts(a);
      setTimeline(tl);
      setAssignments(d);
      setAllPortalUsers(Array.isArray(allUsers) ? allUsers : []);
      setLinkedPortalUsers(
        Array.isArray(allUsers) ? allUsers.filter((u) => u.patient_id === pid) : [],
      );

      if (p.room_id != null) {
        try {
          const room = await api.get<{ name?: string }>(`/rooms/${p.room_id}`);
          setRoomName(room.name ?? null);
        } catch {
          setRoomName(null);
        }
      } else {
        setRoomName(null);
      }

      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("patients.empty"));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (searchParams.get("edit") === "1") {
      setEditorOpen(true);
    }
  }, [searchParams]);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    router.replace(`/admin/patients/${id}`);
  }, [router, id]);

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="h-8 w-64 bg-surface-container-high rounded-lg animate-pulse" />
        <div className="h-60 surface-card rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="w-12 h-12 text-error mb-3" />
        <p className="text-on-surface font-medium">{error || t("patients.empty")}</p>
        <Link
          href="/admin/patients"
          className="text-sm text-primary mt-3 hover:underline"
        >
          {t("patients.backToList")}
        </Link>
      </div>
    );
  }

  const age = ageYears(patient.date_of_birth, nowMs);
  const bmi = bodyMassIndex(patient.height_cm, patient.weight_kg);
  const bmiCat = bmiCategory(bmi);
  const bmiLabel =
    bmiCat === "normal"
      ? t("patients.bmiNormal")
      : bmiCat === "underweight"
        ? t("patients.bmiUnderweight")
        : bmiCat === "overweight"
          ? t("patients.bmiOverweight")
          : bmiCat === "obese"
            ? t("patients.bmiObese")
            : "—";

  const primaryContact =
    contacts.find((c) => c.is_primary) ||
    contacts.find((c) => c.contact_type === "emergency") ||
    contacts[0] ||
    null;

  const activeAssignments = assignments.filter((a) => a.is_active);
  const surgeries = patient.past_surgeries ?? [];
  const medCount = patient.medications?.filter((m) => (m.name || "").trim()).length ?? 0;

  const genderLabel =
    patient.gender === "male"
      ? t("patients.genderMale")
      : patient.gender === "female"
        ? t("patients.genderFemale")
        : patient.gender === "other"
          ? t("patients.genderOther")
          : patient.gender || "—";

  const localeTag = locale === "th" ? "th-TH" : "en-US";

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/admin/patients"
          className="inline-flex items-center gap-2 text-sm text-on-surface-variant hover:text-primary transition-smooth"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("patients.backToList")}
        </Link>
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-outline-variant/30 text-on-surface hover:bg-surface-container-high transition-smooth"
        >
          <Pencil className="w-4 h-4" />
          {t("patients.editPatient")}
        </button>
      </div>

      <PatientEditorModal
        open={editorOpen}
        patientId={id}
        patient={patient}
        primaryContact={primaryContact}
        activeAssignments={activeAssignments}
        allPortalUsers={allPortalUsers}
        linkedPortalUsers={linkedPortalUsers}
        onClose={closeEditor}
        onSaved={fetchData}
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <section className="surface-card rounded-xl border border-outline-variant/20 p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant mb-1">
              {t("patients.detailAbout")}
            </p>
            <div className="flex flex-col sm:flex-row gap-5">
              <div className="relative w-full sm:w-40 aspect-[4/5] rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-end justify-start overflow-hidden shrink-0 border border-outline-variant/20">
                <span className="absolute bottom-2 left-2 text-[10px] font-mono font-semibold text-on-surface/90 bg-black/35 px-2 py-0.5 rounded">
                  {t("patients.detailPatientId")} #{patient.id}
                </span>
                <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-primary/40">
                  {patient.first_name?.[0]}
                  {patient.last_name?.[0]}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-on-surface">
                  {patient.first_name} {patient.last_name}
                </h1>
                <p className="text-sm text-on-surface-variant mt-1">
                  {patient.nickname ? `${patient.nickname} · ` : ""}
                  {age != null ? `${age} ${t("patients.years")}` : "—"}
                  {" · "}
                  {genderLabel}
                </p>
                {roomName && (
                  <p className="text-sm text-on-surface-variant mt-2">
                    {t("patients.room")}:{" "}
                    <span className="font-medium text-on-surface">{roomName}</span>
                  </p>
                )}
                <div className="flex flex-wrap gap-2 mt-4">
                  <span className={`text-xs px-3 py-1 rounded-full font-medium care-${patient.care_level}`}>
                    {patient.care_level}
                  </span>
                  <span className="text-xs px-3 py-1 rounded-full bg-surface-container-high text-on-surface-variant">
                    {patient.mobility_type}
                  </span>
                  <span
                    className={`text-xs px-3 py-1 rounded-full font-medium ${
                      patient.is_active ? "bg-primary/15 text-primary" : "bg-surface-container-high"
                    }`}
                  >
                    {patient.is_active ? t("patients.statusActive") : t("patients.statusInactive")}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-6 border-t border-outline-variant/15">
              <InfoItem
                label={t("patients.detailDob")}
                value={
                  patient.date_of_birth
                    ? new Date(patient.date_of_birth + "T12:00:00").toLocaleDateString(localeTag, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })
                    : "—"
                }
              />
              <InfoItem label={t("patients.heightCm")} value={patient.height_cm != null ? `${patient.height_cm} cm` : "—"} />
              <InfoItem label={t("patients.weightKg")} value={patient.weight_kg != null ? `${patient.weight_kg} kg` : "—"} />
              <InfoItem label={t("patients.bloodType")} value={patient.blood_type || "—"} />
              <InfoItem
                label={t("patients.detailBmi")}
                value={bmi != null ? `${bmi} (${bmiLabel})` : "—"}
              />
            </div>
          </section>

          <section className="surface-card rounded-xl border border-outline-variant/20 p-6">
            <h2 className="font-semibold text-on-surface mb-4">{t("patients.sectionLinkedAccounts")}</h2>
            {linkedPortalUsers.length === 0 ? (
              <p className="text-sm text-on-surface-variant">{t("patients.linkedAccountsEmpty")}</p>
            ) : (
              <ul className="space-y-3">
                {linkedPortalUsers.map((u) => (
                  <li
                    key={u.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-outline-variant/15 bg-surface-container-low/50 px-4 py-3 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-on-surface">{u.username}</p>
                      <p className="text-xs text-on-surface-variant capitalize">{u.role}</p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ${
                        u.is_active ? "care-normal" : "bg-surface-container text-outline"
                      }`}
                    >
                      {u.is_active ? t("patients.statusActive") : t("patients.statusInactive")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="surface-card rounded-xl border border-outline-variant/20 p-6">
            <h2 className="font-semibold text-on-surface mb-4">{t("patients.sectionChronic")}</h2>
            {patient.medical_conditions.length === 0 ? (
              <p className="text-sm text-on-surface-variant">—</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {patient.medical_conditions.map((c, i) => (
                  <li
                    key={i}
                    className="text-sm px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface"
                  >
                    {formatCondition(c)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="surface-card rounded-xl border border-outline-variant/20 p-6">
            <h2 className="font-semibold text-on-surface mb-4">{t("patients.sectionAllergies")}</h2>
            {patient.allergies.length === 0 ? (
              <p className="text-sm text-on-surface-variant">—</p>
            ) : (
              <ul className="space-y-2">
                {patient.allergies.map((a, i) => (
                  <li
                    key={i}
                    className="text-sm px-4 py-3 rounded-lg bg-error/10 border border-error/20 text-on-surface"
                  >
                    {a}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {surgeries.length > 0 && (
            <section className="surface-card rounded-xl border border-outline-variant/20 p-6">
              <h2 className="font-semibold text-on-surface mb-4">{t("patients.sectionSurgeries")}</h2>
              <ul className="space-y-3">
                {surgeries.map((s, i) => (
                  <li
                    key={i}
                    className="text-sm border border-outline-variant/15 rounded-lg p-4 bg-surface-container-low/50"
                  >
                    <p className="font-medium text-on-surface">{s.procedure || "—"}</p>
                    <p className="text-on-surface-variant text-xs mt-1">
                      {[s.facility, s.year != null && s.year !== "" ? String(s.year) : null]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="surface-card rounded-xl border border-outline-variant/20 p-6">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="font-semibold text-on-surface">{t("patients.sectionMeds")}</h2>
              {medCount > 0 && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/15 text-primary">
                  {medCount} {t("patients.activeMedsBadge")}
                </span>
              )}
            </div>
            {medCount === 0 ? (
              <p className="text-sm text-on-surface-variant">—</p>
            ) : (
              <ul className="space-y-3">
                {patient.medications
                  .filter((m) => (m.name || "").trim())
                  .map((m, i) => (
                    <li
                      key={i}
                      className="text-sm border border-outline-variant/15 rounded-lg p-4"
                    >
                      <p className="font-semibold text-on-surface">{m.name}</p>
                      <p className="text-on-surface-variant mt-1">
                        {[m.dosage, m.frequency].filter(Boolean).join(" · ") || "—"}
                      </p>
                      {m.instructions && (
                        <p className="text-xs text-on-surface-variant mt-2 uppercase tracking-wide">
                          {m.instructions}
                        </p>
                      )}
                    </li>
                  ))}
              </ul>
            )}
          </section>

          {patient.notes?.trim() && (
            <section className="surface-card rounded-xl border border-outline-variant/20 p-6">
              <h2 className="font-semibold text-on-surface mb-2">{t("patients.formSectionNotes")}</h2>
              <p className="text-sm text-on-surface-variant whitespace-pre-wrap">{patient.notes}</p>
            </section>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard icon={Heart} title={t("patients.latestVitals")} iconColor="text-error">
              {vitals.length === 0 ? (
                <p className="text-sm text-on-surface-variant py-4">—</p>
              ) : (
                <div className="space-y-2">
                  {vitals.slice(0, 5).map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-surface-container-low text-sm"
                    >
                      <span className="text-on-surface-variant">
                        {new Date(v.timestamp).toLocaleString(localeTag)}
                      </span>
                      <div className="flex gap-4 text-on-surface font-medium">
                        {v.heart_rate_bpm != null && <span>HR: {v.heart_rate_bpm}</span>}
                        {v.spo2 != null && <span>SpO2: {v.spo2}%</span>}
                        {v.skin_temperature != null && <span>Temp: {v.skin_temperature}°C</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard icon={Bell} title={t("patients.alertsSection")} iconColor="text-warning">
              {alerts.length === 0 ? (
                <p className="text-sm text-on-surface-variant py-4">—</p>
              ) : (
                <div className="space-y-2">
                  {alerts.slice(0, 5).map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-surface-container-low text-sm"
                    >
                      <div
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          a.severity === "critical"
                            ? "bg-error"
                            : a.severity === "warning"
                              ? "bg-warning"
                              : "bg-info"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-on-surface truncate">{a.title}</p>
                        <p className="text-xs text-on-surface-variant truncate">{a.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard icon={Clock} title={t("patients.timelineSection")} iconColor="text-info">
              {timeline.length === 0 ? (
                <p className="text-sm text-on-surface-variant py-4">—</p>
              ) : (
                <div className="space-y-2">
                  {timeline.slice(0, 5).map((ev) => (
                    <div key={ev.id} className="flex items-start gap-3 p-3 rounded-lg bg-surface-container-low text-sm">
                      <Activity className="w-4 h-4 text-on-surface-variant shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-on-surface">{ev.event_type}</p>
                        <p className="text-xs text-on-surface-variant">{ev.description}</p>
                        <p className="text-xs text-on-surface-variant mt-1">
                          {new Date(ev.timestamp).toLocaleString(localeTag)}
                          {ev.room_name ? ` · ${ev.room_name}` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard icon={Tablet} title={t("patients.devicesSection")} iconColor="text-primary">
              {activeAssignments.length === 0 ? (
                <p className="text-sm text-on-surface-variant py-4">—</p>
              ) : (
                <div className="space-y-2">
                  {activeAssignments.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-surface-container-low text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Tablet className="w-4 h-4 text-on-surface-variant" />
                        <span className="text-on-surface font-medium">{d.device_id}</span>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-surface-container-high text-on-surface-variant">
                        {d.device_role}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </div>

        <aside className="space-y-4">
          <section
            className="surface-card rounded-xl border border-outline-variant/20 p-5 text-[var(--color-on-primary)]"
            style={{ background: "var(--color-primary)" }}
          >
            <div className="flex items-center gap-2 mb-3">
              <User className="w-5 h-5 opacity-90" />
              <h2 className="font-semibold">{t("patients.formSectionEmergency")}</h2>
            </div>
            {primaryContact ? (
              <div className="space-y-3">
                <div>
                  <p className="font-semibold text-lg">{primaryContact.name}</p>
                  {primaryContact.relationship && (
                    <p className="text-sm opacity-90">{primaryContact.relationship}</p>
                  )}
                </div>
                {primaryContact.phone && (
                  <a
                    href={`tel:${primaryContact.phone.replace(/\s/g, "")}`}
                    className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-sm font-semibold transition-smooth"
                  >
                    <Phone className="w-4 h-4" />
                    {primaryContact.phone}
                  </a>
                )}
              </div>
            ) : (
              <p className="text-sm opacity-90">{t("patients.noEmergencyContact")}</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-on-surface-variant">{label}</p>
      <p className="text-sm font-medium text-on-surface mt-0.5">{value}</p>
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
    <div className="surface-card rounded-xl border border-outline-variant/20 p-6">
      <h2 className="font-semibold text-on-surface flex items-center gap-2 mb-4">
        <Icon className={`w-5 h-5 ${iconColor}`} />
        {title}
      </h2>
      {children}
    </div>
  );
}
