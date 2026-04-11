"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { getQueryPollingMs, getQueryStaleTimeMs } from "@/lib/queryEndpointDefaults";
import { refetchOrThrow } from "@/lib/refetchOrThrow";
import { useTranslation } from "@/lib/i18n";
import { withWorkspaceScope } from "@/lib/workspaceQuery";
import type { Device, Floor, HardwareType, Room } from "@/lib/types";
import type { ListPatientsResponse } from "@/lib/api/task-scope-types";
import { DEVICE_HARDWARE_TABS } from "@/lib/deviceHardwareTabs";
import SearchableListboxPicker from "@/components/shared/SearchableListboxPicker";
import FloorplanCanvas from "@/components/floorplan/FloorplanCanvas";
import {
  bootstrapRoomsFromDbFloor,
  canvasUnitsToPercent,
  FLOORPLAN_LAYOUT_VERSION,
  normalizeFloorplanRooms,
  type FloorplanLayoutResponse,
  type FloorplanRoomShape,
} from "@/lib/floorplanLayout";
import { floorplanRoomIdToNumeric } from "@/lib/monitoringWorkspace";
import { Plus, Save, Trash2, UserPlus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

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
    () => {
      if (facilityId <= 0 || floorId <= 0) return null;
      return withWorkspaceScope(
        `/floorplans/layout?facility_id=${facilityId}&floor_id=${floorId}`,
        user?.workspace_id,
      );
    },
    [facilityId, floorId, user?.workspace_id],
  );

  const floorsEndpoint = useMemo(
    () =>
      facilityId > 0
        ? withWorkspaceScope(`/facilities/${facilityId}/floors`, user?.workspace_id)
        : null,
    [facilityId, user?.workspace_id],
  );
  const { data: availableFloors } = useQuery({
    queryKey: ["admin", "monitoring", "floor-map", "floors", floorsEndpoint, facilityId],
    queryFn: () => api.get<Floor[]>(floorsEndpoint!),
    enabled: Boolean(floorsEndpoint),
    staleTime: floorsEndpoint ? getQueryStaleTimeMs(floorsEndpoint) : 0,
    refetchInterval: floorsEndpoint ? getQueryPollingMs(floorsEndpoint) : false,
    retry: 2,
  });
  const hasValidFloorSelection = useMemo(
    () => (availableFloors ?? []).some((floor) => floor.id === floorId),
    [availableFloors, floorId],
  );

  const {
    data: layoutRes,
    isLoading: loadingLayout,
    error: layoutError,
    refetch: refetchLayoutBase,
  } = useQuery({
    queryKey: ["admin", "monitoring", "floor-map", "layout", layoutEndpoint, facilityId, floorId],
    queryFn: () => api.get<FloorplanLayoutResponse>(layoutEndpoint!),
    enabled: Boolean(layoutEndpoint) && hasValidFloorSelection,
    staleTime: layoutEndpoint ? getQueryStaleTimeMs(layoutEndpoint) : 0,
    refetchInterval: layoutEndpoint ? getQueryPollingMs(layoutEndpoint) : false,
    retry: 3,
  });
  const refetch = useCallback(() => refetchOrThrow(refetchLayoutBase), [refetchLayoutBase]);

  const floorRoomsEndpoint = useMemo(
    () =>
      hasValidFloorSelection
        ? withWorkspaceScope(`/rooms?floor_id=${floorId}`, user?.workspace_id)
        : null,
    [floorId, hasValidFloorSelection, user?.workspace_id],
  );
  const { data: floorRooms, isLoading: loadingFloorRooms } = useQuery({
    queryKey: ["admin", "monitoring", "floor-map", "floor-rooms", floorRoomsEndpoint, floorId],
    queryFn: () => api.get<Room[]>(floorRoomsEndpoint!),
    enabled: Boolean(floorRoomsEndpoint),
    staleTime: floorRoomsEndpoint ? getQueryStaleTimeMs(floorRoomsEndpoint) : 0,
    refetchInterval: floorRoomsEndpoint ? getQueryPollingMs(floorRoomsEndpoint) : false,
    retry: 3,
  });

  const devicesEndpoint = useMemo(
    () => withWorkspaceScope("/devices", user?.workspace_id),
    [user?.workspace_id],
  );
  const { data: devices } = useQuery({
    queryKey: ["admin", "monitoring", "floor-map", "devices", devicesEndpoint],
    queryFn: () => api.get<Device[]>(devicesEndpoint!),
    enabled: Boolean(devicesEndpoint),
    staleTime: devicesEndpoint ? getQueryStaleTimeMs(devicesEndpoint) : 0,
    refetchInterval: devicesEndpoint ? getQueryPollingMs(devicesEndpoint) : false,
    retry: 3,
  });

  const [rooms, setRooms] = useState<FloorplanRoomShape[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  /** True when canvas was filled from /rooms because saved layout JSON was empty */
  const [fromDbBootstrap, setFromDbBootstrap] = useState(false);
  const [nodeHardwareTab, setNodeHardwareTab] = useState<HardwareType | "all">("node");
  const [nodeDeviceSearch, setNodeDeviceSearch] = useState("");
  const [assignmentMode, setAssignmentMode] = useState(false);
  const [patientAssignSearch, setPatientAssignSearch] = useState("");
  const [patientAssignPick, setPatientAssignPick] = useState<string | null>(null);
  const [assignBusy, setAssignBusy] = useState(false);
  const appliedInitialRoomIdRef = useRef<number | null>(null);

  const patientsAssignEndpoint = useMemo(
    () =>
      assignmentMode ? withWorkspaceScope("/patients?limit=1000", user?.workspace_id) : null,
    [assignmentMode, user?.workspace_id],
  );
  const { data: assignPatientsRaw, refetch: refetchAssignPatientsBase } = useQuery({
    queryKey: ["admin", "monitoring", "floor-map", "assign-patients", patientsAssignEndpoint],
    queryFn: () => api.get<ListPatientsResponse>(patientsAssignEndpoint!),
    enabled: Boolean(patientsAssignEndpoint),
    staleTime: patientsAssignEndpoint ? getQueryStaleTimeMs(patientsAssignEndpoint) : 0,
    refetchInterval: patientsAssignEndpoint ? getQueryPollingMs(patientsAssignEndpoint) : false,
    retry: 3,
  });
  const refetchAssignPatients = useCallback(
    () => refetchOrThrow(refetchAssignPatientsBase),
    [refetchAssignPatientsBase],
  );
  const assignPatients = useMemo(
    () => (assignPatientsRaw ?? []) as ListPatientsResponse,
    [assignPatientsRaw],
  );

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
    setPatientAssignSearch("");
    setPatientAssignPick(null);
  }, [selectedId, assignmentMode]);

  const assignPatientOptions = useMemo(() => {
    const q = patientAssignSearch.trim().toLowerCase();
    return assignPatients
      .filter((patient) => {
        if (!q) return true;
        const name = `${patient.first_name} ${patient.last_name}`.toLowerCase();
        return name.includes(q) || String(patient.id).includes(q);
      })
      .map((patient) => ({
        id: String(patient.id),
        title: `${patient.first_name} ${patient.last_name}`.trim() || `Patient #${patient.id}`,
        subtitle:
          patient.room_id != null
            ? `${t("patients.roomPrefix")} #${patient.room_id}`
            : t("patients.unassignedShort"),
      }));
  }, [assignPatients, patientAssignSearch, t]);

  const selectedNumericRoomId = selected ? floorplanRoomIdToNumeric(selected.id) : null;

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
      const roomNodeUpdates = rooms
        .map((shape) => ({
          roomId: floorplanRoomIdToNumeric(shape.id),
          nodeDeviceId: shape.node_device_id ?? null,
        }))
        .filter((item): item is { roomId: number; nodeDeviceId: string | null } => item.roomId !== null);
      const nodePatchResults = await Promise.allSettled(
        roomNodeUpdates.map((item) =>
          api.patch(`/rooms/${item.roomId}`, {
            node_device_id: item.nodeDeviceId,
          }),
        ),
      );
      const failedNodePatches = nodePatchResults.filter((result) => result.status === "rejected").length;
      if (failedNodePatches > 0) {
        setMessage(`Layout saved, but ${failedNodePatches} room node link(s) could not be updated.`);
      } else {
        setMessage(t("floorplan.saved"));
      }
      await refetch();
      setFromDbBootstrap(false);
    } catch {
      setMessage(t("floorplan.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function onAssignPatientToRoom() {
    if (!patientAssignPick || selectedNumericRoomId == null) return;
    setAssignBusy(true);
    setMessage(null);
    try {
      await api.patchPatient(patientAssignPick, { room_id: selectedNumericRoomId });
      setMessage(t("floorplan.assignPatientSuccess"));
      setPatientAssignPick(null);
      await refetchAssignPatients();
    } catch {
      setMessage(t("floorplan.assignPatientFailed"));
    } finally {
      setAssignBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground-variant">{t("monitoring.flow.mapHint")}</p>

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
        <div className="flex w-full min-w-[200px] flex-1 flex-col gap-1 sm:w-auto sm:max-w-md sm:flex-initial">
          <div className="flex items-center gap-2">
            <Checkbox
              id="floorplan-assignment-mode"
              checked={assignmentMode}
              onCheckedChange={(v) => setAssignmentMode(v === true)}
            />
            <Label htmlFor="floorplan-assignment-mode" className="text-sm font-medium cursor-pointer">
              {t("floorplan.assignmentMode")}
            </Label>
          </div>
          {assignmentMode ? (
            <p className="text-xs text-foreground-variant">{t("floorplan.assignmentModeHint")}</p>
          ) : null}
        </div>
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

      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(280px,380px)]">
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
          <p className="text-xs text-foreground-variant">{t("floorplan.hint")}</p>
        </div>

        <div className="surface-card p-4 space-y-3 h-fit">
          <p className="text-sm font-semibold text-foreground">{t("floorplan.roomProps")}</p>
          {!selected ? (
            <p className="text-sm text-foreground-variant">{t("floorplan.selectRoom")}</p>
          ) : (
            <>
              <div>
                <label className="text-xs text-foreground-variant">{t("floorplan.label")}</label>
                <input
                  className="input-field mt-1 text-sm w-full"
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
                    inputId={`floorplan-node-combobox-${selected.id}`}
                    listboxId={`floorplan-node-listbox-${selected.id}`}
                    options={nodeDeviceOptions}
                    search={nodeDeviceSearch}
                    onSearchChange={setNodeDeviceSearch}
                    searchPlaceholder={t("floorplan.searchNodeDevice")}
                    selectedOptionId={
                      selected.node_device_id || null
                    }
                    onSelectOption={(id) => {
                      const linkedDevice =
                        devicesList.find((item) => item.device_id === id) ?? null;
                      updateSelected({
                        node_device_id: id,
                        device_id: linkedDevice?.id ?? null,
                      });
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
                <label className="text-xs text-foreground-variant">{t("floorplan.powerKw")}</label>
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

              {assignmentMode ? (
                <div className="space-y-3 border-t border-outline-variant/25 pt-3">
                  <p className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
                    <UserPlus className="h-4 w-4" />
                    {t("floorplan.assignPatientSection")}
                  </p>
                  {selectedNumericRoomId == null ? (
                    <p className="text-xs text-foreground-variant">{t("floorplan.assignPatientNeedSavedRoom")}</p>
                  ) : (
                    <>
                      <p className="text-xs text-foreground-variant">{t("floorplan.assignPatientPick")}</p>
                      <SearchableListboxPicker
                        inputId={`floorplan-assign-patient-${selected.id}`}
                        listboxId={`floorplan-assign-patient-list-${selected.id}`}
                        options={assignPatientOptions}
                        search={patientAssignSearch}
                        onSearchChange={setPatientAssignSearch}
                        searchPlaceholder={t("floorplan.assignPatientSearch")}
                        selectedOptionId={patientAssignPick}
                        onSelectOption={(id) => setPatientAssignPick(id)}
                        disabled={assignPatientOptions.length === 0}
                        listboxAriaLabel={t("floorplan.assignPatientSearch")}
                        noMatchMessage={t("patients.listNoMatches")}
                        emptyStateMessage={assignPatients.length === 0 ? t("patients.empty") : null}
                        emptyNoMatch={
                          assignPatientOptions.length === 0 && patientAssignSearch.trim().length > 0
                        }
                        listPresentation="portal"
                        listboxZIndex={60}
                      />
                      <button
                        type="button"
                        className="gradient-cta w-full px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                        disabled={assignBusy || !patientAssignPick}
                        onClick={() => void onAssignPatientToRoom()}
                      >
                        {assignBusy ? "…" : t("floorplan.assignPatientButton")}
                      </button>
                    </>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
