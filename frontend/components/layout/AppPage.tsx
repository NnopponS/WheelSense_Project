import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AppPageBreadcrumb {
  label: string;
  href?: string;
}

interface AppPageProps {
  title: string;
  description?: string;
  eyebrow?: string;
  breadcrumbs?: AppPageBreadcrumb[];
  actions?: ReactNode;
  priority?: ReactNode;
  children: ReactNode;
  width?: "reading" | "content" | "wide" | "full";
  className?: string;
  showHeader?: boolean;
}

const widthClasses: Record<NonNullable<AppPageProps["width"]>, string> = {
  reading: "max-w-4xl",
  content: "max-w-6xl",
  wide: "max-w-[90rem]",
  full: "max-w-none",
};

export function AppPage({
  title,
  description,
  eyebrow,
  breadcrumbs,
  actions,
  priority,
  children,
  width = "wide",
  className,
  showHeader = true,
}: AppPageProps) {
  return (
    <div className={cn("mx-auto w-full space-y-6", widthClasses[width], className)}>
      {showHeader ? <header className="space-y-3">
        {breadcrumbs?.length ? (
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              {breadcrumbs.map((item, index) => {
                const current = index === breadcrumbs.length - 1;
                return (
                  <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
                    {index > 0 ? <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
                    {item.href && !current ? (
                      <Link className="rounded-sm hover:text-foreground" href={item.href}>
                        {item.label}
                      </Link>
                    ) : (
                      <span className={cn("truncate", current && "font-medium text-foreground")} aria-current={current ? "page" : undefined}>
                        {item.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        ) : null}

        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-3xl">
            {eyebrow ? (
              <p className="mb-1 text-sm font-semibold text-primary">{eyebrow}</p>
            ) : null}
            <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </header> : null}

      {priority}
      {children}
    </div>
  );
}
