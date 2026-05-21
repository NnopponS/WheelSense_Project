"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title?: string;
  message?: string;
  actionLabel?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  message = "We encountered an error loading this data.",
  actionLabel = "Try Again",
  onRetry,
  className,
}: ErrorStateProps) {
  const handleAction = onRetry
    ? onRetry
    : () => {
        window.location.reload();
      };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        "mx-auto flex min-h-52 w-full max-w-2xl flex-col items-center justify-center gap-4 rounded-lg border border-destructive/30 bg-surface-container-low p-10 text-center animate-in fade-in duration-300",
        className,
      )}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-critical-bg text-critical">
        <AlertTriangle className="w-8 h-8 opacity-80" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{message}</p>
      <Button size="sm" variant="outline" onClick={handleAction} className="min-h-[2.75rem] px-5">
        {actionLabel}
      </Button>
    </div>
  );
}
