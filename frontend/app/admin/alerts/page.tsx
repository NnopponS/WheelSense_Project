"use client";

import { useTranslation } from "@/lib/i18n";
import { useQuery } from "@/hooks/useQuery";
import type { Alert } from "@/lib/types";
import { useState } from "react";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import {
  AdminAlertsTable,
  type AdminAlertFilterStatus,
} from "@/components/admin/alerts/AdminAlertsTable";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function AlertsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: alerts, isLoading, refetch } = useQuery<Alert[]>("/alerts");
  const [filter, setFilter] = useState<AdminAlertFilterStatus>("all");
  const [search, setSearch] = useState("");

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
        <h2 className="text-2xl font-bold text-foreground">{t("alerts.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("alerts.subtitle")}</p>
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search alerts"
              className="pl-9"
            />
          </div>
          <Select value={filter} onValueChange={(value) => setFilter(value as AdminAlertFilterStatus)}>
            <SelectTrigger>
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("alerts.all")}</SelectItem>
              <SelectItem value="active">{t("alerts.active")}</SelectItem>
              <SelectItem value="acknowledged">{t("alerts.acknowledged")}</SelectItem>
              <SelectItem value="resolved">{t("alerts.resolved")}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <AdminAlertsTable
        alerts={alerts}
        isLoading={isLoading}
        filter={filter}
        search={search}
        onUpdateStatus={updateStatus}
        canAcknowledge={canAcknowledge}
      />
    </div>
  );
}
