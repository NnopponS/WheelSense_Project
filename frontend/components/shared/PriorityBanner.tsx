import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatusTone } from "./StatusBadge";

interface PriorityBannerProps {
  title: string;
  description?: string;
  detail?: ReactNode;
  action?: ReactNode;
  tone?: Exclude<StatusTone, "neutral">;
  className?: string;
}

const toneConfig = {
  info: {
    icon: Info,
    surface: "border-info/30 bg-info-bg text-info-foreground",
  },
  success: {
    icon: CheckCircle2,
    surface: "border-success/30 bg-success-bg text-success-foreground",
  },
  warning: {
    icon: AlertTriangle,
    surface: "border-warning/30 bg-warning-bg text-warning-foreground",
  },
  critical: {
    icon: ShieldAlert,
    surface: "border-critical/35 bg-critical-bg text-critical-foreground",
  },
};

export function PriorityBanner({
  title,
  description,
  detail,
  action,
  tone = "info",
  className,
}: PriorityBannerProps) {
  const config = toneConfig[tone];
  const Icon = config.icon;
  const interruptive = tone === "critical";

  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5",
        config.surface,
        className,
      )}
      role={interruptive ? "alert" : "status"}
      aria-live={interruptive ? "assertive" : "polite"}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-card/70 shadow-sm">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-snug">{title}</h2>
          {description ? <p className="mt-1 text-sm leading-relaxed opacity-90 sm:text-base">{description}</p> : null}
          {detail ? <div className="mt-2 text-sm font-medium">{detail}</div> : null}
        </div>
      </div>
      {action ? <div className="shrink-0 sm:pl-4">{action}</div> : null}
    </section>
  );
}
