"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { getQueryPollingMs, getQueryStaleTimeMs } from "@/lib/queryEndpointDefaults";
import { refetchOrThrow } from "@/lib/refetchOrThrow";
import { useTranslation } from "@/lib/i18n";
import type { Device, Facility, Floor, HardwareType, Room } from "@/lib/types";
import { DEVICE_HARDWARE_TABS } from "@/lib/deviceHardwareTabs";
import FloorplanCanvas from "@/components/floorplan/FloorplanCanvas";
import SearchableListboxPicker from "@/components/shared/SearchableListboxPicker";
import {
  bootstrapRoomsFromDbFloor,
  canvasUnitsToPercent,
  FLOORPLAN_LAYOUT_VERSION,
  normalizeFloorplanRooms,
  type FloorplanLayoutResponse,
  type FloorplanRoomShape,
} from "@/lib/floorplanLayout";
import {
  Pencil,
  Building2,
  ChevronRight,
  Layers,
  MapPin,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";

function newRoom(): FloorplanRoomShape {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `r-${Date.now()}`;
  return {
    id,
    label: "Room",
    x: 150,
    y: 150,
    w: 300,
    h: 300,
    device_id: null,
    node_device_id: null,
    power_kw: null,
  };
}

export type FloorplansPanelExternalScope = {
  facilityId: number;
  floorId: number;
};

export default function FloorplansPanel({
  embedded = false,
  externalScope = null,
}: {
  embedded?: boolean;
  /** Parent-selected facility/floor (e.g. Facility management tabs). Hides duplicate building/floor pickers. */
  externalScope?: FloorplansPanelExternalScope | null;
}) {
  const { t } = useTranslation();
  const {
    data: facilities,
    isLoading: loadingFac,
    refetch: refetchFacilitiesBase,
  } = useQuery({
    queryKey: ["admin", "floorplans-panel", "facilities"],
    queryFn: () => api.get<Facility[]>("/facilities"),
    staleTime: getQueryStaleTimeMs("/facilities"),
    refetchInterval: getQueryPollingMs("/facilities"),
    retry: 3,
  });
  const [facilityId, setFacilityId] = useState<number | "">("");
  const [floorId, setFloorId] = useState<number | "">("");

  const floorsEndpoint =
    facilityId === "" ? null : `/facilities/${facilityId}/floors`;
  const {
    data: floors,
    isLoading: loadingFloors,
    refetch: refetchFloorsBase,
  } = useQuery({
    queryKey: ["admin", "floorplans-panel", "floors", floorsEndpoint],
    queryFn: () => api.get<Floor[]>(floorsEndpoint!),
    enabled: Boolean(floorsEndpoint),
    staleTime: floorsEndpoint ? getQueryStaleTimeMs(floorsEndpoint) : 0,
    refetchInterval: floorsEndpoint ? getQueryPollingMs(floorsEndpoint) : false,
    retry: 3,
  });

  const layoutEndpoint = useMemo(() => {
    if (facilityId === "" || floorId === "") return null;
    return `/floorplans/layout?facility_id=${facilityId}&floor_id=${floorId}`;
  }, [facilityId, floorId]);

  const {
    data: layoutRes,
    isLoading: loadingLayout,
    error: layoutError,
    refetch: refetchLayoutBase,
  } = useQuery({
    queryKey: ["admin", "floorplans-panel", "layout", layoutEndpoint],
    queryFn: () => api.get<FloorplanLayoutResponse>(layoutEndpoint!),
    enabled: Boolean(layoutEndpoint),
    staleTime: layoutEndpoint ? getQueryStaleTimeMs(layoutEndpoint) : 0,
    refetchInterval: layoutEndpoint ? getQueryPollingMs(layoutEndpoint) : false,
    retry: 3,
  });

  const floorRoomsEndpoint =
    facilityId === "" || floorId === "" ? null : `/rooms?floor_id=${floorId}`;
  const { data: floorRooms, isLoading: loadingFloorRooms } = useQuery({
    queryKey: ["admin", "floorplans-panel", "floor-rooms", floorRoomsEndpoint],
    queryFn: () => api.get<Room[]>(floorRoomsEndpoint!),
    enabled: Boolean(floorRoomsEndpoint),
    staleTime: floorRoomsEndpoint ? getQueryStaleTimeMs(floorRoomsEndpoint) : 0,
    refetchInterval: floorRoomsEndpoint ? getQueryPollingMs(floorRoomsEndpoint) : false,
    retry: 3,
  });

  const { data: devices } = useQuery({
    queryKey: ["admin", "floorplans-panel", "devices"],
    queryFn: () => api.get<Device[]>("/devices"),
    staleTime: getQueryStaleTimeMs("/devices"),
    refetchInterval: getQueryPollingMs("/devices"),
    retry: 3,
  });

  const refetchFacilities = useCallback(() => refetchOrThrow(refetchFacilitiesBase), [refetchFacilitiesBase]);
  const refetchFloors = useCallback(() => refetchOrThrow(refetchFloorsBase), [refetchFloorsBase]);
  const refetch = useCallback(() => refetchOrThrow(refetchLayoutBase), [refetchLayoutBase]);

  const [rooms, setRooms] = useState<FloorplanRoomShape[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [nodeHardwareTab, setNodeHardwareTab] = useState<HardwareType | "all">("node");
  const [nodeDeviceSearch, setNodeDeviceSearch] = useState("");

  const [showNewFacility, setShowNewFacility] = useState(false);
  const [newFacilityName, setNewFacilityName] = useState("");
  const [newFacilityAddress, setNewFacilityAddress] = useState("");
  const [creatingFacility, setCreatingFacility] = useState(false);

  const [showNewFloor, setShowNewFloor] = useState(false);
  const [newFloorNumber, setNewFloorNumber] = useState(1);
  const [newFloorName, setNewFloorName] = useState("");
  const [creatingFloor, setCreatingFloor] = useState(false);

  const isExternalScope =
    externalScope != null &&
    Number.isFinite(externalScope.facilityId) &&
    Number.isFinite(externalScope.floorId);

  useEffect(() => {
    if (!isExternalScope || !externalScope) return;
    setFacilityId(externalScope.facilityId);
    setFloorId(externalScope.floorId);
  }, [isExternalScope, externalScope]);

  const nextFloorNumber = useMemo(() => {
    if (!floors?.length) return 1;
    return Math.max(...floors.map((f) => f.floor_number)) + 1;
  }, [floors]);

  const selectedFacilityName = useMemo(
    () => (facilities ?? []).find((f) => f.id === facilityId)?.name ?? "",
    [facilities, facilityId],
  );
  const selectedFloorLabel = useMemo(() => {
    const fl = (floors ?? []).find((f) => f.id === floorId);
    if (!fl) return "";
    return fl.name?.trim() ? fl.name : `Floor ${fl.floor_number}`;
  }, [floors, floorId]);

  const roomsFromLayout = useMemo(
    () => normalizeFloorplanRooms(layoutRes?.layout_json),
    [layoutRes],
  );

  const canvasLoading =
    loadingLayout ||
    (roomsFromLayout.length === 0 && loadingFloorRooms);

  useEffect(() => {
    if (facilityId === "" || floorId === "") return;
    if (!layoutRes) {
      setRooms([]);
      setSelectedId(null);
      return;
    }
    const fromLayout = normalizeFloorplanRooms(layoutRes.layout_json);
    if (fromLayout.length > 0) {
      setRooms(fromLayout);
      setSelectedId(null);
      return;
    }
    if (floorRooms == null) {
      return;
    }
    if (floorRooms.length > 0) {
      setRooms(bootstrapRoomsFromDbFloor(floorRooms));
    } else {
      setRooms([]);
    }
    setSelectedId(null);
  }, [layoutRes, facilityId, floorId, floorRooms]);

  useEffect(() => {
    if (isExternalScope) return;
    if (facilityId !== "" || !facilities?.length) return;
    setFacilityId(facilities[0].id);
  }, [facilities, facilityId, isExternalScope]);

  useEffect(() => {
    if (isExternalScope) return;
    setFloorId("");
    setShowNewFloor(false);
  }, [facilityId, isExternalScope]);

  useEffect(() => {
    if (isExternalScope) return;
    if (floorId !== "" || !floors?.length) return;
    setFloorId(floors[0].id);
  }, [floors, floorId, isExternalScope]);

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
        id: d.device_id,
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
    selected?.node_device_id
      ? devicesList.find((d) => d.device_id === selected.node_device_id) ?? null
      : null;

  useEffect(() => {
    setNodeDeviceSearch("");
  }, [selectedId]);

  useEffect(() => {
    if (!devicesList.length) return;
    setRooms((prev) =>
      prev.map((room) => {
        if (room.node_device_id || room.device_id == null) return room;
        const linked = devicesList.find((device) => device.id === room.device_id);
        if (!linked) return room;
        return { ...room, node_device_id: linked.device_id };
      }),
    );
  }, [devicesList]);

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
    if (facilityId === "" || floorId === "") return;
    setSaving(true);
    setMessage(null);
    try {
      await api.put<FloorplanLayoutResponse>("/floorplans/layout", {
        facility_id: facilityId,
        floor_id: floorId,
        version: FLOORPLAN_LAYOUT_VERSION,
        rooms: rooms.map((r) => ({
          id: r.id,
          label: r.label,
          x: canvasUnitsToPercent(r.x),
          y: canvasUnitsToPercent(r.y),
          w: canvasUnitsToPercent(r.w),
          h: canvasUnitsToPercent(r.h),
          device_id: r.device_id,
          power_kw: r.power_kw,
        })),
      });
      setMessage(t("floorplan.saved"));
      await refetch();
    } catch {
      setMessage(t("floorplan.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateFacility() {
    const name = newFacilityName.trim();
    if (!name) return;
    setCreatingFacility(true);
    setMessage(null);
    try {
      const created = await api.post<Facility>("/facilities", {
        name,
        address: newFacilityAddress.trim(),
        description: "",
        config: {},
      });
      await refetchFacilities();
      setFacilityId(created.id);
      setShowNewFacility(false);
      setNewFacilityName("");
      setNewFacilityAddress("");
      setMessage(t("floorplan.buildingCreated"));
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : t("floorplan.createFacilityFailed");
      setMessage(msg);
    } finally {
      setCreatingFacility(false);
    }
  }

  function openNewFloorPanel() {
    setNewFloorNumber(nextFloorNumber);
    setNewFloorName("");
    setShowNewFloor(true);
  }

  async function handleCreateFloor() {
    if (facilityId === "") return;
    const n = Number(newFloorNumber);
    if (!Number.isFinite(n) || n < 0) return;
    setCreatingFloor(true);
    setMessage(null);
    try {
      const created = await api.post<Floor>(
        `/facilities/${facilityId}/floors`,
        {
          facility_id: facilityId,
          floor_number: Math.floor(n),
          name: newFloorName.trim(),
          map_data: {},
        },
      );
      await refetchFloors();
      setFloorId(created.id);
      setShowNewFloor(false);
      setMessage(t("floorplan.saved"));
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : t("floorplan.createFloorFailed");
      setMessage(msg);
    } finally {
      setCreatingFloor(false);
    }
  }

  async function handleRenameFacility() {
    if (facilityId === "") return;
    const nextName = window.prompt(
      t("floorplan.buildingName"),
      selectedFacilityName || "",
    )?.trim();
    if (!nextName) return;
    setMessage(null);
    try {
      await api.patch<Facility>(`/facilities/${facilityId}`, {
        name: nextName,
      });
      await refetchFacilities();
      setMessage(t("floorplan.saved"));
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : t("floorplan.saveFailed"));
    }
  }

  async function handleDeleteFacility() {
    if (facilityId === "") return;
    if (!window.confirm("Delete selected building and all its floors/layouts?")) return;
    setMessage(null);
    try {
      await api.delete<void>(`/facilities/${facilityId}`);
      await refetchFacilities();
      setFacilityId("");
      setFloorId("");
      setRooms([]);
      setSelectedId(null);
      setMessage(t("floorplan.saved"));
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : t("floorplan.saveFailed"));
    }
  }

  async function handleRenameFloor() {
    if (facilityId === "" || floorId === "") return;
    const current = (floors ?? []).find((f) => f.id === floorId);
    const nextName = window.prompt(
      t("floorplan.floorDisplayName"),
      current?.name ?? "",
    )?.trim();
    if (!nextName) return;
    setMessage(null);
    try {
      await api.patch<Floor>(`/facilities/${facilityId}/floors/${floorId}`, {
        name: nextName,
      });
      await refetchFloors();
      setMessage(t("floorplan.saved"));
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : t("floorplan.saveFailed"));
    }
  }

  async function handleDeleteFloor() {
    if (facilityId === "" || floorId === "") return;
    if (!window.confirm("Delete selected floor?")) return;
    setMessage(null);
    try {
      await api.delete<void>(`/facilities/${facilityId}/floors/${floorId}`);
      await refetchFloors();
      setFloorId("");
      setRooms([]);
      setSelectedId(null);
      setMessage(t("floorplan.saved"));
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : t("floorplan.saveFailed"));
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {!embedded && (
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <MapPin className="w-7 h-7 text-primary" />
            {t("floorplan.title")}
          </h2>
          <p className="text-sm text-foreground-variant mt-1">
            {t("floorplan.subtitle")}
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-outline-variant/25 bg-surface-container-low/60 shadow-sm overflow-hidden">
        <div className="relative px-5 py-4 border-b border-outline-variant/20 bg-gradient-to-r from-primary/12 via-primary/5 to-transparent">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground tracking-tight">
                {t("floorplan.scopeTitle")}
              </h3>
              <p className="text-xs text-foreground-variant mt-0.5 max-w-xl">
                {t("floorplan.scopeHint")}
              </p>
            </div>
            {facilityId !== "" && floorId !== "" && (
              <div className="flex items-center gap-1.5 text-xs text-foreground-variant bg-surface/80 px-3 py-1.5 rounded-full border border-outline-variant/20">
                <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="truncate max-w-[140px]">{selectedFacilityName}</span>
                <ChevronRight className="w-3.5 h-3.5 opacity-60 shrink-0" />
                <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="truncate max-w-[140px]">{selectedFloorLabel}</span>
              </div>
            )}
          </div>
        </div>

        {isExternalScope ? (
          <div className="px-5 pb-4">
            <p className="text-xs text-foreground-variant">{t("floorplan.externalScopeHint")}</p>
          </div>
        ) : (
        <div className="p-5 grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-foreground flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                {t("floorplan.building")}
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1 disabled:opacity-40 disabled:pointer-events-none"
                  disabled={facilityId === ""}
                  onClick={() => void handleRenameFacility()}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
                <button
                  type="button"
                  className="text-xs font-medium text-error hover:underline inline-flex items-center gap-1 disabled:opacity-40 disabled:pointer-events-none"
                  disabled={facilityId === ""}
                  onClick={() => void handleDeleteFacility()}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
                  onClick={() => {
                    setShowNewFacility((v) => !v);
                    setShowNewFloor(false);
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t("floorplan.newBuilding")}
                </button>
              </div>
            </div>
            <select
              className="input-field text-sm w-full"
              value={facilityId === "" ? "" : String(facilityId)}
              onChange={(e) => {
                const v = e.target.value;
                setFacilityId(v === "" ? "" : Number(v));
              }}
              disabled={loadingFac}
            >
              <option value="">{t("floorplan.selectBuilding")}</option>
              {(facilities ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>

            {showNewFacility && (
              <div className="rounded-xl border border-primary/35 bg-surface-container-high/80 p-4 space-y-3 shadow-inner">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground">
                    {t("floorplan.newBuilding")}
                  </p>
                  <button
                    type="button"
                    className="p-1 rounded-lg hover:bg-surface-container-low text-foreground-variant"
                    aria-label={t("floorplan.cancel")}
                    onClick={() => {
                      setShowNewFacility(false);
                      setNewFacilityName("");
                      setNewFacilityAddress("");
                    }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <input
                  className="input-field text-sm w-full"
                  placeholder={t("floorplan.buildingName")}
                  value={newFacilityName}
                  onChange={(e) => setNewFacilityName(e.target.value)}
                />
                <input
                  className="input-field text-sm w-full"
                  placeholder={t("floorplan.addressOptional")}
                  value={newFacilityAddress}
                  onChange={(e) => setNewFacilityAddress(e.target.value)}
                />
                <button
                  type="button"
                  className="w-full gradient-cta py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                  disabled={creatingFacility || !newFacilityName.trim()}
                  onClick={() => void handleCreateFacility()}
                >
                  {creatingFacility ? "…" : t("floorplan.createBuilding")}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-foreground flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                {t("floorplan.floor")}
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1 disabled:opacity-40 disabled:pointer-events-none"
                  disabled={facilityId === "" || floorId === ""}
                  onClick={() => void handleRenameFloor()}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
                <button
                  type="button"
                  className="text-xs font-medium text-error hover:underline inline-flex items-center gap-1 disabled:opacity-40 disabled:pointer-events-none"
                  disabled={facilityId === "" || floorId === ""}
                  onClick={() => void handleDeleteFloor()}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1 disabled:opacity-40 disabled:pointer-events-none"
                  disabled={facilityId === ""}
                  onClick={() => {
                    openNewFloorPanel();
                    setShowNewFacility(false);
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t("floorplan.newFloor")}
                </button>
              </div>
            </div>
            <select
              className="input-field text-sm w-full"
              value={floorId === "" ? "" : String(floorId)}
              onChange={(e) => {
                const v = e.target.value;
                setFloorId(v === "" ? "" : Number(v));
              }}
              disabled={facilityId === "" || loadingFloors}
            >
              <option value="">
                {facilityId === ""
                  ? t("floorplan.selectBuildingFirst")
                  : t("floorplan.selectFloor")}
              </option>
              {(floors ?? []).map((fl) => (
                <option key={fl.id} value={fl.id}>
                  {fl.name?.trim()
                    ? `${fl.name} (#${fl.floor_number})`
                    : `Floor ${fl.floor_number}`}
                </option>
              ))}
            </select>

            {showNewFloor && facilityId !== "" && (
              <div className="rounded-xl border border-primary/35 bg-surface-container-high/80 p-4 space-y-3 shadow-inner">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground">
                    {t("floorplan.newFloor")}
                  </p>
                  <button
                    type="button"
                    className="p-1 rounded-lg hover:bg-surface-container-low text-foreground-variant"
                    aria-label={t("floorplan.cancel")}
                    onClick={() => setShowNewFloor(false)}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="max-w-[140px]">
                    <label className="text-[11px] text-foreground-variant block mb-1">
                      {t("floorplan.floorNumberLabel")}
                    </label>
                    <input
                      type="number"
                      min={0}
                      className="input-field text-sm w-full"
                      value={newFloorNumber}
                      onChange={(e) =>
                        setNewFloorNumber(Number(e.target.value) || 0)
                      }
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-foreground-variant block mb-1">
                      {t("floorplan.floorDisplayName")}
                    </label>
                    <input
                      className="input-field text-sm w-full"
                      placeholder={t("floorplan.floorDisplayNamePh")}
                      value={newFloorName}
                      onChange={(e) => setNewFloorName(e.target.value)}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="w-full gradient-cta py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                  disabled={creatingFloor}
                  onClick={() => void handleCreateFloor()}
                >
                  {creatingFloor ? "…" : t("floorplan.createFloor")}
                </button>
              </div>
            )}
          </div>
        </div>
        )}

        <div className="px-5 py-4 border-t border-outline-variant/20 bg-surface-container-low/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs font-medium text-foreground-variant">
            {t("floorplan.actions")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="gradient-cta px-4 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
              disabled={facilityId === "" || floorId === "" || saving}
              onClick={() => {
                void onSave();
              }}
            >
              <Save className="w-4 h-4" />
              {saving ? "…" : t("floorplan.save")}
            </button>
            <button
              type="button"
              className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-outline-variant/30 bg-surface-container-low hover:bg-surface-container-high inline-flex items-center gap-2 disabled:opacity-50 transition-colors"
              disabled={facilityId === "" || floorId === ""}
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
        </div>
      </div>

      {message && (
        <p
          className={`text-sm ${
            [
              t("floorplan.saved"),
              t("floorplan.buildingCreated"),
              t("floorplan.floorCreated"),
            ].includes(message)
              ? "text-primary"
              : "text-error"
          }`}
        >
          {message}
        </p>
      )}

      {facilityId !== "" && floorId !== "" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="space-y-2">
            <p className="text-xs font-medium text-outline uppercase tracking-wide">
              {t("floorplan.canvas")}
            </p>
            {canvasLoading ? (
              <div className="h-80 flex items-center justify-center surface-card">
                <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : layoutError ? (
              <div className="h-80 surface-card p-4 flex flex-col justify-center gap-3">
                <p className="text-sm text-error">{t("floorplan.layoutError")}</p>
                <button
                  type="button"
                  className="px-3 py-2 text-sm rounded-lg border border-outline-variant/30 bg-surface-container-low w-fit"
                  onClick={() => void refetch()}
                >
                  Retry
                </button>
              </div>
            ) : rooms.length === 0 ? (
              <div className="min-h-[280px] flex items-center justify-center surface-card px-4">
                <p className="text-sm text-foreground-variant text-center">
                  {t("floorplan.emptyLayout")}
                </p>
              </div>
            ) : (
              <FloorplanCanvas
                fitContentOnMount
                rooms={rooms}
                onRoomsChange={setRooms}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            )}
            <p className="text-xs text-foreground-variant">{t("floorplan.hint")}</p>
          </div>

          <div className="surface-card p-4 space-y-3 h-fit">
            <p className="text-sm font-semibold text-foreground">
              {t("floorplan.roomProps")}
            </p>
            {!selected ? (
              <p className="text-sm text-foreground-variant">
                {t("floorplan.selectRoom")}
              </p>
            ) : (
              <>
                <div>
                  <label className="text-xs text-foreground-variant">
                    {t("floorplan.label")}
                  </label>
                  <input
                    className="input-field mt-1 text-sm"
                    value={selected.label}
                    onChange={(e) => updateSelected({ label: e.target.value })}
                  />
                </div>
                <div className="space-y-3">
                  <p className="text-xs text-foreground-variant">{t("floorplan.nodeDeviceLinkHint")}</p>
                  <div>
                    <p className="mb-2 text-xs font-medium text-foreground-variant">
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
                                : "border-outline-variant/30 text-foreground hover:bg-surface-container-high"
                            }`}
                          >
                            {t(tab.labelKey)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium text-foreground-variant">
                      {t("floorplan.deviceSearchStep")}
                    </p>
                    <SearchableListboxPicker
                      inputId={`floorplans-panel-node-combobox-${selected.id}`}
                      listboxId={`floorplans-panel-node-listbox-${selected.id}`}
                      options={nodeDeviceOptions}
                      search={nodeDeviceSearch}
                      onSearchChange={setNodeDeviceSearch}
                      searchPlaceholder={t("floorplan.searchNodeDevice")}
                      selectedOptionId={
                        selected.node_device_id || null
                      }
                      onSelectOption={(id) => {
                        const linked =
                          devicesList.find((device) => device.device_id === id) ?? null;
                        updateSelected({
                          node_device_id: id,
                          device_id: linked?.id ?? null,
                        });
                      }}
                      disabled={nodeEmptyPool}
                      listboxAriaLabel={t("floorplan.selectNodeDevice")}
                      noMatchMessage={t("floorplan.noNodeDeviceMatches")}
                      emptyStateMessage={
                        nodeEmptyPool ? t("floorplan.noDevicesInCategory") : null
                      }
                      emptyNoMatch={nodeEmptyNoMatch}
                    />
                  </div>
                  {selected.node_device_id ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-foreground">
                      <span className="truncate font-medium">
                        {t("patients.deviceSelected")}:{" "}
                        {selectedNodeDevice
                          ? selectedNodeDevice.display_name || selectedNodeDevice.device_id
                          : selected.node_device_id}
                      </span>
                      <button
                        type="button"
                        className="ml-auto shrink-0 font-semibold text-primary hover:underline"
                        onClick={() => updateSelected({ node_device_id: null, device_id: null })}
                      >
                        {t("floorplan.noNode")}
                      </button>
                    </div>
                  ) : null}
                </div>
                <div>
                  <label className="text-xs text-foreground-variant">
                    {t("floorplan.powerKw")}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    className="input-field mt-1 text-sm"
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
      )}
    </div>
  );
}
