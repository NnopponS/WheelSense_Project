import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingStateProps {
  message?: string;
  assistiveMessage?: string;
  className?: string;
}

export function LoadingState({
  message = "Loading...",
  assistiveMessage,
  className,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "mx-auto flex min-h-52 w-full max-w-2xl flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border/65 bg-surface-container-low p-10 text-center animate-in fade-in duration-300",
        className,
      )}
    >
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      <div>
        <p className="text-base font-medium text-foreground">{message}</p>
        <p className="text-sm text-muted-foreground">
          {assistiveMessage ?? "Please wait a moment."}
        </p>
      </div>
      <span className="sr-only">{assistiveMessage ?? message}</span>
    </div>
  );
}
