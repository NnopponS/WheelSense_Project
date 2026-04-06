"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import { useQuery } from "@/hooks/useQuery";
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
import { Tablet, Search, Wifi, WifiOff } from "lucide-react";

function DevicesPageContent() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const nowMs = useFixedNowMs();

  const tab = useMemo(
    () => fleetTabFromQuery(searchParams.get("tab")),
    [searchParams],
  );

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
    const base =
      tab === "all"
        ? "/devices"
        : `/devices?hardware_type=${encodeURIComponent(tab)}`;
    return withWorkspaceScope(base, user?.workspace_id);
  }, [tab, user?.workspace_id]);

  const smartEndpoint = useMemo(
    () =>
      tab === "smart_ha"
        ? withWorkspaceScope("/ha/devices", user?.workspace_id)
        : null,
    [tab, user?.workspace_id],
  );

  const { data: devices, isLoading: loadingRegistry, refetch: refetchRegistry } =
    useQuery<Device[]>(registryEndpoint);
  const { data: smartDevices, isLoading: loadingSmart, refetch: refetchSmart } =
    useQuery<SmartDevice[]>(smartEndpoint);

  const isLoading = tab === "smart_ha" ? loadingSmart : loadingRegistry;

  const filteredRegistry = useMemo(() => {
    const list = devices ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (d) =>
        d.device_id.toLowerCase().includes(q) ||
        (d.display_name || "").toLowerCase().includes(q) ||
        d.hardware_type.toLowerCase().includes(q),
    );
  }, [devices, search]);

  const filteredSmart = useMemo(() => {
    const list = smartDevices ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.ha_entity_id.toLowerCase().includes(q) ||
        d.device_type.toLowerCase().includes(q),
    );
  }, [smartDevices, search]);

  const onMutate = useCallback(() => {
    void refetchRegistry();
    void refetchSmart();
  }, [refetchRegistry, refetchSmart]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-on-surface">{t("devices.title")}</h2>
        <p className="text-sm text-on-surface-variant mt-1 max-w-2xl">
          {t("devices.subtitle")}
        </p>
      </div>

      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label={t("devices.title")}
      >
        {DEVICE_FLEET_TABS.map(({ key, labelKey }) => {
          const selected = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                selected
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-outline-variant/30 bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              {t(labelKey)}
            </button>
          );
        })}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-outline pointer-events-none" />
        <input
          type="search"
          autoComplete="off"
          placeholder={
            tab === "smart_ha" ? t("devices.searchSmartDevice") : t("devices.search")
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field input-field--leading-icon py-2.5 text-sm w-full"
          aria-label={tab === "smart_ha" ? t("devices.searchSmartDevice") : t("devices.search")}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === "smart_ha" ? (
        filteredSmart.length === 0 ? (
          <EmptyState
            icon={SMART_DEVICE_CARD_VISUAL.Icon}
            message={t("smartDevices.empty")}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredSmart.map((d) => {
              const ok = isSmartDeviceOnline(d);
              const SmartIcon = SMART_DEVICE_CARD_VISUAL.Icon;
              return (
                <div
                  key={d.id}
                  className="surface-card p-5 rounded-xl border border-outline-variant/15"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${SMART_DEVICE_CARD_VISUAL.wrapClass}`}
                      >
                        <SmartIcon className={`w-5 h-5 ${SMART_DEVICE_CARD_VISUAL.iconClass}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-on-surface text-sm truncate">
                          {d.name}
                        </p>
                        <p className="text-xs text-on-surface-variant truncate font-mono">
                          {d.ha_entity_id}
                        </p>
                        <p className="text-[11px] text-outline truncate">{d.device_type}</p>
                      </div>
                    </div>
                    <span
                      className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${
                        ok ? "care-normal" : "severity-warning"
                      }`}
                    >
                      {ok ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                      {ok ? t("dash.smartDevicesReachable") : t("dash.smartDevicesNotReachable")}
                    </span>
                  </div>
                  <p className="text-xs text-outline">
                    {d.is_active ? t("smartDevices.active") : t("smartDevices.inactive")}
                    {d.state ? ` · ${d.state}` : ""}
                  </p>
                </div>
              );
            })}
          </div>
        )
      ) : filteredRegistry.length === 0 ? (
        <EmptyState icon={Tablet} message={t("devices.empty")} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredRegistry.map((device) => {
            const online = isDeviceOnline(device.last_seen, nowMs);
            const title = device.display_name?.trim() || device.device_id;
            const vis = registryDeviceCardPresentation(device.hardware_type);
            const HwIcon = vis.Icon;
            return (
              <button
                key={device.id}
                type="button"
                onClick={() => setSelectedId(device.device_id)}
                className="text-left surface-card p-5 rounded-xl border border-transparent hover:border-primary/25 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${vis.wrapClass}`}
                    >
                      <HwIcon className={`w-5 h-5 ${vis.iconClass}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-on-surface text-sm truncate">{title}</p>
                      <p className="text-xs text-on-surface-variant truncate font-mono">
                        {device.device_id}
                      </p>
                      <p className="text-[11px] text-outline truncate">{device.hardware_type}</p>
                    </div>
                  </div>
                  <span
                    className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${
                      online ? "care-normal" : "severity-warning"
                    }`}
                  >
                    {online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                    {online ? t("devices.online") : t("devices.offline")}
                  </span>
                </div>
                {device.firmware ? (
                  <p className="text-xs text-outline">FW: {device.firmware}</p>
                ) : null}
                {device.last_seen && (
                  <p className="text-xs text-outline mt-1">
                    {t("devices.lastSeen")}: {new Date(device.last_seen).toLocaleString()}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {selectedId && tab !== "smart_ha" && (
        <DeviceDetailDrawer
          deviceId={selectedId}
          workspaceId={user?.workspace_id}
          onClose={() => setSelectedId(null)}
          t={t}
          onMutate={onMutate}
        />
      )}
    </div>
  );
}

export default function DevicesPage() {
  const { t } = useTranslation();
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="sr-only">{t("common.loading")}</span>
        </div>
      }
    >
      <DevicesPageContent />
    </Suspense>
  );
}
