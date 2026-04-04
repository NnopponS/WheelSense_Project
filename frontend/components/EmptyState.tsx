import type { ComponentType } from "react";

interface EmptyStateProps {
  icon: ComponentType<{ className?: string }>;
  message: string;
  description?: string;
}

export default function EmptyState({
  icon: Icon,
  message,
  description,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-surface-container-low flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 opacity-40" />
      </div>
      <p className="text-sm font-medium">{message}</p>
      {description && (
        <p className="text-xs text-outline mt-1 max-w-xs text-center">
          {description}
        </p>
      )}
    </div>
  );
}
