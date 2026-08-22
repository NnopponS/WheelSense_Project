"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ComponentType } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Camera,
  KeyRound,
  Mail,
  Minus,
  Phone,
  Plus,
  Save,
  Shield,
  Trash2,
  Type,
  Upload,
  UserRound,
} from "lucide-react";
import UserAvatar from "@/components/shared/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useFontScale } from "@/hooks/useFontScale";
import { api, ApiError } from "@/lib/api";
import { getRoleHome } from "@/lib/routes";
import { bodyMassIndex, bmiCategory } from "@/lib/patientMetrics";
import { useTranslation } from "@/lib/i18n";
import type { Caregiver, Patient, Room, User } from "@/lib/types";
import {
  imageFileToResizedSquareJpegBlob,
  isAllowedProfileImageUrlInput,
} from "@/lib/profileImageProcess";

type LinkedCaregiver = Partial<
  Pick<
    Caregiver,
    | "id"
    | "first_name"
    | "last_name"
    | "department"
    | "employee_code"
    | "specialty"
    | "license_number"
    | "emergency_contact_name"
    | "emergency_contact_phone"
    | "photo_url"
  >
>;

type LinkedPatientProfile = {
  id: number;
  first_name: string;
  last_name: string;
  nickname: string;
  date_of_birth: string | null;
  gender: string;
  height_cm: number | null;
  weight_kg: number | null;
  blood_type: string;
  allergies: string[];
  notes: string;
  photo_url: string;
  is_active: boolean;
};

type MeProfileResponse = {
  user: User;
  linked_caregiver?: LinkedCaregiver | null;
  linked_patient?: LinkedPatientProfile | null;
};

type PatientRecordFormState = {
  first_name: string;
  last_name: string;
  nickname: string;
  date_of_birth: string;
  gender: string;
  height_cm: string;
  weight_kg: string;
  blood_type: string;
  allergiesText: string;
  notes: string;
  photo_url: string;
};

function patientFormFromLinked(p: LinkedPatientProfile): PatientRecordFormState {
  const dob =
    p.date_of_birth == null
      ? ""
      : String(p.date_of_birth).length >= 10
        ? String(p.date_of_birth).slice(0, 10)
        : String(p.date_of_birth);
  return {
    first_name: p.first_name ?? "",
    last_name: p.last_name ?? "",
    nickname: p.nickname ?? "",
    date_of_birth: dob,
    gender: p.gender ?? "",
    height_cm: p.height_cm != null ? String(p.height_cm) : "",
    weight_kg: p.weight_kg != null ? String(p.weight_kg) : "",
    blood_type: p.blood_type ?? "",
    allergiesText: (p.allergies ?? []).join("\n"),
    notes: p.notes ?? "",
    photo_url: (p.photo_url ?? "").trim(),
  };
}

function normalizeAllergyLines(text: string): string[] {
  return text
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function allergiesEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].map((s) => s.trim()).sort();
  const sb = [...b].map((s) => s.trim()).sort();
  return sa.every((v, i) => v === sb[i]);
}

type ProfileFormState = {
  username: string;
  email: string;
  phone: string;
  caregiver_first_name: string;
  caregiver_last_name: string;
  caregiver_department: string;
  caregiver_employee_code: string;
  caregiver_specialty: string;
  caregiver_license_number: string;
  caregiver_emergency_contact_name: string;
  caregiver_emergency_contact_phone: string;
};

function fromProfile(profile: MeProfileResponse, fallbackUser: User): ProfileFormState {
  const user = profile.user ?? fallbackUser;
  const caregiver = profile.linked_caregiver ?? {};
  return {
    username: user.username ?? "",
    email: user.email ?? "",
    phone: user.phone ?? "",
    caregiver_first_name: caregiver.first_name ?? "",
    caregiver_last_name: caregiver.last_name ?? "",
    caregiver_department: caregiver.department ?? "",
    caregiver_employee_code: caregiver.employee_code ?? "",
    caregiver_specialty: caregiver.specialty ?? "",
    caregiver_license_number: caregiver.license_number ?? "",
    caregiver_emergency_contact_name: caregiver.emergency_contact_name ?? "",
    caregiver_emergency_contact_phone: caregiver.emergency_contact_phone ?? "",
  };
}

function withFallback(user: User): MeProfileResponse {
  return { user, linked_caregiver: null, linked_patient: null };
}

export default function AccountPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user, loading, refreshUser } = useAuth();
  const fontScale = useFontScale();
  const fileRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<MeProfileResponse | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    username: "",
    email: "",
    phone: "",
    caregiver_first_name: "",
    caregiver_last_name: "",
    caregiver_department: "",
    caregiver_employee_code: "",
    caregiver_specialty: "",
    caregiver_license_number: "",
    caregiver_emergency_contact_name: "",
    caregiver_emergency_contact_phone: "",
  });

  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });

  const [urlInput, setUrlInput] = useState("");
  const [pendingJpegBlob, setPendingJpegBlob] = useState<Blob | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [fileLabel, setFileLabel] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);

  const [patientRecordForm, setPatientRecordForm] = useState<PatientRecordFormState | null>(null);

  const linkedPatientId = profile?.linked_patient?.id ?? null;

  const patientDetailQuery = useQuery({
    queryKey: ["account", "patient-detail", linkedPatientId],
    queryFn: () => api.getPatient(linkedPatientId as number),
    enabled: Boolean(linkedPatientId),
  });

  const patientDetail = patientDetailQuery.data as Patient | undefined;
  const roomId = patientDetail?.room_id ?? null;

  const roomDetailQuery = useQuery({
    queryKey: ["account", "room", roomId],
    queryFn: () => api.getRoom(roomId as number),
    enabled: Boolean(roomId),
  });

  const roomDetail = roomDetailQuery.data;

  const revokeLocalPreview = useCallback(() => {
    setLocalPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    setProfileLoading(true);
    setProfileError(null);
    try {
      const next = await api.get<MeProfileResponse>("/auth/me/profile");
      setProfile(next);
      setProfileForm(fromProfile(next, user));
      setUrlInput(next.user.profile_image_url?.trim() ?? "");
    } catch (err) {
      setProfile(withFallback(user));
      setProfileForm(fromProfile(withFallback(user), user));
      setUrlInput(user.profile_image_url?.trim() ?? "");
      if (err instanceof ApiError && err.status !== 404) {
        setProfileError(err.message);
      }
    } finally {
      setProfileLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void loadProfile();
  }, [loadProfile, user]);

  useEffect(() => {
    if (!profile?.linked_patient) {
      setPatientRecordForm(null);
      return;
    }
    setPatientRecordForm(patientFormFromLinked(profile.linked_patient));
  }, [profile]);

  useEffect(() => () => revokeLocalPreview(), [revokeLocalPreview]);

  const trimmedUrl = urlInput.trim();
  const activeUser = profile?.user ?? user ?? null;
  const previewForAvatar =
    localPreviewUrl ||
    (trimmedUrl && isAllowedProfileImageUrlInput(trimmedUrl) ? trimmedUrl : null) ||
    activeUser?.profile_image_url?.trim() ||
    profile?.linked_patient?.photo_url?.trim() ||
    profile?.linked_caregiver?.photo_url?.trim() ||
    null;

  const hasSavedImage = Boolean(activeUser?.profile_image_url?.trim());
  const canRemovePhoto = hasSavedImage || pendingJpegBlob !== null;
  const caregiverEditable = Boolean(profile?.linked_caregiver);

  const linkedPatientLabel = useMemo(() => {
    if (!profile?.linked_patient) return null;
    const first = profile.linked_patient.first_name ?? "";
    const last = profile.linked_patient.last_name ?? "";
    const name = `${first} ${last}`.trim();
    return name || profile.linked_patient.nickname || `Patient #${profile.linked_patient.id}`;
  }, [profile?.linked_patient]);

  const patientBmiPreview = useMemo(() => {
    if (!patientRecordForm) return null;
    const h = Number(patientRecordForm.height_cm);
    const w = Number(patientRecordForm.weight_kg);
    return bodyMassIndex(Number.isFinite(h) ? h : null, Number.isFinite(w) ? w : null);
  }, [patientRecordForm]);

  const patientBmiCategory = patientBmiPreview != null ? bmiCategory(patientBmiPreview) : null;

  const roomLocationLine = useMemo(() => {
    if (!patientDetail?.room_id) return null;
    if (roomDetailQuery.isPending && !roomDetail) {
      return t("patients.editorLoading");
    }
    const r = roomDetail as Room | undefined;
    if (r) {
      const bits = [r.name, r.facility_name].filter(Boolean);
      return bits.length ? bits.join(" · ") : `${t("clinical.patient.roomPrefix")}${patientDetail.room_id}`;
    }
    return `${t("clinical.patient.roomPrefix")}${patientDetail.room_id}`;
  }, [patientDetail, roomDetail, roomDetailQuery.isPending, t]);

  const resetPhotoState = useCallback(
    (nextProfile: MeProfileResponse | null) => {
      setUrlInput(nextProfile?.user.profile_image_url?.trim() ?? "");
      setPendingJpegBlob(null);
      revokeLocalPreview();
      setFileLabel(null);
      setPhotoError(null);
      setPhotoMessage(null);
      if (fileRef.current) fileRef.current.value = "";
    },
    [revokeLocalPreview],
  );

  useEffect(() => {
    if (profile) resetPhotoState(profile);
  }, [profile, resetPhotoState]);

  async function handlePickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPhotoError(null);
    setPhotoMessage(null);
    if (!file) {
      setFileLabel(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setPhotoError(t("account.photoChooseImage"));
      return;
    }
    setPhotoSaving(true);
    try {
      const blob = await imageFileToResizedSquareJpegBlob(file);
      revokeLocalPreview();
      setLocalPreviewUrl(URL.createObjectURL(blob));
      setPendingJpegBlob(blob);
      setUrlInput("");
      setFileLabel(file.name);
    } catch {
      setPhotoError(t("account.photoPrepareError"));
      setPendingJpegBlob(null);
      revokeLocalPreview();
      setFileLabel(null);
    } finally {
      setPhotoSaving(false);
    }
  }

  function handleUrlChange(value: string) {
    if (value.trim().toLowerCase().startsWith("data:")) {
      setPhotoError(t("account.photoDataUrlError"));
      return;
    }
    setUrlInput(value);
    setPendingJpegBlob(null);
    revokeLocalPreview();
    setFileLabel(null);
    if (fileRef.current) fileRef.current.value = "";
    setPhotoError(null);
    setPhotoMessage(null);
  }

  async function patchProfileImage(nextUrl: string | null) {
    try {
      await api.patch("/auth/me/profile", { user: { profile_image_url: nextUrl } });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        await api.patch("/auth/me", { profile_image_url: nextUrl });
        return;
      }
      throw err;
    }
  }

  async function handleSavePhoto() {
    setPhotoSaving(true);
    setPhotoError(null);
    setPhotoMessage(null);
    try {
      if (pendingJpegBlob) {
        const body = new FormData();
        body.append("file", pendingJpegBlob, "avatar.jpg");
        await api.postForm<User>("/auth/me/profile-image", body);
      } else {
        const nextUrl = urlInput.trim();
        if (nextUrl && !isAllowedProfileImageUrlInput(nextUrl)) {
      setPhotoError(t("account.photoUrlError"));
          setPhotoSaving(false);
          return;
        }
        await patchProfileImage(nextUrl.length ? nextUrl : null);
      }
      await refreshUser();
      await loadProfile();
      setPhotoMessage(t("account.photoUpdated"));
      setPendingJpegBlob(null);
      revokeLocalPreview();
      setFileLabel(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setPhotoError(err instanceof ApiError ? err.message : t("account.photoSaveError"));
    } finally {
      setPhotoSaving(false);
    }
  }

  async function handleRemovePhoto() {
    setPhotoSaving(true);
    setPhotoError(null);
    setPhotoMessage(null);
    try {
      setPendingJpegBlob(null);
      revokeLocalPreview();
      setUrlInput("");
      setFileLabel(null);
      if (fileRef.current) fileRef.current.value = "";
      await patchProfileImage(null);
      await refreshUser();
      await loadProfile();
      setPhotoMessage(t("account.photoRemoved"));
    } catch (err) {
      setPhotoError(err instanceof ApiError ? err.message : t("account.photoRemoveError"));
    } finally {
      setPhotoSaving(false);
    }
  }

  async function handleSaveProfile(scope: "account" | "patient") {
    if (!user || !profile) return;
    setProfileSaving(true);
    setProfileError(null);
    setProfileMessage(null);
    try {
      const payload: Record<string, unknown> = {};
      if (scope === "account") {
        const userPatch: Record<string, unknown> = {};
        if (profileForm.username.trim() !== (profile.user.username ?? "")) {
          userPatch.username = profileForm.username.trim();
        }
        if (profileForm.email.trim() !== (profile.user.email ?? "")) {
          userPatch.email = profileForm.email.trim() || null;
        }
        if (profileForm.phone.trim() !== (profile.user.phone ?? "")) {
          userPatch.phone = profileForm.phone.trim() || null;
        }
        if (Object.keys(userPatch).length > 0) payload.user = userPatch;

        if (caregiverEditable) {
          const current = profile.linked_caregiver ?? {};
          const caregiverPatch: Record<string, unknown> = {};
          if (profileForm.caregiver_first_name.trim() !== (current.first_name ?? "")) {
            caregiverPatch.first_name = profileForm.caregiver_first_name.trim();
          }
          if (profileForm.caregiver_last_name.trim() !== (current.last_name ?? "")) {
            caregiverPatch.last_name = profileForm.caregiver_last_name.trim();
          }
          if (profileForm.caregiver_department.trim() !== (current.department ?? "")) {
            caregiverPatch.department = profileForm.caregiver_department.trim() || null;
          }
          if (profileForm.caregiver_employee_code.trim() !== (current.employee_code ?? "")) {
            caregiverPatch.employee_code = profileForm.caregiver_employee_code.trim() || null;
          }
          if (profileForm.caregiver_specialty.trim() !== (current.specialty ?? "")) {
            caregiverPatch.specialty = profileForm.caregiver_specialty.trim() || null;
          }
          if (profileForm.caregiver_license_number.trim() !== (current.license_number ?? "")) {
            caregiverPatch.license_number = profileForm.caregiver_license_number.trim() || null;
          }
          if (
            profileForm.caregiver_emergency_contact_name.trim() !==
            (current.emergency_contact_name ?? "")
          ) {
            caregiverPatch.emergency_contact_name =
              profileForm.caregiver_emergency_contact_name.trim() || null;
          }
          if (
            profileForm.caregiver_emergency_contact_phone.trim() !==
            (current.emergency_contact_phone ?? "")
          ) {
            caregiverPatch.emergency_contact_phone =
              profileForm.caregiver_emergency_contact_phone.trim() || null;
          }
          if (Object.keys(caregiverPatch).length > 0) payload.linked_caregiver = caregiverPatch;
        }
      }

      if (scope === "patient" && profile.linked_patient && patientRecordForm) {
        const lp = profile.linked_patient;
        const f = patientRecordForm;
        const patientPatch: Record<string, unknown> = {};
        const parseOptFloat = (raw: string): number | null => {
          const trimmed = raw.trim();
          if (!trimmed) return null;
          const n = Number(trimmed);
          return Number.isFinite(n) ? n : null;
        };
        const dobLp = lp.date_of_birth ? String(lp.date_of_birth).slice(0, 10) : "";
        const dobForm = f.date_of_birth.trim();
        const nextAllergies = normalizeAllergyLines(f.allergiesText);

        if (f.first_name.trim() !== (lp.first_name ?? "").trim()) {
          patientPatch.first_name = f.first_name.trim();
        }
        if (f.last_name.trim() !== (lp.last_name ?? "").trim()) {
          patientPatch.last_name = f.last_name.trim();
        }
        if (f.nickname.trim() !== (lp.nickname ?? "").trim()) {
          patientPatch.nickname = f.nickname.trim();
        }
        if (dobForm !== dobLp) {
          patientPatch.date_of_birth = dobForm.length ? dobForm : null;
        }
        if ((f.gender ?? "") !== (lp.gender ?? "")) {
          patientPatch.gender = f.gender;
        }
        const nextH = parseOptFloat(f.height_cm);
        if (nextH !== lp.height_cm) {
          patientPatch.height_cm = nextH;
        }
        const nextW = parseOptFloat(f.weight_kg);
        if (nextW !== lp.weight_kg) {
          patientPatch.weight_kg = nextW;
        }
        if (f.blood_type.trim() !== (lp.blood_type ?? "").trim()) {
          patientPatch.blood_type = f.blood_type.trim();
        }
        if (!allergiesEqual(nextAllergies, lp.allergies ?? [])) {
          patientPatch.allergies = nextAllergies;
        }
        if (f.notes.trim() !== (lp.notes ?? "").trim()) {
          patientPatch.notes = f.notes.trim();
        }
        const nextPhoto = f.photo_url.trim();
        const prevPhoto = (lp.photo_url ?? "").trim();
        if (nextPhoto !== prevPhoto) {
          patientPatch.photo_url = nextPhoto.length ? nextPhoto : null;
        }
        if (Object.keys(patientPatch).length > 0) {
          payload.linked_patient = patientPatch;
        }
      }

      if (Object.keys(payload).length === 0) {
        setProfileMessage(t("account.noChangesToSave"));
        return;
      }

      await api.patch<MeProfileResponse>("/auth/me/profile", payload);
      await refreshUser();
      await loadProfile();
      await queryClient.invalidateQueries({ queryKey: ["account", "patient-detail"] });
      await queryClient.invalidateQueries({ queryKey: ["account", "room"] });
      setProfileMessage(
        scope === "patient" ? t("account.patientRecordUpdated") : t("account.profileUpdated"),
      );
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : t("account.profileSaveError"));
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleChangePassword() {
    setPasswordError(null);
    setPasswordMessage(null);
    if (!passwordForm.current_password || !passwordForm.new_password) {
      setPasswordError(t("account.passwordRequired"));
      return;
    }
    if (passwordForm.new_password.length < 8) {
      setPasswordError(t("account.passwordMinLength"));
      return;
    }
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setPasswordError(t("account.passwordMismatch"));
      return;
    }
    setPasswordSaving(true);
    try {
      await api.post("/auth/change-password", {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });
      setPasswordForm({ current_password: "", new_password: "", confirm_password: "" });
      setPasswordMessage(t("account.passwordUpdated"));
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : t("account.passwordChangeError"));
    } finally {
      setPasswordSaving(false);
    }
  }

  if (loading || profileLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user || !activeUser) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface p-6">
        <div className="max-w-md rounded-xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">{t("account.signInRequired")}</p>
          <Button asChild className="mt-4">
            <Link href="/login">{t("account.goToLogin")}</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("account.eyebrow")}
            </p>
            <h1 className="mt-1 text-2xl font-semibold">{t("account.title")}</h1>
          </div>
          <Button asChild variant="outline">
            <Link href={getRoleHome(user.role)}>
              <ArrowLeft className="h-4 w-4" />
              {t("account.backToDashboard")}
            </Link>
          </Button>
        </div>

        <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-4">
                <UserAvatar
                  username={linkedPatientLabel || activeUser.username}
                  profileImageUrl={previewForAvatar}
                  sizePx={96}
                />
                <div className="min-w-0">
                  <p className="truncate text-xl font-semibold">{activeUser.username}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {activeUser.role.replace(/_/g, " ")}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-3">
                <InfoRow icon={KeyRound} label={t("account.userId")} value={String(activeUser.id)} />
                <InfoRow icon={Shield} label={t("account.role")} value={activeUser.role.replace(/_/g, " ")} />
                {activeUser.email ? <InfoRow icon={Mail} label={t("account.email")} value={activeUser.email} /> : null}
                {activeUser.phone ? <InfoRow icon={Phone} label={t("account.phone")} value={activeUser.phone} /> : null}
                {linkedPatientLabel ? (
                  <InfoRow icon={UserRound} label={t("account.linkedPatient")} value={linkedPatientLabel} />
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Camera className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">{t("account.photoTitle")}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("account.photoDescription")}
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="account-photo-file">
                    {t("account.photoUpload")}
                  </label>
                  <Input
                    ref={fileRef}
                    id="account-photo-file"
                    type="file"
                    accept="image/*"
                    disabled={photoSaving}
                    onChange={(event) => void handlePickFile(event)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("account.photoHelp")}
                  </p>
                  {fileLabel ? (
                    <p className="mt-1 truncate text-xs text-muted-foreground" title={fileLabel}>
                      {fileLabel}
                    </p>
                  ) : null}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="account-photo-url">
                    {t("account.photoUrl")}
                  </label>
                  <Input
                    id="account-photo-url"
                    type="text"
                    inputMode="url"
                    value={urlInput}
                    placeholder="https://..."
                    disabled={Boolean(pendingJpegBlob) || photoSaving}
                    autoComplete="off"
                    onChange={(event) => handleUrlChange(event.target.value)}
                  />
                </div>

                {photoError ? (
                  <p
                    className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                    role="alert"
                  >
                    {photoError}
                  </p>
                ) : null}
                {photoMessage ? (
                  <p className="rounded-lg border border-emerald-400/30 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                    {photoMessage}
                  </p>
                ) : null}

                <div className="flex flex-wrap justify-end gap-2">
                  {canRemovePhoto ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={photoSaving}
                      onClick={() => void handleRemovePhoto()}
                      className="mr-auto text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                      {t("account.photoRemove")}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={photoSaving}
                    onClick={() => resetPhotoState(profile)}
                  >
                    {t("account.photoReset")}
                  </Button>
                  <Button type="button" disabled={photoSaving} onClick={() => void handleSavePhoto()}>
                    <Upload className="h-4 w-4" />
                    {photoSaving ? t("common.loading") : t("account.photoSave")}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {profile?.linked_patient && patientRecordForm ? (
              <div className="rounded-xl border border-border bg-card p-5">
                <h2 className="text-lg font-semibold">{t("patients.detailAbout")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("account.linkedPatientIntro")}</p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-xs font-normal">
                    {t("patients.recordId")} #{linkedPatientId}
                  </Badge>
                  {patientDetail ? (
                    <>
                      <Badge variant="secondary" className="text-xs font-normal">
                        {patientDetail.care_level}
                      </Badge>
                      <Badge variant="secondary" className="text-xs font-normal">
                        {patientDetail.mobility_type}
                      </Badge>
                      <Badge variant={patientDetail.is_active ? "success" : "outline"} className="text-xs font-normal">
                        {patientDetail.is_active
                          ? t("clinical.recordStatus.activeBadge")
                          : t("clinical.recordStatus.inactiveBadge")}
                      </Badge>
                    </>
                  ) : patientDetailQuery.isPending ? (
                    <span className="text-xs text-muted-foreground">{t("patients.editorLoading")}</span>
                  ) : null}
                </div>

                {roomLocationLine ? (
                  <div className="mt-3 text-sm text-foreground">
                    <span className="text-muted-foreground">{t("observer.patients.room")}: </span>
                    {roomLocationLine}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">{t("patients.noRoom")}</p>
                )}

                {user.role === "patient" ? (
                  <div className="mt-2">
                    <Link
                      href="/patient/room-controls"
                      className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {t("account.linkedPatientRoomControls")}
                    </Link>
                  </div>
                ) : null}

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Field
                    label={t("patients.firstName")}
                    value={patientRecordForm.first_name}
                    onChange={(value) =>
                      setPatientRecordForm((prev) => (prev ? { ...prev, first_name: value } : prev))
                    }
                  />
                  <Field
                    label={t("patients.lastName")}
                    value={patientRecordForm.last_name}
                    onChange={(value) =>
                      setPatientRecordForm((prev) => (prev ? { ...prev, last_name: value } : prev))
                    }
                  />
                </div>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field
                    label={t("patients.nickname")}
                    value={patientRecordForm.nickname}
                    onChange={(value) =>
                      setPatientRecordForm((prev) => (prev ? { ...prev, nickname: value } : prev))
                    }
                  />
                  <div>
                    <label className="mb-1 block text-sm font-medium">{t("patients.dateOfBirth")}</label>
                    <Input
                      type="date"
                      value={patientRecordForm.date_of_birth}
                      onChange={(event) =>
                        setPatientRecordForm((prev) =>
                          prev ? { ...prev, date_of_birth: event.target.value } : prev,
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">{t("patients.gender")}</label>
                    <select
                      className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring/30"
                      value={patientRecordForm.gender}
                      onChange={(event) =>
                        setPatientRecordForm((prev) =>
                          prev ? { ...prev, gender: event.target.value } : prev,
                        )
                      }
                    >
                      <option value="">{t("patients.genderUnset")}</option>
                      <option value="male">{t("patients.genderMale")}</option>
                      <option value="female">{t("patients.genderFemale")}</option>
                      <option value="other">{t("patients.genderOther")}</option>
                    </select>
                  </div>
                  <Field
                    label={t("patients.heightCm")}
                    value={patientRecordForm.height_cm}
                    onChange={(value) =>
                      setPatientRecordForm((prev) => (prev ? { ...prev, height_cm: value } : prev))
                    }
                  />
                  <Field
                    label={t("patients.weightKg")}
                    value={patientRecordForm.weight_kg}
                    onChange={(value) =>
                      setPatientRecordForm((prev) => (prev ? { ...prev, weight_kg: value } : prev))
                    }
                  />
                  <Field
                    label={t("patients.bloodType")}
                    value={patientRecordForm.blood_type}
                    onChange={(value) =>
                      setPatientRecordForm((prev) => (prev ? { ...prev, blood_type: value } : prev))
                    }
                  />
                  <div className="sm:col-span-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">{t("patients.detailBmi")}: </span>
                    <span className="font-medium tabular-nums">
                      {patientBmiPreview != null ? patientBmiPreview : "—"}
                    </span>
                    {patientBmiCategory ? (
                      <span className="ml-2 text-muted-foreground">
                        (
                        {patientBmiCategory === "underweight"
                          ? t("patients.bmiUnderweight")
                          : patientBmiCategory === "normal"
                            ? t("patients.bmiNormal")
                            : patientBmiCategory === "overweight"
                              ? t("patients.bmiOverweight")
                              : t("patients.bmiObese")}
                        )
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <label className="block text-sm font-medium">{t("account.allergiesFieldLabel")}</label>
                  <Textarea
                    rows={4}
                    value={patientRecordForm.allergiesText}
                    placeholder={t("patients.allergiesPlaceholder")}
                    onChange={(event) =>
                      setPatientRecordForm((prev) =>
                        prev ? { ...prev, allergiesText: event.target.value } : prev,
                      )
                    }
                  />
                  <p className="text-xs text-muted-foreground">{t("account.linkedPatientAllergiesHelp")}</p>
                </div>

                <div className="mt-4 space-y-2">
                  <label className="block text-sm font-medium">{t("patients.formSectionNotes")}</label>
                  <Textarea
                    rows={3}
                    value={patientRecordForm.notes}
                    onChange={(event) =>
                      setPatientRecordForm((prev) =>
                        prev ? { ...prev, notes: event.target.value } : prev,
                      )
                    }
                  />
                </div>

                <div className="mt-4">
                  <Field
                    label={t("account.linkedPatientRecordPhoto")}
                    value={patientRecordForm.photo_url}
                    onChange={(value) =>
                      setPatientRecordForm((prev) => (prev ? { ...prev, photo_url: value } : prev))
                    }
                  />
                </div>

                {patientDetailQuery.isError ? (
                  <p className="mt-3 text-xs text-destructive">
                    {patientDetailQuery.error instanceof ApiError
                      ? patientDetailQuery.error.message
                      : t("common.requestFailed")}
                  </p>
                ) : null}
                <div className="mt-4 flex justify-end">
                  <Button
                    type="button"
                    disabled={profileSaving}
                    onClick={() => void handleSaveProfile("patient")}
                  >
                    <Save className="h-4 w-4" />
                    {profileSaving ? t("common.loading") : t("account.savePatientRecord")}
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-lg font-semibold">{t("account.personalProfile")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("account.personalProfileDescription")}
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field
                  label={t("account.username")}
                  value={profileForm.username}
                  onChange={(value) => setProfileForm((prev) => ({ ...prev, username: value }))}
                />
                <Field
                  label={t("account.email")}
                  value={profileForm.email}
                  onChange={(value) => setProfileForm((prev) => ({ ...prev, email: value }))}
                />
                <Field
                  label={t("account.phone")}
                  value={profileForm.phone}
                  onChange={(value) => setProfileForm((prev) => ({ ...prev, phone: value }))}
                />
              </div>

              {caregiverEditable ? (
                <>
                  <div className="mt-5 border-t border-border pt-4">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("account.staffProfile")}
                    </h3>
                  </div>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <Field
                      label={t("patients.firstName")}
                      value={profileForm.caregiver_first_name}
                      onChange={(value) =>
                        setProfileForm((prev) => ({ ...prev, caregiver_first_name: value }))
                      }
                    />
                    <Field
                      label={t("patients.lastName")}
                      value={profileForm.caregiver_last_name}
                      onChange={(value) =>
                        setProfileForm((prev) => ({ ...prev, caregiver_last_name: value }))
                      }
                    />
                    <Field
                      label={t("account.department")}
                      value={profileForm.caregiver_department}
                      onChange={(value) =>
                        setProfileForm((prev) => ({ ...prev, caregiver_department: value }))
                      }
                    />
                    <Field
                      label={t("account.employeeCode")}
                      value={profileForm.caregiver_employee_code}
                      onChange={(value) =>
                        setProfileForm((prev) => ({ ...prev, caregiver_employee_code: value }))
                      }
                    />
                    <Field
                      label={t("account.specialty")}
                      value={profileForm.caregiver_specialty}
                      onChange={(value) =>
                        setProfileForm((prev) => ({ ...prev, caregiver_specialty: value }))
                      }
                    />
                    <Field
                      label={t("account.licenseNumber")}
                      value={profileForm.caregiver_license_number}
                      onChange={(value) =>
                        setProfileForm((prev) => ({ ...prev, caregiver_license_number: value }))
                      }
                    />
                    <Field
                      label={t("account.emergencyContactName")}
                      value={profileForm.caregiver_emergency_contact_name}
                      onChange={(value) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          caregiver_emergency_contact_name: value,
                        }))
                      }
                    />
                    <Field
                      label={t("account.emergencyContactPhone")}
                      value={profileForm.caregiver_emergency_contact_phone}
                      onChange={(value) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          caregiver_emergency_contact_phone: value,
                        }))
                      }
                    />
                  </div>
                </>
              ) : null}

              {profileError ? (
                <p
                  className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  role="alert"
                >
                  {profileError}
                </p>
              ) : null}
              {profileMessage ? (
                <p className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                  {profileMessage}
                </p>
              ) : null}

              <div className="mt-4 flex justify-end">
                <Button
                  type="button"
                  disabled={profileSaving}
                  onClick={() => void handleSaveProfile("account")}
                >
                  <Save className="h-4 w-4" />
                  {profileSaving ? t("common.loading") : t("account.saveAccountContact")}
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Type className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">{t("account.displayTitle")}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{t("account.displayDescription")}</p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{t("account.textSizeLabel")}</p>
                  <p className="text-sm text-muted-foreground ws-tabular-nums">{Math.round(fontScale.scale * 100)}%</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={fontScale.decrease}
                    disabled={fontScale.scale <= 0.875}
                    aria-label={t("account.textSizeDecrease")}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={fontScale.reset}
                    disabled={fontScale.scale === 1}
                  >
                    {t("account.textSizeReset")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={fontScale.increase}
                    disabled={fontScale.scale >= 1.5}
                    aria-label={t("account.textSizeIncrease")}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-lg font-semibold">{t("account.passwordTitle")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("account.passwordDescription")}
              </p>

              <div className="mt-4 grid gap-4">
                <Field
                  label={t("account.currentPassword")}
                  type="password"
                  value={passwordForm.current_password}
                  onChange={(value) =>
                    setPasswordForm((prev) => ({ ...prev, current_password: value }))
                  }
                />
                <Field
                  label={t("account.newPassword")}
                  type="password"
                  value={passwordForm.new_password}
                  onChange={(value) =>
                    setPasswordForm((prev) => ({ ...prev, new_password: value }))
                  }
                />
                <Field
                  label={t("account.confirmPassword")}
                  type="password"
                  value={passwordForm.confirm_password}
                  onChange={(value) =>
                    setPasswordForm((prev) => ({ ...prev, confirm_password: value }))
                  }
                />
              </div>

              {passwordError ? (
                <p
                  className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  role="alert"
                >
                  {passwordError}
                </p>
              ) : null}
              {passwordMessage ? (
                <p className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                  {passwordMessage}
                </p>
              ) : null}

              <div className="mt-4 flex justify-end">
                <Button
                  type="button"
                  disabled={passwordSaving}
                  onClick={() => void handleChangePassword()}
                >
                  {passwordSaving ? t("common.loading") : t("account.passwordUpdate")}
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <Input
        type={type}
        value={value}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
      <Icon className="h-4 w-4 text-primary" />
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}
