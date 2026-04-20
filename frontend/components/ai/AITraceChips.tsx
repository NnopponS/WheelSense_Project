"use client";

import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n";

export type AITraceChip = {
  layer: number;
  label: string;
  outcome: string;
  phase?: string | null;
  latency_ms?: number | null;
};

function outcomeVariant(
  outcome: string,
): "default" | "secondary" | "outline" | "success" | "warning" | "destructive" {
  switch (outcome) {
    case "accept":
      return "success";
    case "pending":
      return "warning";
    case "reject":
    case "fail":
      return "destructive";
    default:
      return "outline";
  }
}

export function AITraceChips({ trace }: { trace: AITraceChip[] }) {
  const { t } = useTranslation();
  if (trace.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("aiChat.trace.title")}
      </p>
      <div className="flex flex-wrap gap-2">
        {trace.map((item) => (
          <Badge
            key={`${item.layer}-${item.label}`}
            variant={outcomeVariant(item.outcome)}
            className="gap-1.5 px-2 py-1"
          >
            <span>{item.label}</span>
            <span className="text-[10px] opacity-80">
              {item.outcome}
              {typeof item.latency_ms === "number" ? ` · ${item.latency_ms}ms` : ""}
            </span>
          </Badge>
        ))}
      </div>
    </div>
  );
}
