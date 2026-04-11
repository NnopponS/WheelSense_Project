"use client";

import { useTranslation } from "@/lib/i18n";
import EmptyState from "@/components/EmptyState";
import { Bell, AlertTriangle, Clock } from "lucide-react";
import type { Alert } from "@/lib/types";

type FilterStatus = "all" | "active" | "acknowledged" | "resolved";

type Props = {
  alerts: Alert[] | null | undefined;
  isLoading: boolean;
  filter: FilterStatus;
  onFilterChange: (f: FilterStatus) => void;
  onUpdateStatus: (id: number, status: string) => void;
  canAcknowledge: boolean;
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

  const filtered =
    filter === "all" ? alerts : alerts?.filter((a) => a.status === filter);

  const FILTERS: {
    key: FilterStatus;
    labelKey: "alerts.all" | "alerts.active" | "alerts.acknowledged" | "alerts.resolved";
  }[] = [
    { key: "all", labelKey: "alerts.all" },
    { key: "active", labelKey: "alerts.active" },
    { key: "acknowledged", labelKey: "alerts.acknowledged" },
    { key: "resolved", labelKey: "alerts.resolved" },
  ];

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => onFilterChange(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-smooth ${
              filter === f.key
                ? "bg-primary text-on-primary"
                : "bg-surface-container-low text-foreground-variant hover:bg-surface-container"
            }`}
          >
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !filtered || filtered.length === 0 ? (
        <EmptyState icon={Bell} message={t("alerts.empty")} />
      ) : (
        <div className="space-y-3">
          {filtered.map((alert) => (
            <div
              key={alert.id}
              className="surface-card p-4 flex items-start gap-4 border-l-4 border-l-primary"
            >
              <div className="w-10 h-10 rounded-lg bg-error-container flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-error" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-foreground">
                    {alert.title || alert.alert_type}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase ${
                      alert.severity === "critical"
                        ? "bg-error text-on-error"
                        : alert.severity === "warning"
                          ? "bg-warning text-on-warning"
                          : "bg-surface-container-high text-foreground-variant"
                    }`}
                  >
                    {alert.severity}
                  </span>
                </div>
                {alert.description && (
                  <p className="text-sm text-foreground-variant mt-1">{alert.description}</p>
                )}
                <div className="flex items-center gap-4 mt-2 text-xs text-outline">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {alert.timestamp
                      ? new Date(alert.timestamp).toLocaleString()
                      : "—"}
                  </span>
                  <span
                    className={`font-medium ${
                      alert.status === "active"
                        ? "text-error"
                        : alert.status === "resolved"
                          ? "text-primary"
                          : "text-warning"
                    }`}
                  >
                    {alert.status}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                {alert.status === "active" && canAcknowledge && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onUpdateStatus(alert.id, "acknowledged")}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-warning-bg text-warning hover:opacity-80 transition-smooth"
                    >
                      {t("alerts.acknowledge")}
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateStatus(alert.id, "resolved")}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-success-bg text-success hover:opacity-80 transition-smooth"
                    >
                      {t("alerts.resolve")}
                    </button>
                  </div>
                )}
                {alert.status === "acknowledged" && canAcknowledge && (
                  <button
                    type="button"
                    onClick={() => onUpdateStatus(alert.id, "resolved")}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-success-bg text-success hover:opacity-80 transition-smooth"
                  >
                    {t("alerts.resolve")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
