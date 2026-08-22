"use client";

import { Suspense, useCallback, useMemo, useRef, useState, type ComponentType } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronRight, Search, Tablet, Wifi, WifiOff } from "lucide-react";
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
import { sortRegistryDevices, type DeviceSortDirection, type DeviceSortKey } from "@/lib/deviceFleetSort";
import { SMART_DEVICE_CARD_VISUAL } from "@/lib/deviceFleetCardIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import { getQueryPollingMs, getQueryStaleTimeMs } from "@/lib/queryEndpointDefaults";
import { cn } from "@/lib/utils";
import { AppPage } from "@/components/layout/AppPage";
import { DataState } from "@/components/layout/DataState";

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
  const [sortKey, setSortKey] = useState<DeviceSortKey>("status");
  const [sortDirection, setSortDirection] = useState<DeviceSortDirection>("asc");
  const deviceButtonRefs = useRef(new Map<string, HTMLButtonElement>());
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
    return sortRegistryDevices(filtered, sortKey, sortDirection, nowMs);
  }, [devices, nowMs, search, sortDirection, sortKey]);

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

  const toggleSort = (nextKey: DeviceSortKey) => {
    if (sortKey === nextKey) setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSortKey(nextKey);
      setSortDirection(nextKey === "last_seen" ? "desc" : "asc");
    }
  };

  const closeDeviceDetail = () => {
    const triggerId = selectedId;
    setSelectedId(null);
    if (triggerId) requestAnimationFrame(() => deviceButtonRefs.current.get(triggerId)?.focus());
  };

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
    <AppPage
      title={t("devices.title")}
      description={t("devices.healthNote")}
      breadcrumbs={[
        {
          label: t("nav.dashboard"),
          href: user?.role ? `/${String(user.role).replace("_", "-")}` : "/admin",
        },
        { label: t("nav.devices") },
      ]}
    >

      {tab === "smart_ha" ? (
        <div className="grid items-stretch gap-3 md:grid-cols-3">
          <SummaryCard label={t("devices.summarySmartDevices")} value={smartStats.total} icon={Tablet} tone="info" />
          <SummaryCard label={t("devices.summaryReachable")} value={smartStats.reachable} icon={Wifi} tone="success" />
          <SummaryCard label={t("devices.summaryInactive")} value={smartStats.inactive} icon={WifiOff} tone="warning" />
        </div>
      ) : (
        <div className="grid items-stretch gap-3 md:grid-cols-3">
          <SummaryCard label={t("devices.summaryRegistryDevices")} value={registryStats.total} icon={Tablet} tone="info" />
          <SummaryCard label={t("devices.summaryOnlineRegistry")} value={registryStats.online} icon={Wifi} tone="success" />
          <SummaryCard label={t("devices.summaryOfflineRegistry")} value={registryStats.offline} icon={WifiOff} tone="warning" />
        </div>
      )}

      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-3 p-3 sm:p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-wrap gap-2" role="tablist" aria-label={t("devices.title")}>
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

          <div className="relative w-full xl:max-w-md">
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
          <div className="grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredSmart.map((device) => {
              const ok = isSmartDeviceOnline(device);
              const SmartIcon = SMART_DEVICE_CARD_VISUAL.Icon;
              return (
                <Card key={device.id} className="flex h-full flex-col overflow-hidden">
                  <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${SMART_DEVICE_CARD_VISUAL.wrapClass}`}
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
                  <CardContent className="flex flex-1 flex-col gap-2 text-sm">
                    <p className="text-muted-foreground">{device.device_type}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{t("devices.state")}</span>
                      <span className="font-medium text-foreground">
                        {device.state || (device.is_active ? t("smartDevices.active") : t("smartDevices.inactive"))}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{t("clinical.table.status")}</span>
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
        <DataState
          kind={search.trim() ? "filtered-empty" : "empty"}
          title={search.trim() ? t("devices.noMatches") : t("devices.empty")}
          actionLabel={search.trim() ? t("devices.clearSearch") : undefined}
          onAction={search.trim() ? () => setSearch("") : undefined}
        />
      ) : (
        <section className="overflow-hidden rounded-xl border border-border bg-card" aria-label={t("devices.title")}>
          <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {t("devices.resultCount").replace("{count}", String(filteredRegistry.length))}
            </p>
            <div className="flex flex-wrap items-center gap-2" aria-label={t("devices.sortBy")}>
              {([
                ["device", t("devices.device")],
                ["status", t("clinical.table.status")],
                ["last_seen", t("devices.lastSeen")],
              ] as Array<[DeviceSortKey, string]>).map(([key, label]) => (
                <Button
                  key={key}
                  type="button"
                  variant={sortKey === key ? "secondary" : "outline"}
                  size="sm"
                  aria-pressed={sortKey === key}
                  onClick={() => toggleSort(key)}
                >
                  {label}
                  {sortKey === key ? (
                    sortDirection === "asc" ? <ArrowUp className="h-4 w-4" aria-hidden="true" /> : <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  ) : null}
                </Button>
              ))}
            </div>
          </div>
          <div className="hidden grid-cols-[minmax(0,2fr)_minmax(7rem,0.8fr)_minmax(7rem,0.8fr)_minmax(7rem,1fr)_minmax(10rem,1.2fr)_2rem] gap-3 border-b border-border bg-muted/30 px-4 py-2 text-xs font-semibold text-muted-foreground md:grid">
            <span>{t("devices.device")}</span>
            <span>{t("devices.type")}</span>
            <span>{t("clinical.table.status")}</span>
            <span>{t("devices.firmware")}</span>
            <span>{t("devices.lastSeen")}</span>
            <span className="sr-only">{t("common.open")}</span>
          </div>
          <ul className="divide-y divide-border" role="list">
            {filteredRegistry.map((device) => {
              const online = isDeviceOnline(device.last_seen, nowMs);
              const title = device.display_name?.trim() || device.device_id;
              const status = online ? t("devices.online") : t("devices.offline");
              const accessibleLabel = t("devices.openDetailsLabel")
                .replace("{name}", title)
                .replace("{id}", device.device_id)
                .replace("{status}", status);
              return (
                <li key={device.id}>
                  <button
                    ref={(node) => {
                      if (node) deviceButtonRefs.current.set(device.device_id, node);
                      else deviceButtonRefs.current.delete(device.device_id);
                    }}
                    type="button"
                    className="grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 px-4 py-3 text-left transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/80 md:grid-cols-[minmax(0,2fr)_minmax(7rem,0.8fr)_minmax(7rem,0.8fr)_minmax(7rem,1fr)_minmax(10rem,1.2fr)_2rem] md:items-center md:gap-3"
                    aria-label={accessibleLabel}
                    onClick={() => setSelectedId(device.device_id)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-foreground">{title}</span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">{device.device_id}</span>
                    </span>
                    <span className="col-start-1 row-start-2 text-sm text-foreground md:col-auto md:row-auto">
                      <span className="mr-2 text-xs font-medium text-muted-foreground md:hidden">{t("devices.type")}</span>
                      {device.hardware_type}
                    </span>
                    <span className="col-start-2 row-start-1 justify-self-end md:col-auto md:row-auto md:justify-self-start">
                      <Badge variant={online ? "success" : "warning"}>
                        {online ? <Wifi className="h-3 w-3" aria-hidden="true" /> : <WifiOff className="h-3 w-3" aria-hidden="true" />}
                        {status}
                      </Badge>
                    </span>
                    <span className="col-start-1 row-start-3 text-sm text-foreground md:col-auto md:row-auto">
                      <span className="mr-2 text-xs font-medium text-muted-foreground md:hidden">{t("devices.firmware")}</span>
                      {device.firmware || "-"}
                    </span>
                    <span className="col-start-2 row-span-2 row-start-2 text-right text-sm text-foreground md:col-auto md:row-auto md:text-left">
                      <span className="block">{device.last_seen ? formatDateTime(device.last_seen) : "-"}</span>
                      <span className="block text-xs text-muted-foreground">{device.last_seen ? formatRelativeTime(device.last_seen) : "-"}</span>
                    </span>
                    <ChevronRight className="hidden h-5 w-5 text-muted-foreground md:block" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {selectedId && tab !== "smart_ha" ? (
        <DeviceDetailDrawer
          deviceId={selectedId}
          onClose={closeDeviceDetail}
          t={t}
          onMutate={onMutate}
        />
      ) : null}
    </AppPage>
  );
}

export default function DevicesPage() {
  const { t } = useTranslation();
  return (
    <Suspense
      fallback={
        <DataState kind="loading" title={t("common.loading")} />
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
  tone,
}: {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string }>;
  tone: "info" | "success" | "warning";
}) {
  const toneClassMap: Record<"info" | "success" | "warning", string> = {
    info: "bg-info-bg text-info-foreground",
    success: "bg-success-bg text-success-foreground",
    warning: "bg-warning-bg text-warning-foreground",
  };

  return (
    <Card className="h-full overflow-hidden bg-card">
      <CardContent className="flex min-h-24 items-center justify-between gap-4 p-4 sm:p-5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-semibold leading-none text-foreground">{value}</p>
        </div>
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg", toneClassMap[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
