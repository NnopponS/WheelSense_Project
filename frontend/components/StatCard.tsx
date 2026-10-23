import type { ComponentType } from "react";
import Link from "next/link";

interface StatCardProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  color?: "primary" | "success" | "critical" | "warning" | "info";
  href?: string;
  trend?: { value: number; label: string };
}

const COLOR_MAP = {
  primary: "bg-primary-fixed text-primary",
  success: "bg-success-bg text-success",
  critical: "bg-critical-bg text-critical",
  warning: "bg-warning-bg text-warning",
  info: "bg-info-bg text-info",
} as const;

export default function StatCard({
  icon: Icon,
  label,
  value,
  color = "primary",
  href,
  trend,
}: StatCardProps) {
  const content = (
    <div className="flex items-start justify-between">
      <div className="space-y-3">
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center ${COLOR_MAP[color]}`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground tracking-tight">
            {value}
          </p>
          <p className="text-xs text-foreground-variant mt-0.5">{label}</p>
        </div>
      </div>
      {trend && (
        <div
          className={`text-xs font-medium px-2 py-1 rounded-full ${
            trend.value >= 0
              ? "bg-success-bg text-success"
              : "bg-critical-bg text-critical"
          }`}
        >
          {trend.value >= 0 ? "+" : ""}
          {trend.value}% {trend.label}
        </div>
      )}
    </div>
  );

  const className =
    "surface-card p-5 transition-smooth animate-fade-in block";

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}
