"use client";

import { useState } from "react";
import { Power, Battery, RefreshCw, XCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import DemoPanel from "./DemoPanel";
import type { Device } from "@/lib/types";
import { useTranslation } from "@/lib/i18n";

type DeviceSimulationPanelProps = {
  devices: Device[];
  onSimulateDevice: (deviceId: number, action: string, batteryLevel?: number) => void;
  simulatingDevice: number | null;
};

export default function DeviceSimulationPanel({
  devices,
  onSimulateDevice,
  simulatingDevice,
}: DeviceSimulationPanelProps) {
  const { t } = useTranslation();
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number>(50);

  const selectedDevice = devices.find((d) => d.id === selectedDeviceId);
  
  // Read simulation state from config field
  const getSimState = (device: Device) => {
    const simConfig = (device.config as any)?._simulation || {};
    return {
      is_active: simConfig.is_active !== false, // Default to true if not set
      battery_level: simConfig.battery_level,
    };
  };

  const selectedSimState = selectedDevice ? getSimState(selectedDevice) : null;

  const handleAction = (action: string) => {
    if (!selectedDeviceId) return;
    onSimulateDevice(selectedDeviceId, action, action === "set_battery" ? batteryLevel : undefined);
  };

  return (
    <DemoPanel
      badge={t("demoControl.deviceSim")}
      title={t("demoControl.deviceSimulation")}
      description={t("demoControl.deviceSimulationDesc")}
      action={<Power className="h-4 w-4 text-muted-foreground" />}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>{t("demoControl.device")}</Label>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={selectedDeviceId ?? ""}
            onChange={(e) => setSelectedDeviceId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{t("demoControl.selectDevice")}</option>
            {devices.map((device) => {
              const simState = getSimState(device);
              return (
                <option key={device.id} value={device.id}>
                  {device.device_type} - {device.device_id}
                  {!simState.is_active && ` (${t("demoControl.offline")})`}
                </option>
              );
            })}
          </select>
        </div>

        {selectedDevice && selectedSimState && (
          <div className="space-y-3 rounded-lg border border-border/70 bg-muted/30 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground">{selectedDevice.device_type}</p>
                  <Badge variant={selectedSimState.is_active ? "default" : "secondary"}>
                    {selectedSimState.is_active ? t("demoControl.online") : t("demoControl.offline")}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  ID: {selectedDevice.device_id}
                  {selectedSimState.battery_level !== undefined && ` • Battery: ${selectedSimState.battery_level}%`}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("demoControl.batteryLevel")}</Label>
              <div className="flex items-center gap-2">
                <Battery className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={batteryLevel}
                  onChange={(e) => setBatteryLevel(Number(e.target.value))}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAction("set_online")}
                disabled={simulatingDevice === selectedDeviceId || selectedSimState.is_active}
              >
                <CheckCircle className="mr-2 h-3 w-3" />
                {t("demoControl.setOnline")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAction("set_offline")}
                disabled={simulatingDevice === selectedDeviceId || !selectedSimState.is_active}
              >
                <XCircle className="mr-2 h-3 w-3" />
                {t("demoControl.setOffline")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAction("set_battery")}
                disabled={simulatingDevice === selectedDevice.id}
              >
                <Battery className="mr-2 h-3 w-3" />
                {t("demoControl.setBattery")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAction("disconnect")}
                disabled={simulatingDevice === selectedDevice.id}
              >
                <XCircle className="mr-2 h-3 w-3" />
                {t("demoControl.disconnect")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAction("reconnect")}
                disabled={simulatingDevice === selectedDevice.id}
                className="col-span-2"
              >
                <RefreshCw className="mr-2 h-3 w-3" />
                {t("demoControl.reconnect")}
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label>{t("demoControl.allDevices")} ({devices.length})</Label>
          <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-border/70 bg-muted/30 p-3">
            {devices.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("demoControl.noDevices")}</p>
            ) : (
              devices.map((device) => {
                const simState = getSimState(device);
                return (
                  <div
                    key={device.id}
                    className="flex items-center justify-between rounded-lg bg-card/50 p-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{device.device_type}</p>
                        <Badge variant={simState.is_active ? "default" : "secondary"} className="text-xs">
                          {simState.is_active ? t("demoControl.online") : t("demoControl.offline")}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{device.device_id}</p>
                    </div>
                    {simState.battery_level !== undefined && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Battery className="h-3 w-3" />
                        {simState.battery_level}%
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </DemoPanel>
  );
}
