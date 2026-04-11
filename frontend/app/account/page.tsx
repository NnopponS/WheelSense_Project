"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ComponentType } from "react";
import {
  ArrowLeft,
  Camera,
  KeyRound,
  Mail,
  Phone,
  Save,
  Shield,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import UserAvatar from "@/components/shared/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api";
import { getRoleHome } from "@/lib/routes";
import type { Caregiver, User } from "@/lib/types";
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

type MeProfileResponse = {
  user: User;
  linked_caregiver?: LinkedCaregiver | null;
  linked_patient?: {
    id: number;
    first_name?: string | null;
    last_name?: string | null;
    nickname?: string | null;
  } | null;
};

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
  const { user, loading, refreshUser } = useAuth();
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

  useEffect(() => () => revokeLocalPreview(), [revokeLocalPreview]);

  const trimmedUrl = urlInput.trim();
  const activeUser = profile?.user ?? user ?? null;
  const previewForAvatar =
    localPreviewUrl ||
    (trimmedUrl && isAllowedProfileImageUrlInput(trimmedUrl) ? trimmedUrl : null) ||
    activeUser?.profile_image_url?.trim() ||
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
      setPhotoError("Choose an image file.");
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
      setPhotoError("The image could not be prepared for upload.");
      setPendingJpegBlob(null);
      revokeLocalPreview();
      setFileLabel(null);
    } finally {
      setPhotoSaving(false);
    }
  }

  function handleUrlChange(value: string) {
    if (value.trim().toLowerCase().startsWith("data:")) {
      setPhotoError("Data URLs are not accepted.");
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
          setPhotoError("Use an http(s) image URL or a platform-hosted profile image path.");
          setPhotoSaving(false);
          return;
        }
        await patchProfileImage(nextUrl.length ? nextUrl : null);
      }
      await refreshUser();
      await loadProfile();
      setPhotoMessage("Profile photo updated.");
      setPendingJpegBlob(null);
      revokeLocalPreview();
      setFileLabel(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setPhotoError(err instanceof ApiError ? err.message : "Could not save profile photo.");
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
      setPhotoMessage("Profile photo removed.");
    } catch (err) {
      setPhotoError(err instanceof ApiError ? err.message : "Could not remove profile photo.");
    } finally {
      setPhotoSaving(false);
    }
  }

  async function handleSaveProfile() {
    if (!user || !profile) return;
    setProfileSaving(true);
    setProfileError(null);
    setProfileMessage(null);
    try {
      const payload: Record<string, unknown> = {};
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

      if (Object.keys(payload).length === 0) {
        setProfileMessage("No changes to save.");
        return;
      }

      await api.patch<MeProfileResponse>("/auth/me/profile", payload);
      await refreshUser();
      await loadProfile();
      setProfileMessage("Profile updated.");
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : "Could not save profile.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleChangePassword() {
    setPasswordError(null);
    setPasswordMessage(null);
    if (!passwordForm.current_password || !passwordForm.new_password) {
      setPasswordError("Please enter your current and new password.");
      return;
    }
    if (passwordForm.new_password.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }
    setPasswordSaving(true);
    try {
      await api.post("/auth/change-password", {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });
      setPasswordForm({ current_password: "", new_password: "", confirm_password: "" });
      setPasswordMessage("Password updated.");
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : "Could not change password.");
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
          <p className="text-sm text-muted-foreground">Sign in to manage your account.</p>
          <Button asChild className="mt-4">
            <Link href="/login">Go to login</Link>
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
              Account
            </p>
            <h1 className="mt-1 text-2xl font-semibold">Your profile and security</h1>
          </div>
          <Button asChild variant="outline">
            <Link href={getRoleHome(user.role)}>
              <ArrowLeft className="h-4 w-4" />
              Back to dashboard
            </Link>
          </Button>
        </div>

        <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-4">
                <UserAvatar
                  username={activeUser.username}
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
                <InfoRow icon={KeyRound} label="User ID" value={String(activeUser.id)} />
                <InfoRow icon={Shield} label="Role" value={activeUser.role.replace(/_/g, " ")} />
                {activeUser.email ? <InfoRow icon={Mail} label="Email" value={activeUser.email} /> : null}
                {activeUser.phone ? <InfoRow icon={Phone} label="Phone" value={activeUser.phone} /> : null}
                {linkedPatientLabel ? (
                  <InfoRow icon={UserRound} label="Linked Patient" value={linkedPatientLabel} />
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Camera className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Profile photo</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Upload from your device or use an http(s) image URL.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="account-photo-file">
                    Upload from device
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
                    Images are center-cropped to a square and compressed to JPEG before saving.
                  </p>
                  {fileLabel ? (
                    <p className="mt-1 truncate text-xs text-muted-foreground" title={fileLabel}>
                      {fileLabel}
                    </p>
                  ) : null}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="account-photo-url">
                    Image URL
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
                      Remove photo
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={photoSaving}
                    onClick={() => resetPhotoState(profile)}
                  >
                    Reset
                  </Button>
                  <Button type="button" disabled={photoSaving} onClick={() => void handleSavePhoto()}>
                    <Upload className="h-4 w-4" />
                    {photoSaving ? "Saving..." : "Save photo"}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-lg font-semibold">Personal profile</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                This page is the canonical self-edit surface for every role.
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field
                  label="Username"
                  value={profileForm.username}
                  onChange={(value) => setProfileForm((prev) => ({ ...prev, username: value }))}
                />
                <Field
                  label="Email"
                  value={profileForm.email}
                  onChange={(value) => setProfileForm((prev) => ({ ...prev, email: value }))}
                />
                <Field
                  label="Phone"
                  value={profileForm.phone}
                  onChange={(value) => setProfileForm((prev) => ({ ...prev, phone: value }))}
                />
              </div>

              {caregiverEditable ? (
                <>
                  <div className="mt-5 border-t border-border pt-4">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Staff profile
                    </h3>
                  </div>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <Field
                      label="First Name"
                      value={profileForm.caregiver_first_name}
                      onChange={(value) =>
                        setProfileForm((prev) => ({ ...prev, caregiver_first_name: value }))
                      }
                    />
                    <Field
                      label="Last Name"
                      value={profileForm.caregiver_last_name}
                      onChange={(value) =>
                        setProfileForm((prev) => ({ ...prev, caregiver_last_name: value }))
                      }
                    />
                    <Field
                      label="Department"
                      value={profileForm.caregiver_department}
                      onChange={(value) =>
                        setProfileForm((prev) => ({ ...prev, caregiver_department: value }))
                      }
                    />
                    <Field
                      label="Employee Code"
                      value={profileForm.caregiver_employee_code}
                      onChange={(value) =>
                        setProfileForm((prev) => ({ ...prev, caregiver_employee_code: value }))
                      }
                    />
                    <Field
                      label="Specialty"
                      value={profileForm.caregiver_specialty}
                      onChange={(value) =>
                        setProfileForm((prev) => ({ ...prev, caregiver_specialty: value }))
                      }
                    />
                    <Field
                      label="License Number"
                      value={profileForm.caregiver_license_number}
                      onChange={(value) =>
                        setProfileForm((prev) => ({ ...prev, caregiver_license_number: value }))
                      }
                    />
                    <Field
                      label="Emergency Contact Name"
                      value={profileForm.caregiver_emergency_contact_name}
                      onChange={(value) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          caregiver_emergency_contact_name: value,
                        }))
                      }
                    />
                    <Field
                      label="Emergency Contact Phone"
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
                <Button type="button" disabled={profileSaving} onClick={() => void handleSaveProfile()}>
                  <Save className="h-4 w-4" />
                  {profileSaving ? "Saving..." : "Save profile"}
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-lg font-semibold">Change password</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Password changes always require your current password.
              </p>

              <div className="mt-4 grid gap-4">
                <Field
                  label="Current Password"
                  type="password"
                  value={passwordForm.current_password}
                  onChange={(value) =>
                    setPasswordForm((prev) => ({ ...prev, current_password: value }))
                  }
                />
                <Field
                  label="New Password"
                  type="password"
                  value={passwordForm.new_password}
                  onChange={(value) =>
                    setPasswordForm((prev) => ({ ...prev, new_password: value }))
                  }
                />
                <Field
                  label="Confirm New Password"
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
                  {passwordSaving ? "Updating..." : "Update password"}
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
