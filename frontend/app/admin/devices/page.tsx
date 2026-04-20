"use client";

import { Suspense, useCallback, useMemo, useState, type ComponentType } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Tablet, Wifi, WifiOff } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { withWorkspaceScope } from "@/lib/workspaceQuery";
import {
  DEVICE_FLEET_TABS,
  fleetTabFromQuery,
  fleetTabToQuery,
  type DeviceFleetTab,
} from "@/lib/deviceHardwareTabs";
import { useFixedNowMs } from "@/hooks/useFixedNowMs";
import EmptyState from "@/components/EmptyState";
import DeviceDetailDrawer from "@/components/admin/devices/DeviceDetailDrawer";
import type { Device, SmartDevice } from "@/lib/types";
import { isDeviceOnline } from "@/lib/deviceOnline";
import { isSmartDeviceOnline } from "@/lib/smartDeviceOnline";
import {
  registryDeviceCardPresentation,
  SMART_DEVICE_CARD_VISUAL,
} from "@/lib/deviceFleetCardIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import { getQueryPollingMs, getQueryStaleTimeMs } from "@/lib/queryEndpointDefaults";

function registryDeviceLabelSortKey(device: Device): string {
  return (device.display_name?.trim() || device.device_id).toLocaleLowerCase();
}

function compareRegistryDevices(a: Device, b: Device): number {
  const byLabel = registryDeviceLabelSortKey(a).localeCompare(registryDeviceLabelSortKey(b), undefined, {
    sensitivity: "base",
  });
  if (byLabel !== 0) return byLabel;
  return a.device_id.localeCompare(b.device_id);
}

function compareSmartFleetDevices(a: SmartDevice, b: SmartDevice): number {
  const byName = a.name.toLocaleLowerCase().localeCompare(b.name.toLocaleLowerCase(), undefined, {
    sensitivity: "base",
  });
  if (byName !== 0) return byName;
  return String(a.id).localeCompare(String(b.id));
}

function DevicesPageContent() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const nowMs = useFixedNowMs();

  const tab = useMemo(() => fleetTabFromQuery(searchParams.get("tab")), [searchParams]);

  const setTab = useCallback(
    (next: DeviceFleetTab) => {
      const q = fleetTabToQuery(next);
      const nextUrl = q === "all" ? "/admin/devices" : `/admin/devices?tab=${q}`;
      router.replace(nextUrl, { scroll: false });
      setSearch("");
      setSelectedId(null);
    },
    [router],
  );

  const registryEndpoint = useMemo(() => {
    if (tab === "smart_ha") return null;
    const base = tab === "all" ? "/devices" : `/devices?hardware_type=${encodeURIComponent(tab)}`;
    return withWorkspaceScope(base, user?.workspace_id);
  }, [tab, user?.workspace_id]);

  const smartEndpoint = useMemo(
    () => (tab === "smart_ha" ? withWorkspaceScope("/ha/devices", user?.workspace_id) : null),
    [tab, user?.workspace_id],
  );

  const { data: devices, isLoading: loadingRegistry, refetch: refetchRegistry } = useQuery({
    queryKey: ["admin", "devices", "registry", registryEndpoint, tab],
    queryFn: () => api.get<Device[]>(registryEndpoint!),
    enabled: Boolean(registryEndpoint),
    staleTime: registryEndpoint ? getQueryStaleTimeMs(registryEndpoint) : 30_000,
    refetchInterval: registryEndpoint ? getQueryPollingMs(registryEndpoint) : false,
  });
  const { data: smartDevices, isLoading: loadingSmart, refetch: refetchSmart } = useQuery({
    queryKey: ["admin", "devices", "smart-ha", smartEndpoint],
    queryFn: () => api.get<SmartDevice[]>(smartEndpoint!),
    enabled: Boolean(smartEndpoint),
    staleTime: smartEndpoint ? getQueryStaleTimeMs(smartEndpoint) : 30_000,
    refetchInterval: smartEndpoint ? getQueryPollingMs(smartEndpoint) : false,
  });

  const isLoading = tab === "smart_ha" ? loadingSmart : loadingRegistry;

  const filteredRegistry = useMemo(() => {
    const list = devices ?? [];
    const q = search.trim().toLowerCase();
    const filtered = !q
      ? list
      : list.filter(
          (device) =>
            device.device_id.toLowerCase().includes(q) ||
            (device.display_name || "").toLowerCase().includes(q) ||
            device.hardware_type.toLowerCase().includes(q),
        );
    return [...filtered].sort(compareRegistryDevices);
  }, [devices, search]);

  const filteredSmart = useMemo(() => {
    const list = smartDevices ?? [];
    const q = search.trim().toLowerCase();
    const filtered = !q
      ? list
      : list.filter(
          (device) =>
            device.name.toLowerCase().includes(q) ||
            device.ha_entity_id.toLowerCase().includes(q) ||
            device.device_type.toLowerCase().includes(q),
        );
    return [...filtered].sort(compareSmartFleetDevices);
  }, [smartDevices, search]);

  const onMutate = useCallback(() => {
    // `refetch()` runs the queryFn even when `enabled` is false; registryEndpoint / smartEndpoint are null on the
    // other tab, which would call `api.get(null)` and produce `/apinull`.
    if (registryEndpoint) void refetchRegistry();
    if (smartEndpoint) void refetchSmart();
  }, [refetchRegistry, refetchSmart, registryEndpoint, smartEndpoint]);

  const registryStats = useMemo(() => {
    const source = devices ?? [];
    const online = source.filter((device) => isDeviceOnline(device.last_seen, nowMs)).length;
    return {
      total: source.length,
      online,
      offline: Math.max(source.length - online, 0),
    };
  }, [devices, nowMs]);

  const smartStats = useMemo(() => {
    const source = smartDevices ?? [];
    const reachable = source.filter((device) => isSmartDeviceOnline(device)).length;
    return {
      total: source.length,
      reachable,
      inactive: source.filter((device) => !device.is_active).length,
    };
  }, [smartDevices]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">{t("devices.title")}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("devices.healthNote")}</p>
      </div>

      {tab === "smart_ha" ? (
        <div className="grid gap-4 md:grid-cols-3">
          <SummaryCard label={t("devices.summarySmartDevices")} value={smartStats.total} icon={Tablet} />
          <SummaryCard label={t("devices.summaryReachable")} value={smartStats.reachable} icon={Wifi} />
          <SummaryCard label={t("devices.summaryInactive")} value={smartStats.inactive} icon={WifiOff} />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <SummaryCard label={t("devices.summaryRegistryDevices")} value={registryStats.total} icon={Tablet} />
          <SummaryCard label={t("devices.summaryOnlineRegistry")} value={registryStats.online} icon={Wifi} />
          <SummaryCard label={t("devices.summaryOfflineRegistry")} value={registryStats.offline} icon={WifiOff} />
        </div>
      )}

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("devices.title")}>
            {DEVICE_FLEET_TABS.map(({ key, labelKey }) => {
              const selected = tab === key;
              return (
                <Button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  variant={selected ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTab(key)}
                >
                  {t(labelKey)}
                </Button>
              );
            })}
          </div>

          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              autoComplete="off"
              placeholder={tab === "smart_ha" ? t("devices.searchSmartDevice") : t("devices.search")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
              aria-label={tab === "smart_ha" ? t("devices.searchSmartDevice") : t("devices.search")}
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="flex min-h-72 items-center justify-center pt-6">
            <div className="h-9 w-9 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </CardContent>
        </Card>
      ) : tab === "smart_ha" ? (
        filteredSmart.length === 0 ? (
          <EmptyState icon={SMART_DEVICE_CARD_VISUAL.Icon} message={t("smartDevices.empty")} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredSmart.map((device) => {
              const ok = isSmartDeviceOnline(device);
              const SmartIcon = SMART_DEVICE_CARD_VISUAL.Icon;
              return (
                <Card key={device.id} className="overflow-hidden">
                  <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${SMART_DEVICE_CARD_VISUAL.wrapClass}`}
                      >
                        <SmartIcon className={`h-5 w-5 ${SMART_DEVICE_CARD_VISUAL.iconClass}`} />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base">{device.name}</CardTitle>
                        <p className="truncate font-mono text-sm text-muted-foreground">
                          {device.ha_entity_id}
                        </p>
                      </div>
                    </div>
                    <Badge variant={ok ? "success" : "warning"}>
                      {ok ? t("dash.smartDevicesReachable") : t("dash.smartDevicesNotReachable")}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p className="text-muted-foreground">{device.device_type}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">State</span>
                      <span className="font-medium text-foreground">
                        {device.state || (device.is_active ? t("smartDevices.active") : t("smartDevices.inactive"))}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <Badge variant={device.is_active ? "success" : "outline"}>
                        {device.is_active ? t("smartDevices.active") : t("smartDevices.inactive")}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      ) : filteredRegistry.length === 0 ? (
        <EmptyState icon={Tablet} message={t("devices.empty")} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredRegistry.map((device) => {
            const online = isDeviceOnline(device.last_seen, nowMs);
            const title = device.display_name?.trim() || device.device_id;
            const visual = registryDeviceCardPresentation(device.hardware_type);
            const DeviceIcon = visual.Icon;
            return (
              <Card
                key={device.id}
                className="cursor-pointer transition-colors hover:border-primary/45"
                onClick={() => setSelectedId(device.device_id)}
              >
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${visual.wrapClass}`}
                    >
                      <DeviceIcon className={`h-5 w-5 ${visual.iconClass}`} />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{title}</CardTitle>
                      <p className="truncate font-mono text-sm text-muted-foreground">{device.device_id}</p>
                    </div>
                  </div>
                  <Badge variant={online ? "success" : "warning"}>
                    {online ? (
                      <span className="inline-flex items-center gap-1">
                        <Wifi className="h-3 w-3" />
                        {t("devices.online")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <WifiOff className="h-3 w-3" />
                        {t("devices.offline")}
                      </span>
                    )}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Hardware</span>
                    <span className="font-medium text-foreground">{device.hardware_type}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Firmware</span>
                    <span className="font-medium text-foreground">{device.firmware || "-"}</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">{t("devices.lastSeen")}</p>
                    <p className="text-foreground">{device.last_seen ? formatDateTime(device.last_seen) : "-"}</p>
                    <p className="text-sm text-muted-foreground">
                      {device.last_seen ? formatRelativeTime(device.last_seen) : "-"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selectedId && tab !== "smart_ha" ? (
        <DeviceDetailDrawer
          deviceId={selectedId}
          onClose={() => setSelectedId(null)}
          t={t}
          onMutate={onMutate}
        />
      ) : null}
    </div>
  );
}

export default function DevicesPage() {
  const { t } = useTranslation();
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <span className="sr-only">{t("common.loading")}</span>
        </div>
      }
    >
      <DevicesPageContent />
    </Suspense>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="bg-card">
      <CardContent className="flex items-center justify-between pt-6">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-semibold text-foreground">{value}</p>
        </div>
        <Icon className="h-8 w-8 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}
