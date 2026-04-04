"use client";

import { useTranslation } from "@/lib/i18n";
import { useQuery } from "@/hooks/useQuery";
import type { Alert } from "@/lib/types";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import AlertPanel from "@/components/shared/AlertPanel";

type FilterStatus = "all" | "active" | "acknowledged" | "resolved";

export default function AlertsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: alerts, isLoading, refetch } = useQuery<Alert[]>("/alerts");
  const [filter, setFilter] = useState<FilterStatus>("all");

  const canAcknowledge = user?.role === "admin" || user?.role === "head_nurse";

  async function updateStatus(id: number, status: string) {
    try {
      if (status === "acknowledged") {
        await api.post(`/alerts/${id}/acknowledge`, {
          caregiver_id: user?.caregiver_id ?? null,
        });
      } else if (status === "resolved") {
        await api.post(`/alerts/${id}/resolve`, { resolution_note: "" });
      }
      refetch();
    } catch {
      /* silent */
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-on-surface">{t("alerts.title")}</h2>
        <p className="text-sm text-on-surface-variant mt-1">{t("alerts.subtitle")}</p>
      </div>

      <AlertPanel
        alerts={alerts}
        isLoading={isLoading}
        filter={filter}
        onFilterChange={setFilter}
        onUpdateStatus={updateStatus}
        canAcknowledge={canAcknowledge}
      />
    </div>
  );
}
