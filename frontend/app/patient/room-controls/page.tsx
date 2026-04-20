"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import {
  AlertTriangle,
  CircleSlash,
  Fan,
  Home,
  Lightbulb,
  Loader2,
  Power,
  PowerOff,
  RefreshCw,
  Thermometer,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import type {
  GetSmartDeviceStateResponse,
  ListSmartDevicesResponse,
} from "@/lib/api/task-scope-types";
import { useTranslation, type TranslationKey } from "@/lib/i18n";

type SmartDevice = ListSmartDevicesResponse[number];

type DeviceKind = "light" | "fan" | "switch" | "climate" | "unsupported";

type DeviceSnapshot = {
  state: string;
  message: string;
  data: Record<string, unknown> | null;
  fetchedAt: string;
  error: string | null;
};

type ActionDefinition = {
  key: string;
  label: TranslationKey;
  action: string;
  Icon: ComponentType<{ className?: string }>;
  variant: "default" | "secondary" | "outline";
};

const ACTIONS: Record<Exclude<DeviceKind, "unsupported">, ActionDefinition[]> = {
  light: [
    { key: "on", label: "patient.roomControls.turnOn", action: "turn_on", Icon: Power, variant: "default" },
    { key: "off", label: "patient.roomControls.turnOff", action: "turn_off", Icon: PowerOff, variant: "outline" },
    { key: "toggle", label: "patient.roomControls.toggle", action: "toggle", Icon: RefreshCw, variant: "secondary" },
  ],
  fan: [
    { key: "on", label: "patient.roomControls.turnOn", action: "turn_on", Icon: Power, variant: "default" },
    { key: "off", label: "patient.roomControls.turnOff", action: "turn_off", Icon: PowerOff, variant: "outline" },
    { key: "toggle", label: "patient.roomControls.toggle", action: "toggle", Icon: RefreshCw, variant: "secondary" },
  ],
  switch: [
    { key: "on", label: "patient.roomControls.turnOn", action: "turn_on", Icon: Power, variant: "default" },
    { key: "off", label: "patient.roomControls.turnOff", action: "turn_off", Icon: PowerOff, variant: "outline" },
    { key: "toggle", label: "patient.roomControls.toggle", action: "toggle", Icon: RefreshCw, variant: "secondary" },
  ],
  climate: [
    { key: "on", label: "patient.roomControls.turnOn", action: "turn_on", Icon: Power, variant: "default" },
    { key: "off", label: "patient.roomControls.turnOff", action: "turn_off", Icon: PowerOff, variant: "outline" },
  ],
};

const DEVICE_KIND_ICONS: Record<DeviceKind, ComponentType<{ className?: string }>> = {
  light: Lightbulb,
  fan: Fan,
  climate: Thermometer,
  switch: Power,
  unsupported: CircleSlash,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function humanizeDeviceType(value: string): string {
  const cleaned = value.trim().replace(/[_-]+/g, " ");
  if (!cleaned) return "Device";
  return cleaned
    .split(/\s+/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function resolveDeviceKind(device: SmartDevice): DeviceKind {
  const haystack = `${device.device_type} ${device.ha_entity_id}`.toLowerCase();
  if (haystack.includes("climate") || haystack.includes("thermostat") || haystack.includes("hvac")) {
    return "climate";
  }
  if (haystack.includes("fan")) return "fan";
  if (haystack.includes("light") || haystack.includes("lamp") || haystack.includes("bulb")) return "light";
  if (haystack.includes("switch") || haystack.includes("plug") || haystack.includes("outlet")) return "switch";
  return "unsupported";
}

function getSnapshotState(snapshot: DeviceSnapshot | undefined, fallback: string): string {
  return snapshot?.state?.trim() || fallback || "unknown";
}

function extractTargetTemperature(device: SmartDevice, snapshot: DeviceSnapshot | undefined): number | null {
  const candidateSources: Array<Record<string, unknown> | null> = [
    snapshot?.data && isRecord(snapshot.data.attributes) ? snapshot.data.attributes : null,
    snapshot?.data ?? null,
    device.config ?? null,
  ];

  const keys = [
    "target_temperature",
    "temperature",
    "setpoint",
    "heating_setpoint",
    "cooling_setpoint",
    "target_temp",
    "target_temp_high",
    "target_temp_low",
  ];

  for (const source of candidateSources) {
    if (!source) continue;
    for (const key of keys) {
      const numeric = toFiniteNumber(source[key]);
      if (numeric !== null) return numeric;
    }
  }

  return null;
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export default function PatientRoomControlsPage() {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<SmartDevice[]>([]);
  const [snapshots, setSnapshots] = useState<Record<number, DeviceSnapshot>>({});
  const [temperatureDrafts, setTemperatureDrafts] = useState<Record<number, string>>({});
  const [deviceErrors, setDeviceErrors] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);
  const [refreshingDeviceIds, setRefreshingDeviceIds] = useState<Record<number, boolean>>({});

  const setDeviceRefreshing = useCallback((deviceId: number, busy: boolean) => {
    setRefreshingDeviceIds((current) => {
      if (busy) {
        return { ...current, [deviceId]: true };
      }

      if (!(deviceId in current)) return current;
      const next = { ...current };
      delete next[deviceId];
      return next;
    });
  }, []);

  const hydrateDeviceSnapshots = useCallback(async (items: SmartDevice[]) => {
    const nextSnapshots: Record<number, DeviceSnapshot> = {};
    const nextErrors: Record<number, string> = {};

    const results = await Promise.all(
      items.map(async (device) => {
        try {
          const response: GetSmartDeviceStateResponse = await api.getSmartDeviceState(device.id);
          return { device, response, reason: null as unknown };
        } catch (reason) {
          return { device, response: null as GetSmartDeviceStateResponse | null, reason };
        }
      }),
    );

    for (const result of results) {
      if (result.response) {
        const { device, response } = result;
        const rawData = isRecord(response.data) ? response.data : null;
        nextSnapshots[device.id] = {
          state:
            rawData && typeof rawData.state === "string" && rawData.state.trim()
              ? rawData.state
              : device.state,
          message: response.message,
          data: rawData,
          fetchedAt: new Date().toISOString(),
          error: response.status === "success" ? null : response.message,
        };
        if (response.status !== "success") {
          nextErrors[device.id] = response.message;
        }
      } else {
        nextErrors[result.device.id] = getErrorMessage(result.reason, t("patient.roomControls.refreshFailed"));
      }
    }

    return { nextSnapshots, nextErrors };
  }, [t]);

  const loadDevices = useCallback(
    async (options?: { showLoader?: boolean }) => {
      const showLoader = options?.showLoader ?? false;
      if (showLoader) {
        setLoading(true);
      } else {
        setRefreshingAll(true);
      }

      setPageError(null);
      try {
        const list = await api.listSmartDevices();
        const visible = list.filter((device) => device.is_active);
        setDevices(visible);

        if (visible.length === 0) {
          setSnapshots({});
          setDeviceErrors({});
          setTemperatureDrafts({});
          return;
        }

        const { nextSnapshots, nextErrors } = await hydrateDeviceSnapshots(visible);
        setSnapshots(nextSnapshots);
        setDeviceErrors(nextErrors);
        setTemperatureDrafts((current) => {
          const next = { ...current };
          for (const device of visible) {
            const snapshot = nextSnapshots[device.id];
            const target = extractTargetTemperature(device, snapshot);
            if (target !== null && next[device.id] === undefined) {
              next[device.id] = String(target);
            }
          }
          return next;
        });
      } catch (error) {
        setPageError(getErrorMessage(error, t("patient.roomControls.errorBody")));
      } finally {
        setLoading(false);
        setRefreshingAll(false);
      }
    },
    [hydrateDeviceSnapshots, t],
  );

  useEffect(() => {
    void loadDevices({ showLoader: true });
  }, [loadDevices]);

  const activeDevices = useMemo(() => devices.filter((device) => device.is_active), [devices]);

  const summary = useMemo(() => {
    let controllable = 0;
    let readOnly = 0;
    for (const device of activeDevices) {
      if (resolveDeviceKind(device) === "unsupported") {
        readOnly += 1;
      } else {
        controllable += 1;
      }
    }
    return {
      active: activeDevices.length,
      controllable,
      readOnly,
    };
  }, [activeDevices]);

  const handleRefreshDevice = useCallback(
    async (device: SmartDevice) => {
      setDeviceRefreshing(device.id, true);
      setDeviceErrors((current) => {
        const next = { ...current };
        delete next[device.id];
        return next;
      });

      try {
        const response = await api.getSmartDeviceState(device.id);
        const rawData = isRecord(response.data) ? response.data : null;
        const nextSnapshot: DeviceSnapshot = {
          state:
            typeof rawData?.state === "string" && rawData.state.trim()
              ? rawData.state
              : device.state,
          message: response.message,
          data: rawData,
          fetchedAt: new Date().toISOString(),
          error: response.status === "success" ? null : response.message,
        };
        setSnapshots((current) => ({ ...current, [device.id]: nextSnapshot }));
        setTemperatureDrafts((current) => {
          const target = extractTargetTemperature(device, nextSnapshot);
          if (target === null || current[device.id] !== undefined) return current;
          return { ...current, [device.id]: String(target) };
        });
      } catch (error) {
        setDeviceErrors((current) => ({
          ...current,
          [device.id]: getErrorMessage(error, t("patient.roomControls.refreshFailed")),
        }));
      } finally {
        setDeviceRefreshing(device.id, false);
      }
    },
    [setDeviceRefreshing, t],
  );

  const handleControl = useCallback(
    async (device: SmartDevice, action: string, parameters?: Record<string, unknown>) => {
      const actionKey = `${device.id}:${action}`;
      setBusyActionKey(actionKey);
      setDeviceErrors((current) => {
        const next = { ...current };
        delete next[device.id];
        return next;
      });

      try {
        await api.controlSmartDevice(device.id, {
          action,
          ...(parameters ? { parameters } : {}),
        });
        await handleRefreshDevice(device);
      } catch (error) {
        setDeviceErrors((current) => ({
          ...current,
          [device.id]: getErrorMessage(error, t("patient.roomControls.controlFailed")),
        }));
      } finally {
        setBusyActionKey((current) => (current === actionKey ? null : current));
      }
    },
    [handleRefreshDevice, t],
  );

  const isBusy = loading || refreshingAll;

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            <Home className="h-3.5 w-3.5" />
            {t("patient.roomControls.badge")}
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
              {t("patient.roomControls.title")}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {t("patient.roomControls.subtitle")}
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => void loadDevices()} disabled={isBusy}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshingAll ? "animate-spin" : ""}`} />
          {t("patient.roomControls.refreshAll")}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label={t("patient.roomControls.summaryActive")} value={summary.active} />
        <StatCard label={t("patient.roomControls.summaryControllable")} value={summary.controllable} />
        <StatCard label={t("patient.roomControls.summaryReadOnly")} value={summary.readOnly} />
      </div>

      {loading ? (
        <Card className="border-border/70">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div className="space-y-1">
              <p className="text-base font-medium text-foreground">{t("patient.roomControls.loadingTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("patient.roomControls.loadingBody")}</p>
            </div>
          </CardContent>
        </Card>
      ) : pageError ? (
        <Card className="border-border/70">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <AlertTriangle className="h-10 w-10 text-destructive" />
            <div className="space-y-1">
              <p className="text-base font-medium text-foreground">{t("patient.roomControls.errorTitle")}</p>
              <p className="text-sm text-muted-foreground">{pageError}</p>
            </div>
            <Button type="button" onClick={() => void loadDevices({ showLoader: true })}>
              {t("patient.roomControls.refreshAll")}
            </Button>
          </CardContent>
        </Card>
      ) : activeDevices.length === 0 ? (
        <Card className="border-border/70">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <CircleSlash className="h-10 w-10 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-base font-medium text-foreground">{t("patient.roomControls.emptyTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("patient.roomControls.emptyBody")}</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {activeDevices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              snapshot={snapshots[device.id]}
              temperatureDraft={temperatureDrafts[device.id]}
              onTemperatureDraftChange={(value) =>
                setTemperatureDrafts((current) => ({ ...current, [device.id]: value }))
              }
              onRefresh={() => void handleRefreshDevice(device)}
              onControl={(action, parameters) => void handleControl(device, action, parameters)}
              busyActionKey={busyActionKey}
              isRefreshing={Boolean(refreshingDeviceIds[device.id])}
              error={deviceErrors[device.id] ?? null}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DeviceCard({
  device,
  snapshot,
  temperatureDraft,
  onTemperatureDraftChange,
  onRefresh,
  onControl,
  busyActionKey,
  isRefreshing,
  error,
  t,
}: {
  device: SmartDevice;
  snapshot?: DeviceSnapshot;
  temperatureDraft?: string;
  onTemperatureDraftChange: (value: string) => void;
  onRefresh: () => void;
  onControl: (action: string, parameters?: Record<string, unknown>) => void;
  busyActionKey: string | null;
  isRefreshing: boolean;
  error: string | null;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const kind = resolveDeviceKind(device);
  const Icon = DEVICE_KIND_ICONS[kind];
  const currentState = getSnapshotState(snapshot, device.state);
  const targetTemperature = extractTargetTemperature(device, snapshot);
  const liveActionBusy = busyActionKey !== null && busyActionKey.startsWith(`${device.id}:`);
  const kindActions = kind === "unsupported" ? [] : ACTIONS[kind];
  const lastUpdated = snapshot?.fetchedAt ? formatTimestamp(snapshot.fetchedAt) : null;
  const temperatureNumber = targetTemperature ?? toFiniteNumber(temperatureDraft);
  const temperatureValue = temperatureDraft ?? (temperatureNumber !== null ? String(temperatureNumber) : "");
  const canSetTemperature = kind === "climate" && targetTemperature !== null;

  return (
    <Card className="border-border/70">
      <CardHeader className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{device.name}</CardTitle>
              <CardDescription className="truncate font-mono text-sm">{device.ha_entity_id}</CardDescription>
            </div>
          </div>
          <Badge variant={kind === "unsupported" ? "outline" : "secondary"}>{humanizeDeviceType(device.device_type)}</Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant={device.is_active ? "success" : "outline"}>
            {device.is_active ? t("patient.roomControls.statusActive") : t("patient.roomControls.statusInactive")}
          </Badge>
          <Badge variant="outline">{t("patient.roomControls.deviceRoom")}: {device.room_id ?? "-"}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoTile label={t("patient.roomControls.entityId")} value={device.ha_entity_id} mono />
          <InfoTile label={t("patient.roomControls.deviceType")} value={humanizeDeviceType(device.device_type)} />
          <InfoTile label={t("patient.roomControls.currentState")} value={currentState} />
          <InfoTile
            label={t("patient.roomControls.lastUpdated")}
            value={lastUpdated ?? t("patient.roomControls.unknownState")}
          />
        </div>

        {error ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : snapshot?.message ? (
          <p className="text-sm text-muted-foreground">{snapshot.message}</p>
        ) : null}

        {kind === "unsupported" ? (
          <div className="space-y-3 rounded-xl border border-dashed border-border/70 bg-muted/20 p-4">
            <p className="text-sm text-muted-foreground">{t("patient.roomControls.readOnlyNotice")}</p>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                <span>{t("patient.roomControls.refreshDevice")}</span>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing || liveActionBusy}>
                {t("patient.roomControls.refreshDevice")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 rounded-xl border border-border/70 bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                  {t("patient.roomControls.supportedActions")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {canSetTemperature ? t("patient.roomControls.temperatureHelp") : t("patient.roomControls.controlHint")}
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={onRefresh} disabled={isRefreshing || liveActionBusy}>
                <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                {t("patient.roomControls.refreshDevice")}
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {kindActions.map((action) => (
                <Button
                  key={action.key}
                  type="button"
                  variant={action.variant}
                  size="sm"
                  onClick={() => onControl(action.action)}
                  disabled={liveActionBusy || isRefreshing}
                  className="justify-start"
                >
                  <action.Icon className="mr-2 h-4 w-4" />
                  {t(action.label)}
                </Button>
              ))}
            </div>

            {kind === "climate" && canSetTemperature ? (
              <div className="space-y-2">
                <label className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                  {t("patient.roomControls.setTemperature")}
                </label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={10}
                    max={35}
                    step={0.5}
                    value={temperatureValue}
                    onChange={(event) => onTemperatureDraftChange(event.target.value)}
                    className="max-w-32"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      const parsed = toFiniteNumber(temperatureValue);
                      if (parsed !== null) {
                        onControl("set_temperature", { temperature: parsed });
                      }
                    }}
                    disabled={liveActionBusy || isRefreshing || toFiniteNumber(temperatureValue) === null}
                  >
                    {t("patient.roomControls.setTemperature")}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InfoTile({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2">
      <p className="text-sm uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-medium text-foreground ${mono ? "font-mono break-all text-sm" : ""}`}>{value}</p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="border-border/70">
      <CardContent className="flex items-center justify-between pt-6">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-semibold text-foreground">{value}</p>
        </div>
        <Home className="h-8 w-8 text-muted-foreground/70" />
      </CardContent>
    </Card>
  );
}
