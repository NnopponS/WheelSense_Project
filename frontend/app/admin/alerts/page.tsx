"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AdminAlertsTable,
  type AdminAlertFilterStatus,
} from "@/components/admin/alerts/AdminAlertsTable";
import { AppPage } from "@/components/layout/AppPage";
import { FilterBar } from "@/components/shared/FilterBar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import type { Alert } from "@/lib/types";

function parseError(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

export default function AdminAlertsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<AdminAlertFilterStatus>("all");
  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const alertsQuery = useQuery({
    queryKey: ["admin", "alerts", "list"],
    queryFn: () => api.listAlerts({ limit: 500 }),
    refetchInterval: 30_000,
  });

  const updateAlertMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      if (status === "acknowledged") {
        await api.acknowledgeAlert(id, { caregiver_id: null });
        return;
      }
      if (status === "resolved") {
        await api.resolveAlert(id, { resolution_note: "" });
      }
    },
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "alerts"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      setActionError(parseError(error, t("common.requestFailed")));
    },
  });

  const alerts = (alertsQuery.data ?? []) as Alert[];

  return (
    <AppPage
      eyebrow={t("nav.alerts")}
      title={t("alerts.title")}
      description={t("admin.alerts.pageSubtitle")}
      breadcrumbs={[
        { label: t("nav.dashboard"), href: "/admin" },
        { label: t("nav.alerts") },
      ]}
    >
      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchLabel={t("common.search")}
        searchPlaceholder={t("admin.alerts.searchPlaceholder")}
        resetLabel={t("common.reset")}
        hasActiveFilters={search.trim().length > 0 || filter !== "all"}
        onReset={() => {
          setSearch("");
          setFilter("all");
        }}
      >
        <div className="min-w-48 flex-1">
          <label htmlFor="admin-alert-status" className="mb-1 block text-sm font-medium text-foreground">
            {t("headNurse.alerts.filterStatusPlaceholder")}
          </label>
          <Select value={filter} onValueChange={(value) => setFilter(value as AdminAlertFilterStatus)}>
            <SelectTrigger id="admin-alert-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("headNurse.alerts.filterStatusAll")}</SelectItem>
              <SelectItem value="active">{t("alerts.active")}</SelectItem>
              <SelectItem value="acknowledged">{t("alerts.acknowledged")}</SelectItem>
              <SelectItem value="resolved">{t("headNurse.alerts.statusResolved")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </FilterBar>

      {actionError ? (
        <div className="rounded-xl border border-critical/30 bg-critical-bg px-4 py-3 text-sm text-critical-foreground" role="alert">
          {actionError}
        </div>
      ) : null}

      <AdminAlertsTable
        alerts={alerts}
        isLoading={alertsQuery.isLoading}
        filter={filter}
        search={search}
        onUpdateStatus={(id, status) => updateAlertMutation.mutate({ id, status })}
        canAcknowledge
      />
    </AppPage>
  );
}
