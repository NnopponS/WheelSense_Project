"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import type { Notification } from "@/hooks/useNotifications";
import type { AlertOut } from "@/lib/api/task-scope-types";

interface EmergencyAlertOverlayProps {
  notifications: Notification[];
  canAcknowledge: boolean;
}

type PatientContext = {
  nameLine: string;
  roomLine: string | null;
};

const SEVERITY_RANK: Record<string, number> = {
  critical: 5,
  urgent: 5,
  high: 4,
  warning: 3,
  medium: 2,
  moderate: 2,
};

function asAlert(notification: Notification): AlertOut | null {
  if (notification.type !== "alert") return null;
  const data = notification.data as AlertOut | undefined;
  return data && typeof data.id === "number" ? data : null;
}

function emergencyRank(alert: AlertOut): number {
  const severity = String(alert.severity || "").toLowerCase();
  const type = String(alert.alert_type || "").toLowerCase();
  if (type.includes("fall") || type.includes("sos") || type.includes("emergency")) {
    return Math.max(SEVERITY_RANK[severity] ?? 0, 4);
  }
  return SEVERITY_RANK[severity] ?? 0;
}

function isActiveEmergency(notification: Notification): boolean {
  const alert = asAlert(notification);
  if (!alert || alert.status !== "active") return false;
  return emergencyRank(alert) >= 3;
}

function alertTimestamp(alert: AlertOut, notification: Notification): number {
  const raw = alert.timestamp || notification.timestamp;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : 0;
}

async function loadPatientContext(patientId: number): Promise<PatientContext> {
  const patient = await api.getPatient(patientId);
  const nameLine =
    `${patient.first_name ?? ""} ${patient.last_name ?? ""}`.trim() || `Patient #${patientId}`;
  if (patient.room_id == null) {
    return { nameLine, roomLine: null };
  }
  try {
    const room = await api.getRoom(patient.room_id);
    const floor =
      room.floor_name ||
      (typeof room.floor_number === "number" && Number.isFinite(room.floor_number)
        ? `Floor ${room.floor_number}`
        : null);
    const roomLine = [room.facility_name, floor, room.name].filter(Boolean).join(" / ");
    return { nameLine, roomLine: roomLine || null };
  } catch {
    return { nameLine, roomLine: null };
  }
}

export function EmergencyAlertOverlay({
  notifications,
  canAcknowledge,
}: EmergencyAlertOverlayProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const selected = useMemo(() => {
    const candidates = notifications
      .map((notification) => {
        const alert = asAlert(notification);
        return alert ? { notification, alert } : null;
      })
      .filter((item): item is { notification: Notification; alert: AlertOut } =>
        Boolean(item && isActiveEmergency(item.notification)),
      );
    candidates.sort((a, b) => {
      const rankDelta = emergencyRank(b.alert) - emergencyRank(a.alert);
      if (rankDelta !== 0) return rankDelta;
      return alertTimestamp(b.alert, b.notification) - alertTimestamp(a.alert, a.notification);
    });
    return candidates[0] ?? null;
  }, [notifications]);

  const patientId = selected?.alert.patient_id ?? null;
  const patientQuery = useQuery({
    queryKey: ["notifications", "emergency-alert-context", patientId],
    queryFn: () => loadPatientContext(Number(patientId)),
    enabled: canAcknowledge && patientId != null,
    staleTime: 30_000,
  });

  if (!mounted || !selected || !canAcknowledge) return null;

  const { notification, alert } = selected;
  const title = alert.title || notification.title || t("notifications.toastNewAlert");
  const description = alert.description || notification.message;
  const severity = String(alert.severity || notification.priority || "warning");
  const patientContext = patientQuery.data;

  async function acknowledge() {
    if (!selected) return;
    setBusy(true);
    try {
      await api.acknowledgeAlert(selected.alert.id, { caregiver_id: null });
      toast.success(t("notifications.emergencyOverlayAckSuccess"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "alerts"] }),
        queryClient.invalidateQueries({ queryKey: ["head-nurse", "alerts"] }),
        queryClient.invalidateQueries({ queryKey: ["observer", "alerts"] }),
        queryClient.invalidateQueries({ queryKey: ["supervisor", "emergency"] }),
        queryClient.invalidateQueries({ queryKey: ["observer", "dashboard", "alerts"] }),
        queryClient.invalidateQueries({ queryKey: ["head-nurse", "dashboard", "alerts"] }),
        queryClient.invalidateQueries({ queryKey: ["supervisor", "dashboard", "alerts"] }),
      ]);
    } catch {
      toast.error(t("notifications.toastAckFailed"));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-[2px]">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ws-emergency-alert-title"
        className="pointer-events-auto w-full max-w-lg rounded-lg border border-destructive/45 bg-card shadow-2xl"
      >
        <div className="border-b border-destructive/20 bg-destructive/10 px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive text-destructive-foreground">
              <AlertTriangle className="h-6 w-6" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
                  {t("notifications.emergencyOverlayKicker")}
                </p>
                <Badge variant="destructive" className="h-6 uppercase">
                  {severity}
                </Badge>
              </div>
              <h2 id="ws-emergency-alert-title" className="mt-1 text-lg font-semibold leading-tight text-foreground">
                {title}
              </h2>
            </div>
          </div>
        </div>

        <div className="space-y-3 px-4 py-4">
          {description ? (
            <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
          ) : null}

          <div className="grid gap-2 rounded-lg border border-border bg-muted/35 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{t("notifications.emergencyOverlayAlert")}</span>
              <span className="font-medium text-foreground">#{alert.id}</span>
            </div>
            {patientId != null ? (
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted-foreground">{t("notifications.emergencyOverlayPatient")}</span>
                <span className="text-right font-medium text-foreground">
                  {patientQuery.isLoading ? (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      {t("common.loading")}
                    </span>
                  ) : (
                    patientContext?.nameLine || `#${patientId}`
                  )}
                  {patientContext?.roomLine ? (
                    <span className="block text-xs font-normal text-muted-foreground">
                      {patientContext.roomLine}
                    </span>
                  ) : null}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border px-4 py-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => {
              if (notification.link) router.push(notification.link);
            }}
          >
            <ExternalLink className="mr-2 h-5 w-5" aria-hidden />
            {t("notifications.emergencyOverlayOpenQueue")}
          </Button>
          <Button type="button" className="h-11" disabled={busy} onClick={() => void acknowledge()}>
            {busy ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <CheckCircle2 className="mr-2 h-5 w-5" aria-hidden />
            )}
            {t("notifications.emergencyOverlayAcknowledge")}
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
