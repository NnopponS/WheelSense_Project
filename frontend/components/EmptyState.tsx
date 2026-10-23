import type { ComponentType } from "react";
import type { ReactNode } from "react";
import { DataState } from "@/components/layout/DataState";

interface EmptyStateProps {
  icon: ComponentType<{ className?: string }>;
  message: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({
  icon: Icon,
  message,
  description,
  action,
}: EmptyStateProps) {
  return (
    <DataState
      kind="empty"
      title={message}
      description={description}
      icon={Icon}
      action={action}
      className="animate-fade-in"
    />
  );
}
