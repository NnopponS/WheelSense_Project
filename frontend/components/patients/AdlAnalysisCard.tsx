"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Accessibility,
  Activity,
  ArrowUpDown,
  Bath,
  Droplets,
  Footprints,
  Shirt,
  Sparkles,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { DataState } from "@/components/layout/DataState";
import { cn } from "@/lib/utils";

type AdlItemScore = {
  score: number;
  max: number;
  confidence: string;
  evidence: string;
  source: string;
};

type AdlAnalysis = {
  patient_id: number;
  name: string;
  total: number;
  max_total: number;
  tier: number;
  tier_label: string;
  method: string;
  items: Record<string, AdlItemScore>;
  notes: string[];
};

const ADL_ITEM_ORDER = [
  "bowels",
  "bladder",
  "grooming",
  "toilet_use",
  "feeding",
  "transfers",
  "mobility",
  "dressing",
  "stairs",
  "bathing",
];

const ADL_ITEM_ICONS: Record<string, LucideIcon> = {
  bowels: Droplets,
  bladder: Droplets,
  grooming: Sparkles,
  toilet_use: Accessibility,
  feeding: Utensils,
  transfers: ArrowUpDown,
  mobility: Footprints,
  dressing: Shirt,
  stairs: ArrowUpDown,
  bathing: Bath,
};

function tierBadgeColor(tier: number) {
  if (tier === 1) return "bg-success-bg text-emerald-800 border-emerald-200";
  if (tier === 2) return "bg-warning-bg text-warning-foreground border-warning/30";
  return "bg-rose-100 text-rose-800 border-rose-200";
}

export function AdlAnalysisCard({ patientId }: { patientId: number }) {
  const { t } = useTranslation();
  const query = useQuery<AdlAnalysis>({
    queryKey: ["adl-analysis", patientId],
    enabled: Number.isFinite(patientId),
    queryFn: () => api.get<AdlAnalysis>(`/timeline/adl/${patientId}`),
  });

  if (query.isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <DataState kind="loading" title={t("common.loading")} />
        </CardContent>
      </Card>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Card>
        <CardContent className="pt-6">
          <DataState
            kind={query.isError ? "error" : "empty"}
            title={query.isError ? t("common.error") : t("patient.adl.noData")}
          />
        </CardContent>
      </Card>
    );
  }

  const analysis = query.data;
  const totalMax = Math.max(analysis.max_total, 1);
  const totalScore = Math.min(Math.max(analysis.total, 0), totalMax);
  const scorePercent = (totalScore / totalMax) * 100;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Activity className="h-5 w-5 text-primary" />
            {t("patient.adl.title")}
          </CardTitle>
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 font-semibold",
              tierBadgeColor(analysis.tier)
            )}
          >
            {t("patient.adl.tier")} {analysis.tier} · {analysis.tier_label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4 rounded-xl border border-primary/10 bg-gradient-to-r from-primary/5 to-transparent p-3">
          <div
            role="img"
            aria-label={t("patient.adl.score") + ": " + analysis.total + "/" + analysis.max_total}
            className="grid h-20 w-20 shrink-0 place-items-center rounded-full p-2"
            style={{ background: "conic-gradient(var(--primary) " + scorePercent + "%, var(--muted) 0)" }}
          >
            <div className="grid h-full w-full place-content-center rounded-full bg-card text-center">
              <span className="text-xl font-bold leading-none tabular-nums">{analysis.total}</span>
              <span className="mt-1 text-[10px] text-muted-foreground">/ {analysis.max_total}</span>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{analysis.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("patient.adl.score")}</p>
            <div className="mt-2 h-1.5 w-36 max-w-full overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-primary" style={{ width: scorePercent + "%" }} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {ADL_ITEM_ORDER.map((key) => {
            const item = analysis.items[key];
            if (!item) return null;
            const Icon = ADL_ITEM_ICONS[key] ?? Activity;
            return (
              <div
                key={key}
                className="rounded-xl border border-outline-variant/20 bg-card p-2.5 shadow-sm"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <p className="min-w-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {key.replace(/_/g, " ")}
                  </p>
                </div>
                <p className="text-lg font-semibold tabular-nums">{item.score}<span className="text-sm text-muted-foreground">/{item.max}</span></p>
                <div
                  role="progressbar"
                  aria-label={`${key.replace(/_/g, " ")}: ${item.score}/${item.max}`}
                  aria-valuemin={0}
                  aria-valuemax={Math.max(item.max, 1)}
                  aria-valuenow={Math.min(Math.max(item.score, 0), Math.max(item.max, 1))}
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
                >
                  <div className="h-full rounded-full bg-primary/80" style={{ width: `${Math.min(Math.max(item.score / Math.max(item.max, 1), 0), 1) * 100}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {item.confidence}
                </p>
              </div>
            );
          })}
        </div>

        {analysis.notes.length > 0 ? (
          <details className="rounded-lg border border-border/60 px-3">
            <summary className="flex min-h-11 cursor-pointer items-center text-xs font-medium text-primary">{t("patient.health.analysisDetails")}</summary>
            <div className="space-y-1 pb-3">
              {analysis.notes.map((note, i) => (
                <p key={i} className="text-xs leading-relaxed text-muted-foreground">{note}</p>
              ))}
            </div>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}
