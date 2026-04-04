"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@/hooks/useQuery";
import { api, ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import type { Device, Facility, Floor } from "@/lib/types";
import FloorplanCanvas from "@/components/floorplan/FloorplanCanvas";
import {
  normalizeFloorplanRooms,
  type FloorplanLayoutResponse,
  type FloorplanRoomShape,
} from "@/lib/floorplanLayout";
import {
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
    x: 12,
    y: 12,
    w: 28,
    h: 32,
    device_id: null,
    power_kw: null,
  };
}

export default function FloorplansPanel({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const {
    data: facilities,
    isLoading: loadingFac,
    refetch: refetchFacilities,
  } = useQuery<Facility[]>("/facilities");
  const [facilityId, setFacilityId] = useState<number | "">("");
  const [floorId, setFloorId] = useState<number | "">("");

  const floorsEndpoint =
    facilityId === "" ? null : `/facilities/${facilityId}/floors`;
  const {
    data: floors,
    isLoading: loadingFloors,
    refetch: refetchFloors,
  } = useQuery<Floor[]>(floorsEndpoint);

  const layoutEndpoint = useMemo(() => {
    if (facilityId === "" || floorId === "") return null;
    return `/future/floorplans/layout?facility_id=${facilityId}&floor_id=${floorId}`;
  }, [facilityId, floorId]);

  const { data: layoutRes, isLoading: loadingLayout, refetch } =
    useQuery<FloorplanLayoutResponse>(layoutEndpoint);

  const { data: devices } = useQuery<Device[]>("/devices");

  const [rooms, setRooms] = useState<FloorplanRoomShape[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [showNewFacility, setShowNewFacility] = useState(false);
  const [newFacilityName, setNewFacilityName] = useState("");
  const [newFacilityAddress, setNewFacilityAddress] = useState("");
  const [creatingFacility, setCreatingFacility] = useState(false);

  const [showNewFloor, setShowNewFloor] = useState(false);
  const [newFloorNumber, setNewFloorNumber] = useState(1);
  const [newFloorName, setNewFloorName] = useState("");
  const [creatingFloor, setCreatingFloor] = useState(false);

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

  useEffect(() => {
    if (!layoutRes) return;
    setRooms(normalizeFloorplanRooms(layoutRes.layout_json));
    setSelectedId(null);
  }, [layoutRes, facilityId, floorId]);

  useEffect(() => {
    setFloorId("");
    setShowNewFloor(false);
  }, [facilityId]);

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
    if (facilityId === "" || floorId === "") return;
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

  return (
    <div className="space-y-6 animate-fade-in">
      {!embedded && (
        <div>
          <h2 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <MapPin className="w-7 h-7 text-primary" />
            {t("floorplan.title")}
          </h2>
          <p className="text-sm text-on-surface-variant mt-1">
            {t("floorplan.subtitle")}
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-outline-variant/25 bg-surface-container-low/60 shadow-sm overflow-hidden">
        <div className="relative px-5 py-4 border-b border-outline-variant/20 bg-gradient-to-r from-primary/12 via-primary/5 to-transparent">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-on-surface tracking-tight">
                {t("floorplan.scopeTitle")}
              </h3>
              <p className="text-xs text-on-surface-variant mt-0.5 max-w-xl">
                {t("floorplan.scopeHint")}
              </p>
            </div>
            {facilityId !== "" && floorId !== "" && (
              <div className="flex items-center gap-1.5 text-xs text-on-surface-variant bg-surface/80 px-3 py-1.5 rounded-full border border-outline-variant/20">
                <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="truncate max-w-[140px]">{selectedFacilityName}</span>
                <ChevronRight className="w-3.5 h-3.5 opacity-60 shrink-0" />
                <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="truncate max-w-[140px]">{selectedFloorLabel}</span>
              </div>
            )}
          </div>
        </div>

        <div className="p-5 grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-on-surface flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                {t("floorplan.building")}
              </label>
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
                  <p className="text-xs font-semibold text-on-surface">
                    {t("floorplan.newBuilding")}
                  </p>
                  <button
                    type="button"
                    className="p-1 rounded-lg hover:bg-surface-container-low text-on-surface-variant"
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
              <label className="text-xs font-semibold uppercase tracking-wide text-on-surface flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                {t("floorplan.floor")}
              </label>
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
                  <p className="text-xs font-semibold text-on-surface">
                    {t("floorplan.newFloor")}
                  </p>
                  <button
                    type="button"
                    className="p-1 rounded-lg hover:bg-surface-container-low text-on-surface-variant"
                    aria-label={t("floorplan.cancel")}
                    onClick={() => setShowNewFloor(false)}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="max-w-[140px]">
                    <label className="text-[11px] text-on-surface-variant block mb-1">
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
                    <label className="text-[11px] text-on-surface-variant block mb-1">
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

        <div className="px-5 py-4 border-t border-outline-variant/20 bg-surface-container-low/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs font-medium text-on-surface-variant">
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
            {loadingLayout ? (
              <div className="h-80 flex items-center justify-center surface-card">
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
            <p className="text-sm font-semibold text-on-surface">
              {t("floorplan.roomProps")}
            </p>
            {!selected ? (
              <p className="text-sm text-on-surface-variant">
                {t("floorplan.selectRoom")}
              </p>
            ) : (
              <>
                <div>
                  <label className="text-xs text-on-surface-variant">
                    {t("floorplan.label")}
                  </label>
                  <input
                    className="input-field mt-1 text-sm"
                    value={selected.label}
                    onChange={(e) => updateSelected({ label: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-on-surface-variant">
                    {t("floorplan.nodeDevice")}
                  </label>
                  <select
                    className="input-field mt-1 text-sm"
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
                  <label className="text-xs text-on-surface-variant">
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
