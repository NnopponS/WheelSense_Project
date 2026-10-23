"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

export type RoleQuickActionTone = "primary" | "danger" | "warning" | "success" | "neutral";

export type RoleQuickAction = {
  label: string;
  description?: string;
  href?: string;
  icon: LucideIcon;
  tone?: RoleQuickActionTone;
  aiPrompt?: string;
};

const toneClass: Record<RoleQuickActionTone, string> = {
  primary: "border-primary/25 bg-primary text-primary-foreground hover:bg-primary/90",
  danger: "border-red-500/40 bg-red-500/10 text-red-700 hover:bg-red-500/15 dark:text-red-300",
  warning: "border-amber-500/35 bg-amber-500/10 text-amber-800 hover:bg-amber-500/15 dark:text-amber-300",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/15 dark:text-emerald-300",
  neutral: "border-border/70 bg-card text-foreground hover:bg-muted/45",
};

function openAi(prompt?: string) {
  window.dispatchEvent(new CustomEvent("wheelsense:open-ai", { detail: { prompt } }));
}

function ActionInner({ action }: { action: RoleQuickAction }) {
  const Icon = action.icon;
  return (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background/85 text-current shadow-sm ring-1 ring-current/10">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 text-left">
        <span className="block line-clamp-2 text-sm font-semibold leading-tight">{action.label}</span>
        {action.description ? (
          <span className="mt-0.5 block line-clamp-1 text-xs font-normal opacity-75">
            {action.description}
          </span>
        ) : null}
      </span>
    </>
  );
}

export function RoleQuickActions({
  title = "Quick actions",
  actions,
  className,
}: {
  title?: string;
  actions: RoleQuickAction[];
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-border/70 bg-card p-3 shadow-[0_10px_24px_-22px_rgb(15_23_42/0.45)]", className)} aria-label={title}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        <Bot className="h-4 w-4 text-muted-foreground" aria-hidden />
      </div>
      <div className="grid min-w-0 auto-rows-fr grid-cols-2 gap-2 md:grid-cols-3 2xl:grid-cols-6">
        {actions.map((action) => {
          const classes = cn(
            "flex h-full min-h-12 min-w-0 items-center justify-start gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-14 sm:px-3 sm:py-2.5",
            toneClass[action.tone ?? "neutral"],
          );
          if (action.href) {
            return (
              <Link key={`${action.label}-${action.href}`} href={action.href} className={classes}>
                <ActionInner action={action} />
              </Link>
            );
          }
          return (
            <button
              key={action.label}
              type="button"
              className={classes}
              onClick={() => openAi(action.aiPrompt)}
            >
              <ActionInner action={action} />
            </button>
          );
        })}
      </div>
    </section>
  );
}
