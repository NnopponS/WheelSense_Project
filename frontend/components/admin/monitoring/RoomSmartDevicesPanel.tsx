"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@/hooks/useQuery";
import { api, ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import type { SmartDevice } from "@/lib/types";
import { Plus, Trash2 } from "lucide-react";

export interface RoomSmartDevicesPanelProps {
  roomId: number | null;
}

export default function RoomSmartDevicesPanel({ roomId }: RoomSmartDevicesPanelProps) {
  const { t } = useTranslation();
  const { data: allDevices, isLoading, error, refetch } = useQuery<SmartDevice[]>("/ha/devices");
  const [message, setMessage] = useState<string | null>(null);

  const devices = useMemo(() => {
    if (roomId === null || !allDevices) return [];
    return allDevices.filter((d) => d.room_id === roomId);
  }, [allDevices, roomId]);

  const [adding, setAdding] = useState(false);
  const [newEntity, setNewEntity] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("switch");

  const clearForm = useCallback(() => {
    setNewEntity("");
    setNewName("");
    setNewType("switch");
    setAdding(false);
  }, []);

  async function handleAdd() {
    if (roomId === null) return;
    const entity = newEntity.trim();
    const name = newName.trim() || entity;
    if (!entity) return;
    setMessage(null);
    try {
      await api.post<SmartDevice>("/ha/devices", {
        name,
        ha_entity_id: entity,
        device_type: newType,
        room_id: roomId,
        is_active: true,
        config: {},
      });
      await refetch();
      clearForm();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : t("monitoring.ha.saveFailed"));
    }
  }

  async function handlePatch(id: number, patch: Partial<{ name: string; device_type: string; is_active: boolean }>) {
    setMessage(null);
    try {
      await api.patch<SmartDevice>(`/ha/devices/${id}`, patch);
      await refetch();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : t("monitoring.ha.saveFailed"));
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm(t("monitoring.ha.delete") + "?")) return;
    setMessage(null);
    try {
      await api.delete<void>(`/ha/devices/${id}`);
      await refetch();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : t("monitoring.ha.deleteFailed"));
    }
  }

  if (roomId === null) {
    return (
      <p className="text-sm text-on-surface-variant py-2">{t("monitoring.ha.pickRoom")}</p>
    );
  }

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-on-surface">{t("monitoring.ha.title")}</h4>

      {message && <p className="text-xs text-error">{message}</p>}

      {isLoading ? (
        <div className="flex justify-center py-6">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <p className="text-sm text-error">{t("monitoring.ha.loadFailed")}</p>
      ) : devices.length === 0 ? (
        <p className="text-sm text-on-surface-variant">{t("monitoring.ha.empty")}</p>
      ) : (
        <ul className="space-y-3">
          {devices.map((d) => (
            <DeviceRow
              key={`${d.id}-${d.name}-${d.device_type}-${d.is_active}`}
              device={d}
              onPatch={handlePatch}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}

      {!adding ? (
        <button
          type="button"
          className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
          onClick={() => setAdding(true)}
        >
          <Plus className="w-4 h-4" />
          {t("monitoring.ha.add")}
        </button>
      ) : (
        <div className="rounded-xl border border-outline-variant/30 p-3 space-y-2 bg-surface-container-low/50">
          <div>
            <label className="text-xs text-on-surface-variant">{t("monitoring.ha.entityId")}</label>
            <input
              className="input-field text-sm w-full mt-1"
              value={newEntity}
              onChange={(e) => setNewEntity(e.target.value)}
              placeholder="light.bedroom"
            />
          </div>
          <div>
            <label className="text-xs text-on-surface-variant">{t("monitoring.ha.name")}</label>
            <input
              className="input-field text-sm w-full mt-1"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-on-surface-variant">{t("monitoring.ha.type")}</label>
            <input
              className="input-field text-sm w-full mt-1"
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className="gradient-cta px-3 py-2 rounded-lg text-sm font-semibold"
              onClick={() => void handleAdd()}
            >
              {t("monitoring.ha.save")}
            </button>
            <button type="button" className="px-3 py-2 text-sm" onClick={clearForm}>
              {t("monitoring.roomForm.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DeviceRow({
  device,
  onPatch,
  onDelete,
}: {
  device: SmartDevice;
  onPatch: (id: number, patch: Partial<{ name: string; device_type: string; is_active: boolean }>) => void;
  onDelete: (id: number) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(device.name);
  const [deviceType, setDeviceType] = useState(device.device_type);
  const [active, setActive] = useState(device.is_active);

  return (
    <li className="rounded-lg border border-outline-variant/25 p-3 space-y-2">
      <p className="text-xs text-on-surface-variant font-mono truncate">{device.ha_entity_id}</p>
      <div>
        <label className="text-xs text-on-surface-variant">{t("monitoring.ha.name")}</label>
        <input
          className="input-field text-sm w-full mt-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <label className="text-xs text-on-surface-variant">{t("monitoring.ha.type")}</label>
        <input
          className="input-field text-sm w-full mt-1"
          value={deviceType}
          onChange={(e) => setDeviceType(e.target.value)}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
        {t("monitoring.ha.activeLabel")}
      </label>
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg text-sm bg-primary-fixed text-primary font-medium"
          onClick={() =>
            onPatch(device.id, { name: name.trim(), device_type: deviceType.trim(), is_active: active })
          }
        >
          {t("monitoring.ha.save")}
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg text-sm text-error border border-error/30 inline-flex items-center gap-1"
          onClick={() => void onDelete(device.id)}
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t("monitoring.ha.delete")}
        </button>
      </div>
    </li>
  );
}
