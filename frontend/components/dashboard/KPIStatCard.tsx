"use client";

import { TrendingDown, TrendingUp, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n";

interface KPIStatCardProps {
  value: string | number;
  label: string;
  trend?: {
    value: number;
    direction: "up" | "down";
    label?: string;
  };
  icon?: LucideIcon;
  status?: "good" | "warning" | "critical" | "neutral";
  onClick?: () => void;
  className?: string;
}

const statusColors = {
  good: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  warning: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  critical: "bg-destructive/10 text-destructive border-destructive/20",
  neutral: "bg-muted/50 text-muted-foreground border-border",
};

const statusIconColors = {
  good: "text-emerald-500",
  warning: "text-amber-500",
  critical: "text-destructive",
  neutral: "text-muted-foreground",
};

export function KPIStatCard({
  value,
  label,
  trend,
  icon: Icon,
  status = "neutral",
  onClick,
  className,
}: KPIStatCardProps) {
  const { t } = useTranslation();

  return (
    <Card
      className={cn(
        "transition-all duration-200",
        onClick && "cursor-pointer hover:shadow-md hover:border-primary/30",
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {value}
            </p>
            <p className="text-sm text-muted-foreground mt-1">{label}</p>

            {trend && (
              <div className="flex items-center gap-1 mt-2">
                {trend.direction === "up" ? (
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                )}
                <span
                  className={cn(
                    "text-xs font-medium",
                    trend.direction === "up" ? "text-emerald-600" : "text-destructive"
                  )}
                >
                  {trend.value > 0 ? "+" : ""}
                  {trend.value}%
                </span>
                {trend.label && (
                  <span className="text-xs text-muted-foreground">
                    {trend.label}
                  </span>
                )}
              </div>
            )}
          </div>

          {Icon && (
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg border",
                statusColors[status]
              )}
            >
              <Icon className={cn("h-5 w-5", statusIconColors[status])} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
