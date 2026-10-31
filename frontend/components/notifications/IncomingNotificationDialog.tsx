"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Accessibility, Bell, BellRing, Cake, Droplets, MapPin, TriangleAlert, User, Volume2 } from "lucide-react";
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

const SEVERITY_ICON = {
  critical: TriangleAlert,
  warning: TriangleAlert,
  info: Bell,
} as const;

export function IncomingNotificationDialog({ notification, pendingCount, canTriage, soundEnabled, onEnableSound, onDismiss }: {
  notification: Notification;
  pendingCount: number;
  canTriage: boolean;
  /** Reserved: backend environment flag; the popup always presents live alert wording. */
  isSimulator?: boolean;
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
  const alertMeta = alert?.data && typeof alert.data === "object" ? (alert.data as Record<string, unknown>) : null;
  // Camera-originated alerts (e.g. fall detection) may carry no patient_id; surface
  // the room/location from the alert payload so the popup still gives responders context.
  const alertLocation =
    (typeof alertMeta?.room_name === "string" && alertMeta.room_name.trim()) ||
    (typeof alertMeta?.location === "string" && alertMeta.location.trim()) ||
    "";
  const tone = severity === "critical" ? "critical" : severity === "warning" ? "warning" : "info";
  const SeverityIcon = SEVERITY_ICON[tone];
  const genderLabel =
    patient?.gender === "male" ? t("patients.genderMale")
      : patient?.gender === "female" ? t("patients.genderFemale")
        : patient?.gender === "other" ? t("patients.genderOther")
          : patient?.gender || "";
  const patientChips = patient
    ? [
        patient.ageYears != null ? { icon: Cake, label: `${patient.ageYears} yrs` } : null,
        genderLabel ? { icon: User, label: genderLabel } : null,
        patient.bloodType ? { icon: Droplets, label: patient.bloodType } : null,
        patient.mobilityType ? { icon: Accessibility, label: patient.mobilityType } : null,
      ].filter((chip): chip is { icon: typeof Cake; label: string } => chip != null)
    : [];

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
    <DialogContent className={styles.popup} data-severity={tone} onOpenAutoFocus={event => { event.preventDefault(); titleRef.current?.focus(); }}>
      <header className={styles.header}>
        <div className={styles.severityIcon} aria-hidden>
          <SeverityIcon className="size-6" />
        </div>
        <div className={styles.headerText}>
          <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{t("workspace.newNotification")}</span><StatusBadge label={severity ?? notification.type} tone={tone} /></div>
          <p className="text-xs text-muted-foreground"><time dateTime={notification.timestamp}>{formatDateTime(notification.timestamp)}</time> · {t("workspace.pendingNotifications")}: {pendingCount}</p>
        </div>
      </header>
      <div className={styles.body}>
        <DialogTitle ref={titleRef} tabIndex={-1} className={styles.title}>{notification.title}</DialogTitle>
        <DialogDescription className={styles.description}>{notification.message || t("notifications.detailsMissing")}</DialogDescription>
        {patient ? (
          <div className={styles.patientCard}>
            <div className={styles.avatar} aria-hidden>
              {patient.photoUrl ? <img src={patient.photoUrl} alt="" className={styles.avatarImage} /> : <span className={styles.avatarInitials}>{patient.initials}</span>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold">{patient.nameLine}</p>
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />{patient.roomLine}</p>
              {patientChips.length ? (
                <div className={styles.chips}>
                  {patientChips.map(({ icon: ChipIcon, label }) => (
                    <span key={label} className={styles.chip}><ChipIcon className="size-3.5" aria-hidden />{label}</span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {!patient && alertLocation ? (
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span><span className="font-medium text-foreground/90">{t("patients.room")}:</span> {alertLocation}</span>
          </p>
        ) : null}
        {error ? <p role="alert" className="rounded-lg bg-critical-bg p-3 text-sm text-critical-foreground">{error}</p> : null}
        <div className="flex flex-wrap gap-2.5">
          {notification.link ? <Button onClick={() => { onDismiss(notification.id); router.push(notification.link!); }}>{t("workspace.reviewNotification")}</Button> : null}
          {alert && canTriage ? <><Button variant="outline" disabled={busy} onClick={() => void triage("acknowledge")}>{busy ? t("common.saving") : t("alerts.acknowledge")}</Button><ResolveAlertButton alertTitle={notification.title} disabled={busy} onConfirm={() => void triage("resolve")} /></> : null}
        </div>
      </div>
      <footer className={styles.footer}>
        <p className="text-xs text-muted-foreground">{t("workspace.dismissHint")}</p>
        <div className="flex flex-wrap gap-2">{!soundEnabled ? <Button variant="outline" size="sm" onClick={onEnableSound}><Volume2 className="size-4" aria-hidden />{t("workspace.enableSound")}</Button> : null}<Button variant="outline" size="sm" onClick={() => onDismiss(notification.id)}>{t("workspace.dismissNotification")}</Button></div>
      </footer>
    </DialogContent>
  </Dialog>;
}
