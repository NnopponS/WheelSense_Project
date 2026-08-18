"use client";

import { AlertTriangle, Bell, Clock, Info, ShieldAlert } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import type { Alert } from "@/lib/types";
import EmptyState from "@/components/EmptyState";
import { LoadingState } from "@/components/layout/LoadingState";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/shared/StatusBadge";
import { cn } from "@/lib/utils";

type FilterStatus = "all" | "active" | "acknowledged" | "resolved";

type Props = {
  alerts: Alert[] | null | undefined;
  isLoading: boolean;
  filter: FilterStatus;
  onFilterChange: (filter: FilterStatus) => void;
  onUpdateStatus: (id: number, status: string) => void;
  canAcknowledge: boolean;
};

function severityTone(severity: string): StatusTone {
  if (severity === "critical") return "critical";
  if (severity === "warning") return "warning";
  return "info";
}

function statusTone(status: string): StatusTone {
  if (status === "resolved") return "success";
  if (status === "acknowledged") return "info";
  if (status === "active") return "critical";
  return "neutral";
}

const severityStyles = {
  critical: {
    icon: ShieldAlert,
    border: "border-l-critical",
    iconSurface: "bg-critical-bg text-critical-foreground",
  },
  warning: {
    icon: AlertTriangle,
    border: "border-l-warning",
    iconSurface: "bg-warning-bg text-warning-foreground",
  },
  info: {
    icon: Info,
    border: "border-l-info",
    iconSurface: "bg-info-bg text-info-foreground",
  },
};

export default function AlertPanel({
  alerts,
  isLoading,
  filter,
  onFilterChange,
  onUpdateStatus,
  canAcknowledge,
}: Props) {
  const { t } = useTranslation();
  const filtered = filter === "all" ? alerts : alerts?.filter((alert) => alert.status === filter);

  const filters: Array<{
    key: FilterStatus;
    labelKey: "alerts.all" | "alerts.active" | "alerts.acknowledged" | "alerts.resolved";
  }> = [
    { key: "all", labelKey: "alerts.all" },
    { key: "active", labelKey: "alerts.active" },
    { key: "acknowledged", labelKey: "alerts.acknowledged" },
    { key: "resolved", labelKey: "alerts.resolved" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" aria-label={t("alerts.filterLabel")}>
        {filters.map((item) => {
          const selected = filter === item.key;
          return (
            <Button
              key={item.key}
              type="button"
              size="sm"
              variant={selected ? "default" : "outline"}
              aria-pressed={selected}
              onClick={() => onFilterChange(item.key)}
            >
              {t(item.labelKey)}
            </Button>
          );
        })}
      </div>

      {isLoading ? (
        <LoadingState message={t("common.loading")} />
      ) : !filtered?.length ? (
        <EmptyState icon={Bell} message={t("alerts.empty")} />
      ) : (
        <div className="space-y-3" aria-live="polite">
          {filtered.map((alert) => {
            const tone = severityTone(alert.severity);
            const style = severityStyles[
              tone === "critical" ? "critical" : tone === "warning" ? "warning" : "info"
            ];
            const Icon = style.icon;

            return (
              <article
                key={alert.id}
                className={cn(
                  "surface-card flex flex-col gap-4 border-l-4 p-4 sm:flex-row sm:items-start",
                  style.border,
                )}
              >
                <div
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg",
                    style.iconSurface,
                  )}
                >
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-foreground">
                      {alert.title || alert.alert_type}
                    </h3>
                    <StatusBadge label={alert.severity} tone={tone} />
                    <StatusBadge label={alert.status} tone={statusTone(alert.status)} />
                  </div>
                  {alert.description ? (
                    <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                      {alert.description}
                    </p>
                  ) : null}
                  <p className="ws-tabular-nums mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-5 w-5" aria-hidden="true" />
                    {alert.timestamp ? new Date(alert.timestamp).toLocaleString() : "—"}
                  </p>
                </div>

                {canAcknowledge && alert.status !== "resolved" ? (
                  <div className="flex shrink-0 flex-wrap gap-2 sm:max-w-48 sm:justify-end">
                    {alert.status === "active" ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="border-warning/40 text-warning-foreground hover:bg-warning-bg"
                        onClick={() => onUpdateStatus(alert.id, "acknowledged")}
                      >
                        {t("alerts.acknowledge")}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      className="border-success/40 text-success-foreground hover:bg-success-bg"
                      onClick={() => onUpdateStatus(alert.id, "resolved")}
                    >
                      {t("alerts.resolve")}
                    </Button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
