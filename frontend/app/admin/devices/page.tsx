"use client";

import { useTranslation } from "@/lib/i18n";
import { useQuery } from "@/hooks/useQuery";
import EmptyState from "@/components/EmptyState";
import { Tablet, Search, Wifi, WifiOff } from "lucide-react";
import { useState } from "react";

interface Device {
  id: number;
  device_id: string;
  device_type: string;
  is_active: boolean;
  firmware_version?: string;
  last_seen?: string;
  patient_id?: number;
}

export default function DevicesPage() {
  const { t } = useTranslation();
  const { data: devices, isLoading } = useQuery<Device[]>("/devices");
  const [search, setSearch] = useState("");

  const filtered = devices?.filter((d) =>
    d.device_id?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-2xl font-bold text-on-surface">{t("devices.title")}</h2>

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
          {filtered.map((device) => (
            <div key={device.id} className="surface-card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-info-bg flex items-center justify-center">
                    <Tablet className="w-5 h-5 text-info" />
                  </div>
                  <div>
                    <p className="font-semibold text-on-surface text-sm">
                      {device.device_id}
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      {device.device_type}
                    </p>
                  </div>
                </div>
                <span
                  className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${
                    device.is_active ? "care-normal" : "severity-warning"
                  }`}
                >
                  {device.is_active ? (
                    <Wifi className="w-3 h-3" />
                  ) : (
                    <WifiOff className="w-3 h-3" />
                  )}
                  {device.is_active ? t("devices.online") : t("devices.offline")}
                </span>
              </div>
              {device.firmware_version && (
                <p className="text-xs text-outline">
                  FW: {device.firmware_version}
                </p>
              )}
              {device.last_seen && (
                <p className="text-xs text-outline mt-1">
                  {t("devices.lastSeen")}:{" "}
                  {new Date(device.last_seen).toLocaleString()}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
