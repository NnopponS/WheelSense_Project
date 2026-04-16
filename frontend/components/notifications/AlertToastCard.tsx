"use client";

import { useState } from "react";
import { toast as sonnerToast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export type AlertToastVisualEmphasis = "standard" | "interrupt";

export interface AlertToastCardProps {
  toastId: string | number;
  alertId: number;
  title: string;
  description?: string;
  alertType: string;
  /** Resolved from `GET /patients/{id}` (+ room when `room_id` is set); null when alert has no patient. */
  patientContext: { nameLine: string; roomLine: string } | null;
  /** Observer + sound-tier: stronger shadow / border for floor-staff “interrupt” pattern (iter-6 §3.B). */
  visualEmphasis?: AlertToastVisualEmphasis;
  /** True when UI may call POST /alerts/{id}/acknowledge; mirrors clinical staff allowed by backend ROLE_ALERT_ACK. */
  canAcknowledge: boolean;
  onNavigateInbox: () => void;
}

export function AlertToastCard({
  toastId,
  alertId,
  title,
  description,
  alertType,
  patientContext,
  visualEmphasis = "standard",
  canAcknowledge,
  onNavigateInbox,
}: AlertToastCardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function acknowledge() {
    setBusy(true);
    try {
      await api.acknowledgeAlert(alertId, { caregiver_id: null });
      sonnerToast.dismiss(toastId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
        queryClient.invalidateQueries({ queryKey: ["head-nurse", "alerts"] }),
        queryClient.invalidateQueries({ queryKey: ["observer", "alerts"] }),
        queryClient.invalidateQueries({ queryKey: ["supervisor", "emergency"] }),
        queryClient.invalidateQueries({ queryKey: ["observer", "dashboard", "alerts"] }),
        queryClient.invalidateQueries({ queryKey: ["head-nurse", "dashboard", "alerts"] }),
        queryClient.invalidateQueries({ queryKey: ["supervisor", "dashboard", "alerts"] }),
      ]);
    } catch {
      sonnerToast.error(t("notifications.toastAckFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "pointer-events-auto w-[min(100vw-1.5rem,22rem)] rounded-lg border border-border bg-card p-3 text-left shadow-lg",
        "border-l-[3px] border-l-muted-foreground/35",
        visualEmphasis === "interrupt" && "ws-alert-toast-interrupt p-3.5",
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {alertType}
      </p>
      <p
        className={cn(
          "mt-1 font-semibold leading-snug text-foreground",
          visualEmphasis === "interrupt" ? "text-base" : "text-sm",
        )}
      >
        {title}
      </p>
      {description ? (
        <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {patientContext ? (
        <div className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
          <p className="font-medium text-foreground/90">{patientContext.nameLine}</p>
          <p>{patientContext.roomLine}</p>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="default"
          className="h-8 text-xs"
          onClick={() => {
            sonnerToast.dismiss(toastId);
            onNavigateInbox();
          }}
        >
          {t("notifications.toastOpenQueue")}
        </Button>
        {canAcknowledge ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 text-xs"
            disabled={busy}
            onClick={() => void acknowledge()}
          >
            {t("notifications.toastAcknowledge")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
