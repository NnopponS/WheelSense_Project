"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, MapPin, Volume2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ResolveAlertButton } from "@/components/shared/ResolveAlertButton";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/lib/i18n";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { resolvePatientAlertContext, type Notification } from "@/hooks/useNotifications";
import styles from "./incoming-notification.module.css";

export function IncomingNotificationDialog({ notification, pendingCount, canTriage, isSimulator, soundEnabled, onEnableSound, onDismiss }: {
  notification: Notification;
  pendingCount: number;
  canTriage: boolean;
  isSimulator: boolean;
  soundEnabled: boolean;
  onEnableSound: () => void;
  onDismiss: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alert = notification.type === "alert" && notification.data && "severity" in notification.data ? notification.data : null;
  const { data: patient } = useQuery({
    queryKey: ["notifications", "patient-context", user?.workspace_id, user?.id, alert?.patient_id],
    queryFn: () => resolvePatientAlertContext(alert!.patient_id!, t),
    enabled: alert?.patient_id != null,
    staleTime: 30_000,
  });
  const severity = alert?.severity;
  const tone = severity === "critical" ? "critical" : severity === "warning" ? "warning" : "info";

  async function triage(action: "acknowledge" | "resolve") {
    if (!alert || !canTriage || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (action === "acknowledge") await api.acknowledgeAlert(alert.id, { caregiver_id: null });
      else await api.resolveAlert(alert.id, { resolution_note: "" });
      onDismiss(notification.id);
      await queryClient.invalidateQueries({ predicate: query => query.queryKey.includes("notifications") || query.queryKey.includes("alerts") || query.queryKey.includes("emergency") });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("common.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  return <Dialog open onOpenChange={open => { if (!open) onDismiss(notification.id); }}>
    <DialogContent className={styles.screen} onOpenAutoFocus={event => { event.preventDefault(); titleRef.current?.focus(); }}>
      <header className={styles.header}>
        <div className="flex flex-wrap items-center gap-3"><BellRing className="size-6 text-primary" aria-hidden /><span className="font-semibold">{t("workspace.newNotification")}</span><StatusBadge label={severity ?? notification.type} tone={tone} /></div>
        {isSimulator ? <p className="text-xs font-medium text-warning-foreground">{t("workspace.simulatedNotification")}</p> : null}
        <p className="text-xs text-muted-foreground">{t("workspace.pendingNotifications")}: {pendingCount}</p>
      </header>
      <div className={styles.body}>
        <div className={styles.evidence} data-severity={severity}>
          <p className="text-sm text-muted-foreground"><time dateTime={notification.timestamp}>{formatDateTime(notification.timestamp)}</time></p>
          <DialogTitle ref={titleRef} tabIndex={-1} className={styles.title}>{notification.title}</DialogTitle>
          <DialogDescription className={styles.description}>{notification.message || t("notifications.detailsMissing")}</DialogDescription>
          {patient ? <div className="flex flex-col gap-2 border-t border-border pt-5"><p className="text-lg font-semibold">{patient.nameLine}</p><p className="flex items-start gap-2 text-sm text-muted-foreground"><MapPin className="size-4 shrink-0" aria-hidden />{patient.roomLine}</p></div> : null}
          {error ? <p role="alert" className="rounded-lg bg-critical-bg p-3 text-sm text-critical-foreground">{error}</p> : null}
          <div className="flex flex-wrap gap-3">
            {notification.link ? <Button onClick={() => { onDismiss(notification.id); router.push(notification.link!); }}>{t("workspace.reviewNotification")}</Button> : null}
            {alert && canTriage ? <><Button variant="outline" disabled={busy} onClick={() => void triage("acknowledge")}>{busy ? t("common.saving") : t("alerts.acknowledge")}</Button><ResolveAlertButton alertTitle={notification.title} disabled={busy} onConfirm={() => void triage("resolve")} /></> : null}
          </div>
        </div>
      </div>
      <footer className={styles.footer}>
        <p className="max-w-xl text-sm text-muted-foreground">{t("workspace.dismissHint")}</p>
        <div className="flex flex-wrap gap-2">{!soundEnabled ? <Button variant="outline" onClick={onEnableSound}><Volume2 className="size-4" aria-hidden />{t("workspace.enableSound")}</Button> : null}<Button variant="outline" onClick={() => onDismiss(notification.id)}>{t("workspace.dismissNotification")}</Button></div>
      </footer>
    </DialogContent>
  </Dialog>;
}
