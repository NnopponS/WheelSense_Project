"use client";

import { useMemo } from "react";
import {
  CheckCircle2,
  Circle,
  Loader2,
  AlertTriangle,
  XCircle,
  Clock,
  ChevronRight,
  Shield,
  Play,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { components } from "@/lib/api/generated/schema";

type ExecutionPlanStep = components["schemas"]["ExecutionPlanStep"];

export interface StepResult {
  stepId: string;
  success: boolean;
  message?: string;
  data?: unknown;
  error?: string;
  executedAt?: string;
}

interface ExecutionStepListProps {
  steps: ExecutionPlanStep[];
  executing?: boolean;
  currentStepIndex?: number;
  completedSteps?: number[];
  stepResults?: StepResult[];
  failedSteps?: number[];
}

const stepStatus = (
  index: number,
  executing: boolean,
  currentStepIndex: number,
  completedSteps: number[],
  failedSteps: number[]
): "pending" | "executing" | "completed" | "failed" => {
  if (failedSteps.includes(index)) return "failed";
  if (completedSteps.includes(index)) return "completed";
  if (executing && currentStepIndex === index) return "executing";
  if (executing && currentStepIndex > index) return "completed";
  return "pending";
};

const statusIcon = (status: "pending" | "executing" | "completed" | "failed") => {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />;
    case "executing":
      return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
    case "failed":
      return <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />;
    default:
      return <Circle className="h-5 w-5 text-muted-foreground/40" />;
  }
};

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

function StepCard({
  step,
  index,
  status,
  result,
  isLast,
}: {
  step: ExecutionPlanStep;
  index: number;
  status: "pending" | "executing" | "completed" | "failed";
  result?: StepResult;
  isLast: boolean;
}) {
  const showResult = status === "completed" || status === "failed";

  return (
    <div className="relative">
      {/* Connection line */}
      {!isLast && (
        <div
          className={cn(
            "absolute left-[19px] top-[38px] w-[2px] transition-colors",
            status === "completed" ? "bg-emerald-500/50" : "bg-border/50"
          )}
          style={{ height: "calc(100% - 24px)" }}
        />
      )}

      <div
        className={cn(
          "flex gap-3 rounded-xl border p-3 transition-all",
          status === "executing" && "border-primary/50 bg-primary/5",
          status === "completed" && "border-emerald-500/20 bg-emerald-50/30 dark:bg-emerald-950/10",
          status === "failed" && "border-red-500/20 bg-red-50/30 dark:bg-red-950/10",
          status === "pending" && "border-border/50 bg-card/50"
        )}
      >
        {/* Status Icon */}
        <div className="flex shrink-0 pt-0.5">
          {statusIcon(status)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Step {index + 1}</span>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{step.title}</span>
            </div>
            <Badge variant={riskBadgeVariant(step.risk_level)} className="shrink-0 text-[10px]">
              {step.risk_level}
            </Badge>
          </div>

          {/* Tool Name */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Shield className="h-3 w-3" />
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
              {step.tool_name}
            </code>
          </div>

          {/* Permission Basis */}
          {step.permission_basis && step.permission_basis.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 pt-1">
              <span className="text-[10px] text-muted-foreground">Permissions:</span>
              {step.permission_basis.map((perm, idx) => (
                <Badge key={idx} variant="outline" className="text-[9px] px-1 py-0">
                  {perm}
                </Badge>
              ))}
            </div>
          )}

          {/* Affected Entities */}
          {step.affected_entities && step.affected_entities.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 pt-1">
              {step.affected_entities.map((entity, idx) => {
                const e = entity as Record<string, unknown>;
                const name = e.name || e.patient_name || e.room_name || `Entity ${idx + 1}`;
                const type = String(e.type || (e.patient_id ? "patient" : e.room_id ? "room" : "entity"));
                return (
                  <Badge key={idx} variant="secondary" className="text-[10px] gap-1">
                    <span className="capitalize text-muted-foreground">{type}:</span>
                    <span>{String(name)}</span>
                  </Badge>
                );
              })}
            </div>
          )}

          {/* Result Display */}
          {showResult && result && (
            <div
              className={cn(
                "mt-2 rounded-lg border p-2 text-xs",
                result.success
                  ? "border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20"
                  : "border-red-500/20 bg-red-50/50 dark:bg-red-950/20"
              )}
            >
              {result.success ? (
                <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{result.message || "Completed successfully"}</span>
                </div>
              ) : (
                <div className="flex items-start gap-1.5 text-red-700 dark:text-red-300">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span className="break-words">{result.error || "Step failed"}</span>
                </div>
              )}
              {result.executedAt && (
                <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {new Date(result.executedAt).toLocaleTimeString()}
                </div>
              )}
            </div>
          )}

          {/* Arguments Preview (collapsed, shown on executing) */}
          {status === "executing" && step.arguments && Object.keys(step.arguments).length > 0 && (
            <div className="mt-2 rounded bg-muted/50 p-2">
              <p className="text-[10px] font-medium text-muted-foreground mb-1">Arguments:</p>
              <pre className="text-[10px] text-muted-foreground overflow-x-auto">
                {JSON.stringify(step.arguments, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ExecutionStepList({
  steps,
  executing = false,
  currentStepIndex = 0,
  completedSteps = [],
  stepResults = [],
  failedSteps = [],
}: ExecutionStepListProps) {
  const progress = useMemo(() => {
    if (steps.length === 0) return 0;
    const completed = completedSteps.length;
    return Math.round((completed / steps.length) * 100);
  }, [steps.length, completedSteps]);

  const stepCount = steps.length;
  const completedCount = completedSteps.length;
  const failedCount = failedSteps.length;

  if (stepCount === 0) {
    return null;
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Play className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">Execution Steps</CardTitle>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{completedCount}</span>
                <span>/</span>
                <span>{stepCount}</span>
                <span>completed</span>
                {failedCount > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-red-600 dark:text-red-400">{failedCount} failed</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Progress Badge */}
          <Badge variant={executing ? "default" : completedCount === stepCount ? "success" : "outline"}>
            {executing ? "Executing..." : completedCount === stepCount ? "Complete" : "Pending"}
          </Badge>
        </div>

        {/* Progress Bar */}
        <Progress value={progress} className="mt-3 h-1.5" />
      </CardHeader>

      <CardContent className="space-y-1">
        {steps.map((step, index) => {
          const status = stepStatus(index, executing, currentStepIndex, completedSteps, failedSteps);
          const result = stepResults.find((r) => r.stepId === step.id);

          return (
            <StepCard
              key={step.id}
              step={step}
              index={index}
              status={status}
              result={result}
              isLast={index === steps.length - 1}
            />
          );
        })}
      </CardContent>
    </Card>
  );
}
