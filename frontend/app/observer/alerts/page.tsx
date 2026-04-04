"use client";

import { useState } from "react";
import { useQuery } from "@/hooks/useQuery";
import type { Alert } from "@/lib/types";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { AlertTriangle, Bell } from "lucide-react";

export default function ObserverAlertsPage() {
  const { user } = useAuth();
  const { data: alerts, isLoading, refetch } = useQuery<Alert[]>(
    "/alerts?status=active",
  );
  const [actionError, setActionError] = useState("");
  const [pendingAlertId, setPendingAlertId] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const alertList = alerts ?? [];

  const acknowledgeAlert = async (alertId: number) => {
    if (!user?.caregiver_id) {
      setActionError("Cannot acknowledge alert because your account has no caregiver link.");
      return;
    }

    setActionError("");
    setPendingAlertId(alertId);
    try {
      await api.post<Alert>(`/alerts/${alertId}/acknowledge`, {
        caregiver_id: user.caregiver_id,
      });
      await refetch();
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setActionError("Your current role is not allowed to acknowledge alerts.");
      } else {
        setActionError(error instanceof Error ? error.message : "Failed to acknowledge alert.");
      }
    } finally {
      setPendingAlertId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-on-surface">Active alerts</h2>
        <p className="text-sm text-on-surface-variant mt-1">
          Monitor severity and acknowledge alerts when role permissions allow.
        </p>
      </div>

      {actionError && (
        <div className="rounded-xl bg-critical-bg text-critical px-4 py-3 text-sm">
          {actionError}
        </div>
      )}

      {alertList.length === 0 ? (
        <div className="surface-card p-6 text-center">
          <Bell className="w-8 h-8 mx-auto text-on-surface-variant mb-2" />
          <p className="text-sm text-on-surface-variant">No active alerts right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alertList.map((alert) => (
            <div key={alert.id} className="surface-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-on-surface truncate">
                    {alert.title || alert.alert_type}
                  </p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    {alert.description}
                  </p>
                  <p className="text-[11px] text-on-surface-variant mt-1">
                    {new Date(alert.timestamp).toLocaleString()}
                  </p>
                </div>
                <span
                  className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    alert.severity === "critical"
                      ? "bg-critical-bg text-critical"
                      : alert.severity === "warning"
                        ? "bg-warning-bg text-warning"
                        : "bg-info-bg text-info"
                  }`}
                >
                  {alert.severity}
                </span>
              </div>

              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-on-surface-variant flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {alert.alert_type}
                  {alert.patient_id ? ` · patient #${alert.patient_id}` : ""}
                </p>
                {alert.status === "active" && (
                  <button
                    type="button"
                    onClick={() => acknowledgeAlert(alert.id)}
                    disabled={pendingAlertId === alert.id}
                    className="text-xs px-3 py-1.5 rounded-md bg-surface-container-low text-on-surface disabled:opacity-60"
                  >
                    {pendingAlertId === alert.id ? "Acknowledging..." : "Acknowledge"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
