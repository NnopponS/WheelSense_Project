import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EntityHeaderProps {
  name: string;
  description?: ReactNode;
  avatar?: ReactNode;
  status?: ReactNode;
  metadata?: ReactNode;
  actions?: ReactNode;
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

export function EntityHeader({
  name,
  description,
  avatar,
  status,
  metadata,
  actions,
  headingLevel = 2,
  className,
}: EntityHeaderProps) {
  const Heading = `h${headingLevel}` as const;

  return (
    <header className={cn("space-y-3", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {avatar ? <div className="shrink-0">{avatar}</div> : null}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Heading className="truncate text-xl font-semibold text-foreground">{name}</Heading>
              {status}
            </div>
            {description ? (
              <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</div>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {metadata ? <div className="flex flex-wrap gap-2">{metadata}</div> : null}
    </header>
  );
}
