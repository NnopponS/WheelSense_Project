import { cn } from "@/lib/utils";
import { DataState } from "./DataState";

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
    <DataState
      kind="loading"
      title={message}
      description={assistiveMessage ?? "Please wait a moment."}
      className={cn("animate-fade-in", className)}
    />
  );
}
