"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@/hooks/useQuery";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { withWorkspaceScope } from "@/lib/workspaceQuery";
import type { Device, Room } from "@/lib/types";
import FloorplanCanvas from "@/components/floorplan/FloorplanCanvas";
import {
  bootstrapRoomsFromDbFloor,
  normalizeFloorplanRooms,
  type FloorplanLayoutResponse,
  type FloorplanRoomShape,
} from "@/lib/floorplanLayout";
import { floorplanRoomIdToNumeric } from "@/lib/monitoringWorkspace";
import { Plus, Save, Trash2 } from "lucide-react";

function newRoom(): FloorplanRoomShape {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `r-${Date.now()}`;
  return {
    id,
    label: "Room",
    x: 12,
    y: 12,
    w: 28,
    h: 32,
    device_id: null,
    power_kw: null,
  };
}

export interface FloorMapWorkspaceProps {
  facilityId: number;
  floorId: number;
  onRoomSelect?: (roomId: number | null) => void;
}

export default function FloorMapWorkspace({
  facilityId,
  floorId,
  onRoomSelect,
}: FloorMapWorkspaceProps) {
  const { t } = useTranslation();
  const { user } = useAuth();

  const layoutEndpoint = useMemo(
    () =>
      withWorkspaceScope(
        `/future/floorplans/layout?facility_id=${facilityId}&floor_id=${floorId}`,
        user?.workspace_id,
      ),
    [facilityId, floorId, user?.workspace_id],
  );

  const {
    data: layoutRes,
    isLoading: loadingLayout,
    error: layoutError,
    refetch,
  } = useQuery<FloorplanLayoutResponse>(layoutEndpoint);

  const floorRoomsEndpoint = useMemo(
    () => withWorkspaceScope(`/rooms?floor_id=${floorId}`, user?.workspace_id),
    [floorId, user?.workspace_id],
  );
  const { data: floorRooms, isLoading: loadingFloorRooms } = useQuery<Room[]>(floorRoomsEndpoint);

  const devicesEndpoint = useMemo(
    () => withWorkspaceScope("/devices", user?.workspace_id),
    [user?.workspace_id],
  );
  const { data: devices } = useQuery<Device[]>(devicesEndpoint);

  const [rooms, setRooms] = useState<FloorplanRoomShape[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  /** True when canvas was filled from /rooms because saved layout JSON was empty */
  const [fromDbBootstrap, setFromDbBootstrap] = useState(false);

  const geometryLoading =
    !!layoutRes &&
    !layoutError &&
    normalizeFloorplanRooms(layoutRes.layout_json).length === 0 &&
    loadingFloorRooms;

  useEffect(() => {
    if (!layoutRes) return;

    const fromLayout = normalizeFloorplanRooms(layoutRes.layout_json);
    if (fromLayout.length > 0) {
      setRooms(fromLayout);
      setFromDbBootstrap(false);
      setSelectedId(null);
      return;
    }

    if (loadingFloorRooms) return;

    const list = floorRooms ?? [];
    if (list.length > 0) {
      setRooms(bootstrapRoomsFromDbFloor(list));
      setFromDbBootstrap(true);
    } else {
      setRooms([]);
      setFromDbBootstrap(false);
    }
    setSelectedId(null);
  }, [layoutRes, floorRooms, loadingFloorRooms, facilityId, floorId]);

  useEffect(() => {
    if (!onRoomSelect) return;
    if (!selectedId) {
      onRoomSelect(null);
      return;
    }
    const n = floorplanRoomIdToNumeric(selectedId);
    onRoomSelect(n);
  }, [selectedId, onRoomSelect]);

  const selected = rooms.find((r) => r.id === selectedId) ?? null;

  const updateSelected = useCallback(
    (patch: Partial<FloorplanRoomShape>) => {
      if (!selectedId) return;
      setRooms((prev) =>
        prev.map((r) => (r.id === selectedId ? { ...r, ...patch } : r)),
      );
    },
    [selectedId],
  );

  async function onSave() {
    setSaving(true);
    setMessage(null);
    try {
      await api.put<FloorplanLayoutResponse>("/future/floorplans/layout", {
        facility_id: facilityId,
        floor_id: floorId,
        version: 1,
        rooms: rooms.map((r) => ({
          id: r.id,
          label: r.label,
          x: r.x,
          y: r.y,
          w: r.w,
          h: r.h,
          device_id: r.device_id,
          power_kw: r.power_kw,
        })),
      });
      setMessage(t("floorplan.saved"));
      await refetch();
      setFromDbBootstrap(false);
    } catch {
      setMessage(t("floorplan.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-variant">{t("monitoring.flow.mapHint")}</p>

      <div className="flex flex-wrap items-center gap-2 border border-outline-variant/25 rounded-xl p-3 bg-surface-container-low/40">
        <button
          type="button"
          className="gradient-cta px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
          disabled={saving}
          onClick={() => void onSave()}
        >
          <Save className="w-4 h-4" />
          {saving ? "…" : t("floorplan.save")}
        </button>
        <button
          type="button"
          className="px-4 py-2 rounded-xl text-sm font-semibold border border-outline-variant/30 bg-surface-container-low hover:bg-surface-container-high inline-flex items-center gap-2"
          onClick={() => {
            const r = newRoom();
            setRooms((prev) => [...prev, r]);
            setSelectedId(r.id);
          }}
        >
          <Plus className="w-4 h-4" />
          {t("floorplan.addRoom")}
        </button>
      </div>

      {message && (
        <p
          className={`text-sm ${
            message === t("floorplan.saved") ? "text-primary" : "text-error"
          }`}
        >
          {message}
        </p>
      )}

      {fromDbBootstrap && (
        <p className="text-xs text-primary font-medium">{t("floorplan.bootstrappedHint")}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-2">
          <p className="text-xs font-medium text-outline uppercase tracking-wide">
            {t("floorplan.canvas")}
          </p>
          {loadingLayout ? (
            <div className="min-h-[min(78vh,720px)] flex items-center justify-center surface-card rounded-xl border border-outline-variant/25">
              <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : layoutError ? (
            <div className="min-h-[min(78vh,720px)] surface-card p-4 flex flex-col justify-center gap-3 rounded-xl border border-outline-variant/25">
              <p className="text-sm text-error">{t("floorplan.layoutError")}</p>
              <button
                type="button"
                className="px-3 py-2 text-sm rounded-lg border border-outline-variant/30 bg-surface-container-low w-fit"
                onClick={() => void refetch()}
              >
                Retry
              </button>
            </div>
          ) : geometryLoading ? (
            <div className="min-h-[min(78vh,720px)] flex items-center justify-center surface-card rounded-xl border border-outline-variant/25">
              <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <FloorplanCanvas
              rooms={rooms}
              onRoomsChange={setRooms}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
          <p className="text-xs text-on-surface-variant">{t("floorplan.hint")}</p>
        </div>

        <div className="surface-card p-4 space-y-3 h-fit">
          <p className="text-sm font-semibold text-on-surface">{t("floorplan.roomProps")}</p>
          {!selected ? (
            <p className="text-sm text-on-surface-variant">{t("floorplan.selectRoom")}</p>
          ) : (
            <>
              <div>
                <label className="text-xs text-on-surface-variant">{t("floorplan.label")}</label>
                <input
                  className="input-field mt-1 text-sm w-full"
                  value={selected.label}
                  onChange={(e) => updateSelected({ label: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-on-surface-variant">{t("floorplan.nodeDevice")}</label>
                <select
                  className="input-field mt-1 text-sm w-full"
                  value={selected.device_id ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateSelected({
                      device_id: v === "" ? null : Number(v),
                    });
                  }}
                >
                  <option value="">{t("floorplan.noNode")}</option>
                  {(devices ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.device_id} ({d.device_type})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-on-surface-variant">{t("floorplan.powerKw")}</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  className="input-field mt-1 text-sm w-full"
                  value={selected.power_kw ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateSelected({
                      power_kw: v === "" ? null : Number(v),
                    });
                  }}
                />
              </div>
              <button
                type="button"
                className="w-full py-2 rounded-lg text-sm font-medium text-error border border-error/30 hover:bg-error/10 inline-flex items-center justify-center gap-2"
                onClick={() => {
                  setRooms((prev) => prev.filter((r) => r.id !== selectedId));
                  setSelectedId(null);
                }}
              >
                <Trash2 className="w-4 h-4" />
                {t("floorplan.removeRoom")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
