"use client";

import type { ComponentType, ReactNode } from "react";
import { AlertTriangle, Inbox, Loader2, LockKeyhole, RefreshCw, SearchX, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DataStateKind =
  | "loading"
  | "empty"
  | "filtered-empty"
  | "error"
  | "offline"
  | "stale"
  | "permission";

interface DataStateProps {
  kind: DataStateKind;
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  action?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

const defaultIcons = {
  loading: Loader2,
  empty: Inbox,
  "filtered-empty": SearchX,
  error: AlertTriangle,
  offline: WifiOff,
  stale: RefreshCw,
  permission: LockKeyhole,
};

export function DataState({
  kind,
  title,
  description,
  icon,
  action,
  actionLabel,
  onAction,
  className,
}: DataStateProps) {
  const Icon = icon ?? defaultIcons[kind];
  const isLoading = kind === "loading";
  const isError = kind === "error" || kind === "offline";

  return (
    <section
      className={cn(
        "mx-auto flex min-h-52 w-full max-w-2xl flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-surface-container-low p-6 text-center sm:p-10",
        isError && "border-critical/35 bg-critical-bg/45",
        className,
      )}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      aria-busy={isLoading || undefined}
    >
      <div
        aria-hidden="true"
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-xl bg-card text-muted-foreground shadow-sm",
          isError && "text-critical-foreground",
        )}
      >
        <Icon className={cn("h-7 w-7", isLoading && "animate-spin")} />
      </div>
      <div className="max-w-md">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-relaxed text-muted-foreground sm:text-base">{description}</p> : null}
      </div>
      {action ?? (actionLabel && onAction ? (
        <Button type="button" variant="outline" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null)}
    </section>
  );
}
