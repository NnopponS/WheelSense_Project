import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type Tone = "critical" | "warning" | "success" | "info";

const toneClassMap: Record<Tone, string> = {
  critical: "bg-red-500/12 text-red-700 dark:text-red-300",
  warning: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  success: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  info: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
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
    <Card>
      <CardContent className="flex items-center justify-between gap-4 pt-6">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-semibold text-foreground">{value}</p>
        </div>
        <div className={`rounded-2xl p-3 ${toneClassMap[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

