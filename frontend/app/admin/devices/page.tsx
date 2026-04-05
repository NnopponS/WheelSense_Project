"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { useQuery } from "@/hooks/useQuery";
import { useAuth } from "@/hooks/useAuth";
import { withWorkspaceScope } from "@/lib/workspaceQuery";
import EmptyState from "@/components/EmptyState";
import DeviceDetailDrawer from "@/components/admin/devices/DeviceDetailDrawer";
import type { Device, HardwareType } from "@/lib/types";
import { Tablet, Search, Wifi, WifiOff } from "lucide-react";

const HARDWARE_TABS: Array<{ key: HardwareType | "all"; labelKey: TranslationKey }> = [
  { key: "all", labelKey: "devicesDetail.tabAll" },
  { key: "wheelchair", labelKey: "devicesDetail.tabWheelchair" },
  { key: "node", labelKey: "devicesDetail.tabNode" },
  { key: "polar_sense", labelKey: "devicesDetail.tabPolar" },
  { key: "mobile_phone", labelKey: "devicesDetail.tabMobile" },
];

const ONLINE_MS = 5 * 60 * 1000;

function isOnline(lastSeen: string | null, nowMs: number): boolean {
  if (!lastSeen) return false;
  return nowMs - new Date(lastSeen).getTime() <= ONLINE_MS;
}

export default function DevicesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<HardwareType | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listEndpoint = useMemo(() => {
    const base =
      tab === "all"
        ? "/devices"
        : `/devices?hardware_type=${encodeURIComponent(tab)}`;
    return withWorkspaceScope(base, user?.workspace_id);
  }, [tab, user?.workspace_id]);

  const { data: devices, isLoading, refetch } = useQuery<Device[]>(listEndpoint);

  const nowMs = Date.now();
  const filtered = useMemo(() => {
    const list = devices ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (d) =>
        d.device_id.toLowerCase().includes(q) ||
        (d.display_name || "").toLowerCase().includes(q),
    );
  }, [devices, search]);

  const onMutate = useCallback(() => {
    void refetch();
  }, [refetch]);

  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-2xl font-bold text-on-surface">{t("devices.title")}</h2>

      <div className="flex flex-wrap gap-2">
        {HARDWARE_TABS.map(({ key, labelKey }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              tab === key
                ? "border-primary bg-primary/15 text-primary"
                : "border-outline-variant/30 bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
        <input
          type="text"
          placeholder={t("devices.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field input-field--leading-icon py-2.5 text-sm"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !filtered || filtered.length === 0 ? (
        <EmptyState icon={Tablet} message={t("devices.empty")} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((device) => {
            const online = isOnline(device.last_seen, nowMs);
            const title =
              device.display_name?.trim() || device.device_id;
            return (
              <button
                key={device.id}
                type="button"
                onClick={() => setSelectedId(device.device_id)}
                className="text-left surface-card p-5 rounded-xl border border-transparent hover:border-primary/25 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-info-bg flex items-center justify-center shrink-0">
                      <Tablet className="w-5 h-5 text-info" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-on-surface text-sm truncate">
                        {title}
                      </p>
                      <p className="text-xs text-on-surface-variant truncate font-mono">
                        {device.device_id}
                      </p>
                      <p className="text-[11px] text-outline truncate">
                        {device.hardware_type}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${
                      online ? "care-normal" : "severity-warning"
                    }`}
                  >
                    {online ? (
                      <Wifi className="w-3 h-3" />
                    ) : (
                      <WifiOff className="w-3 h-3" />
                    )}
                    {online ? t("devices.online") : t("devices.offline")}
                  </span>
                </div>
                {device.firmware ? (
                  <p className="text-xs text-outline">FW: {device.firmware}</p>
                ) : null}
                {device.last_seen && (
                  <p className="text-xs text-outline mt-1">
                    {t("devices.lastSeen")}:{" "}
                    {new Date(device.last_seen).toLocaleString()}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {selectedId && (
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
