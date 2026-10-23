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

export type ProviderAttemptTrace = {
  provider: string;
  model: string;
  phase: string;
  attempt: number;
  status: string;
  latency_ms?: number | null;
  fallback_reason?: string | null;
};

function outcomeVariant(
  outcome: string,
): "default" | "secondary" | "outline" | "success" | "warning" | "destructive" {
  switch (outcome) {
    case "accept":
    case "success":
      return "success";
    case "pending":
    case "fallback":
      return "warning";
    case "reject":
    case "fail":
    case "error":
      return "destructive";
    default:
      return "outline";
  }
}

export function AITraceChips({
  trace,
  providerAttempts = [],
}: {
  trace: AITraceChip[];
  providerAttempts?: ProviderAttemptTrace[];
}) {
  const { t } = useTranslation();
  if (trace.length === 0 && providerAttempts.length === 0) return null;

  return (
    <div className="space-y-2">
      {trace.length > 0 ? (
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
                  {typeof item.latency_ms === "number" ? ` - ${item.latency_ms}ms` : ""}
                </span>
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
      {providerAttempts.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("aiChat.trace.providers")}
          </p>
          <div className="flex flex-wrap gap-2">
            {providerAttempts.map((item) => (
              <Badge
                key={`${item.phase}-${item.attempt}-${item.provider}-${item.model}`}
                variant={outcomeVariant(item.status)}
                className="gap-1.5 px-2 py-1"
              >
                <span>
                  {item.provider}:{item.model}
                </span>
                <span className="text-[10px] opacity-80">
                  {item.status}
                  {typeof item.latency_ms === "number" ? ` - ${item.latency_ms}ms` : ""}
                  {item.fallback_reason ? ` - ${item.fallback_reason}` : ""}
                </span>
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
