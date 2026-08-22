import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { StatusBadge, type StatusTone } from "./StatusBadge";

interface MetricCardProps {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  description?: string;
  status?: { label: string; tone?: StatusTone };
  trend?: { value: number; label: string };
  href?: string;
  hrefLabel?: string;
  className?: string;
  /** Shorter card with no description paragraph or "Open" link; the whole card is a click target when `href` is set. */
  compact?: boolean;
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  description,
  status,
  trend,
  href,
  hrefLabel,
  className,
  compact = false,
}: MetricCardProps) {
  if (compact) {
    const body = (
      <CardContent className="flex h-full flex-col gap-2 p-3.5 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </div>
          {status ? <StatusBadge label={status.label} tone={status.tone} /> : null}
        </div>
        <div className="min-w-0">
          <p className="ws-tabular-nums text-2xl font-bold leading-none tracking-tight text-foreground">{value}</p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            {label}
            {description ? <span className="text-muted-foreground/80"> · {description}</span> : null}
          </p>
        </div>
      </CardContent>
    );

    if (href) {
      return (
        <Link href={href} className="block h-full">
          <Card className={cn("h-full transition-colors hover:border-primary/40 hover:bg-muted/40", className)}>
            {body}
          </Card>
        </Link>
      );
    }
    return <Card className={cn("h-full", className)}>{body}</Card>;
  }

  return (
    <Card className={cn("h-full", className)}>
      <CardContent className="flex h-full flex-col gap-4 pt-[var(--ws-card-padding)] sm:pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="flex items-center gap-2">
            {trend ? (
              <span
                className={cn(
                  "ws-tabular-nums rounded-full px-2 py-1 text-xs font-medium",
                  trend.value >= 0 ? "bg-success-bg text-success" : "bg-critical-bg text-critical",
                )}
              >
                {trend.value >= 0 ? "+" : ""}
                {trend.value}% {trend.label}
              </span>
            ) : null}
            {status ? <StatusBadge label={status.label} tone={status.tone} /> : null}
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="ws-tabular-nums mt-1 text-3xl font-bold leading-none tracking-tight text-foreground">{value}</p>
          {description ? <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
        </div>
        {href && hrefLabel ? (
          <Link className="mt-auto inline-flex min-h-11 items-center gap-2 self-start rounded-md text-sm font-semibold text-primary hover:underline" href={href}>
            {hrefLabel}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
