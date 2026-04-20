"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  Clock,
  Users,
  DoorOpen,
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api } from "@/lib/api";
import type { components } from "@/lib/api/generated/schema";
import { useTranslation } from "@/lib/i18n";
import { AITraceChips, type AITraceChip } from "./AITraceChips";

type ExecutionPlan = components["schemas"]["ExecutionPlan"];
type EntityReference = { type: string; id: string | number; name?: string };

interface ActionPlanPreviewProps {
  plan: ExecutionPlan;
  proposalId?: number | null;
  onConfirm: () => void;
  onCancel: () => void;
  isConfirming?: boolean;
  trace?: AITraceChip[];
}

interface ResolvedEntity {
  type: "patient" | "room" | "caregiver" | "device" | "unknown";
  id: string | number;
  name: string;
  subtitle?: string;
  status?: string;
}

const riskBadgeVariant = (risk: string): "default" | "secondary" | "outline" | "success" | "warning" | "destructive" => {
  switch (risk?.toLowerCase()) {
    case "low":
      return "success";
    case "medium":
      return "warning";
    case "high":
      return "destructive";
    default:
      return "outline";
  }
};

const riskIcon = (risk: string) => {
  switch (risk?.toLowerCase()) {
    case "low":
      return <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
    case "medium":
      return <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
    case "high":
      return <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />;
    default:
      return <ShieldCheck className="h-4 w-4" />;
  }
};

function extractEntities(plan: ExecutionPlan): EntityReference[] {
  const entities: EntityReference[] = [];
  const seen = new Set<string>();

  const addEntity = (type: string, id: unknown) => {
    if (id === null || id === undefined) return;
    const key = `${type}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    entities.push({ type, id: id as string | number });
  };

  // Extract from affected_entities at plan level
  plan.affected_entities?.forEach((entity) => {
    if (typeof entity === "object" && entity !== null) {
      const e = entity as Record<string, unknown>;
      if (e.patient_id) addEntity("patient", e.patient_id);
      if (e.room_id) addEntity("room", e.room_id);
      if (e.caregiver_id) addEntity("caregiver", e.caregiver_id);
      if (e.device_id) addEntity("device", e.device_id);
      if (e.id && e.type) addEntity(String(e.type), e.id);
    }
  });

  // Extract from steps
  plan.steps?.forEach((step) => {
    step.affected_entities?.forEach((entity) => {
      if (typeof entity === "object" && entity !== null) {
        const e = entity as Record<string, unknown>;
        if (e.patient_id) addEntity("patient", e.patient_id);
        if (e.room_id) addEntity("room", e.room_id);
        if (e.caregiver_id) addEntity("caregiver", e.caregiver_id);
        if (e.device_id) addEntity("device", e.device_id);
      }
    });

    // Extract from arguments
    if (typeof step.arguments === "object" && step.arguments !== null) {
      const args = step.arguments as Record<string, unknown>;
      if (args.patient_id) addEntity("patient", args.patient_id);
      if (args.room_id) addEntity("room", args.room_id);
      if (args.caregiver_id) addEntity("caregiver", args.caregiver_id);
      if (args.device_id) addEntity("device", args.device_id);
    }
  });

  return entities;
}

export function ActionPlanPreview({
  plan,
  onConfirm,
  onCancel,
  isConfirming = false,
  trace = [],
}: ActionPlanPreviewProps) {
  const { t } = useTranslation();
  const [resolvedEntities, setResolvedEntities] = useState<ResolvedEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resolveEntities = useCallback(async () => {
    const entities = extractEntities(plan);
    if (entities.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const resolved = await Promise.all(
        entities.map(async (entity): Promise<ResolvedEntity | null> => {
          try {
            switch (entity.type) {
              case "patient": {
                const patient = await api.getPatient(entity.id);
                const fullName = `${patient.first_name || ""} ${patient.last_name || ""}`.trim();
                return {
                  type: "patient",
                  id: entity.id,
                  name: fullName || `Patient #${entity.id}`,
                  subtitle: patient.nickname || undefined,
                  status: patient.is_active ? "active" : "inactive",
                };
              }
              case "room": {
                const room = await api.getRoom(entity.id);
                return {
                  type: "room",
                  id: entity.id,
                  name: room.name || `Room #${entity.id}`,
                  subtitle: room.facility_name || undefined,
                };
              }
              case "caregiver": {
                const caregivers = await api.listCaregivers({ limit: 100 });
                const caregiver = caregivers.find((c) => c.id === Number(entity.id));
                const caregiverName = caregiver
                  ? `${caregiver.first_name || ""} ${caregiver.last_name || ""}`.trim()
                  : `Staff #${entity.id}`;
                return {
                  type: "caregiver",
                  id: entity.id,
                  name: caregiverName,
                  subtitle: caregiver?.role || undefined,
                };
              }
              default:
                return {
                  type: "unknown",
                  id: entity.id,
                  name: `${entity.type} #${entity.id}`,
                };
            }
          } catch {
            // Return placeholder on error
            return {
              type: entity.type as ResolvedEntity["type"],
              id: entity.id,
              name: `${entity.type} #${entity.id}`,
              status: "unresolved",
            };
          }
        })
      );

      setResolvedEntities(resolved.filter((e): e is ResolvedEntity => e !== null));
    } catch (e) {
      setError(t("aiChat.actionPlan.entityResolveError"));
    } finally {
      setLoading(false);
    }
  }, [plan, t]);

  useEffect(() => {
    void resolveEntities();
  }, [resolveEntities]);

  const entityIcon = (type: string) => {
    switch (type) {
      case "patient":
        return <Users className="h-3.5 w-3.5" />;
      case "room":
        return <DoorOpen className="h-3.5 w-3.5" />;
      default:
        return <ShieldCheck className="h-3.5 w-3.5" />;
    }
  };

  const stepCount = plan.steps?.length || 0;
  const estimatedTime = stepCount > 0 ? `${Math.max(1, stepCount * 2)}s` : null;

  const riskLabel =
    plan.risk_level === "low"
      ? t("aiChat.actionPlan.riskLow")
      : plan.risk_level === "medium"
        ? t("aiChat.actionPlan.riskMedium")
        : plan.risk_level === "high"
          ? t("aiChat.actionPlan.riskHigh")
          : plan.risk_level;

  return (
    <Card className="border-amber-500/20 bg-amber-50/40 dark:bg-amber-950/10">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">{plan.playbook}</CardTitle>
              <CardDescription className="text-xs">{t("aiChat.actionPlan.summary")}</CardDescription>
            </div>
          </div>
          <Badge variant={riskBadgeVariant(plan.risk_level)} className="shrink-0 gap-1">
            {riskIcon(plan.risk_level)}
            {riskLabel}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary */}
        {plan.summary && (
          <p className="text-sm text-foreground">{plan.summary}</p>
        )}

        {/* Affected Entities */}
        {resolvedEntities.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("aiChat.actionPlan.affected")}
            </p>
            <div className="flex flex-wrap gap-2">
              {loading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t("aiChat.entity.resolving")}
                </div>
              ) : (
                resolvedEntities.map((entity) => (
                  <Badge
                    key={`${entity.type}-${entity.id}`}
                    variant="outline"
                    className="gap-1.5 px-2 py-1"
                  >
                    {entityIcon(entity.type)}
                    <span className="font-medium">{entity.name}</span>
                    {entity.subtitle && (
                      <span className="text-muted-foreground">· {entity.subtitle}</span>
                    )}
                    {entity.status === "unresolved" && (
                      <span className="text-amber-600">({t("aiChat.entity.unresolved")})</span>
                    )}
                  </Badge>
                ))
              )}
            </div>
          </div>
        )}

        {/* Permission Basis */}
        {plan.permission_basis && plan.permission_basis.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("aiChat.actionPlan.permissionsRequired")}
            </p>
            <div className="flex flex-wrap gap-1">
              {plan.permission_basis.map((perm, idx) => (
                <Badge key={idx} variant="secondary" className="text-[10px]">
                  {perm}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Step Summary */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            {stepCount} {stepCount === 1 ? t("aiChat.actionPlan.stepSingle") : t("aiChat.actionPlan.steps")}
          </div>
          {estimatedTime && (
            <div className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {t("aiChat.actionPlan.estimatedTime")} ~{estimatedTime}
            </div>
          )}
        </div>

        {trace.length > 0 && <AITraceChips trace={trace} />}

        {/* Error State */}
        {error && (
          <Alert variant="destructive" className="py-2">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>

      <CardFooter className="flex gap-2 pt-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onCancel}
          disabled={isConfirming}
        >
          <XCircle className="mr-1.5 h-4 w-4" />
          {t("aiChat.actionPlan.reject")}
        </Button>
        <Button
          size="sm"
          className="flex-1"
          onClick={onConfirm}
          disabled={isConfirming || loading}
        >
          {isConfirming ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              {t("aiChat.actionPlan.executing")}
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              {t("aiChat.actionPlan.confirmExecute")}
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
