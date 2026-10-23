import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MobilePageLayoutProps {
  title: string;
  description?: string;
  /**
   * Primary action that will stick to the bottom or appear prominently.
   */
  primaryAction?: ReactNode;
  /**
   * Top right actions (e.g., small icon buttons)
   */
  topActions?: ReactNode;
  children: ReactNode;
  className?: string;
  /**
   * Applies bottom padding to prevent content from being hidden by the mobile task bar
   * Defaults to true
   */
  bottomNavOffset?: boolean;
}

export function MobilePageLayout({
  title,
  description,
  primaryAction,
  topActions,
  children,
  className,
  bottomNavOffset = true,
}: MobilePageLayoutProps) {
  return (
    <div className={cn("flex min-h-full flex-col", bottomNavOffset && "pb-20", className)}>
      <div className="sticky top-0 z-10 border-b border-border/40 bg-background/85 px-3 py-3 backdrop-blur-md sm:px-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-tight sm:text-xl">{title}</h1>
            {description && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground sm:text-sm">{description}</p>}
          </div>
          {topActions && <div className="flex items-center gap-2">{topActions}</div>}
        </div>
      </div>
      
      <div className="flex flex-1 flex-col gap-3 p-3 sm:gap-4 sm:p-4">
        {children}
      </div>

      {primaryAction && (
        <div className="fixed bottom-20 left-4 right-4 z-20 pointer-events-none flex justify-center">
          <div className="pointer-events-auto">
            {primaryAction}
          </div>
        </div>
      )}
    </div>
  );
}
