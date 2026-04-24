"use client";

import { useState } from "react";
import { Zap, Activity, Users, Camera, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import DemoPanel from "./DemoPanel";
import { useTranslation } from "@/lib/i18n";

type QuickAction = {
  id: string;
  nameKey: string;
  descKey: string;
  icon: React.ReactNode;
  categoryKey: string;
  color: string;
};

type QuickActionsPanelProps = {
  onExecuteAction: (actionId: string) => void;
  executingAction: string | null;
};

export default function QuickActionsPanel({
  onExecuteAction,
  executingAction,
}: QuickActionsPanelProps) {
  const { t } = useTranslation();

  const quickActions: QuickAction[] = [
    {
      id: "emergency-drill",
      nameKey: "demoControl.emergencyDrill",
      descKey: "demoControl.emergencyDrillDesc",
      icon: <AlertTriangle className="h-5 w-5" />,
      categoryKey: "demoControl.categoryEmergency",
      color: "bg-red-500",
    },
    {
      id: "morning-rounds",
      nameKey: "demoControl.morningRounds",
      descKey: "demoControl.morningRoundsDesc",
      icon: <Activity className="h-5 w-5" />,
      categoryKey: "demoControl.categoryRoutine",
      color: "bg-blue-500",
    },
    {
      id: "handoff-pressure",
      nameKey: "demoControl.handoffPressure",
      descKey: "demoControl.handoffPressureDesc",
      icon: <Users className="h-5 w-5" />,
      categoryKey: "demoControl.categoryWorkflow",
      color: "bg-purple-500",
    },
    {
      id: "photo-sweep",
      nameKey: "demoControl.photoSweep",
      descKey: "demoControl.photoSweepDesc",
      icon: <Camera className="h-5 w-5" />,
      categoryKey: "demoControl.categoryHardware",
      color: "bg-green-500",
    },
  ];

  const handleExecute = (actionId: string) => {
    onExecuteAction(actionId);
  };

  return (
    <DemoPanel
      badge={t("demoControl.quickActions")}
      title={t("demoControl.oneClickDemoFlows")}
      description={t("demoControl.oneClickDemoFlowsDesc")}
      action={<Zap className="h-4 w-4 text-muted-foreground" />}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {quickActions.map((action) => {
          const isExecuting = executingAction === action.id;
          return (
            <button
              key={action.id}
              onClick={() => handleExecute(action.id)}
              disabled={isExecuting}
              className="group relative flex flex-col items-start gap-3 rounded-xl border border-border/70 bg-card/50 p-4 text-left transition-all hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50"
            >
              <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${action.color} text-white`}>
                  {action.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">{t(action.nameKey)}</p>
                    <Badge variant="outline" className="text-xs">
                      {t(action.categoryKey)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{t(action.descKey)}</p>
                </div>
              </div>
              {isExecuting && (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/80 backdrop-blur-sm">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <span>{t("demoControl.executing")}</span>
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </DemoPanel>
  );
}
