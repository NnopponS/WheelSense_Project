"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
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

function tierBadgeColor(tier: number) {
  if (tier === 1) return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (tier === 2) return "bg-amber-100 text-amber-800 border-amber-200";
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
        <p className="text-sm text-muted-foreground">
          {analysis.name} — {t("patient.adl.score")}: {analysis.total}/{analysis.max_total}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {ADL_ITEM_ORDER.map((key) => {
            const item = analysis.items[key];
            if (!item) return null;
            return (
              <div
                key={key}
                className="rounded-lg border border-outline-variant/20 p-2"
              >
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {key.replace(/_/g, " ")}
                </p>
                <p className="text-lg font-semibold">
                  {item.score}/{item.max}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {item.confidence}
                </p>
              </div>
            );
          })}
        </div>

        <div className="space-y-1">
          {analysis.notes.map((note, i) => (
            <p
              key={i}
              className="text-xs leading-relaxed text-muted-foreground"
            >
              • {note}
            </p>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
