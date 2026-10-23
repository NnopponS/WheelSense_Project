"use client";

import { DataState } from "./DataState";

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
    <DataState
      kind="error"
      title={title}
      description={message}
      actionLabel={actionLabel}
      onAction={handleAction}
      className={className}
    />
  );
}
