import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DesktopPageLayoutProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  /**
   * If provided, renders a split pane layout where children are on the left
   * and the detail/sidebar content is on the right.
   */
  detailPane?: ReactNode;
  className?: string;
}

export function DesktopPageLayout({
  title,
  description,
  action,
  children,
  detailPane,
  className,
}: DesktopPageLayoutProps) {
  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="border-b bg-background px-4 py-4 sm:px-6 shrink-0">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
            {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
          </div>
          {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className={cn("flex-1 overflow-auto p-4 sm:p-6", detailPane ? "border-r border-border/50" : "")}>
          {children}
        </div>
        {detailPane && (
          <div className="w-[400px] xl:w-[500px] shrink-0 overflow-auto bg-surface-container-lowest/50">
            {detailPane}
          </div>
        )}
      </div>
    </div>
  );
}
