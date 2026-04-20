"use client";

import { Phone, Siren } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface PatientSosHeroProps {
  isPending: boolean;
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
export function PatientSosHero({ isPending, onRaise, className }: PatientSosHeroProps) {
  const { t } = useTranslation();

  return (
    <section
      aria-labelledby="patient-sos-hero-title"
      className={cn(
        "rounded-3xl border border-red-500/30 bg-gradient-to-br from-red-500/10 via-red-500/5 to-transparent p-5 md:p-6 shadow-sm",
        className,
      )}
    >
      <div className="flex items-start gap-3 md:gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-red-500/15 text-red-600">
          <Siren className="h-7 w-7" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p
            id="patient-sos-hero-title"
            className="text-lg font-semibold leading-tight text-red-600 md:text-xl"
          >
            {t("patient.sosHero.title")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground md:text-base">
            {t("patient.sosHero.subtitle")}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1.4fr_1fr]">
        <Button
          type="button"
          size="lg"
          variant="destructive"
          disabled={isPending}
          aria-label={t("patient.sosHero.sosAria")}
          className="h-14 w-full text-base font-semibold shadow-md md:h-16 md:text-lg"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRaise("sos");
          }}
        >
          <Siren className="mr-2 h-6 w-6" aria-hidden />
          {t("patient.sosHero.sosButton")}
        </Button>

        <Button
          type="button"
          size="lg"
          variant="outline"
          disabled={isPending}
          aria-label={t("patient.sosHero.assistanceAria")}
          className="h-14 w-full text-base font-semibold md:h-16 md:text-lg"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRaise("assistance");
          }}
        >
          <Phone className="mr-2 h-6 w-6" aria-hidden />
          {t("patient.sosHero.assistanceButton")}
        </Button>
      </div>

      {isPending ? (
        <p
          className="mt-3 text-xs font-medium text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {t("patient.sosHero.sending")}
        </p>
      ) : null}
    </section>
  );
}

export default PatientSosHero;
