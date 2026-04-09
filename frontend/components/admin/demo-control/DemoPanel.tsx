"use client";

import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type DemoPanelProps = {
  title: string;
  description: string;
  badge?: string;
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export default function DemoPanel({
  title,
  description,
  badge,
  action,
  children,
  footer,
  className,
}: DemoPanelProps) {
  return (
    <Card className={cn("overflow-hidden border-border/70 bg-card/90 shadow-sm", className)}>
      <div className="h-1 bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-500" />
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            {badge ? (
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
                {badge}
              </p>
            ) : null}
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
      {footer ? (
        <div className="border-t border-border/70 px-6 py-4 text-xs text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </Card>
  );
}
