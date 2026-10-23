import type { ComponentProps } from "react";
import { AlertTriangle, CheckCircle2, Circle, Info, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "critical";

interface StatusBadgeProps extends Omit<ComponentProps<typeof Badge>, "variant"> {
  label: string;
  tone?: StatusTone;
}

const toneConfig = {
  neutral: { icon: Circle, variant: "secondary" as const, className: "text-muted-foreground" },
  info: { icon: Info, variant: "outline" as const, className: "border-info/35 bg-info-bg text-info-foreground" },
  success: { icon: CheckCircle2, variant: "success" as const, className: "" },
  warning: { icon: AlertTriangle, variant: "warning" as const, className: "" },
  critical: { icon: ShieldAlert, variant: "destructive" as const, className: "" },
};

export function StatusBadge({ label, tone = "neutral", className, ...props }: StatusBadgeProps) {
  const config = toneConfig[tone];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={cn(config.className, className)} {...props}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>{label}</span>
    </Badge>
  );
}
