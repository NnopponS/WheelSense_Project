"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { ROUTES } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n";
import { useQuery } from "@/hooks/useQuery";
import CaregiverDetailPane from "@/components/admin/caregivers/CaregiverDetailPane";
import EditCaregiverModal from "@/components/admin/caregivers/EditCaregiverModal";
import type { Caregiver, User } from "@/lib/types";

function usersForCaregiver(users: User[] | null | undefined, caregiverId: number): User[] {
  if (!users?.length) return [];
  return users.filter((u) => u.caregiver_id === caregiverId);
}

export default function AdminCaregiverDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t } = useTranslation();
  const numericId = Number(id);
  const { data: users, refetch: refetchUsers } = useQuery<User[]>("/users");
  const [caregiver, setCaregiver] = useState<Caregiver | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!Number.isFinite(numericId) || numericId < 1) {
      setError(t("caregivers.detailInvalidId"));
      setCaregiver(null);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const c = await api.get<Caregiver>(`/caregivers/${numericId}`);
        if (!cancelled) {
          setCaregiver(c);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setCaregiver(null);
          const msg =
            e instanceof ApiError
              ? e.message
              : e instanceof Error
                ? e.message
                : t("caregivers.detailLoadError");
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [numericId, t]);

  const linked = caregiver ? usersForCaregiver(users, caregiver.id) : [];

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      {loading ? (
        <>
          <Link
            href={ROUTES.CAREGIVERS}
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {t("caregivers.backToDirectory")}
          </Link>
          <div className="flex justify-center py-16">
            <div
              className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent"
              role="status"
              aria-label={t("common.loading")}
            />
          </div>
        </>
      ) : error || !caregiver ? (
        <>
          <Link
            href={ROUTES.CAREGIVERS}
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {t("caregivers.backToDirectory")}
          </Link>
          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low/50 px-4 py-8 text-center text-sm text-on-surface-variant">
            {error ?? t("caregivers.detailNotFound")}
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href={ROUTES.CAREGIVERS}
              className="inline-flex items-center gap-2 text-sm text-on-surface-variant hover:text-primary transition-smooth"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {t("caregivers.backToDirectory")}
            </Link>
            <button
              type="button"
              onClick={() => setEditorOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-outline-variant/30 text-on-surface hover:bg-surface-container-high transition-smooth"
            >
              <Pencil className="h-4 w-4" aria-hidden />
              {t("caregivers.editStaff")}
            </button>
          </div>
          <EditCaregiverModal
            open={editorOpen}
            caregiver={caregiver}
            onClose={() => setEditorOpen(false)}
            onSaved={(updated) => setCaregiver(updated)}
          />
          <CaregiverDetailPane
            caregiver={caregiver}
            linkedUsers={linked}
            onUserUpdated={() => void refetchUsers()}
          />
        </>
      )}
    </div>
  );
}
