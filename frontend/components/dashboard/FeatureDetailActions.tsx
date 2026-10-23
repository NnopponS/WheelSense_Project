"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type FeatureDetailAction = {
  label: string;
  description?: string;
  href: string;
  icon: LucideIcon;
  tone?: "danger" | "primary" | "warning" | "neutral";
};

const toneClass: Record<NonNullable<FeatureDetailAction["tone"]>, string> = {
  danger: "border-red-500/30 bg-red-500/10 text-red-700",
  primary: "border-primary/25 bg-primary/10 text-primary",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-800",
  neutral: "border-border/70 bg-card text-foreground",
};

export function FeatureDetailActions({
  title,
  actions,
  className,
}: {
  title: string;
  actions: FeatureDetailAction[];
  className?: string;
}) {
  if (actions.length === 0) return null;

  return (
    <section className={cn("rounded-lg border border-border/70 bg-muted/20 p-3", className)} aria-label={title}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={`${action.href}-${action.label}`}
              href={action.href}
              className={cn(
                "flex min-h-16 min-w-0 items-center gap-3 rounded-lg border px-3 py-3 transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                toneClass[action.tone ?? "neutral"],
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background/85 ring-1 ring-current/10">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block line-clamp-1 text-sm font-semibold leading-tight">{action.label}</span>
                {action.description ? (
                  <span className="mt-0.5 block line-clamp-1 text-xs opacity-75">{action.description}</span>
                ) : null}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default FeatureDetailActions;
