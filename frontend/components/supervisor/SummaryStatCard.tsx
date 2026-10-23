import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "critical" | "warning" | "success" | "info";

const toneClassMap: Record<Tone, string> = {
  critical: "bg-critical-bg text-critical",
  warning: "bg-warning-bg text-warning",
  success: "bg-success-bg text-success",
  info: "bg-info-bg text-info",
};

export function SummaryStatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: Tone;
}) {
  return (
    <Card className="h-full overflow-hidden">
      <CardContent className="flex min-h-24 items-center justify-between gap-4 p-4 sm:p-5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-semibold leading-none text-foreground">{value}</p>
        </div>
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg", toneClassMap[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
