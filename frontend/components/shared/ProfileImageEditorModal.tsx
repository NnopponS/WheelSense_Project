"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/lib/i18n";
import { api, ApiError } from "@/lib/api";
import type { User } from "@/lib/types";
import {
  imageFileToResizedSquareJpegBlob,
  isAllowedProfileImageUrlInput,
} from "@/lib/profileImageProcess";
import { X } from "lucide-react";
import UserAvatar from "./UserAvatar";

export interface ProfileImageEditorModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ProfileImageEditorModal({
  open,
  onClose,
}: ProfileImageEditorModalProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const urlInputId = useId();
  const fileInputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const { user, refreshUser } = useAuth();

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
    (u: User | null) => {
      const v = u?.profile_image_url?.trim() ?? "";
      setUrlInput(v);
      setPendingJpegBlob(null);
      revokeLocalPreview();
      setFileLabel(null);
      setError(null);
      if (fileRef.current) fileRef.current.value = "";
    },
    [revokeLocalPreview],
  );

  useEffect(() => {
    if (open && user) {
      resetFromUser(user);
    }
  }, [open, user, resetFromUser]);

  useEffect(() => {
    return () => revokeLocalPreview();
  }, [revokeLocalPreview]);

  const trimmedUrl = urlInput.trim();
  const previewForAvatar =
    localPreviewUrl ||
    (trimmedUrl && isAllowedProfileImageUrlInput(trimmedUrl) ? trimmedUrl : null) ||
    user?.profile_image_url?.trim() ||
    null;

  const handlePickFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      setError(null);
      if (!file) {
        setFileLabel(null);
        return;
      }
      if (!file.type.startsWith("image/")) {
        setError(t("profile.avatar.errorFileType"));
        return;
      }
      setSaving(true);
      try {
        const blob = await imageFileToResizedSquareJpegBlob(file);
        revokeLocalPreview();
        const objUrl = URL.createObjectURL(blob);
        setLocalPreviewUrl(objUrl);
        setPendingJpegBlob(blob);
        setUrlInput("");
        setFileLabel(file.name);
      } catch {
        setError(t("profile.avatar.errorUpload"));
        setPendingJpegBlob(null);
        revokeLocalPreview();
        setFileLabel(null);
      } finally {
        setSaving(false);
      }
    },
    [t, revokeLocalPreview],
  );

  const handleUrlChange = useCallback(
    (v: string) => {
      if (v.trim().toLowerCase().startsWith("data:")) {
        setError(t("profile.avatar.errorDataUrl"));
        return;
      }
      setUrlInput(v);
      setPendingJpegBlob(null);
      revokeLocalPreview();
      setFileLabel(null);
      if (fileRef.current) fileRef.current.value = "";
      setError(null);
    },
    [t, revokeLocalPreview],
  );

  const handleRemovePhoto = useCallback(async () => {
    if (!user) return;
    setPendingJpegBlob(null);
    revokeLocalPreview();
    setUrlInput("");
    setFileLabel(null);
    if (fileRef.current) fileRef.current.value = "";
    setSaving(true);
    setError(null);
    try {
      await api.patch<User>("/auth/me", { profile_image_url: null });
      await refreshUser();
      onClose();
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : t("profile.avatar.errorUpload");
      setError(msg);
    } finally {
      setSaving(false);
    }
  }, [user, refreshUser, onClose, t, revokeLocalPreview]);

  const handleSave = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      if (pendingJpegBlob) {
        const fd = new FormData();
        fd.append("file", pendingJpegBlob, "avatar.jpg");
        await api.postForm<User>("/auth/me/profile-image", fd);
      } else {
        const trimmed = urlInput.trim();
        if (trimmed && !isAllowedProfileImageUrlInput(trimmed)) {
          setError(t("profile.avatar.errorInvalidUrl"));
          setSaving(false);
          return;
        }
        await api.patch<User>("/auth/me", {
          profile_image_url: trimmed.length ? trimmed : null,
        });
      }
      await refreshUser();
      onClose();
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : t("profile.avatar.errorUpload");
      setError(msg);
    } finally {
      setSaving(false);
    }
  }, [user, pendingJpegBlob, urlInput, refreshUser, onClose, t]);

  if (!open) return null;

  const hasSavedImage = Boolean(user?.profile_image_url?.trim());
  const canRemove = hasSavedImage || pendingJpegBlob !== null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-surface-container-lowest border border-outline-variant/20 shadow-lg overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/15">
          <h2 id={titleId} className="text-base font-semibold text-foreground">
            {t("profile.avatar.editorTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-foreground-variant hover:bg-surface-container-high transition-smooth"
            aria-label={t("profile.avatar.cancel")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {user && (
            <div className="flex justify-center">
              <UserAvatar
                username={user.username}
                profileImageUrl={previewForAvatar}
                sizePx={96}
              />
            </div>
          )}

          <p className="text-xs text-foreground-variant">{t("profile.avatar.urlHint")}</p>

          <div>
            <label htmlFor={urlInputId} className="block text-sm font-medium text-foreground mb-1">
              {t("profile.avatar.changePhoto")}
            </label>
            <input
              id={urlInputId}
              type="text"
              inputMode="url"
              value={urlInput}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="https://..."
              disabled={Boolean(pendingJpegBlob)}
              className="input-field w-full py-2 text-sm disabled:opacity-60"
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor={fileInputId} className="block text-sm font-medium text-foreground mb-1">
              {t("profile.avatar.localFileLabel")}
            </label>
            <input
              ref={fileRef}
              id={fileInputId}
              type="file"
              accept="image/*"
              disabled={saving}
              className="block w-full text-sm text-foreground-variant file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-surface-container-high file:text-foreground disabled:opacity-60"
              onChange={(e) => void handlePickFile(e)}
            />
            {fileLabel && (
              <p className="mt-1 text-xs text-foreground-variant truncate" title={fileLabel}>
                {fileLabel}
              </p>
            )}
            <p className="mt-1 text-xs text-foreground-variant">{t("profile.avatar.cropHint")}</p>
          </div>

          {error && (
            <p className="text-sm text-error" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            {canRemove ? (
              <button
                type="button"
                className="mr-auto px-3 py-2 rounded-lg text-sm font-medium text-error hover:bg-error/10 transition-smooth"
                onClick={() => void handleRemovePhoto()}
                disabled={saving}
              >
                {t("profile.avatar.removePhoto")}
              </button>
            ) : null}
            <button
              type="button"
              className="px-4 py-2 rounded-lg text-sm font-medium text-foreground-variant hover:bg-surface-container-high transition-smooth"
              onClick={onClose}
              disabled={saving}
            >
              {t("profile.avatar.cancel")}
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-on-primary hover:opacity-95 disabled:opacity-50"
              onClick={() => void handleSave()}
              disabled={saving || !user}
            >
              {saving ? `${t("common.loading")}` : t("profile.avatar.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
