"use client";

import { AlertTriangle, CheckCircle2, Phone, Siren } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/shared/ConfirmAction";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface PatientSosHeroProps {
  isPending: boolean;
  result?: {
    kind: "assistance" | "sos";
    status: "sending" | "sent" | "error";
  } | null;
  onRaise: (kind: "assistance" | "sos") => void;
  className?: string;
}

/**
 * Patient one-screen SOS hero.
 *
 * Elder-friendly:
 *  - Single card above the fold on mobile.
 *  - Primary red SOS button (min 56px height, text 20px).
 *  - Secondary assistance button sits under it so the thumb never has to leave
 *    the hero area. Both buttons use the same `raiseAssistanceMutation` wired
 *    from `app/patient/page.tsx` so no new API surface is introduced.
 */
export function PatientSosHero({ isPending, result, onRaise, className }: PatientSosHeroProps) {
  const { t } = useTranslation();

  return (
    <section
      aria-labelledby="patient-sos-hero-title"
      className={cn(
        "rounded-2xl border border-critical/35 bg-critical-bg/55 p-5 shadow-[var(--shadow-card)] md:p-6",
        className,
      )}
    >
      <div className="flex items-start gap-3 md:gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-card/80 text-critical-foreground shadow-sm">
          <Siren className="h-7 w-7" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2
            id="patient-sos-hero-title"
            className="text-xl font-semibold leading-tight text-critical-foreground md:text-2xl"
          >
            {t("patient.sosHero.title")}
          </h2>
          <p className="mt-1 text-base text-foreground/80">
            {t("patient.sosHero.subtitle")}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1.4fr_1fr]">
        <ConfirmAction
          tone="critical"
          title={t("patient.sosHero.confirmTitle")}
          description={t("patient.sosHero.confirmDescription")}
          affectedEntity={t("patient.sosHero.subtitle")}
          confirmLabel={t("patient.sosHero.confirmAction")}
          cancelLabel={t("patient.sosHero.cancel")}
          onConfirm={() => onRaise("sos")}
          icon={<Siren className="h-7 w-7" />}
          trigger={
            <Button
              type="button"
              size="lg"
              variant="destructive"
              disabled={isPending}
              aria-label={t("patient.sosHero.sosAria")}
              className="h-16 w-full text-lg font-semibold shadow-md"
            >
              <Siren className="h-6 w-6" aria-hidden="true" />
              {t("patient.sosHero.sosButton")}
            </Button>
          }
        />

        <Button
          type="button"
          size="lg"
          variant="outline"
          disabled={isPending}
          aria-label={t("patient.sosHero.assistanceAria")}
          className="h-16 w-full text-lg font-semibold"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRaise("assistance");
          }}
        >
          <Phone className="h-6 w-6" aria-hidden="true" />
          {t("patient.sosHero.assistanceButton")}
        </Button>
      </div>

      {result ? (
        <div
          className={cn(
            "mt-4 flex items-start gap-3 rounded-xl border bg-card/80 px-4 py-3 text-base",
            result.status === "sent" && "border-success/35 text-success-foreground",
            result.status === "error" && "border-critical/35 text-critical-foreground",
            result.status === "sending" && "border-info/35 text-info-foreground",
          )}
          role={result.status === "error" ? "alert" : "status"}
          aria-live={result.status === "error" ? "assertive" : "polite"}
        >
          {result.status === "sent" ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          ) : result.status === "error" ? (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          ) : (
            <span className="mt-1 h-4 w-4 shrink-0 animate-pulse rounded-full bg-info" aria-hidden="true" />
          )}
          <span>
            {result.status === "sending"
              ? t("patient.sosHero.sending")
              : result.status === "error"
                ? t("patient.sosHero.error")
                : result.kind === "sos"
                  ? t("patient.sosHero.sosSent")
                  : t("patient.sosHero.assistanceSent")}
          </span>
        </div>
      ) : null}
    </section>
  );
}

export default PatientSosHero;
