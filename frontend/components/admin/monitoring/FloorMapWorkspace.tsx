"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@/hooks/useQuery";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { withWorkspaceScope } from "@/lib/workspaceQuery";
import type { Device, HardwareType, Room } from "@/lib/types";
import { DEVICE_HARDWARE_TABS } from "@/lib/deviceHardwareTabs";
import SearchableListboxPicker from "@/components/shared/SearchableListboxPicker";
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
  initialRoomId?: number | null;
  onRoomSelect?: (roomId: number | null) => void;
}

export default function FloorMapWorkspace({
  facilityId,
  floorId,
  initialRoomId = null,
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
  const [nodeHardwareTab, setNodeHardwareTab] = useState<HardwareType | "all">("all");
  const [nodeDeviceSearch, setNodeDeviceSearch] = useState("");
  const appliedInitialRoomIdRef = useRef<number | null>(null);

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
      if (initialRoomId != null && appliedInitialRoomIdRef.current !== initialRoomId) return;
      onRoomSelect(null);
      return;
    }
    const n = floorplanRoomIdToNumeric(selectedId);
    onRoomSelect(n);
  }, [initialRoomId, selectedId, onRoomSelect]);

  useEffect(() => {
    if (initialRoomId == null) {
      appliedInitialRoomIdRef.current = null;
      return;
    }
    if (appliedInitialRoomIdRef.current === initialRoomId) return;
    const targetId = `room-${initialRoomId}`;
    if (rooms.some((room) => room.id === targetId)) {
      setSelectedId(targetId);
      appliedInitialRoomIdRef.current = initialRoomId;
    }
  }, [initialRoomId, rooms]);

  const selected = rooms.find((r) => r.id === selectedId) ?? null;

  const devicesList = useMemo(() => devices ?? [], [devices]);

  const devicesByHardwareTab = useMemo(() => {
    if (nodeHardwareTab === "all") return devicesList;
    return devicesList.filter(
      (d) => (d.hardware_type || "").toLowerCase() === nodeHardwareTab,
    );
  }, [devicesList, nodeHardwareTab]);

  const filteredNodeDevices = useMemo(() => {
    const q = nodeDeviceSearch.trim().toLowerCase();
    if (!q) return devicesByHardwareTab;
    return devicesByHardwareTab.filter((d) => {
      const label = (d.display_name || d.device_id).toLowerCase();
      const id = d.device_id.toLowerCase();
      const hw = (d.hardware_type || "").toLowerCase();
      const dt = (d.device_type || "").toLowerCase();
      return (
        label.includes(q) || id.includes(q) || hw.includes(q) || dt.includes(q)
      );
    });
  }, [devicesByHardwareTab, nodeDeviceSearch]);

  const nodeDeviceOptions = useMemo(
    () =>
      filteredNodeDevices.map((d) => ({
        id: String(d.id),
        title: d.display_name || d.device_id,
        subtitle: `${d.device_id}${d.hardware_type ? ` · ${d.hardware_type}` : ""}`,
      })),
    [filteredNodeDevices],
  );

  const nodeEmptyPool = devicesByHardwareTab.length === 0;
  const nodeEmptyNoMatch =
    devicesByHardwareTab.length > 0 &&
    filteredNodeDevices.length === 0 &&
    nodeDeviceSearch.trim().length > 0;

  const selectedNodeDevice =
    selected?.device_id != null
      ? devicesList.find((d) => d.id === selected.device_id) ?? null
      : null;

  useEffect(() => {
    setNodeDeviceSearch("");
  }, [selectedId]);

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
              <div className="space-y-3">
                <p className="text-xs text-on-surface-variant">{t("floorplan.nodeDeviceLinkHint")}</p>
                <div>
                  <p className="mb-2 text-xs font-medium text-on-surface-variant">
                    {t("floorplan.deviceCategoryStep")}
                  </p>
                  <div
                    className="flex flex-wrap gap-1.5"
                    role="tablist"
                    aria-label={t("floorplan.deviceCategoryStep")}
                  >
                    {DEVICE_HARDWARE_TABS.map((tab) => {
                      const active = nodeHardwareTab === tab.key;
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => {
                            setNodeHardwareTab(tab.key);
                            setNodeDeviceSearch("");
                          }}
                          className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-smooth ${
                            active
                              ? "border-primary bg-primary/15 text-primary"
                              : "border-outline-variant/30 text-on-surface hover:bg-surface-container-high"
                          }`}
                        >
                          {t(tab.labelKey)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-on-surface-variant">
                    {t("floorplan.deviceSearchStep")}
                  </p>
                  <SearchableListboxPicker
                    inputId={`floorplan-node-combobox-${selected.id}`}
                    listboxId={`floorplan-node-listbox-${selected.id}`}
                    options={nodeDeviceOptions}
                    search={nodeDeviceSearch}
                    onSearchChange={setNodeDeviceSearch}
                    searchPlaceholder={t("floorplan.searchNodeDevice")}
                    selectedOptionId={
                      selected.device_id != null ? String(selected.device_id) : null
                    }
                    onSelectOption={(id) => {
                      updateSelected({ device_id: Number(id) });
                    }}
                    disabled={nodeEmptyPool}
                    listboxAriaLabel={t("floorplan.selectNodeDevice")}
                    noMatchMessage={t("floorplan.noNodeDeviceMatches")}
                    emptyStateMessage={
                      nodeEmptyPool ? t("floorplan.noDevicesInCategory") : null
                    }
                    emptyNoMatch={nodeEmptyNoMatch}
                    listPresentation="portal"
                    listboxZIndex={60}
                  />
                </div>
                {selected.device_id != null ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-on-surface">
                    <span className="truncate font-medium">
                      {t("patients.deviceSelected")}:{" "}
                      {selectedNodeDevice
                        ? selectedNodeDevice.display_name || selectedNodeDevice.device_id
                        : `#${selected.device_id}`}
                    </span>
                    <button
                      type="button"
                      className="ml-auto shrink-0 font-semibold text-primary hover:underline"
                      onClick={() => updateSelected({ device_id: null })}
                    >
                      {t("floorplan.noNode")}
                    </button>
                  </div>
                ) : null}
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
