"use client";

import { useState } from "react";
import { Play, Square, Clock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import DemoPanel from "./DemoPanel";

type ScenarioMetadata = {
  scenario_id: string;
  name: string;
  description: string;
  category: string;
  default_interval_ms: number;
};

type ScenarioStatus = {
  scenario_id: string;
  status: "running" | "stopped";
};

type ScenarioPanelProps = {
  scenarios: ScenarioMetadata[];
  runningScenarios: Set<string>;
  onStartScenario: (scenarioId: string, intervalMs: number) => void;
  onStopScenario: (scenarioId: string) => void;
};

export default function ScenarioPanel({
  scenarios,
  runningScenarios,
  onStartScenario,
  onStopScenario,
}: ScenarioPanelProps) {
  const [selectedScenario, setSelectedScenario] = useState<string>("");
  const [intervalMs, setIntervalMs] = useState<number>(2000);

  const selectedScenarioData = scenarios.find((s) => s.scenario_id === selectedScenario);

  const handleStart = () => {
    if (!selectedScenario) return;
    onStartScenario(selectedScenario, intervalMs);
  };

  const handleStop = () => {
    if (!selectedScenario) return;
    onStopScenario(selectedScenario);
  };

  const isRunning = selectedScenario ? runningScenarios.has(selectedScenario) : false;

  return (
    <DemoPanel
      badge="Scenarios"
      title="Demo Scenarios"
      description="Start pre-defined simulation scenarios for comprehensive demonstrations"
      action={<Zap className="h-4 w-4 text-muted-foreground" />}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Scenario</Label>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={selectedScenario}
            onChange={(e) => {
              setSelectedScenario(e.target.value);
              const scenario = scenarios.find((s) => s.scenario_id === e.target.value);
              if (scenario) setIntervalMs(scenario.default_interval_ms);
            }}
          >
            <option value="">Select a scenario</option>
            {scenarios.map((scenario) => (
              <option key={scenario.scenario_id} value={scenario.scenario_id}>
                {scenario.name}
              </option>
            ))}
          </select>
        </div>

        {selectedScenarioData && (
          <div className="space-y-3 rounded-lg border border-border/70 bg-muted/30 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground">{selectedScenarioData.name}</p>
                  <Badge variant="outline" className="text-xs">
                    {selectedScenarioData.category}
                  </Badge>
                  {isRunning && (
                    <Badge variant="default" className="text-xs bg-green-600">
                      Running
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{selectedScenarioData.description}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Interval (ms)</Label>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  min="250"
                  max="60000"
                  step="250"
                  value={intervalMs}
                  onChange={(e) => setIntervalMs(Number(e.target.value))}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">milliseconds</span>
              </div>
            </div>

            <div className="flex gap-2">
              {!isRunning ? (
                <Button onClick={handleStart} disabled={!selectedScenario} className="flex-1">
                  <Play className="mr-2 h-4 w-4" />
                  Start Scenario
                </Button>
              ) : (
                <Button onClick={handleStop} variant="destructive" className="flex-1">
                  <Square className="mr-2 h-4 w-4" />
                  Stop Scenario
                </Button>
              )}
            </div>
          </div>
        )}

        {scenarios.length > 0 && (
          <div className="space-y-2">
            <Label>All Scenarios</Label>
            <div className="space-y-2">
              {scenarios.map((scenario) => {
                const running = runningScenarios.has(scenario.scenario_id);
                return (
                  <div
                    key={scenario.scenario_id}
                    className="flex items-center justify-between rounded-lg border border-border/70 bg-card/50 p-3"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{scenario.name}</p>
                        <Badge variant="outline" className="text-xs">
                          {scenario.category}
                        </Badge>
                        {running && (
                          <Badge variant="default" className="text-xs bg-green-600">
                            Running
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{scenario.description}</p>
                    </div>
                    <div className="flex gap-1">
                      {!running ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedScenario(scenario.scenario_id);
                            setIntervalMs(scenario.default_interval_ms);
                            onStartScenario(scenario.scenario_id, scenario.default_interval_ms);
                          }}
                        >
                          <Play className="h-3 w-3" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onStopScenario(scenario.scenario_id)}
                        >
                          <Square className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </DemoPanel>
  );
}
