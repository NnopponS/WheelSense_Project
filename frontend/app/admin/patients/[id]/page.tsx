"use client";

import { useEffect, useState, useCallback, useId, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { api, ApiError } from "@/lib/api";
import type {
  Patient,
  Caregiver,
  Room,
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
  User,
  CalendarDays,
  Plus,
} from "lucide-react";
import Link from "next/link";
import SearchableListboxPicker, {
  type SearchableListboxOption,
} from "@/components/shared/SearchableListboxPicker";
import { ageYears } from "@/lib/age";
import { useFixedNowMs } from "@/hooks/useFixedNowMs";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/lib/i18n";
import { hasCapability } from "@/lib/permissions";
import { formatStaffRoleLabel } from "@/lib/staffRoleLabel";
import { bodyMassIndex, bmiCategory } from "@/lib/patientMetrics";
import { CalendarView, type CalendarViewMode } from "@/components/calendar/CalendarView";
import { AgendaView } from "@/components/calendar/AgendaView";
import { ScheduleForm } from "@/components/calendar/ScheduleForm";
import { schedulesToCalendarEvents } from "@/components/calendar/scheduleEventMapper";
import type { CareScheduleOut } from "@/lib/api/task-scope-types";

function caregiverSearchText(c: Caregiver): string {
  return [
    `${c.first_name} ${c.last_name}`.trim(),
    `#${c.id}`,
    c.employee_code?.trim() || null,
    c.role,
    c.department?.trim() || null,
  ]
    .filter((v): v is string => Boolean(v && String(v).trim()))
    .join(" ")
    .toLowerCase();
}

function formatCondition(c: MedicalConditionEntry): string {
  if (typeof c === "string") return c;
  const o = c as Record<string, unknown>;
  if (typeof o.label === "string") return o.label;
  if (typeof o.name === "string") return o.name;
  if (typeof o.condition === "string") return o.condition;
  return String(o.type ?? "—");
}

function splitMultilineList(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

type EditableCard = "about" | "chronic" | "allergies" | "medications" | "emergency" | "notes";

type CardDrafts = {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: string;
  care_level: string;
  mobility_type: string;
  blood_type: string;
  height_cm: string;
  weight_kg: string;
  room_id: string;
  is_active: boolean;
  medical_conditions_raw: string;
  allergies_raw: string;
  medications_raw: string;
  emergency_contact_name: string;
  emergency_contact_relationship: string;
  emergency_contact_phone: string;
  emergency_contact_email: string;
  emergency_contact_notes: string;
  notes: string;
};

function buildCardDrafts(patient: Patient, contacts: PatientContact[]): CardDrafts {
  const contact =
    contacts.find((c) => c.is_primary) ||
    contacts.find((c) => c.contact_type === "emergency") ||
    contacts[0] ||
    null;
  return {
    first_name: patient.first_name ?? "",
    last_name: patient.last_name ?? "",
    date_of_birth: patient.date_of_birth ? String(patient.date_of_birth).slice(0, 10) : "",
    gender: patient.gender ?? "",
    care_level: patient.care_level ?? "normal",
    mobility_type: patient.mobility_type ?? "wheelchair",
    blood_type: patient.blood_type ?? "",
    height_cm: patient.height_cm != null ? String(patient.height_cm) : "",
    weight_kg: patient.weight_kg != null ? String(patient.weight_kg) : "",
    room_id: patient.room_id != null ? String(patient.room_id) : "",
    is_active: patient.is_active,
    medical_conditions_raw: (patient.medical_conditions ?? [])
      .map((entry) => formatCondition(entry))
      .filter((entry) => entry !== "—")
      .join("\n"),
    allergies_raw: (patient.allergies ?? []).join("\n"),
    medications_raw: (patient.medications ?? [])
      .map((entry) => (entry?.name ?? "").trim())
      .filter(Boolean)
      .join("\n"),
    emergency_contact_name: contact?.name ?? "",
    emergency_contact_relationship: contact?.relationship ?? "",
    emergency_contact_phone: contact?.phone ?? "",
    emergency_contact_email: contact?.email ?? "",
    emergency_contact_notes: contact?.notes ?? "",
    notes: patient.notes ?? "",
  };
}

export default function PatientDetailPage() {
  const params = useParams();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "";
  const searchParams = useSearchParams();
  const { t, locale } = useTranslation();
  const { user: authUser } = useAuth();
  const nowMs = useFixedNowMs();
  const staffSearchInputId = useId();
  const staffSearchListboxId = useId();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [contacts, setContacts] = useState<PatientContact[]>([]);
  const [roomDetail, setRoomDetail] = useState<Room | null>(null);
  const [caregiverPool, setCaregiverPool] = useState<Caregiver[]>([]);
  const [caregiverDraftIds, setCaregiverDraftIds] = useState<number[]>([]);
  const [staffSearch, setStaffSearch] = useState("");
  const [staffSaving, setStaffSaving] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [vitals, setVitals] = useState<VitalReading[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [assignments, setAssignments] = useState<DeviceAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingCard, setEditingCard] = useState<EditableCard | null>(null);
  const [savingCard, setSavingCard] = useState<EditableCard | null>(null);
  const [cardErrors, setCardErrors] = useState<Partial<Record<EditableCard, string>>>({});
  const [cardDrafts, setCardDrafts] = useState<CardDrafts>({
    first_name: "",
    last_name: "",
    date_of_birth: "",
    gender: "",
    care_level: "normal",
    mobility_type: "wheelchair",
    blood_type: "",
    height_cm: "",
    weight_kg: "",
    room_id: "",
    is_active: true,
    medical_conditions_raw: "",
    allergies_raw: "",
    medications_raw: "",
    emergency_contact_name: "",
    emergency_contact_relationship: "",
    emergency_contact_phone: "",
    emergency_contact_email: "",
    emergency_contact_notes: "",
    notes: "",
  });
  const [linkedPortalUsers, setLinkedPortalUsers] = useState<PortalUser[]>([]);
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [accountDraft, setAccountDraft] = useState({
    username: "",
    role: "",
    is_active: true,
    password: "",
    caregiver_id: "",
    patient_id: "",
  });
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [calendarViewMode, setCalendarViewMode] = useState<CalendarViewMode>("month");
  const [calendarAnchor, setCalendarAnchor] = useState(() => new Date());
  const [scheduleFormOpen, setScheduleFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<CareScheduleOut | null>(null);
  const [schedulePickerDate, setSchedulePickerDate] = useState<Date | undefined>();

  const fetchData = useCallback(async () => {
    try {
      const pid = Number(id);
      const p = await api.get<Patient>(`/patients/${id}`);
      setPatient(p);

      const [c, v, a, tl, d, users, pool, assigned] = await Promise.all([
        api.get<PatientContact[]>(`/patients/${id}/contacts`).catch(() => []),
        api
          .get<VitalReading[]>(`/vitals/readings?patient_id=${id}&limit=20`)
          .catch(() => []),
        api.get<Alert[]>(`/alerts?patient_id=${id}`).catch(() => []),
        api.get<TimelineEvent[]>(`/timeline?patient_id=${id}`).catch(() => []),
        api.get<DeviceAssignment[]>(`/patients/${id}/devices`).catch(() => []),
        api.get<PortalUser[]>("/users").catch(() => []),
        api.get<Caregiver[]>("/caregivers?limit=1000").catch(() => []),
        api.get<Caregiver[]>(`/patients/${id}/caregivers`).catch(() => []),
      ]);
      setContacts(c);
      setVitals(v);
      setAlerts(a);
      setTimeline(tl);
      setAssignments(d);
      const poolMerged = new Map<number, Caregiver>();
      (pool ?? []).forEach((c) => poolMerged.set(c.id, c));
      (assigned ?? []).forEach((c) => {
        if (!poolMerged.has(c.id)) poolMerged.set(c.id, c);
      });
      setCaregiverPool([...poolMerged.values()]);
      setCaregiverDraftIds(assigned.map((cg) => cg.id));
      setStaffError(null);
      setLinkedPortalUsers(
        Array.isArray(users) ? users.filter((u) => u.patient_id === pid) : [],
      );

      if (p.room_id != null) {
        try {
          const room = await api.get<Room>(`/rooms/${p.room_id}`);
          setRoomDetail(room);
        } catch {
          setRoomDetail(null);
        }
      } else {
        setRoomDetail(null);
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
      if (!patient) return;
      setCardDrafts(buildCardDrafts(patient, contacts));
      setEditingCard("about");
    }
  }, [contacts, patient, searchParams]);

  const clearEditQuery = useCallback(() => {
    if (typeof window === "undefined") return;
    if (searchParams.get("edit") !== "1") return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("edit");
    const next = params.toString();
    window.history.replaceState(null, "", next ? `${window.location.pathname}?${next}` : window.location.pathname);
  }, [searchParams]);

  const canManageResponsibleStaff = Boolean(
    authUser &&
      (hasCapability(authUser.role, "patients.manage") ||
        hasCapability(authUser.role, "caregivers.manage")),
  );

  const caregiversById = useMemo(() => {
    const m = new Map<number, Caregiver>();
    caregiverPool.forEach((c) => m.set(c.id, c));
    return m;
  }, [caregiverPool]);

  const caregiverDraftSet = useMemo(() => new Set(caregiverDraftIds), [caregiverDraftIds]);

  const staffPickerOptions = useMemo<SearchableListboxOption[]>(() => {
    const q = staffSearch.trim().toLowerCase();
    return caregiverPool
      .filter((c) => !caregiverDraftSet.has(c.id))
      .filter((c) => !q || caregiverSearchText(c).includes(q))
      .slice(0, 80)
      .map((c) => ({
        id: String(c.id),
        title: `${c.first_name} ${c.last_name}`.trim() || `Staff #${c.id}`,
        subtitle: [
          formatStaffRoleLabel(c.role, t),
          c.employee_code?.trim() || null,
          `#${c.id}`,
        ]
          .filter(Boolean)
          .join(" · "),
      }));
  }, [caregiverPool, caregiverDraftSet, staffSearch, t]);

  const draftCaregiversOrdered = useMemo(() => {
    return caregiverDraftIds
      .map((cid) => caregiversById.get(cid))
      .filter((c): c is Caregiver => Boolean(c));
  }, [caregiverDraftIds, caregiversById]);

  const handleSaveResponsibleStaff = useCallback(async () => {
    if (!canManageResponsibleStaff) return;
    setStaffSaving(true);
    setStaffError(null);
    try {
      await api.put(`/patients/${id}/caregivers`, { caregiver_ids: caregiverDraftIds });
      await fetchData();
    } catch (e) {
      setStaffError(e instanceof ApiError ? e.message : t("patients.empty"));
    } finally {
      setStaffSaving(false);
    }
  }, [canManageResponsibleStaff, id, caregiverDraftIds, fetchData, t]);

  const canManageSchedules = Boolean(authUser && hasCapability(authUser.role, "workflow.manage"));
  const canManageAccounts = Boolean(authUser && hasCapability(authUser.role, "users.manage"));
  const canEditPatient = Boolean(authUser && hasCapability(authUser.role, "patients.manage"));

  const schedulesQuery = useQuery({
    queryKey: ["admin", "patient-detail", "schedules", id],
    enabled: Number.isFinite(Number(id)),
    queryFn: () => api.listWorkflowSchedules({ patient_id: Number(id), limit: 300 }),
  });

  const patientNameById = useMemo(() => {
    if (!patient) return new Map<number, string>();
    const full = `${patient.first_name} ${patient.last_name}`.trim() || `Patient #${patient.id}`;
    return new Map([[patient.id, full]]);
  }, [patient]);

  const patientSchedules = useMemo(
    () => ((schedulesQuery.data ?? []) as CareScheduleOut[]).filter((row) => row.patient_id === Number(id)),
    [id, schedulesQuery.data],
  );

  const patientCalendarEvents = useMemo(
    () => schedulesToCalendarEvents(patientSchedules, patientNameById),
    [patientNameById, patientSchedules],
  );

  const startEditingCard = useCallback(
    (card: EditableCard) => {
      if (!patient) return;
      setCardDrafts(buildCardDrafts(patient, contacts));
      setCardErrors((prev) => ({ ...prev, [card]: "" }));
      setEditingCard(card);
    },
    [contacts, patient],
  );

  const cancelEditingCard = useCallback(() => {
    setEditingCard(null);
    setSavingCard(null);
    clearEditQuery();
  }, [clearEditQuery]);

  const setCardError = useCallback((card: EditableCard, message: string) => {
    setCardErrors((prev) => ({ ...prev, [card]: message }));
  }, []);

  const saveCard = useCallback(
    async (card: EditableCard) => {
      if (!patient) return;
      if (!canEditPatient) return;
      if (savingCard) return;
      setSavingCard(card);
      setCardError(card, "");
      try {
        if (card === "about") {
          if (!cardDrafts.first_name.trim() || !cardDrafts.last_name.trim()) {
            setCardError(card, t("patients.editorErrFirstName"));
            return;
          }
          await api.patchPatient(patient.id, {
            first_name: cardDrafts.first_name.trim(),
            last_name: cardDrafts.last_name.trim(),
            date_of_birth: cardDrafts.date_of_birth.trim() || null,
            gender: cardDrafts.gender.trim(),
            care_level: cardDrafts.care_level,
            mobility_type: cardDrafts.mobility_type,
            blood_type: cardDrafts.blood_type,
            height_cm: cardDrafts.height_cm.trim() ? Number(cardDrafts.height_cm) : null,
            weight_kg: cardDrafts.weight_kg.trim() ? Number(cardDrafts.weight_kg) : null,
            room_id: cardDrafts.room_id.trim() ? Number(cardDrafts.room_id) : null,
            is_active: cardDrafts.is_active,
          });
        } else if (card === "chronic") {
          const preservedByLabel = new Map<string, MedicalConditionEntry>();
          for (const entry of patient.medical_conditions ?? []) {
            preservedByLabel.set(formatCondition(entry).toLowerCase(), entry);
          }
          const nextConditions = splitMultilineList(cardDrafts.medical_conditions_raw).map((label) => {
            return preservedByLabel.get(label.toLowerCase()) ?? label;
          });
          await api.patchPatient(patient.id, {
            medical_conditions: nextConditions,
          });
        } else if (card === "allergies") {
          await api.patchPatient(patient.id, {
            allergies: splitMultilineList(cardDrafts.allergies_raw),
          });
        } else if (card === "medications") {
          const existing = [...(patient.medications ?? [])];
          const used = new Set<number>();
          const nextMedications = splitMultilineList(cardDrafts.medications_raw).map((name) => {
            const index = existing.findIndex(
              (row, i) =>
                !used.has(i) && String(row?.name ?? "").trim().toLowerCase() === name.toLowerCase(),
            );
            if (index >= 0) {
              used.add(index);
              const row = existing[index];
              return {
                name,
                dosage: row?.dosage ?? "",
                frequency: row?.frequency ?? "",
                instructions: row?.instructions ?? "",
              };
            }
            return {
              name,
              dosage: "",
              frequency: "",
              instructions: "",
            };
          });
          await api.patchPatient(patient.id, {
            medications: nextMedications,
          });
        } else if (card === "notes") {
          await api.patchPatient(patient.id, {
            notes: cardDrafts.notes.trim(),
          });
        } else if (card === "emergency") {
          const existingEmergency =
            contacts.find((c) => c.contact_type === "emergency") ||
            contacts.find((c) => c.is_primary) ||
            null;
          const hasName = cardDrafts.emergency_contact_name.trim().length > 0;
          const hasPhone = cardDrafts.emergency_contact_phone.trim().length > 0;
          if (hasName && hasPhone) {
            const payload = {
              contact_type: "emergency",
              name: cardDrafts.emergency_contact_name.trim(),
              relationship: cardDrafts.emergency_contact_relationship.trim(),
              phone: cardDrafts.emergency_contact_phone.trim(),
              email: cardDrafts.emergency_contact_email.trim(),
              notes: cardDrafts.emergency_contact_notes.trim(),
              is_primary: true,
            };
            if (existingEmergency) {
              await api.patch(`/patients/${patient.id}/contacts/${existingEmergency.id}`, payload);
            } else {
              await api.post(`/patients/${patient.id}/contacts`, payload);
            }
          } else if (!hasName && !hasPhone && existingEmergency) {
            await api.delete(`/patients/${patient.id}/contacts/${existingEmergency.id}`);
          } else if (hasName !== hasPhone) {
            setCardError(card, t("patients.editorErrEmergencyPair"));
            return;
          }
        }
        setEditingCard(null);
        clearEditQuery();
        await fetchData();
      } catch (e) {
        setCardError(card, e instanceof ApiError ? e.message : t("patients.empty"));
      } finally {
        setSavingCard(null);
      }
    },
    [canEditPatient, cardDrafts, clearEditQuery, contacts, fetchData, patient, savingCard, setCardError, t],
  );

  function openAccountEditor(user: PortalUser) {
    setEditingAccountId(user.id);
    setAccountError(null);
    setAccountDraft({
      username: user.username,
      role: user.role,
      is_active: user.is_active,
      password: "",
      caregiver_id: user.caregiver_id != null ? String(user.caregiver_id) : "",
      patient_id: user.patient_id != null ? String(user.patient_id) : "",
    });
  }

  async function saveAccountEditor(userId: number) {
    if (!canManageAccounts) return;
    setAccountBusy(true);
    setAccountError(null);
    try {
      await api.put(`/users/${userId}`, {
        username: accountDraft.username.trim(),
        role: accountDraft.role,
        is_active: accountDraft.is_active,
        caregiver_id: accountDraft.caregiver_id.trim() ? Number(accountDraft.caregiver_id) : null,
        patient_id: accountDraft.patient_id.trim() ? Number(accountDraft.patient_id) : null,
        password: accountDraft.password.trim() || undefined,
      });
      setEditingAccountId(null);
      const refreshed = await api.get<PortalUser[]>("/users");
      setLinkedPortalUsers(refreshed.filter((u) => u.patient_id === Number(id)));
    } catch (e) {
      setAccountError(e instanceof ApiError ? e.message : t("patients.userLoadErr"));
    } finally {
      setAccountBusy(false);
    }
  }

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
        <p className="text-foreground font-medium">{error || t("patients.empty")}</p>
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
  const patientPhotoUrl = patient.photo_url?.trim();

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
  const isEditingAbout = editingCard === "about";
  const isSavingAbout = savingCard === "about";

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/admin/patients"
          className="inline-flex items-center gap-2 text-sm text-foreground-variant hover:text-primary transition-smooth"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("patients.backToList")}
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <section className="surface-card rounded-xl border border-outline-variant/20 p-6">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground-variant">
                {t("patients.detailAbout")}
              </p>
              {canEditPatient && isEditingAbout ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-foreground-variant hover:bg-surface-container-high"
                    onClick={cancelEditingCard}
                    disabled={isSavingAbout}
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary/90"
                    onClick={() => void saveCard("about")}
                    disabled={isSavingAbout || !cardDrafts.first_name.trim() || !cardDrafts.last_name.trim()}
                  >
                    {isSavingAbout ? t("common.saving") : t("common.save")}
                  </button>
                </div>
              ) : canEditPatient ? (
                <button
                  type="button"
                  className="rounded-lg border border-outline-variant/30 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-container-high"
                  onClick={() => startEditingCard("about")}
                >
                  {t("common.edit")}
                </button>
              ) : null}
            </div>
            {isEditingAbout ? (
              <div className="mb-5 grid gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs text-foreground-variant">{t("patients.firstName")}</span>
                  <input className="input-field w-full text-sm" value={cardDrafts.first_name} onChange={(event) => setCardDrafts((prev) => ({ ...prev, first_name: event.target.value }))} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-foreground-variant">{t("patients.lastName")}</span>
                  <input className="input-field w-full text-sm" value={cardDrafts.last_name} onChange={(event) => setCardDrafts((prev) => ({ ...prev, last_name: event.target.value }))} />
                </label>
                <label className="space-y-1"><span className="text-xs text-foreground-variant">{t("patients.dateOfBirth")}</span><input type="date" className="input-field w-full text-sm" value={cardDrafts.date_of_birth} onChange={(event) => setCardDrafts((prev) => ({ ...prev, date_of_birth: event.target.value }))} /></label>
                <label className="space-y-1"><span className="text-xs text-foreground-variant">{t("patients.gender")}</span><select className="input-field w-full text-sm" value={cardDrafts.gender} onChange={(event) => setCardDrafts((prev) => ({ ...prev, gender: event.target.value }))}><option value="">{t("patients.genderUnset")}</option><option value="male">{t("patients.genderMale")}</option><option value="female">{t("patients.genderFemale")}</option><option value="other">{t("patients.genderOther")}</option></select></label>
                <label className="space-y-1"><span className="text-xs text-foreground-variant">{t("patients.careLevel")}</span><select className="input-field w-full text-sm" value={cardDrafts.care_level} onChange={(event) => setCardDrafts((prev) => ({ ...prev, care_level: event.target.value }))}><option value="normal">{t("patients.careLevelNormal")}</option><option value="special">{t("patients.careLevelSpecial")}</option><option value="critical">{t("patients.careLevelCritical")}</option></select></label>
                <label className="space-y-1"><span className="text-xs text-foreground-variant">{t("patients.mobilityType")}</span><select className="input-field w-full text-sm" value={cardDrafts.mobility_type} onChange={(event) => setCardDrafts((prev) => ({ ...prev, mobility_type: event.target.value }))}><option value="wheelchair">{t("patients.mobilityWheelchair")}</option><option value="walker">{t("patients.mobilityWalker")}</option><option value="independent">{t("patients.mobilityIndependent")}</option></select></label>
                <label className="space-y-1"><span className="text-xs text-foreground-variant">{t("patients.bloodType")}</span><input className="input-field w-full text-sm" value={cardDrafts.blood_type} onChange={(event) => setCardDrafts((prev) => ({ ...prev, blood_type: event.target.value }))} /></label>
                <label className="space-y-1"><span className="text-xs text-foreground-variant">{t("patients.heightCm")}</span><input className="input-field w-full text-sm" value={cardDrafts.height_cm} onChange={(event) => setCardDrafts((prev) => ({ ...prev, height_cm: event.target.value }))} /></label>
                <label className="space-y-1"><span className="text-xs text-foreground-variant">{t("patients.weightKg")}</span><input className="input-field w-full text-sm" value={cardDrafts.weight_kg} onChange={(event) => setCardDrafts((prev) => ({ ...prev, weight_kg: event.target.value }))} /></label>
                <label className="space-y-1"><span className="text-xs text-foreground-variant">{t("patients.room")}</span><input className="input-field w-full text-sm" value={cardDrafts.room_id} onChange={(event) => setCardDrafts((prev) => ({ ...prev, room_id: event.target.value }))} placeholder={t("patients.noRoom")} /></label>
                <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={cardDrafts.is_active} onChange={(event) => setCardDrafts((prev) => ({ ...prev, is_active: event.target.checked }))} />{t("patients.statusActive")}</label>
              </div>
            ) : null}
            {cardErrors.about ? <p className="mb-3 text-sm text-error">{cardErrors.about}</p> : null}
            <div className="flex flex-col sm:flex-row gap-5">
              <div className="relative w-full sm:w-40 aspect-[4/5] rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-end justify-start overflow-hidden shrink-0 border border-outline-variant/20">
                <span className="absolute bottom-2 left-2 text-[10px] font-mono font-semibold text-foreground/90 bg-black/35 px-2 py-0.5 rounded">
                  {t("patients.detailPatientId")} #{patient.id}
                </span>
                {patientPhotoUrl ? (
                  <Image
                    src={patientPhotoUrl}
                    alt={`${patient.first_name} ${patient.last_name}`}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-primary/40">
                    {patient.first_name?.[0]}
                    {patient.last_name?.[0]}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-foreground">
                  {patient.first_name} {patient.last_name}
                </h1>
                <p className="text-sm text-foreground-variant mt-1">
                  {age != null ? `${age} ${t("patients.years")}` : "—"}
                  {" · "}
                  {genderLabel}
                </p>
                <div className="text-sm text-foreground-variant mt-2 space-y-1">
                  <p>
                    <span className="font-medium text-foreground-variant">{t("patients.room")}: </span>
                    {patient.room_id == null ? (
                      <span className="font-medium text-foreground">{t("patients.noRoom")}</span>
                    ) : roomDetail ? (
                      <span className="font-medium text-foreground">
                        {roomDetail.name?.trim() || `Room #${roomDetail.id}`}
                        {roomDetail.facility_name || roomDetail.floor_name
                          ? ` · ${[roomDetail.facility_name, roomDetail.floor_name].filter(Boolean).join(" · ")}`
                          : ""}
                      </span>
                    ) : (
                      <span className="font-medium text-foreground">
                        #{patient.room_id}
                        <span className="text-foreground-variant font-normal"> — {t("patients.roomDetailsUnavailable")}</span>
                      </span>
                    )}
                  </p>
                  <p>
                    <Link
                      href="/admin/facility-management"
                      className="text-primary text-sm font-semibold hover:underline"
                    >
                      {t("patients.roomOpenFacility")}
                    </Link>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  <span className={`text-xs px-3 py-1 rounded-full font-medium care-${patient.care_level}`}>
                    {patient.care_level}
                  </span>
                  <span className="text-xs px-3 py-1 rounded-full bg-surface-container-high text-foreground-variant">
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
            <h2 className="font-semibold text-foreground mb-4">{t("patients.sectionLinkedAccounts")}</h2>
            {linkedPortalUsers.length === 0 ? (
              <p className="text-sm text-foreground-variant">{t("patients.linkedAccountsEmpty")}</p>
            ) : (
              <ul className="space-y-3">
                {linkedPortalUsers.map((u) => (
                  <li
                    key={u.id}
                    className="rounded-xl border border-outline-variant/15 bg-surface-container-low/50 px-4 py-3 text-sm"
                  >
                    {editingAccountId === u.id && canManageAccounts ? (
                      <div className="space-y-3">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="space-y-1">
                            <span className="text-xs text-foreground-variant">{t("admin.users.username")}</span>
                            <input className="input-field w-full text-sm" value={accountDraft.username} onChange={(event) => setAccountDraft((prev) => ({ ...prev, username: event.target.value }))} />
                          </label>
                          <label className="space-y-1">
                            <span className="text-xs text-foreground-variant">{t("admin.users.role")}</span>
                            <select className="input-field w-full text-sm" value={accountDraft.role} onChange={(event) => setAccountDraft((prev) => ({ ...prev, role: event.target.value }))}>
                              <option value="admin">{t("shell.roleAdmin")}</option>
                              <option value="head_nurse">{t("shell.roleHeadNurse")}</option>
                              <option value="supervisor">{t("shell.roleSupervisor")}</option>
                              <option value="observer">{t("shell.roleObserver")}</option>
                              <option value="patient">{t("shell.rolePatient")}</option>
                            </select>
                          </label>
                          <label className="space-y-1">
                            <span className="text-xs text-foreground-variant">{t("accountMgmt.pickStaff")}</span>
                            <input className="input-field w-full text-sm" value={accountDraft.caregiver_id} onChange={(event) => setAccountDraft((prev) => ({ ...prev, caregiver_id: event.target.value }))} />
                          </label>
                          <label className="space-y-1">
                            <span className="text-xs text-foreground-variant">{t("accountMgmt.pickPatient")}</span>
                            <input className="input-field w-full text-sm" value={accountDraft.patient_id} onChange={(event) => setAccountDraft((prev) => ({ ...prev, patient_id: event.target.value }))} />
                          </label>
                          <label className="space-y-1 sm:col-span-2">
                            <span className="text-xs text-foreground-variant">{t("admin.users.resetPassword")}</span>
                            <input type="password" className="input-field w-full text-sm" placeholder={t("patients.editorPasswordOptionalHint")} value={accountDraft.password} onChange={(event) => setAccountDraft((prev) => ({ ...prev, password: event.target.value }))} />
                          </label>
                          <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
                            <input type="checkbox" checked={accountDraft.is_active} onChange={(event) => setAccountDraft((prev) => ({ ...prev, is_active: event.target.checked }))} />
                            {t("patients.statusActive")}
                          </label>
                        </div>
                        {accountError ? <p className="text-xs text-error">{accountError}</p> : null}
                        <div className="flex items-center justify-end gap-2">
                          <button type="button" className="rounded-lg px-3 py-1.5 text-xs font-medium text-foreground-variant hover:bg-surface-container-high" onClick={() => setEditingAccountId(null)} disabled={accountBusy}>
                            {t("common.cancel")}
                          </button>
                          <button type="button" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary/90" onClick={() => void saveAccountEditor(u.id)} disabled={accountBusy}>
                            {accountBusy ? t("common.saving") : t("common.save")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-foreground">{u.username}</p>
                          <p className="text-xs text-foreground-variant capitalize">{u.role}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ${
                              u.is_active ? "care-normal" : "bg-surface-container text-outline"
                            }`}
                          >
                            {u.is_active ? t("patients.statusActive") : t("patients.statusInactive")}
                          </span>
                          {canManageAccounts ? (
                            <button
                              type="button"
                              className="text-xs font-semibold text-primary hover:underline"
                              onClick={() => openAccountEditor(u)}
                            >
                              {t("common.edit")}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="surface-card rounded-xl border border-outline-variant/20 p-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="font-semibold text-foreground">{t("patients.sectionChronic")}</h2>
              {canEditPatient ? (
                editingCard === "chronic" ? (
                  <div className="flex items-center gap-2">
                    <button type="button" className="rounded-lg px-3 py-1.5 text-xs font-medium text-foreground-variant hover:bg-surface-container-high" onClick={cancelEditingCard} disabled={savingCard === "chronic"}>{t("common.cancel")}</button>
                    <button type="button" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary/90" onClick={() => void saveCard("chronic")} disabled={savingCard === "chronic"}>{savingCard === "chronic" ? t("common.saving") : t("common.save")}</button>
                  </div>
                ) : (
                  <button type="button" className="rounded-lg border border-outline-variant/30 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-container-high" onClick={() => startEditingCard("chronic")}>{t("common.edit")}</button>
                )
              ) : null}
            </div>
            {editingCard === "chronic" ? (
              <textarea className="input-field min-h-[110px] w-full text-sm" value={cardDrafts.medical_conditions_raw} onChange={(event) => setCardDrafts((prev) => ({ ...prev, medical_conditions_raw: event.target.value }))} placeholder={t("patients.chronicPlaceholder")} />
            ) : patient.medical_conditions.length === 0 ? (
              <p className="text-sm text-foreground-variant">—</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {patient.medical_conditions.map((c, i) => (
                  <li
                    key={i}
                    className="text-sm px-3 py-1.5 rounded-lg bg-surface-container-high text-foreground"
                  >
                    {formatCondition(c)}
                  </li>
                ))}
              </ul>
            )}
            {cardErrors.chronic ? <p className="mt-3 text-sm text-error">{cardErrors.chronic}</p> : null}
          </section>

          <section className="surface-card rounded-xl border border-outline-variant/20 p-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="font-semibold text-foreground">{t("patients.sectionAllergies")}</h2>
              {canEditPatient ? (
                editingCard === "allergies" ? (
                  <div className="flex items-center gap-2">
                    <button type="button" className="rounded-lg px-3 py-1.5 text-xs font-medium text-foreground-variant hover:bg-surface-container-high" onClick={cancelEditingCard} disabled={savingCard === "allergies"}>{t("common.cancel")}</button>
                    <button type="button" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary/90" onClick={() => void saveCard("allergies")} disabled={savingCard === "allergies"}>{savingCard === "allergies" ? t("common.saving") : t("common.save")}</button>
                  </div>
                ) : (
                  <button type="button" className="rounded-lg border border-outline-variant/30 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-container-high" onClick={() => startEditingCard("allergies")}>{t("common.edit")}</button>
                )
              ) : null}
            </div>
            {editingCard === "allergies" ? (
              <textarea className="input-field min-h-[110px] w-full text-sm" value={cardDrafts.allergies_raw} onChange={(event) => setCardDrafts((prev) => ({ ...prev, allergies_raw: event.target.value }))} placeholder={t("patients.allergiesPlaceholder")} />
            ) : patient.allergies.length === 0 ? (
              <p className="text-sm text-foreground-variant">—</p>
            ) : (
              <ul className="space-y-2">
                {patient.allergies.map((a, i) => (
                  <li
                    key={i}
                    className="text-sm px-4 py-3 rounded-lg bg-error/10 border border-error/20 text-foreground"
                  >
                    {a}
                  </li>
                ))}
              </ul>
            )}
            {cardErrors.allergies ? <p className="mt-3 text-sm text-error">{cardErrors.allergies}</p> : null}
          </section>

          {surgeries.length > 0 && (
            <section className="surface-card rounded-xl border border-outline-variant/20 p-6">
              <h2 className="font-semibold text-foreground mb-4">{t("patients.sectionSurgeries")}</h2>
              <ul className="space-y-3">
                {surgeries.map((s, i) => (
                  <li
                    key={i}
                    className="text-sm border border-outline-variant/15 rounded-lg p-4 bg-surface-container-low/50"
                  >
                    <p className="font-medium text-foreground">{s.procedure || "—"}</p>
                    <p className="text-foreground-variant text-xs mt-1">
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
              <h2 className="font-semibold text-foreground">{t("patients.sectionMeds")}</h2>
              <div className="flex items-center gap-2">
                {medCount > 0 && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/15 text-primary">
                    {medCount} {t("patients.activeMedsBadge")}
                  </span>
                )}
                {canEditPatient ? (
                  editingCard === "medications" ? (
                    <>
                      <button type="button" className="rounded-lg px-3 py-1.5 text-xs font-medium text-foreground-variant hover:bg-surface-container-high" onClick={cancelEditingCard} disabled={savingCard === "medications"}>{t("common.cancel")}</button>
                      <button type="button" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary/90" onClick={() => void saveCard("medications")} disabled={savingCard === "medications"}>{savingCard === "medications" ? t("common.saving") : t("common.save")}</button>
                    </>
                  ) : (
                    <button type="button" className="rounded-lg border border-outline-variant/30 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-container-high" onClick={() => startEditingCard("medications")}>{t("common.edit")}</button>
                  )
                ) : null}
              </div>
            </div>
            {editingCard === "medications" ? (
              <textarea className="input-field min-h-[110px] w-full text-sm" value={cardDrafts.medications_raw} onChange={(event) => setCardDrafts((prev) => ({ ...prev, medications_raw: event.target.value }))} placeholder={t("patients.medName")} />
            ) : medCount === 0 ? (
              <p className="text-sm text-foreground-variant">—</p>
            ) : (
              <ul className="space-y-3">
                {patient.medications
                  .filter((m) => (m.name || "").trim())
                  .map((m, i) => (
                    <li
                      key={i}
                      className="text-sm border border-outline-variant/15 rounded-lg p-4"
                    >
                      <p className="font-semibold text-foreground">{m.name}</p>
                      <p className="text-foreground-variant mt-1">
                        {[m.dosage, m.frequency].filter(Boolean).join(" · ") || "—"}
                      </p>
                      {m.instructions && (
                        <p className="text-xs text-foreground-variant mt-2 uppercase tracking-wide">
                          {m.instructions}
                        </p>
                      )}
                    </li>
                  ))}
              </ul>
            )}
            {cardErrors.medications ? <p className="mt-3 text-sm text-error">{cardErrors.medications}</p> : null}
          </section>

          <section className="surface-card rounded-xl border border-outline-variant/20 p-6">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="font-semibold text-foreground">{t("patients.formSectionNotes")}</h2>
              {canEditPatient ? (
                editingCard === "notes" ? (
                  <div className="flex items-center gap-2">
                    <button type="button" className="rounded-lg px-3 py-1.5 text-xs font-medium text-foreground-variant hover:bg-surface-container-high" onClick={cancelEditingCard} disabled={savingCard === "notes"}>{t("common.cancel")}</button>
                    <button type="button" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary/90" onClick={() => void saveCard("notes")} disabled={savingCard === "notes"}>{savingCard === "notes" ? t("common.saving") : t("common.save")}</button>
                  </div>
                ) : (
                  <button type="button" className="rounded-lg border border-outline-variant/30 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-container-high" onClick={() => startEditingCard("notes")}>{t("common.edit")}</button>
                )
              ) : null}
            </div>
            {editingCard === "notes" ? (
              <textarea className="input-field min-h-[110px] w-full text-sm" value={cardDrafts.notes} onChange={(event) => setCardDrafts((prev) => ({ ...prev, notes: event.target.value }))} />
            ) : patient.notes?.trim() ? (
              <p className="text-sm text-foreground-variant whitespace-pre-wrap">{patient.notes}</p>
            ) : (
              <p className="text-sm text-foreground-variant">—</p>
            )}
            {cardErrors.notes ? <p className="mt-3 text-sm text-error">{cardErrors.notes}</p> : null}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard icon={Heart} title={t("patients.latestVitals")} iconColor="text-error">
              {vitals.length === 0 ? (
                <p className="text-sm text-foreground-variant py-4">—</p>
              ) : (
                <div className="space-y-2">
                  {vitals.slice(0, 5).map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-surface-container-low text-sm"
                    >
                      <span className="text-foreground-variant">
                        {new Date(v.timestamp).toLocaleString(localeTag)}
                      </span>
                      <div className="flex gap-4 text-foreground font-medium">
                        {v.heart_rate_bpm != null && <span>HR: {v.heart_rate_bpm}</span>}
                        {v.spo2 != null && <span>SpO2: {v.spo2}%</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard icon={Bell} title={t("patients.alertsSection")} iconColor="text-warning">
              {alerts.length === 0 ? (
                <p className="text-sm text-foreground-variant py-4">—</p>
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
                        <p className="font-medium text-foreground truncate">{a.title}</p>
                        <p className="text-xs text-foreground-variant truncate">{a.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard icon={Clock} title={t("patients.timelineSection")} iconColor="text-info">
              {timeline.length === 0 ? (
                <p className="text-sm text-foreground-variant py-4">—</p>
              ) : (
                <div className="space-y-2">
                  {timeline.slice(0, 5).map((ev) => (
                    <div key={ev.id} className="flex items-start gap-3 p-3 rounded-lg bg-surface-container-low text-sm">
                      <Activity className="w-4 h-4 text-foreground-variant shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-foreground">{ev.event_type}</p>
                        <p className="text-xs text-foreground-variant">{ev.description}</p>
                        <p className="text-xs text-foreground-variant mt-1">
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
                <p className="text-sm text-foreground-variant py-4">—</p>
              ) : (
                <div className="space-y-2">
                  {activeAssignments.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-surface-container-low text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Tablet className="w-4 h-4 text-foreground-variant" />
                        <span className="text-foreground font-medium">{d.device_id}</span>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-surface-container-high text-foreground-variant">
                        {d.device_role}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <section className="surface-card rounded-xl border border-outline-variant/20 p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-primary" />
                {t("caregivers.workPanel.calendarTitle")}
              </h2>
              {canManageSchedules ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary/90"
                  onClick={() => {
                    setEditingSchedule(null);
                    setSchedulePickerDate(new Date());
                    setScheduleFormOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  {t("caregivers.workPanel.addSupplementary")}
                </button>
              ) : null}
            </div>
            <CalendarView
              events={patientCalendarEvents}
              viewMode={calendarViewMode}
              onViewModeChange={setCalendarViewMode}
              currentDate={calendarAnchor}
              onDateChange={setCalendarAnchor}
              onEventClick={(ev) => {
                if (!canManageSchedules) return;
                const full = patientSchedules.find((row) => row.id === ev.id) ?? null;
                setEditingSchedule(full);
                setSchedulePickerDate(new Date(ev.startTime));
                setScheduleFormOpen(true);
              }}
              onDateClick={(date) => {
                if (!canManageSchedules) return;
                setEditingSchedule(null);
                setSchedulePickerDate(date);
                setScheduleFormOpen(true);
              }}
              onCreateClick={() => {
                if (!canManageSchedules) return;
                setEditingSchedule(null);
                setSchedulePickerDate(new Date());
                setScheduleFormOpen(true);
              }}
              showCreateButton={canManageSchedules}
            />
            <AgendaView
              events={patientCalendarEvents}
              onEventClick={(ev) => {
                if (!canManageSchedules) return;
                const full = patientSchedules.find((row) => row.id === ev.id) ?? null;
                if (!full) return;
                setEditingSchedule(full);
                setSchedulePickerDate(new Date(ev.startTime));
                setScheduleFormOpen(true);
              }}
            />
          </section>
        </div>

        <aside className="space-y-4">
          <section
            className="surface-card rounded-xl border border-outline-variant/20 p-5 text-[var(--color-on-primary)]"
            style={{ background: "var(--color-primary)" }}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <User className="w-5 h-5 opacity-90" />
                <h2 className="font-semibold">{t("patients.formSectionEmergency")}</h2>
              </div>
              {canEditPatient ? (
                editingCard === "emergency" ? (
                  <div className="flex items-center gap-2">
                    <button type="button" className="rounded-lg px-2 py-1 text-xs font-medium text-white/85 hover:bg-white/15" onClick={cancelEditingCard} disabled={savingCard === "emergency"}>{t("common.cancel")}</button>
                    <button type="button" className="rounded-lg bg-white/20 px-2 py-1 text-xs font-semibold text-white hover:bg-white/30" onClick={() => void saveCard("emergency")} disabled={savingCard === "emergency"}>{savingCard === "emergency" ? t("common.saving") : t("common.save")}</button>
                  </div>
                ) : (
                  <button type="button" className="rounded-lg border border-white/30 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/15" onClick={() => startEditingCard("emergency")}>{t("common.edit")}</button>
                )
              ) : null}
            </div>
            {editingCard === "emergency" ? (
              <div className="space-y-2">
                <input className="input-field w-full text-sm" placeholder={t("patients.ecName")} value={cardDrafts.emergency_contact_name} onChange={(event) => setCardDrafts((prev) => ({ ...prev, emergency_contact_name: event.target.value }))} />
                <input className="input-field w-full text-sm" placeholder={t("patients.ecRelationship")} value={cardDrafts.emergency_contact_relationship} onChange={(event) => setCardDrafts((prev) => ({ ...prev, emergency_contact_relationship: event.target.value }))} />
                <input className="input-field w-full text-sm" placeholder={t("patients.ecPhone")} value={cardDrafts.emergency_contact_phone} onChange={(event) => setCardDrafts((prev) => ({ ...prev, emergency_contact_phone: event.target.value }))} />
                <input className="input-field w-full text-sm" placeholder={t("patients.ecEmail")} value={cardDrafts.emergency_contact_email} onChange={(event) => setCardDrafts((prev) => ({ ...prev, emergency_contact_email: event.target.value }))} />
                <textarea className="input-field min-h-[88px] w-full text-sm" placeholder={t("patients.ecContactNotes")} value={cardDrafts.emergency_contact_notes} onChange={(event) => setCardDrafts((prev) => ({ ...prev, emergency_contact_notes: event.target.value }))} />
              </div>
            ) : primaryContact ? (
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
            {cardErrors.emergency ? <p className="mt-3 text-sm text-white">{cardErrors.emergency}</p> : null}
          </section>

          <section className="surface-card rounded-xl border border-outline-variant/20 p-5">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <h2 className="font-semibold text-foreground flex items-center justify-between gap-2">
                <span>{t("patients.sectionResponsibleStaff")}</span>
                <span className="text-xs font-normal text-foreground-variant">{caregiverDraftIds.length}</span>
              </h2>
              {canManageResponsibleStaff ? (
                <button
                  type="button"
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary/90 disabled:opacity-50 shrink-0"
                  onClick={() => void handleSaveResponsibleStaff()}
                  disabled={staffSaving}
                >
                  {staffSaving ? t("patients.responsibleStaffSaving") : t("patients.responsibleStaffSave")}
                </button>
              ) : null}
            </div>
            {!canManageResponsibleStaff ? (
              <p className="text-xs text-foreground-variant mb-3">{t("patients.responsibleStaffReadOnlyHint")}</p>
            ) : null}
            {staffError ? <p className="text-sm text-critical mb-3">{staffError}</p> : null}
            {canManageResponsibleStaff ? (
              <div className="mb-4">
                <SearchableListboxPicker
                  inputId={staffSearchInputId}
                  listboxId={staffSearchListboxId}
                  options={staffPickerOptions}
                  search={staffSearch}
                  onSearchChange={setStaffSearch}
                  searchPlaceholder={t("patients.searchStaffPlaceholder")}
                  selectedOptionId={null}
                  onSelectOption={(optId) => {
                    const n = Number(optId);
                    if (!Number.isFinite(n)) return;
                    setCaregiverDraftIds((prev) => (prev.includes(n) ? prev : [...prev, n]));
                    setStaffSearch("");
                  }}
                  disabled={staffSaving}
                  listboxAriaLabel={t("patients.responsibleStaffListbox")}
                  noMatchMessage={t("patients.responsibleStaffNoMatch")}
                  emptyStateMessage={
                    staffPickerOptions.length === 0 ? t("caregivers.empty") : null
                  }
                  emptyNoMatch={staffSearch.trim().length > 0}
                />
              </div>
            ) : null}
            {draftCaregiversOrdered.length === 0 ? (
              <p className="text-sm text-foreground-variant">{t("patients.responsibleStaffEmpty")}</p>
            ) : (
              <ul className="space-y-2">
                {draftCaregiversOrdered.map((person) => (
                  <li
                    key={person.id}
                    className="rounded-lg border border-outline-variant/20 p-3 bg-surface-container-low text-sm hover:border-primary/30 transition-smooth"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/admin/caregivers/${person.id}`} className="min-w-0 flex-1">
                        <span className="font-medium text-foreground block">
                          {person.first_name} {person.last_name}
                        </span>
                        <span className="text-xs text-foreground-variant">
                          {formatStaffRoleLabel(person.role, t)}
                          {person.employee_code?.trim() ? ` · ${person.employee_code.trim()}` : ""}
                        </span>
                      </Link>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Link
                          href={`/admin/caregivers/${person.id}`}
                          className="text-xs text-primary font-semibold hover:underline"
                        >
                          {t("caregivers.openFullDetail")}
                        </Link>
                        {canManageResponsibleStaff ? (
                          <button
                            type="button"
                            className="text-xs font-semibold text-critical hover:underline"
                            onClick={() =>
                              setCaregiverDraftIds((prev) => prev.filter((x) => x !== person.id))
                            }
                          >
                            {t("patients.responsibleStaffRemove")}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
      <ScheduleForm
        open={scheduleFormOpen}
        onClose={() => {
          setScheduleFormOpen(false);
          setEditingSchedule(null);
        }}
        onSuccess={() => void schedulesQuery.refetch()}
        initialDate={editingSchedule ? new Date(editingSchedule.starts_at) : schedulePickerDate ?? new Date()}
        schedule={editingSchedule}
        mode={editingSchedule ? "edit" : "create"}
        defaultAssigneeUserId={editingSchedule ? editingSchedule.assigned_user_id : (authUser?.id ?? null)}
        defaultPatientId={patient.id}
        lockedPatientId={patient.id}
      />
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-foreground-variant">{label}</p>
      <p className="text-sm font-medium text-foreground mt-0.5">{value}</p>
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
      <h2 className="font-semibold text-foreground flex items-center gap-2 mb-4">
        <Icon className={`w-5 h-5 ${iconColor}`} />
        {title}
      </h2>
      {children}
    </div>
  );
}
