"use client";

import { AlertTriangle, CheckCircle2, Siren, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type HeroMode = "alert" | "task" | "idle";

export interface ObserverNextActionHeroProps {
  mode: HeroMode;
  /** Pre-localized title for the current action (e.g. alert title or task title). */
  title?: string;
  /** Short descriptive line (patient name, room, due time, etc). */
  subtitle?: string;
  /** Severity/priority chip text (optional). */
  severityLabel?: string;
  /** Highlight color tier. "critical" colors the card red; default keeps neutral primary. */
  severity?: "critical" | "warning" | "info" | "idle";
  /** Fires when user taps the primary big button. Caller decides ack vs complete. */
  onPrimaryAction?: () => void;
  /** Primary action pending state. */
  isPending?: boolean;
  className?: string;
}

/**
 * Observer "Next Action" hero. Renders one large card with one primary big
 * button so elderly observers always see exactly one thing to do.
 *
 * When `mode === "idle"` we still render the card so the position is stable —
 * it reassures the observer that nothing is pending.
 */
export function ObserverNextActionHero(props: ObserverNextActionHeroProps) {
  const { t } = useTranslation();
  const {
    mode,
    title,
    subtitle,
    severityLabel,
    severity = "info",
    onPrimaryAction,
    isPending,
    className,
  } = props;

  const frameClass = cn(
    "rounded-3xl border p-5 md:p-6 shadow-sm",
    severity === "critical"
      ? "border-red-500/40 bg-gradient-to-br from-red-500/12 via-red-500/5 to-transparent"
      : severity === "warning"
        ? "border-amber-500/40 bg-gradient-to-br from-amber-500/12 via-amber-500/5 to-transparent"
        : severity === "idle"
          ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent"
          : "border-sky-500/30 bg-gradient-to-br from-sky-500/10 via-sky-500/5 to-transparent",
    className,
  );

  const iconWrap = cn(
    "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl",
    severity === "critical" && "bg-red-500/15 text-red-600",
    severity === "warning" && "bg-amber-500/15 text-amber-700",
    severity === "idle" && "bg-emerald-500/15 text-emerald-700",
    severity === "info" && "bg-sky-500/15 text-sky-700",
  );

  const Icon =
    mode === "alert"
      ? severity === "critical"
        ? Siren
        : AlertTriangle
      : mode === "task"
        ? Clock3
        : CheckCircle2;

  const heading =
    title ??
    (mode === "idle" ? t("observer.hero.allCaughtUp") : t("observer.hero.whatNow"));
  const sub =
    subtitle ??
    (mode === "idle" ? t("observer.hero.noPending") : t("observer.hero.checkBelow"));

  return (
    <section
      aria-labelledby="observer-hero-title"
      aria-live="polite"
      className={frameClass}
    >
      <div className="flex items-start gap-3 md:gap-4">
        <div className={iconWrap} aria-hidden>
          <Icon className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <p
            id="observer-hero-title"
            className="truncate text-lg font-semibold leading-tight text-foreground md:text-xl"
          >
            {heading}
          </p>
          <p className="mt-1 text-sm text-muted-foreground md:text-base">{sub}</p>
          {severityLabel ? (
            <span className="mt-2 inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {severityLabel}
            </span>
          ) : null}
        </div>
      </div>

      {mode !== "idle" && onPrimaryAction ? (
        <div className="mt-4">
          <Button
            type="button"
            size="lg"
            variant={severity === "critical" ? "destructive" : "default"}
            disabled={isPending}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onPrimaryAction();
            }}
            className="h-14 w-full text-base font-semibold md:h-16 md:text-lg"
          >
            {mode === "alert"
              ? t("observer.hero.acknowledge")
              : t("observer.hero.markDone")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

export default ObserverNextActionHero;
