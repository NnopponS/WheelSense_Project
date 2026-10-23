"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import CaregiverDetailPane from "@/components/admin/caregivers/CaregiverDetailPane";
import type { Caregiver, User } from "@/lib/types";
import { AppPage } from "@/components/layout/AppPage";
import { DataState } from "@/components/layout/DataState";
import { useAuth } from "@/hooks/useAuth";
import { getCaregiversPath } from "@/lib/routes";

function usersForCaregiver(users: User[] | null | undefined, caregiverId: number): User[] {
  if (!users?.length) return [];
  return users.filter((u) => u.caregiver_id === caregiverId);
}

export default function AdminCaregiverDetailPage() {
  const params = useParams();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "";
  const { t } = useTranslation();
  const { user } = useAuth();
  const numericId = Number(id);
  const { data: users, refetch: refetchUsers } = useQuery({
    queryKey: ["admin", "caregivers", "detail", "users"],
    queryFn: () => api.get<User[]>("/users"),
    staleTime: 30_000,
  });
  const [caregiver, setCaregiver] = useState<Caregiver | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  const backHref = getCaregiversPath(user?.role || "admin");

  return (
    <AppPage
      width="content"
      title={
        caregiver
          ? `${caregiver.first_name} ${caregiver.last_name}`.trim() || t("caregivers.title")
          : t("caregivers.title")
      }
      description={t("caregivers.directorySubtitle")}
      breadcrumbs={[
        {
          label: t("nav.dashboard"),
          href: user?.role ? `/${String(user.role).replace("_", "-")}` : "/admin",
        },
        { label: t("caregivers.title"), href: backHref },
        { label: caregiver ? `${caregiver.first_name} ${caregiver.last_name}` : t("common.loading") },
      ]}
    >
      {loading ? (
        <DataState kind="loading" title={t("common.loading")} />
      ) : error || !caregiver ? (
        <DataState
          kind="error"
          title={t("caregivers.detailNotFound")}
          description={error ?? t("caregivers.detailLoadError")}
        />
      ) : (
        <CaregiverDetailPane
          caregiver={caregiver}
          linkedUsers={linked}
          onUserUpdated={() => void refetchUsers()}
          onCaregiverUpdated={setCaregiver}
        />
      )}
    </AppPage>
  );
}
