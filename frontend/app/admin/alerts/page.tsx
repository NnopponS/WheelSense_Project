"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Search } from "lucide-react";
import {
  AdminAlertsTable,
  type AdminAlertFilterStatus,
} from "@/components/admin/alerts/AdminAlertsTable";
import { Input } from "@/components/ui/input";
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
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Bell className="h-3.5 w-3.5" />
            {t("nav.alerts")}
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-foreground md:text-3xl">
            {t("alerts.title")}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {t("admin.alerts.pageSubtitle")}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_180px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("admin.alerts.searchPlaceholder")}
              className="pl-9"
            />
          </div>
          <Select value={filter} onValueChange={(value) => setFilter(value as AdminAlertFilterStatus)}>
            <SelectTrigger>
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
      </div>

      {actionError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
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
    </div>
  );
}
