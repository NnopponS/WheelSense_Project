"use client";

import React, { useEffect, useState, useCallback, useId, useMemo, type ChangeEvent } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { api, ApiError } from "@/lib/api";
import type {
  Patient,
  Caregiver,
  Room,
  User as PortalUser,
  PatientContact,
  MedicalConditionEntry,
} from "@/lib/types";
import {
  Phone,
  CalendarDays,
  Plus,
  MapPin,
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
import {
  resolveCareScheduleIdFromEvent,
  schedulesToCalendarEvents,
  visibleCalendarRange,
} from "@/components/calendar/scheduleEventMapper";
import type { CareScheduleOut } from "@/lib/api/task-scope-types";
import { imageFileToResizedSquareJpegBlob, looksLikeImageFile } from "@/lib/profileImageProcess";
import {
  getPatientsPath,
  getPersonnelPath,
  getCaregiverDetailPath,
} from "@/lib/routes";
import { getSafePatientListReturnTo } from "@/lib/patientListContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import DashboardFloorplanPanel from "@/components/dashboard/DashboardFloorplanPanel";
import { PatientCareCoordinationPanel } from "@/components/patients/PatientCareCoordinationPanel";
import { PatientHealthAnalysisPanel } from "@/components/patients/PatientHealthAnalysisPanel";
import { PersonSensorStatusPanel } from "@/components/shared/PersonSensorStatusPanel";
import UserAvatar from "@/components/shared/UserAvatar";
import { AppPage } from "@/components/layout/AppPage";
import { DataState } from "@/components/layout/DataState";
import { Button } from "@/components/ui/button";

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
  const pathname = usePathname();
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { user: authUser } = useAuth();
  const patientListHref = getSafePatientListReturnTo(
    searchParams.get("returnTo"),
    getPatientsPath(authUser?.role || "admin"),
    [getPersonnelPath(authUser?.role || "admin")],
  );
  const nowMs = useFixedNowMs();
  const staffSearchInputId = useId();
  const staffSearchListboxId = useId();
  const patientPhotoInputId = useId();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [contacts, setContacts] = useState<PatientContact[]>([]);
  const [roomDetail, setRoomDetail] = useState<Room | null>(null);
  const [caregiverPool, setCaregiverPool] = useState<Caregiver[]>([]);
  const [caregiverDraftIds, setCaregiverDraftIds] = useState<number[]>([]);
  const [staffSearch, setStaffSearch] = useState("");
  const [staffSaving, setStaffSaving] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);
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
  const [patientPhotoBusy, setPatientPhotoBusy] = useState(false);
  const [patientPhotoErr, setPatientPhotoErr] = useState<string | null>(null);
  const [patientMapOpen, setPatientMapOpen] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const pid = Number(id);
      const p = await api.get<Patient>(`/patients/${id}`);
      setPatient(p);

      const [c, users, pool, assigned] = await Promise.all([
        api.get<PatientContact[]>(`/patients/${id}/contacts`).catch(() => []),
        api.get<PortalUser[]>("/users").catch(() => []),
        api.get<Caregiver[]>("/caregivers?limit=1000").catch(() => []),
        api.get<Caregiver[]>(`/patients/${id}/caregivers`).catch(() => []),
      ]);
      setContacts(c);
      const userByCaregiverId = new Map<number, PortalUser>();
      if (Array.isArray(users)) {
        for (const user of users) {
          if (typeof user.caregiver_id === "number") {
            userByCaregiverId.set(user.caregiver_id, user);
          }
        }
      }
      const withAccountPhotoFallback = (caregiver: Caregiver): Caregiver => {
        const ownPhoto = caregiver.photo_url?.trim();
        if (ownPhoto) return caregiver;
        const accountPhoto = userByCaregiverId.get(caregiver.id)?.profile_image_url?.trim();
        return accountPhoto ? { ...caregiver, photo_url: accountPhoto } : caregiver;
      };
      const poolMerged = new Map<number, Caregiver>();
      (pool ?? []).forEach((c) => poolMerged.set(c.id, withAccountPhotoFallback(c)));
      (assigned ?? []).forEach((c) => {
        if (!poolMerged.has(c.id)) poolMerged.set(c.id, withAccountPhotoFallback(c));
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

  const mainTab = searchParams.get("tab") === "care" ? "care" : "profile";

  const setMainTab = useCallback(
    (next: "profile" | "care") => {
      const p = new URLSearchParams(searchParams.toString());
      if (next === "profile") {
        p.delete("tab");
      } else {
        p.set("tab", "care");
      }
      const q = p.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    if (searchParams.get("edit") === "1" && mainTab !== "profile") {
      const p = new URLSearchParams(searchParams.toString());
      p.delete("tab");
      const q = p.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    }
  }, [mainTab, pathname, router, searchParams]);

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

  const onPickPatientPhoto = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !patient) return;
      if (!canEditPatient) return;
      if (!looksLikeImageFile(file)) {
        setPatientPhotoErr(t("profile.avatar.errorFileType"));
        return;
      }
      setPatientPhotoBusy(true);
      setPatientPhotoErr(null);
      try {
        const blob = await imageFileToResizedSquareJpegBlob(file);
        const fd = new FormData();
        fd.append("file", blob, "avatar.jpg");
        const updated = await api.postForm<Patient>(`/patients/${patient.id}/profile-image`, fd);
        setPatient(updated);
        await fetchData();
      } catch (e) {
        if (e instanceof ApiError && e.status === 404 && e.message === "Not Found") {
          setPatientPhotoErr(t("profile.avatar.errorUploadEndpointMissing"));
        } else {
          setPatientPhotoErr(e instanceof ApiError ? e.message : t("profile.avatar.errorUpload"));
        }
      } finally {
        setPatientPhotoBusy(false);
        event.target.value = "";
      }
    },
    [patient, canEditPatient, fetchData, t],
  );

  const onRemovePatientPhoto = useCallback(async () => {
    if (!patient || !canEditPatient) return;
    setPatientPhotoBusy(true);
    setPatientPhotoErr(null);
    try {
      const updated = await api.patch<Patient>(`/patients/${patient.id}`, { photo_url: "" });
      setPatient(updated);
      await fetchData();
    } catch (e) {
      setPatientPhotoErr(e instanceof ApiError ? e.message : t("profile.avatar.errorUpload"));
    } finally {
      setPatientPhotoBusy(false);
    }
  }, [patient, canEditPatient, fetchData, t]);

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

  const patientCalendarRange = useMemo(
    () => visibleCalendarRange(calendarAnchor, calendarViewMode),
    [calendarAnchor, calendarViewMode],
  );

  const patientCalendarEvents = useMemo(
    () => schedulesToCalendarEvents(patientSchedules, patientNameById, patientCalendarRange),
    [patientCalendarRange, patientNameById, patientSchedules],
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
      <AppPage title={t("patients.title")} breadcrumbs={[{ label: t("nav.patients") }] }>
        <DataState kind="loading" title={t("common.loading")} />
      </AppPage>
    );
  }

  if (error || !patient) {
    return (
      <AppPage title={t("patients.title")} breadcrumbs={[{ label: t("nav.patients") }] }>
        <DataState
          kind="error"
          title={t("patients.empty")}
          description={error || t("patients.empty")}
          action={
            <Button asChild variant="outline">
              <Link href={patientListHref}>{t("patients.backToList")}</Link>
            </Button>
          }
        />
      </AppPage>
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
    <AppPage
      title={`${patient.first_name} ${patient.last_name}`.trim() || t("patients.title")}
      description={[patient.care_level, roomDetail?.name].filter(Boolean).join(" · ")}
      breadcrumbs={[
        {
          label: t("nav.dashboard"),
          href: authUser?.role ? `/${String(authUser.role).replace("_", "-")}` : "/admin",
        },
        { label: t("nav.patients"), href: patientListHref },
        { label: `${patient.first_name} ${patient.last_name}`.trim() || t("patients.title") },
      ]}
    >

      <Tabs
        value={mainTab}
        onValueChange={(v) => setMainTab(v as "profile" | "care")}
        className="w-full"
      >
        <TabsList className="mb-4 grid h-auto w-full max-w-lg grid-cols-2 gap-1 p-1">
          <TabsTrigger value="profile" className="text-sm">
            {t("patients.detailTabProfile")}
          </TabsTrigger>
          <TabsTrigger value="care" className="text-sm">
            {t("patients.detailTabCare")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-0 space-y-5">

          {/* ── COMPACT PROFILE HEADER ─────────────────────────────────────── */}
          <section className="rounded-xl border border-border/60 bg-card p-5">
            {/* edit-about toolbar */}
            {canEditPatient && (
              <div className="absolute right-4 top-4 z-10">
                {isEditingAbout ? (
                  <div className="flex items-center gap-2">
                    <button type="button" className="min-h-11 rounded-lg border border-outline-variant/30 bg-surface px-4 py-2 text-sm font-medium text-foreground-variant hover:bg-surface-container-high" onClick={cancelEditingCard} disabled={isSavingAbout}>{t("common.cancel")}</button>
                    <button type="button" className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary/90" onClick={() => void saveCard("about")} disabled={isSavingAbout || !cardDrafts.first_name.trim() || !cardDrafts.last_name.trim()}>{isSavingAbout ? t("common.saving") : t("common.save")}</button>
                  </div>
                ) : (
                  <button type="button" className="min-h-11 rounded-lg border border-outline-variant/30 bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-surface-container-high" onClick={() => startEditingCard("about")}>{t("common.edit")}</button>
                )}
              </div>
            )}

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              {/* Avatar */}
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-muted/30 sm:h-20 sm:w-20">
                {canEditPatient && (
                  <label htmlFor={patientPhotoInputId} className={`absolute inset-0 z-[5] cursor-pointer ${patientPhotoBusy ? "pointer-events-none" : ""}`} aria-hidden="true" />
                )}
                {patientPhotoUrl ? (
                  <Image src={patientPhotoUrl} alt={`${patient.first_name} ${patient.last_name}`} fill unoptimized className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xl font-bold text-primary/50">
                    {patient.first_name?.[0]}{patient.last_name?.[0]}
                  </div>
                )}
                {canEditPatient && patientPhotoUrl && (
                  <button type="button" className="absolute right-0.5 top-0.5 z-10 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-black/75 disabled:opacity-50" disabled={patientPhotoBusy} onClick={() => void onRemovePatientPhoto()}>{t("profile.avatar.removePhoto")}</button>
                )}
              </div>
              {canEditPatient && (
                <label htmlFor={patientPhotoInputId} className="hidden cursor-pointer items-center rounded-lg px-2 text-center text-xs font-medium text-primary hover:bg-primary/10 sm:flex">{t("profile.avatar.localFileLabel")}</label>
              )}
              <input id={patientPhotoInputId} type="file" accept="image/*" disabled={patientPhotoBusy} onChange={(e) => void onPickPatientPhoto(e)} className="sr-only" />
              {patientPhotoErr && <p className="text-center text-sm text-destructive">{patientPhotoErr}</p>}

              {/* Identity + status chips */}
              <div className="min-w-0 flex-1">
                {isEditingAbout ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1"><span className="text-sm text-foreground-variant">{t("patients.firstName")}</span><input className="input-field w-full text-sm" value={cardDrafts.first_name} onChange={(e) => setCardDrafts((p) => ({ ...p, first_name: e.target.value }))} /></label>
                    <label className="space-y-1"><span className="text-sm text-foreground-variant">{t("patients.lastName")}</span><input className="input-field w-full text-sm" value={cardDrafts.last_name} onChange={(e) => setCardDrafts((p) => ({ ...p, last_name: e.target.value }))} /></label>
                    <label className="space-y-1"><span className="text-sm text-foreground-variant">{t("patients.dateOfBirth")}</span><input type="date" className="input-field w-full text-sm" value={cardDrafts.date_of_birth} onChange={(e) => setCardDrafts((p) => ({ ...p, date_of_birth: e.target.value }))} /></label>
                    <label className="space-y-1"><span className="text-sm text-foreground-variant">{t("patients.gender")}</span><select className="input-field w-full text-sm" value={cardDrafts.gender} onChange={(e) => setCardDrafts((p) => ({ ...p, gender: e.target.value }))}><option value="">{t("patients.genderUnset")}</option><option value="male">{t("patients.genderMale")}</option><option value="female">{t("patients.genderFemale")}</option><option value="other">{t("patients.genderOther")}</option></select></label>
                    <label className="space-y-1"><span className="text-sm text-foreground-variant">{t("patients.careLevel")}</span><select className="input-field w-full text-sm" value={cardDrafts.care_level} onChange={(e) => setCardDrafts((p) => ({ ...p, care_level: e.target.value }))}><option value="normal">{t("patients.careLevelNormal")}</option><option value="special">{t("patients.careLevelSpecial")}</option><option value="critical">{t("patients.careLevelCritical")}</option></select></label>
                    <label className="space-y-1"><span className="text-sm text-foreground-variant">{t("patients.mobilityType")}</span><select className="input-field w-full text-sm" value={cardDrafts.mobility_type} onChange={(e) => setCardDrafts((p) => ({ ...p, mobility_type: e.target.value }))}><option value="wheelchair">{t("patients.mobilityWheelchair")}</option><option value="walker">{t("patients.mobilityWalker")}</option><option value="independent">{t("patients.mobilityIndependent")}</option></select></label>
                    <label className="space-y-1"><span className="text-sm text-foreground-variant">{t("patients.bloodType")}</span><input className="input-field w-full text-sm" value={cardDrafts.blood_type} onChange={(e) => setCardDrafts((p) => ({ ...p, blood_type: e.target.value }))} /></label>
                    <label className="space-y-1"><span className="text-sm text-foreground-variant">{t("patients.heightCm")}</span><input className="input-field w-full text-sm" value={cardDrafts.height_cm} onChange={(e) => setCardDrafts((p) => ({ ...p, height_cm: e.target.value }))} /></label>
                    <label className="space-y-1"><span className="text-sm text-foreground-variant">{t("patients.weightKg")}</span><input className="input-field w-full text-sm" value={cardDrafts.weight_kg} onChange={(e) => setCardDrafts((p) => ({ ...p, weight_kg: e.target.value }))} /></label>
                    <label className="space-y-1"><span className="text-sm text-foreground-variant">{t("patients.room")}</span><input className="input-field w-full text-sm" value={cardDrafts.room_id} onChange={(e) => setCardDrafts((p) => ({ ...p, room_id: e.target.value }))} placeholder={t("patients.noRoom")} /></label>
                    <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2"><input type="checkbox" checked={cardDrafts.is_active} onChange={(e) => setCardDrafts((p) => ({ ...p, is_active: e.target.checked }))} />{t("patients.statusActive")}</label>
                  </div>
                ) : (
                  <>
                    <h1 className="text-xl font-bold leading-tight text-foreground sm:text-2xl">{patient.first_name} {patient.last_name}</h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {age != null ? `${age} ${t("patients.years")}` : "—"} · {genderLabel}
                      {patient.room_id != null && roomDetail ? ` · ${roomDetail.name?.trim() || `Room #${roomDetail.id}`}` : ""}
                    </p>
                    {/* Compact status chips */}
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${patient.is_active ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${patient.is_active ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                        {patient.is_active ? t("patients.statusActive") : t("patients.statusInactive")}
                      </span>
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground capitalize">{patient.mobility_type}</span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${patient.care_level === "critical" ? "bg-red-50 text-red-700" : patient.care_level === "special" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${patient.care_level === "critical" ? "bg-red-500" : patient.care_level === "special" ? "bg-amber-500" : "bg-emerald-500"}`} />
                        {patient.care_level}
                      </span>
                      {patient.blood_type && <span className="rounded-full border border-border/40 px-2.5 py-0.5 text-[11px] font-mono font-medium text-foreground">{patient.blood_type}</span>}
                      {patient.room_id != null && (
                        <button type="button" className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/10" onClick={() => setPatientMapOpen(true)}>
                          <MapPin className="mr-1 inline h-3 w-3" />{t("patients.roomOpenFacility")}
                        </button>
                      )}
                    </div>
                  </>
                )}
                {cardErrors.about && <p className="mt-2 text-sm text-error">{cardErrors.about}</p>}
              </div>
            </div>

            {/* ── Compact vital stats bar ──────────────────────────────────── */}
            {!isEditingAbout && (
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-border/40 pt-3 text-xs">
                <span className="text-muted-foreground">{t("patients.detailDob")}: <span className="font-semibold text-foreground">{patient.date_of_birth ? new Date(patient.date_of_birth + "T12:00:00").toLocaleDateString(localeTag, { year: "numeric", month: "short", day: "numeric" }) : "—"}</span></span>
                <span className="text-muted-foreground">{t("patients.heightCm")}: <span className="font-semibold text-foreground">{patient.height_cm != null ? `${patient.height_cm} cm` : "—"}</span></span>
                <span className="text-muted-foreground">{t("patients.weightKg")}: <span className="font-semibold text-foreground">{patient.weight_kg != null ? `${patient.weight_kg} kg` : "—"}</span></span>
                <span className="text-muted-foreground">{t("patients.detailBmi")}: <span className="font-semibold text-foreground">{bmi != null ? `${bmi}` : "—"}</span>{bmiLabel ? <span className="text-muted-foreground"> ({bmiLabel})</span> : null}</span>
                <span className="text-muted-foreground">{t("patients.bloodType")}: <span className="font-semibold text-foreground">{patient.blood_type || "—"}</span></span>
              </div>
            )}
          </section>

          {/* ── AI HEALTH ANALYSIS (blank when AI offline) ────────────────── */}
          <PatientHealthAnalysisPanel patientId={Number(id)} />

          {/* ── MAIN + SIDEBAR GRID ───────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <div className="space-y-5 xl:col-span-2">

              {/* Medical Conditions */}
              <ProfileCard
                title={t("patients.sectionChronic")}
                editSlot={canEditPatient ? (editingCard === "chronic" ? <EditActions onCancel={cancelEditingCard} onSave={() => void saveCard("chronic")} saving={savingCard === "chronic"} t={t} /> : <EditBtn onClick={() => startEditingCard("chronic")} t={t} />) : null}
              >
                {editingCard === "chronic" ? (
                  <textarea className="input-field min-h-[110px] w-full text-sm" value={cardDrafts.medical_conditions_raw} onChange={(e) => setCardDrafts((p) => ({ ...p, medical_conditions_raw: e.target.value }))} placeholder={t("patients.chronicPlaceholder")} />
                ) : patient.medical_conditions.length === 0 ? (
                  <p className="text-sm text-foreground-variant">—</p>
                ) : (
                  <ul className="space-y-2">
                    {patient.medical_conditions.map((c, i) => {
                      const raw = c as Record<string, unknown>;
                      const sev = String(raw.severity ?? "").toLowerCase();
                      const sevClass = sev === "high" || sev === "สูง" ? "border-critical/30 bg-critical-bg text-foreground"
                        : sev === "medium" || sev === "ปานกลาง" ? "border-warning/30 bg-warning-bg text-foreground"
                        : "border-outline-variant/30 bg-surface-container-high text-foreground";
                      return (
                        <li key={i} className={`flex items-start justify-between gap-2 rounded-lg border px-4 py-3 text-sm ${sevClass}`}>
                          <span className="font-medium">{formatCondition(c)}</span>
                          {sev && <span className="shrink-0 rounded-full bg-current/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-80">{sev}</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {cardErrors.chronic && <p className="mt-3 text-sm text-error">{cardErrors.chronic}</p>}
              </ProfileCard>

              {/* Allergies */}
              <ProfileCard
                title={t("patients.sectionAllergies")}
                editSlot={canEditPatient ? (editingCard === "allergies" ? <EditActions onCancel={cancelEditingCard} onSave={() => void saveCard("allergies")} saving={savingCard === "allergies"} t={t} /> : <EditBtn onClick={() => startEditingCard("allergies")} t={t} />) : null}
              >
                {editingCard === "allergies" ? (
                  <textarea className="input-field min-h-[110px] w-full text-sm" value={cardDrafts.allergies_raw} onChange={(e) => setCardDrafts((p) => ({ ...p, allergies_raw: e.target.value }))} placeholder={t("patients.allergiesPlaceholder")} />
                ) : patient.allergies.length === 0 ? (
                  <p className="text-sm text-foreground-variant">—</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {patient.allergies.map((a, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-critical/30 bg-critical-bg px-3 py-1 text-xs font-semibold text-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-critical" />
                        {a}
                      </span>
                    ))}
                  </div>
                )}
                {cardErrors.allergies && <p className="mt-3 text-sm text-error">{cardErrors.allergies}</p>}
              </ProfileCard>

              {/* Medications */}
              <ProfileCard
                title={t("patients.sectionMeds")}
                badge={medCount > 0 ? `${medCount} ${t("patients.activeMedsBadge")}` : undefined}
                editSlot={canEditPatient ? (editingCard === "medications" ? <EditActions onCancel={cancelEditingCard} onSave={() => void saveCard("medications")} saving={savingCard === "medications"} t={t} /> : <EditBtn onClick={() => startEditingCard("medications")} t={t} />) : null}
              >
                {editingCard === "medications" ? (
                  <textarea className="input-field min-h-[110px] w-full text-sm" value={cardDrafts.medications_raw} onChange={(e) => setCardDrafts((p) => ({ ...p, medications_raw: e.target.value }))} placeholder={t("patients.medName")} />
                ) : medCount === 0 ? (
                  <p className="text-sm text-foreground-variant">—</p>
                ) : (
                  <ul className="divide-y divide-outline-variant/10">
                    {patient.medications.filter((m) => (m.name || "").trim()).map((m, i) => (
                      <li key={i} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[10px] font-bold text-primary">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-foreground text-sm">{m.name}</p>
                          {(m.dosage || m.frequency) && <p className="mt-0.5 text-xs text-foreground-variant">{[m.dosage, m.frequency].filter(Boolean).join(" · ")}</p>}
                          {m.instructions && <p className="mt-1 text-[10px] uppercase tracking-wide text-foreground-variant">{m.instructions}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {cardErrors.medications && <p className="mt-3 text-sm text-error">{cardErrors.medications}</p>}
              </ProfileCard>

              {/* Surgical History */}
              {surgeries.length > 0 && (
                <ProfileCard title={t("patients.sectionSurgeries")}>
                  <ul className="divide-y divide-outline-variant/10">
                    {surgeries.map((s, i) => (
                      <li key={i} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground text-sm">{s.procedure || "—"}</p>
                          <p className="mt-0.5 text-xs text-foreground-variant">{[s.facility, s.year != null && s.year !== "" ? String(s.year) : null].filter(Boolean).join(" · ") || "—"}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </ProfileCard>
              )}

              {/* Clinical Notes */}
              <ProfileCard
                title={t("patients.formSectionNotes")}
                editSlot={canEditPatient ? (editingCard === "notes" ? <EditActions onCancel={cancelEditingCard} onSave={() => void saveCard("notes")} saving={savingCard === "notes"} t={t} /> : <EditBtn onClick={() => startEditingCard("notes")} t={t} />) : null}
              >
                {editingCard === "notes" ? (
                  <textarea className="input-field min-h-[110px] w-full text-sm" value={cardDrafts.notes} onChange={(e) => setCardDrafts((p) => ({ ...p, notes: e.target.value }))} />
                ) : patient.notes?.trim() ? (
                  <p className="text-sm text-foreground-variant whitespace-pre-wrap leading-relaxed">{patient.notes}</p>
                ) : (
                  <p className="text-sm text-foreground-variant">—</p>
                )}
                {cardErrors.notes && <p className="mt-3 text-sm text-error">{cardErrors.notes}</p>}
              </ProfileCard>

              <PersonSensorStatusPanel personType="patient" personId={patient.id} compact />

              {/* Linked Portal Accounts */}
              <ProfileCard title={t("patients.sectionLinkedAccounts")}>
                {linkedPortalUsers.length === 0 ? (
                  <p className="text-sm text-foreground-variant">{t("patients.linkedAccountsEmpty")}</p>
                ) : (
                  <ul className="space-y-2">
                    {linkedPortalUsers.map((u) => (
                      <li key={u.id} className="rounded-xl border border-outline-variant/15 bg-surface-container-low/50 px-4 py-3 text-sm">
                        {editingAccountId === u.id && canManageAccounts ? (
                          <div className="space-y-3">
                            <div className="grid gap-2 sm:grid-cols-2">
                              <label className="space-y-1"><span className="text-sm text-foreground-variant">{t("admin.users.username")}</span><input className="input-field w-full text-sm" value={accountDraft.username} onChange={(e) => setAccountDraft((p) => ({ ...p, username: e.target.value }))} /></label>
                              <label className="space-y-1"><span className="text-sm text-foreground-variant">{t("admin.users.role")}</span><select className="input-field w-full text-sm" value={accountDraft.role} onChange={(e) => setAccountDraft((p) => ({ ...p, role: e.target.value }))}><option value="admin">{t("shell.roleAdmin")}</option><option value="head_nurse">{t("shell.roleHeadNurse")}</option><option value="supervisor">{t("shell.roleSupervisor")}</option><option value="observer">{t("shell.roleObserver")}</option><option value="patient">{t("shell.rolePatient")}</option></select></label>
                              <label className="space-y-1"><span className="text-sm text-foreground-variant">{t("accountMgmt.pickStaff")}</span><input className="input-field w-full text-sm" value={accountDraft.caregiver_id} onChange={(e) => setAccountDraft((p) => ({ ...p, caregiver_id: e.target.value }))} /></label>
                              <label className="space-y-1"><span className="text-sm text-foreground-variant">{t("accountMgmt.pickPatient")}</span><input className="input-field w-full text-sm" value={accountDraft.patient_id} onChange={(e) => setAccountDraft((p) => ({ ...p, patient_id: e.target.value }))} /></label>
                              <label className="space-y-1 sm:col-span-2"><span className="text-sm text-foreground-variant">{t("admin.users.resetPassword")}</span><input type="password" className="input-field w-full text-sm" placeholder={t("patients.editorPasswordOptionalHint")} value={accountDraft.password} onChange={(e) => setAccountDraft((p) => ({ ...p, password: e.target.value }))} /></label>
                              <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2"><input type="checkbox" checked={accountDraft.is_active} onChange={(e) => setAccountDraft((p) => ({ ...p, is_active: e.target.checked }))} />{t("patients.statusActive")}</label>
                            </div>
                            {accountError && <p className="text-sm text-error">{accountError}</p>}
                            <div className="flex items-center justify-end gap-2">
                              <button type="button" className="min-h-11 rounded-lg px-4 py-2 text-sm font-medium text-foreground-variant hover:bg-surface-container-high" onClick={() => setEditingAccountId(null)} disabled={accountBusy}>{t("common.cancel")}</button>
                              <button type="button" className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary/90" onClick={() => void saveAccountEditor(u.id)} disabled={accountBusy}>{accountBusy ? t("common.saving") : t("common.save")}</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div><p className="font-semibold text-foreground">{u.username}</p><p className="text-xs text-foreground-variant capitalize">{u.role}</p></div>
                            <div className="flex items-center gap-2">
                              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ${u.is_active ? "care-normal" : "bg-surface-container text-outline"}`}>{u.is_active ? t("patients.statusActive") : t("patients.statusInactive")}</span>
                              {canManageAccounts && <button type="button" className="min-h-11 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-primary/10" onClick={() => openAccountEditor(u)}>{t("common.edit")}</button>}
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </ProfileCard>
            </div>

            {/* ── SIDEBAR ──────────────────────────────────────────────────── */}
            <aside className="space-y-5">

              {/* Emergency Contact */}
              <div className="overflow-hidden rounded-2xl border border-outline-variant/20 shadow-sm"
                style={{ background: "var(--color-primary)" }}>
                <div className="p-5 text-[var(--color-on-primary)]">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 opacity-80" />
                      <h2 className="font-semibold text-sm uppercase tracking-wide opacity-90">{t("patients.formSectionEmergency")}</h2>
                    </div>
                    {canEditPatient && (
                      editingCard === "emergency"
                        ? <div className="flex gap-2"><button type="button" className="min-h-11 rounded-lg px-3 py-2 text-sm font-medium text-white/85 hover:bg-white/15" onClick={cancelEditingCard} disabled={savingCard === "emergency"}>{t("common.cancel")}</button><button type="button" className="min-h-11 rounded-lg bg-white/20 px-3 py-2 text-sm font-semibold text-white hover:bg-white/30" onClick={() => void saveCard("emergency")} disabled={savingCard === "emergency"}>{savingCard === "emergency" ? t("common.saving") : t("common.save")}</button></div>
                        : <button type="button" className="min-h-11 rounded-lg border border-white/30 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15" onClick={() => startEditingCard("emergency")}>{t("common.edit")}</button>
                    )}
                  </div>
                  {editingCard === "emergency" ? (
                    <div className="space-y-2">
                      <input className="input-field w-full text-sm" placeholder={t("patients.ecName")} value={cardDrafts.emergency_contact_name} onChange={(e) => setCardDrafts((p) => ({ ...p, emergency_contact_name: e.target.value }))} />
                      <input className="input-field w-full text-sm" placeholder={t("patients.ecRelationship")} value={cardDrafts.emergency_contact_relationship} onChange={(e) => setCardDrafts((p) => ({ ...p, emergency_contact_relationship: e.target.value }))} />
                      <input className="input-field w-full text-sm" placeholder={t("patients.ecPhone")} value={cardDrafts.emergency_contact_phone} onChange={(e) => setCardDrafts((p) => ({ ...p, emergency_contact_phone: e.target.value }))} />
                      <input className="input-field w-full text-sm" placeholder={t("patients.ecEmail")} value={cardDrafts.emergency_contact_email} onChange={(e) => setCardDrafts((p) => ({ ...p, emergency_contact_email: e.target.value }))} />
                      <textarea className="input-field min-h-[72px] w-full text-sm" placeholder={t("patients.ecContactNotes")} value={cardDrafts.emergency_contact_notes} onChange={(e) => setCardDrafts((p) => ({ ...p, emergency_contact_notes: e.target.value }))} />
                    </div>
                  ) : primaryContact ? (
                    <div className="space-y-3">
                      <div>
                        <p className="font-bold text-lg leading-tight">{primaryContact.name}</p>
                        {primaryContact.relationship && <p className="text-sm opacity-80 mt-0.5">{primaryContact.relationship}</p>}
                      </div>
                      {primaryContact.phone && (
                        <a href={`tel:${primaryContact.phone.replace(/\s/g, "")}`} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/15 py-2.5 text-sm font-semibold hover:bg-white/25 transition-smooth">
                          <Phone className="h-4 w-4" />{primaryContact.phone}
                        </a>
                      )}
                      {primaryContact.notes && <p className="text-xs opacity-75 leading-relaxed">{primaryContact.notes}</p>}
                    </div>
                  ) : (
                    <p className="text-sm opacity-75">{t("patients.noEmergencyContact")}</p>
                  )}
                  {cardErrors.emergency && <p className="mt-3 text-sm text-white/90">{cardErrors.emergency}</p>}
                </div>
              </div>

              {/* Responsible Staff */}
              <ProfileCard title={t("patients.sectionResponsibleStaff")} badge={caregiverDraftIds.length > 0 ? String(caregiverDraftIds.length) : undefined}>
                {canManageResponsibleStaff && (
                  <div className="mb-3">
                    <SearchableListboxPicker
                      inputId={staffSearchInputId}
                      listboxId={staffSearchListboxId}
                      options={staffPickerOptions}
                      search={staffSearch}
                      onSearchChange={setStaffSearch}
                      searchPlaceholder={t("patients.searchStaffPlaceholder")}
                      selectedOptionId={null}
                      onSelectOption={(optId) => { const n = Number(optId); if (!Number.isFinite(n)) return; setCaregiverDraftIds((prev) => (prev.includes(n) ? prev : [...prev, n])); setStaffSearch(""); }}
                      disabled={staffSaving}
                      listboxAriaLabel={t("patients.responsibleStaffListbox")}
                      noMatchMessage={t("patients.responsibleStaffNoMatch")}
                      emptyStateMessage={staffPickerOptions.length === 0 ? t("caregivers.empty") : null}
                      emptyNoMatch={staffSearch.trim().length > 0}
                    />
                  </div>
                )}
                {!canManageResponsibleStaff && <p className="mb-3 text-xs text-foreground-variant">{t("patients.responsibleStaffReadOnlyHint")}</p>}
                {staffError && <p className="mb-3 text-sm text-critical">{staffError}</p>}
                {draftCaregiversOrdered.length === 0 ? (
                  <p className="text-sm text-foreground-variant">{t("patients.responsibleStaffEmpty")}</p>
                ) : (
                  <ul className="space-y-2">
                    {draftCaregiversOrdered.map((person) => (
                      <li key={person.id} className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2.5 text-sm hover:border-primary/30 transition-smooth">
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            username={`${person.first_name} ${person.last_name}`.trim() || `Staff #${person.id}`}
                            profileImageUrl={person.photo_url}
                            sizePx={32}
                            fallbackClassName="bg-primary/10 text-primary"
                          />
                          <Link href={getCaregiverDetailPath(authUser?.role || "admin", person.id)} className="min-w-0 flex-1">
                            <span className="block font-medium text-foreground">{person.first_name} {person.last_name}</span>
                            <span className="text-xs text-foreground-variant">{formatStaffRoleLabel(person.role, t)}{person.employee_code?.trim() ? ` · ${person.employee_code.trim()}` : ""}</span>
                          </Link>
                          {canManageResponsibleStaff && (
                            <button type="button" className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold text-critical hover:bg-critical/10" onClick={() => setCaregiverDraftIds((prev) => prev.filter((x) => x !== person.id))}>{t("patients.responsibleStaffRemove")}</button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {canManageResponsibleStaff && (
                  <button type="button" className="mt-4 w-full rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary/90 disabled:opacity-50" onClick={() => void handleSaveResponsibleStaff()} disabled={staffSaving}>
                    {staffSaving ? t("patients.responsibleStaffSaving") : t("patients.responsibleStaffSave")}
                  </button>
                )}
              </ProfileCard>
            </aside>
          </div>
        </TabsContent>
        <TabsContent value="care" className="mt-0 space-y-6">
          <PatientCareCoordinationPanel
            patientId={Number(id)}
            showHeader={false}
            invalidBackHref={patientListHref}
          />
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
                const full =
                  patientSchedules.find((row) => row.id === resolveCareScheduleIdFromEvent(ev)) ??
                  null;
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
                const full =
                  patientSchedules.find((row) => row.id === resolveCareScheduleIdFromEvent(ev)) ??
                  null;
                if (!full) return;
                setEditingSchedule(full);
                setSchedulePickerDate(new Date(ev.startTime));
                setScheduleFormOpen(true);
              }}
            />
          </section>
        </TabsContent>
      </Tabs>
      <Dialog open={patientMapOpen} onOpenChange={setPatientMapOpen}>
        <DialogContent className="w-[calc(100vw-0.75rem)] max-w-[76rem] max-h-[94vh] rounded-2xl sm:w-[calc(100vw-2rem)]">
          <DialogHeader className="px-4 py-4 pr-14 sm:px-5">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <MapPin className="h-5 w-5 text-primary" />
              {roomDetail?.name?.trim() || (patient.room_id != null ? `Room #${patient.room_id}` : t("patients.room"))}
            </DialogTitle>
            <DialogDescription className="line-clamp-2 pr-2">
              {[roomDetail?.facility_name, roomDetail?.floor_name].filter(Boolean).join(" | ") ||
                t("patients.roomOpenFacility")}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[calc(94vh-7rem)] overflow-y-auto px-3 pb-3 sm:px-4 sm:pb-4">
            <DashboardFloorplanPanel
              compact={false}
              showPresence
              initialFacilityId={roomDetail?.facility_id ?? null}
              initialFloorId={roomDetail?.floor_id ?? null}
              initialRoomName={roomDetail?.name ?? null}
              className="border-0 shadow-none"
            />
          </div>
        </DialogContent>
      </Dialog>
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
    </AppPage>
  );
}

function ProfileCard({
  title,
  badge,
  editSlot,
  children,
}: {
  title: string;
  badge?: string;
  editSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="surface-card rounded-2xl border border-outline-variant/20 p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-foreground text-sm">{title}</h2>
          {badge && (
            <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-semibold text-primary">
              {badge}
            </span>
          )}
        </div>
        {editSlot}
      </div>
      {children}
    </div>
  );
}

function EditBtn({ onClick, t }: { onClick: () => void; t: (k: string) => string }) {
  return (
    <button
      type="button"
      className="min-h-11 rounded-lg border border-outline-variant/30 px-4 py-2 text-sm font-semibold text-foreground hover:bg-surface-container-high"
      onClick={onClick}
    >
      {t("common.edit")}
    </button>
  );
}

function EditActions({
  onCancel,
  onSave,
  saving,
  t,
}: {
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  t: (k: string) => string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" className="min-h-11 rounded-lg px-4 py-2 text-sm font-medium text-foreground-variant hover:bg-surface-container-high" onClick={onCancel} disabled={saving}>{t("common.cancel")}</button>
      <button type="button" className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary/90 disabled:opacity-50" onClick={onSave} disabled={saving}>{saving ? t("common.saving") : t("common.save")}</button>
    </div>
  );
}
