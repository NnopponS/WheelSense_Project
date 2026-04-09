"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, KeyRound, Mail, Shield, Trash2, Upload } from "lucide-react";
import UserAvatar from "@/components/shared/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api";
import { getRoleHome } from "@/lib/routes";
import type { User } from "@/lib/types";
import {
  imageFileToResizedSquareJpegBlob,
  isAllowedProfileImageUrlInput,
} from "@/lib/profileImageProcess";

export default function AccountPage() {
  const { user, loading, refreshUser } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState("");
  const [pendingJpegBlob, setPendingJpegBlob] = useState<Blob | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [fileLabel, setFileLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const revokeLocalPreview = useCallback(() => {
    setLocalPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const resetFromUser = useCallback(
    (nextUser: User | null) => {
      setUrlInput(nextUser?.profile_image_url?.trim() ?? "");
      setPendingJpegBlob(null);
      revokeLocalPreview();
      setFileLabel(null);
      setError(null);
      if (fileRef.current) fileRef.current.value = "";
    },
    [revokeLocalPreview],
  );

  useEffect(() => {
    if (user) resetFromUser(user);
  }, [resetFromUser, user]);

  useEffect(() => () => revokeLocalPreview(), [revokeLocalPreview]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
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

  const trimmedUrl = urlInput.trim();
  const previewForAvatar =
    localPreviewUrl ||
    (trimmedUrl && isAllowedProfileImageUrlInput(trimmedUrl) ? trimmedUrl : null) ||
    user.profile_image_url?.trim() ||
    null;
  const hasSavedImage = Boolean(user.profile_image_url?.trim());
  const canRemove = hasSavedImage || pendingJpegBlob !== null;

  async function handlePickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError(null);
    if (!file) {
      setFileLabel(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    setSaving(true);
    try {
      const blob = await imageFileToResizedSquareJpegBlob(file);
      revokeLocalPreview();
      setLocalPreviewUrl(URL.createObjectURL(blob));
      setPendingJpegBlob(blob);
      setUrlInput("");
      setFileLabel(file.name);
    } catch {
      setError("The image could not be prepared for upload.");
      setPendingJpegBlob(null);
      revokeLocalPreview();
      setFileLabel(null);
    } finally {
      setSaving(false);
    }
  }

  function handleUrlChange(value: string) {
    if (value.trim().toLowerCase().startsWith("data:")) {
      setError("Data URLs are not accepted.");
      return;
    }
    setUrlInput(value);
    setPendingJpegBlob(null);
    revokeLocalPreview();
    setFileLabel(null);
    if (fileRef.current) fileRef.current.value = "";
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      if (pendingJpegBlob) {
        const body = new FormData();
        body.append("file", pendingJpegBlob, "avatar.jpg");
        await api.postForm<User>("/auth/me/profile-image", body);
      } else {
        const nextUrl = urlInput.trim();
        if (nextUrl && !isAllowedProfileImageUrlInput(nextUrl)) {
          setError("Use an http(s) image URL or a platform-hosted profile image path.");
          setSaving(false);
          return;
        }
        await api.patch<User>("/auth/me", {
          profile_image_url: nextUrl.length ? nextUrl : null,
        });
      }
      await refreshUser();
      setPendingJpegBlob(null);
      revokeLocalPreview();
      setFileLabel(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save profile photo.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemovePhoto() {
    setSaving(true);
    setError(null);
    try {
      setPendingJpegBlob(null);
      revokeLocalPreview();
      setUrlInput("");
      setFileLabel(null);
      if (fileRef.current) fileRef.current.value = "";
      await api.patch<User>("/auth/me", { profile_image_url: null });
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove profile photo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-surface px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Account
            </p>
            <h1 className="mt-1 text-2xl font-semibold">Your settings</h1>
          </div>
          <Button asChild variant="outline">
            <Link href={getRoleHome(user.role)}>
              <ArrowLeft className="h-4 w-4" />
              Back to dashboard
            </Link>
          </Button>
        </div>

        <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-4">
              <UserAvatar
                username={user.username}
                profileImageUrl={previewForAvatar}
                sizePx={96}
              />
              <div className="min-w-0">
                <p className="truncate text-xl font-semibold">{user.username}</p>
                <p className="mt-1 text-sm text-muted-foreground">{user.role.replace(/_/g, " ")}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-3">
              <InfoRow icon={KeyRound} label="User ID" value={String(user.id)} />
              <InfoRow icon={Shield} label="Role" value={user.role.replace(/_/g, " ")} />
              {user.email ? <InfoRow icon={Mail} label="Email" value={user.email} /> : null}
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
                  Upload from your device, or use an http(s) image address.
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
                  disabled={saving}
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
                  disabled={Boolean(pendingJpegBlob) || saving}
                  autoComplete="off"
                  onChange={(event) => handleUrlChange(event.target.value)}
                />
              </div>

              {error ? (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2">
                {canRemove ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={() => void handleRemovePhoto()}
                    className="mr-auto text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove photo
                  </Button>
                ) : null}
                <Button type="button" variant="outline" disabled={saving} onClick={() => resetFromUser(user)}>
                  Reset
                </Button>
                <Button type="button" disabled={saving} onClick={() => void handleSave()}>
                  <Upload className="h-4 w-4" />
                  {saving ? "Saving..." : "Save photo"}
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
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
