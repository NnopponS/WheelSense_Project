"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { ListPatientsResponse } from "@/lib/api/task-scope-types";
import { getQueryPollingMs, getQueryStaleTimeMs } from "@/lib/queryEndpointDefaults";
import { refetchOrThrow } from "@/lib/refetchOrThrow";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import {
  normalizeRoomShapeIds,
  resolveLayoutShapeToFloorRoomId,
} from "@/lib/floorplanRoomResolve";
import {
  alignFloorplanShapesToRegistryDevices,
  provisionRoomsForUnmappedFloorplanNodes,
} from "@/lib/floorplanSaveProvision";
import type { Device, DeviceDetail, Facility, Floor, Room, SmartDevice } from "@/lib/types";
import FloorplanCanvas, {
  type FloorplanCanvasHandle,
} from "@/components/floorplan/FloorplanCanvas";
import SearchableListboxPicker from "@/components/shared/SearchableListboxPicker";
import {
  bootstrapRoomsFromDbFloor,
  canvasUnitsToPercent,
  FLOORPLAN_LAYOUT_VERSION,
  FLOORPLAN_ROOM_TYPES,
  normalizeFloorplanRooms,
  normalizeRoomType,
  type FloorplanLayoutResponse,
  type FloorplanRoomShape,
  type FloorplanRoomType,
} from "@/lib/floorplanLayout";
import {
  Building2,
  Camera,
  ChevronDown,
  ChevronRight,
  Copy,
  Grid3x3,
  Layers,
  Magnet,
  Maximize,
  Pencil,
  Plus,
  Redo2,
  Save,
  Trash2,
  Undo2,
  UserPlus,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

function resolveShapeRoomId(shape: FloorplanRoomShape, floorRooms: Room[] | null | undefined): number | null {
  return resolveLayoutShapeToFloorRoomId(shape, floorRooms ?? undefined);
}

function mergeRoomNodesFromFloor(
  shapes: FloorplanRoomShape[],
  floorRooms: Room[] | null | undefined,
): FloorplanRoomShape[] {
  if (!floorRooms?.length) return shapes;
  const byId = new Map(floorRooms.map((r) => [r.id, r]));
  return shapes.map((shape) => {
    const n = resolveShapeRoomId(shape, floorRooms);
    if (n == null) return shape;
    const row = byId.get(n);
    if (!row?.node_device_id) return shape;
    return { ...shape, node_device_id: row.node_device_id };
  });
}

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
    room_type: "resident_room",
  };
}

export type FloorplansPanelExternalScope = {
  facilityId: number;
  floorId: number;
};

export type SaveState = "saved" | "unsaved" | "saving" | "error";

export default function FloorplansPanel({
  externalScope = null,
}: {
  /** Kept for backward compatibility; the panel is always embedded now. */
  embedded?: boolean;
  /** Parent-selected facility/floor (e.g. Facility management tabs). Hides duplicate building/floor pickers. */
  externalScope?: FloorplansPanelExternalScope | null;
}) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
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

  const { data: smartDevicesRaw = [], refetch: refetchSmartDevicesBase } = useQuery({
    queryKey: ["admin", "floorplans-panel", "smart-devices"],
    queryFn: async () => {
      const raw = await api.listSmartDevices();
      return Array.isArray(raw) ? (raw as SmartDevice[]) : [];
    },
    staleTime: getQueryStaleTimeMs("/ha/devices"),
    refetchInterval: getQueryPollingMs("/ha/devices"),
    retry: 3,
  });

  const refetchFacilities = useCallback(() => refetchOrThrow(refetchFacilitiesBase), [refetchFacilitiesBase]);
  const refetchFloors = useCallback(() => refetchOrThrow(refetchFloorsBase), [refetchFloorsBase]);
  const refetch = useCallback(() => refetchOrThrow(refetchLayoutBase), [refetchLayoutBase]);
  const refetchSmartDevices = useCallback(
    () => refetchOrThrow(refetchSmartDevicesBase),
    [refetchSmartDevicesBase],
  );

  const [rooms, setRooms] = useState<FloorplanRoomShape[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [message, setMessage] = useState<string | null>(null);
  const [roomDeviceTab, setRoomDeviceTab] = useState<"node" | "smart">("node");
  const [nodeDeviceSearch, setNodeDeviceSearch] = useState("");
  const [smartDeviceSearch, setSmartDeviceSearch] = useState("");
  const [capturePreviewUrl, setCapturePreviewUrl] = useState<string | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [patientAssignSearch, setPatientAssignSearch] = useState("");
  const [patientAssignPick, setPatientAssignPick] = useState<string | null>(null);
  const [assignBusy, setAssignBusy] = useState(false);
  const [unlinkingPatientId, setUnlinkingPatientId] = useState<number | null>(null);

  const [showNewFacility, setShowNewFacility] = useState(false);
  const [newFacilityName, setNewFacilityName] = useState("");
  const [newFacilityAddress, setNewFacilityAddress] = useState("");
  const [creatingFacility, setCreatingFacility] = useState(false);

  const [showNewFloor, setShowNewFloor] = useState(false);
  const [newFloorNumber, setNewFloorNumber] = useState(1);
  const [newFloorName, setNewFloorName] = useState("");
  const [creatingFloor, setCreatingFloor] = useState(false);

  // Editor toolbar state
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const canvasRef = useRef<FloorplanCanvasHandle>(null);

  // Undo / redo history (room snapshots only)
  const undoStack = useRef<FloorplanRoomShape[][]>([]);
  const redoStack = useRef<FloorplanRoomShape[][]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);

  // Inspector drawer (small screens)
  const [inspectorOpen, setInspectorOpen] = useState(false);

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

  // Track the last saved snapshot so we can compute unsaved state.
  const savedSnapshotRef = useRef<FloorplanRoomShape[]>([]);

  useEffect(() => {
    if (facilityId === "" || floorId === "") return;
    if (!layoutRes) {
      setRooms([]);
      setSelectedId(null);
      savedSnapshotRef.current = [];
      setSaveState("saved");
      return;
    }
    const fromLayout = normalizeFloorplanRooms(layoutRes.layout_json);
    if (fromLayout.length > 0) {
      const merged = mergeRoomNodesFromFloor(fromLayout, floorRooms ?? undefined);
      setRooms(merged);
      setSelectedId(null);
      savedSnapshotRef.current = merged;
      setSaveState("saved");
      return;
    }
    if (floorRooms == null) {
      return;
    }
    if (floorRooms.length > 0) {
      const merged = mergeRoomNodesFromFloor(bootstrapRoomsFromDbFloor(floorRooms), floorRooms);
      setRooms(merged);
      setSelectedId(null);
      savedSnapshotRef.current = merged;
      setSaveState("unsaved");
    } else {
      setRooms([]);
      savedSnapshotRef.current = [];
      setSaveState("saved");
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
  const selectedNumericRoomId = useMemo(
    () => (selected ? resolveShapeRoomId(selected, floorRooms) : null),
    [floorRooms, selected],
  );

  const patientsAssignEndpoint =
    facilityId === "" || floorId === "" || selectedNumericRoomId == null
      ? null
      : `/patients?limit=1000`;
  const { data: assignPatientsRaw } = useQuery({
    queryKey: ["admin", "floorplans-panel", "assign-patients", patientsAssignEndpoint, selectedNumericRoomId],
    queryFn: () => api.get<ListPatientsResponse>(patientsAssignEndpoint!),
    enabled: Boolean(patientsAssignEndpoint),
    staleTime: patientsAssignEndpoint ? getQueryStaleTimeMs(patientsAssignEndpoint) : 0,
    refetchInterval: patientsAssignEndpoint ? getQueryPollingMs(patientsAssignEndpoint) : false,
    retry: 3,
  });
  const assignPatients = useMemo(
    () => (assignPatientsRaw ?? []) as ListPatientsResponse,
    [assignPatientsRaw],
  );

  const devicesList = useMemo(() => devices ?? [], [devices]);

  const smartDevicesList = useMemo(() => smartDevicesRaw ?? [], [smartDevicesRaw]);

  const nodeDevicesPool = useMemo(
    () => devicesList.filter((d) => (d.hardware_type || "").toLowerCase() === "node"),
    [devicesList],
  );

  const filteredNodeDevices = useMemo(() => {
    const q = nodeDeviceSearch.trim().toLowerCase();
    if (!q) return nodeDevicesPool;
    return nodeDevicesPool.filter((d) => {
      const label = (d.display_name || d.device_id).toLowerCase();
      const id = d.device_id.toLowerCase();
      const hw = (d.hardware_type || "").toLowerCase();
      const dt = (d.device_type || "").toLowerCase();
      return (
        label.includes(q) || id.includes(q) || hw.includes(q) || dt.includes(q)
      );
    });
  }, [nodeDevicesPool, nodeDeviceSearch]);

  const nodeDeviceOptions = useMemo(
    () =>
      filteredNodeDevices.map((d) => ({
        id: d.device_id,
        title: d.display_name || d.device_id,
        subtitle: `${d.device_id}${d.hardware_type ? ` · ${d.hardware_type}` : ""}`,
      })),
    [filteredNodeDevices],
  );

  const nodeEmptyPool = nodeDevicesPool.length === 0;
  const nodeEmptyNoMatch =
    nodeDevicesPool.length > 0 &&
    filteredNodeDevices.length === 0 &&
    nodeDeviceSearch.trim().length > 0;

  const smartDevicesInRoom = useMemo(() => {
    if (selectedNumericRoomId == null) return [];
    return smartDevicesList.filter((sd) => sd.room_id === selectedNumericRoomId);
  }, [smartDevicesList, selectedNumericRoomId]);

  const filteredSmartDeviceOptions = useMemo(() => {
    const q = smartDeviceSearch.trim().toLowerCase();
    const pool = smartDevicesList.filter((sd) => sd.is_active !== false);
    const filtered = !q
      ? pool
      : pool.filter((sd) => {
          const name = (sd.name || "").toLowerCase();
          const entity = (sd.ha_entity_id || "").toLowerCase();
          const dt = (sd.device_type || "").toLowerCase();
          return name.includes(q) || entity.includes(q) || dt.includes(q) || String(sd.id).includes(q);
        });
    return filtered.map((sd) => ({
      id: String(sd.id),
      title: sd.name || sd.ha_entity_id || `Smart #${sd.id}`,
      subtitle:
        sd.room_id != null && sd.room_id !== selectedNumericRoomId
          ? `${sd.ha_entity_id} · ${t("patients.roomPrefix")} #${sd.room_id}`
          : sd.ha_entity_id,
    }));
  }, [smartDevicesList, smartDeviceSearch, selectedNumericRoomId, t]);

  const smartEmptyPool = smartDevicesList.length === 0;
  const smartEmptyNoMatch =
    smartDevicesList.length > 0 &&
    filteredSmartDeviceOptions.length === 0 &&
    smartDeviceSearch.trim().length > 0;

  const selectedNodeDevice =
    selected?.node_device_id
      ? devicesList.find((d) => d.device_id === selected.node_device_id) ?? null
      : null;

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

  const patientsInRoom = useMemo(() => {
    if (selectedNumericRoomId == null) return [];
    return assignPatients.filter((p) => p.room_id === selectedNumericRoomId);
  }, [assignPatients, selectedNumericRoomId]);

  const dbRoomForSelected = useMemo(() => {
    if (selectedNumericRoomId == null || !floorRooms?.length) return null;
    return floorRooms.find((r) => r.id === selectedNumericRoomId) ?? null;
  }, [floorRooms, selectedNumericRoomId]);

  const dbNodeLabel = useMemo(() => {
    const id = dbRoomForSelected?.node_device_id;
    if (!id) return null;
    const d = devicesList.find((x) => x.device_id === id);
    return d?.display_name?.trim() || id;
  }, [dbRoomForSelected, devicesList]);

  const canvasNodeLabel =
    selected?.node_device_id
      ? selectedNodeDevice?.display_name?.trim() || selected.node_device_id
      : null;

  const nodeAssignOutOfSync =
    selectedNumericRoomId != null &&
    (dbRoomForSelected?.node_device_id ?? null) !== (selected?.node_device_id ?? null);

  useEffect(() => {
    setNodeDeviceSearch("");
    setSmartDeviceSearch("");
  }, [selectedId]);

  useEffect(() => {
    setPatientAssignSearch("");
    setPatientAssignPick(null);
  }, [selectedId]);

  useEffect(() => {
    setCapturePreviewUrl(null);
  }, [selectedId, selected?.node_device_id]);

  useEffect(() => {
    if (!devicesList.length) return;
    setRooms((prev) =>
      prev.map((room) => {
        if (room.node_device_id) {
          const byNode = devicesList.find((device) => device.device_id === room.node_device_id);
          if (byNode && room.device_id !== byNode.id) {
            return { ...room, device_id: byNode.id };
          }
          return room;
        }
        if (room.device_id == null) return room;
        const linked = devicesList.find((device) => device.id === room.device_id);
        if (!linked) return room;
        return { ...room, node_device_id: linked.device_id };
      }),
    );
  }, [devicesList]);

  // ── History (undo/redo) ────────────────────────────────────────────────
  // historyVersion forces re-render so canUndo/canRedo reflect ref changes.
  void historyVersion;
  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(rooms);
    setRooms(prev);
    setHistoryVersion((v) => v + 1);
  }, [rooms]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(rooms);
    setRooms(next);
    setHistoryVersion((v) => v + 1);
  }, [rooms]);

  // Wrap setRooms so user-initiated edits push history and mark unsaved.
  const updateRoomsWithHistory = useCallback(
    (next: FloorplanRoomShape[] | ((prev: FloorplanRoomShape[]) => FloorplanRoomShape[])) => {
      setRooms((prev) => {
        const resolved = typeof next === "function" ? (next as (p: FloorplanRoomShape[]) => FloorplanRoomShape[])(prev) : next;
        undoStack.current.push(prev);
        if (undoStack.current.length > 50) undoStack.current.shift();
        redoStack.current = [];
        setHistoryVersion((v) => v + 1);
        return resolved;
      });
    },
    [],
  );

  // Canvas drag commits call onRoomsChange directly (no history per pointer-move);
  // we snapshot once at drag start via the wrapper below.
  const handleRoomsChange = useCallback(
    (next: FloorplanRoomShape[]) => {
      // The canvas already produced the full next array; record the previous snapshot once.
      setRooms((prev) => {
        if (prev !== next) {
          undoStack.current.push(prev);
          if (undoStack.current.length > 50) undoStack.current.shift();
          redoStack.current = [];
          setHistoryVersion((v) => v + 1);
        }
        return next;
      });
    },
    [],
  );

  // Compute save state by diffing against the last saved snapshot.
  useEffect(() => {
    if (saving) return; // saving state set explicitly
    const same =
      savedSnapshotRef.current.length === rooms.length &&
      savedSnapshotRef.current.every((r, i) => {
        const cur = rooms[i];
        return (
          cur &&
          r.id === cur.id &&
          r.label === cur.label &&
          r.x === cur.x &&
          r.y === cur.y &&
          r.w === cur.w &&
          r.h === cur.h &&
          (r.node_device_id ?? null) === (cur.node_device_id ?? null) &&
          (r.room_type ?? null) === (cur.room_type ?? null)
        );
      });
    setSaveState(same ? "saved" : "unsaved");
  }, [rooms, saving]);

  const updateSelected = useCallback(
    (patch: Partial<FloorplanRoomShape>) => {
      if (!selectedId) return;
      updateRoomsWithHistory((prev) =>
        prev.map((r) => (r.id === selectedId ? { ...r, ...patch } : r)),
      );
    },
    [selectedId, updateRoomsWithHistory],
  );

  async function onSave() {
    if (facilityId === "" || floorId === "") return;
    setSaving(true);
    setSaveState("saving");
    setMessage(null);
    try {
      const floorRoomRefs = (floorRooms ?? []).map((r) => ({ id: r.id, name: r.name }));
      let mergedRefs = floorRoomRefs;
      let roomsForNormalize = rooms;
      try {
        const provisioned = await provisionRoomsForUnmappedFloorplanNodes(
          (body) => api.post<{ id: number; name: string }>("/rooms", body),
          rooms,
          floorRoomRefs,
          Number(floorId),
        );
        mergedRefs = provisioned.mergedRefs;
        roomsForNormalize = provisioned.workingShapes;
        if (provisioned.mergedRefs.length > floorRoomRefs.length) {
          setRooms(provisioned.workingShapes);
        }
      } catch (e) {
        setMessage(e instanceof ApiError ? e.message : t("floorplan.saveFailed"));
        setSaveState("error");
        return;
      }

      const { shapes: normalizedRooms, idRemap } = normalizeRoomShapeIds(
        roomsForNormalize,
        mergedRefs,
      );

      const skippedNodePatches = normalizedRooms.filter((s) => {
        const hasNode = s.node_device_id != null && String(s.node_device_id).trim() !== "";
        if (!hasNode) return false;
        return resolveLayoutShapeToFloorRoomId(s, mergedRefs) == null;
      }).length;

      const alignedForLayout = alignFloorplanShapesToRegistryDevices(normalizedRooms, devicesList);

      await api.put<FloorplanLayoutResponse>("/floorplans/layout", {
        facility_id: facilityId,
        floor_id: floorId,
        version: FLOORPLAN_LAYOUT_VERSION,
        rooms: alignedForLayout.map((r) => ({
          id: r.id,
          label: r.label,
          x: canvasUnitsToPercent(r.x),
          y: canvasUnitsToPercent(r.y),
          w: canvasUnitsToPercent(r.w),
          h: canvasUnitsToPercent(r.h),
          device_id: r.device_id,
          node_device_id: r.node_device_id ?? null,
          power_kw: null,
          room_type: r.room_type ?? null,
        })),
      });
      const roomNodeUpdates = alignedForLayout
        .map((shape) => ({
          roomId: resolveLayoutShapeToFloorRoomId(shape, mergedRefs),
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
      if (selectedId && idRemap.has(selectedId)) {
        setSelectedId(idRemap.get(selectedId)!);
      }
      // Snapshot the saved state for unsaved tracking.
      savedSnapshotRef.current = alignedForLayout;
      if (failedNodePatches > 0) {
        setMessage(t("floorplan.savedPartialNodeLinks"));
      } else if (skippedNodePatches > 0) {
        setMessage(t("floorplan.savedWithUnmappedNodeLinks"));
      } else {
        setMessage(t("floorplan.saved"));
      }
      setSaveState("saved");
      await refetch();
      await queryClient.invalidateQueries({ queryKey: ["admin", "floorplans-panel", "floor-rooms"] });
      await queryClient.invalidateQueries({ queryKey: ["device-detail-drawer", "rooms"] });
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : t("floorplan.saveFailed"));
      setSaveState("error");
    } finally {
      setSaving(false);
    }
  }

  async function handleCaptureNodePreview() {
    const nodeId = selected?.node_device_id;
    if (!nodeId) return;
    if (selectedNodeDevice && (selectedNodeDevice.hardware_type || "").toLowerCase() !== "node") {
      setMessage(t("floorplan.captureNeedsNodeHardware"));
      return;
    }
    setCaptureBusy(true);
    setCapturePreviewUrl(null);
    setMessage(null);
    try {
      await api.cameraCheckSnapshot(nodeId);
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      let url: string | null = null;
      for (let i = 0; i < 5; i += 1) {
        await sleep(900);
        const detail = await api.get<DeviceDetail>(`/devices/${encodeURIComponent(nodeId)}`);
        url = detail.latest_photo?.url ?? null;
        if (url) break;
      }
      if (url) {
        setCapturePreviewUrl(url);
      } else {
        setMessage(t("floorplan.captureNoPhotoYet"));
      }
    } catch {
      setMessage(t("floorplan.captureFailed"));
    } finally {
      setCaptureBusy(false);
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
      await queryClient.invalidateQueries({ queryKey: ["admin", "floorplans-panel", "assign-patients"] });
    } catch {
      setMessage(t("floorplan.assignPatientFailed"));
    } finally {
      setAssignBusy(false);
    }
  }

  async function onRemovePatientFromRoom(patientId: number) {
    setUnlinkingPatientId(patientId);
    setMessage(null);
    try {
      await api.patchPatient(String(patientId), { room_id: null });
      setMessage(t("floorplan.removePatientFromRoomSuccess"));
      if (patientAssignPick === String(patientId)) setPatientAssignPick(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "floorplans-panel", "assign-patients"] });
    } catch {
      setMessage(t("floorplan.removePatientFromRoomFailed"));
    } finally {
      setUnlinkingPatientId(null);
    }
  }

  async function onLinkSmartDeviceToRoom(smartDeviceId: number) {
    if (selectedNumericRoomId == null) return;
    setMessage(null);
    try {
      await api.patchSmartDevice(smartDeviceId, { room_id: selectedNumericRoomId });
      setSmartDeviceSearch("");
      await refetchSmartDevices();
    } catch {
      setMessage(t("floorplan.smartAssignFailed"));
    }
  }

  async function onUnlinkSmartDeviceFromRoom(smartDeviceId: number) {
    setMessage(null);
    try {
      await api.patchSmartDevice(smartDeviceId, { room_id: null });
      await refetchSmartDevices();
    } catch {
      setMessage(t("floorplan.smartAssignFailed"));
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
      savedSnapshotRef.current = [];
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
      savedSnapshotRef.current = [];
      setMessage(t("floorplan.saved"));
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : t("floorplan.saveFailed"));
    }
  }

  // Scope switching with unsaved-change warning (used by compact selectors).
  const switchFacility = useCallback(
    (nextId: number | "") => {
      if (nextId === facilityId) return;
      if (saveState === "unsaved") {
        const ok = window.confirm(t("floorplan.unsavedSwitchConfirm"));
        if (!ok) return;
      }
      setFacilityId(nextId);
      setFloorId("");
      undoStack.current = [];
      redoStack.current = [];
      setHistoryVersion((v) => v + 1);
    },
    [facilityId, saveState, t],
  );

  const switchFloor = useCallback(
    (nextId: number | "") => {
      if (nextId === floorId) return;
      if (saveState === "unsaved") {
        const ok = window.confirm(t("floorplan.unsavedSwitchConfirm"));
        if (!ok) return;
      }
      setFloorId(nextId);
      undoStack.current = [];
      redoStack.current = [];
      setHistoryVersion((v) => v + 1);
    },
    [floorId, saveState, t],
  );

  const addRoom = useCallback(() => {
    const r = newRoom();
    updateRoomsWithHistory((prev) => [...prev, r]);
    setSelectedId(r.id);
  }, [updateRoomsWithHistory]);

  const duplicateRoom = useCallback(() => {
    if (!selected) return;
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `r-${Date.now()}`;
    const copy: FloorplanRoomShape = {
      ...selected,
      id,
      x: selected.x + 40,
      y: selected.y + 40,
      label: `${selected.label} copy`,
    };
    updateRoomsWithHistory((prev) => [...prev, copy]);
    setSelectedId(id);
  }, [selected, updateRoomsWithHistory]);

  const deleteRoom = useCallback(() => {
    if (!selectedId) return;
    updateRoomsWithHistory((prev) => prev.filter((r) => r.id !== selectedId));
    setSelectedId(null);
  }, [selectedId, updateRoomsWithHistory]);

  const scopeReady = facilityId !== "" && floorId !== "";

  return (
    <div className="flex flex-col gap-3 animate-fade-in">
      {/* Compact context selectors (always visible, replaces the big Building & floor card) */}
      {!isExternalScope ? (
        <div className="flex flex-wrap items-center gap-2">
          <ScopeSelect
            icon={<Building2 className="h-4 w-4 text-primary" />}

            disabled={loadingFac}
            value={facilityId === "" ? "" : String(facilityId)}
            onChange={(v) => switchFacility(v === "" ? "" : Number(v))}
            options={(facilities ?? []).map((f) => ({ value: String(f.id), label: f.name }))}
            placeholder={t("floorplan.selectBuilding")}
            onEdit={facilityId !== "" ? () => void handleRenameFacility() : undefined}
            onDelete={facilityId !== "" ? () => void handleDeleteFacility() : undefined}
            onAdd={() => {
              setShowNewFacility((v) => !v);
              setShowNewFloor(false);
            }}
            addLabel={t("floorplan.newBuilding")}
          />
          <span className="text-foreground-variant/60" aria-hidden>/</span>
          <ScopeSelect
            icon={<Layers className="h-4 w-4 text-primary" />}

            disabled={facilityId === "" || loadingFloors}
            value={floorId === "" ? "" : String(floorId)}
            onChange={(v) => switchFloor(v === "" ? "" : Number(v))}
            options={(floors ?? []).map((fl) => ({
              value: String(fl.id),
              label: fl.name?.trim() ? `${fl.name} (#${fl.floor_number})` : `Floor ${fl.floor_number}`,
            }))}
            placeholder={facilityId === "" ? t("floorplan.selectBuildingFirst") : t("floorplan.selectFloor")}
            onEdit={facilityId !== "" && floorId !== "" ? () => void handleRenameFloor() : undefined}
            onDelete={facilityId !== "" && floorId !== "" ? () => void handleDeleteFloor() : undefined}
            onAdd={facilityId !== "" ? () => { openNewFloorPanel(); setShowNewFacility(false); } : undefined}
            addLabel={t("floorplan.newFloor")}
          />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm text-foreground-variant">
          <Building2 className="h-4 w-4 text-primary" />
          <span className="font-medium text-foreground/90">{selectedFacilityName}</span>
          <span className="text-foreground-variant/60" aria-hidden>/</span>
          <Layers className="h-4 w-4 text-primary" />
          <span className="font-medium text-foreground/90">{selectedFloorLabel}</span>
        </div>
      )}

      {/* Inline new-building / new-floor panels (non-embedded only) */}
      {!isExternalScope && showNewFacility ? (
        <div className="rounded-lg border border-primary/35 bg-surface-container-high/80 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground">{t("floorplan.newBuilding")}</p>
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
            className="w-full gradient-cta py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            disabled={creatingFacility || !newFacilityName.trim()}
            onClick={() => void handleCreateFacility()}
          >
            {creatingFacility ? "…" : t("floorplan.createBuilding")}
          </button>
        </div>
      ) : null}

      {!isExternalScope && showNewFloor && facilityId !== "" ? (
        <div className="rounded-lg border border-primary/35 bg-surface-container-high/80 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground">{t("floorplan.newFloor")}</p>
            <button
              type="button"
              className="p-1 rounded-lg hover:bg-surface-container-low text-foreground-variant"
              aria-label={t("floorplan.cancel")}
              onClick={() => setShowNewFloor(false)}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="w-full max-w-[10rem]">
              <label className="text-[11px] text-foreground-variant block mb-1">
                {t("floorplan.floorNumberLabel")}
              </label>
              <input
                type="number"
                min={0}
                className="input-field text-sm w-full"
                value={newFloorNumber}
                onChange={(e) => setNewFloorNumber(Number(e.target.value) || 0)}
              />
            </div>
            <div className="min-w-[12rem] flex-1">
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
            className="w-full gradient-cta py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            disabled={creatingFloor}
            onClick={() => void handleCreateFloor()}
          >
            {creatingFloor ? "…" : t("floorplan.createFloor")}
          </button>
        </div>
      ) : null}

      {/* Editor: toolbar + canvas + inspector — fills remaining viewport height */}
      {scopeReady ? (
        <div className="flex flex-col rounded-lg border border-border/70 bg-card overflow-hidden h-[calc(100vh-13rem)] min-h-[420px]">
          {/* Sticky editor toolbar */}
          <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border/70 bg-card/95 px-3 py-2 backdrop-blur">
            <div className="flex flex-wrap items-center gap-1">
              <ToolbarButton
                ariaLabel={t("floorplan.undo")}
                disabled={!canUndo}
                onClick={undo}
                title={t("floorplan.undo")}
              >
                <Undo2 className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                ariaLabel={t("floorplan.redo")}
                disabled={!canRedo}
                onClick={redo}
                title={t("floorplan.redo")}
              >
                <Redo2 className="h-4 w-4" />
              </ToolbarButton>
              <span className="mx-1 h-5 w-px bg-border/70" aria-hidden />
              <ToolbarButton
                ariaLabel={t("floorplan.zoomOut")}
                onClick={() => canvasRef.current?.zoomOut()}
                title={t("floorplan.zoomOut")}
              >
                <ZoomOut className="h-4 w-4" />
              </ToolbarButton>
              <span className="min-w-[3rem] text-center text-xs tabular-nums font-medium text-foreground">
                {`${Math.round(canvasZoom * 100)}%`}
              </span>
              <ToolbarButton
                ariaLabel={t("floorplan.zoomIn")}
                onClick={() => canvasRef.current?.zoomIn()}
                title={t("floorplan.zoomIn")}
              >
                <ZoomIn className="h-4 w-4" />
              </ToolbarButton>
              <span className="mx-1 h-5 w-px bg-border/70" aria-hidden />
              <ToolbarButton
                ariaLabel={t("floorplan.fitFloor")}
                onClick={() => canvasRef.current?.fitToRooms()}
                title={t("floorplan.fitFloor")}
              >
                <Maximize className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                ariaLabel={t("floorplan.zoomReset")}
                onClick={() => canvasRef.current?.resetZoom()}
                title={t("floorplan.zoomReset")}
              >
                {t("floorplan.zoomReset")}
              </ToolbarButton>
              <span className="mx-1 h-5 w-px bg-border/70" aria-hidden />
              <ToolbarToggleButton
                active={showGrid}
                onClick={() => setShowGrid((v) => !v)}
                ariaLabel={t("floorplan.gridToggle")}
                title={t("floorplan.gridToggle")}
              >
                <Grid3x3 className="h-3.5 w-3.5" />
                {t("floorplan.gridToggle").replace("Toggle ", "")}
              </ToolbarToggleButton>
              <ToolbarToggleButton
                active={snapToGrid}
                onClick={() => setSnapToGrid((v) => !v)}
                ariaLabel={t("floorplan.snapToggle")}
                title={t("floorplan.snapToggle")}
              >
                <Magnet className="h-3.5 w-3.5" />
                {t("floorplan.snapToggle").replace("Toggle ", "")}
              </ToolbarToggleButton>
            </div>

            <div className="flex items-center gap-2">
              <SaveStateBadge state={saveState} />
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-input bg-background px-3 py-2 text-sm font-semibold text-foreground hover:bg-accent disabled:opacity-50"
                onClick={addRoom}
              >
                <Plus className="h-4 w-4" />
                {t("floorplan.addRoom")}
              </button>
              <button
                type="button"
                className="gradient-cta inline-flex items-center gap-1.5 rounded-[var(--radius-control)] px-3 py-2 text-sm font-semibold disabled:opacity-50"
                disabled={saving}
                onClick={() => void onSave()}
              >
                <Save className="h-4 w-4" />
                {saving ? t("common.saving") : t("floorplan.save")}
              </button>
            </div>
          </div>

          {/* Canvas + inspector — share remaining editor height; inspector scrolls independently */}
          <div className="flex flex-col lg:flex-row min-h-0 flex-1">
            <div className="min-w-0 flex-1 p-2 min-h-0 flex flex-col">
              {canvasLoading ? (
                <div className="flex flex-1 items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : layoutError ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
                  <p className="text-sm text-error">{t("floorplan.layoutError")}</p>
                  <button
                    type="button"
                    className="rounded-lg border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-sm"
                    onClick={() => void refetch()}
                  >
                    Retry
                  </button>
                </div>
              ) : rooms.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
                  <p className="text-sm text-foreground-variant">{t("floorplan.emptyLayout")}</p>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-input bg-background px-3 py-2 text-sm font-semibold hover:bg-accent"
                    onClick={addRoom}
                  >
                    <Plus className="h-4 w-4" />
                    {t("floorplan.addRoom")}
                  </button>
                </div>
              ) : (
                <div className="flex-1 min-h-0">
                  <FloorplanCanvas
                    ref={canvasRef}
                    fitContentOnMount
                    rooms={rooms}
                    onRoomsChange={handleRoomsChange}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    showGrid={showGrid}
                    snapToGrid={snapToGrid}
                    hideZoomControls
                    onZoomChange={setCanvasZoom}
                  />
                </div>
              )}
            </div>

            {/* Inspector sidebar (large screens) — scrolls independently */}
            <aside className="hidden w-[320px] shrink-0 border-t border-border/70 lg:w-[320px] lg:border-l lg:border-t-0 lg:block overflow-y-auto min-h-0">
              <div className="p-3">
              <RoomInspector
                t={t}
                user={user}
                selected={selected}
                selectedNumericRoomId={selectedNumericRoomId}
                canvasNodeLabel={canvasNodeLabel}
                dbNodeLabel={dbNodeLabel}
                nodeAssignOutOfSync={nodeAssignOutOfSync}
                smartDevicesInRoom={smartDevicesInRoom}
                patientsInRoom={patientsInRoom}
                devicesList={devicesList}
                unlinkingPatientId={unlinkingPatientId}
                onRemovePatientFromRoom={onRemovePatientFromRoom}
                roomDeviceTab={roomDeviceTab}
                setRoomDeviceTab={setRoomDeviceTab}
                nodeDeviceOptions={nodeDeviceOptions}
                nodeDeviceSearch={nodeDeviceSearch}
                setNodeDeviceSearch={setNodeDeviceSearch}
                selectedNodeDevice={selectedNodeDevice}
                updateSelected={updateSelected}
                nodeEmptyPool={nodeEmptyPool}
                nodeEmptyNoMatch={nodeEmptyNoMatch}
                captureBusy={captureBusy}
                capturePreviewUrl={capturePreviewUrl}
                handleCaptureNodePreview={handleCaptureNodePreview}
                filteredSmartDeviceOptions={filteredSmartDeviceOptions}
                smartDeviceSearch={smartDeviceSearch}
                setSmartDeviceSearch={setSmartDeviceSearch}
                onLinkSmartDeviceToRoom={onLinkSmartDeviceToRoom}
                onUnlinkSmartDeviceFromRoom={onUnlinkSmartDeviceFromRoom}
                smartEmptyPool={smartEmptyPool}
                smartEmptyNoMatch={smartEmptyNoMatch}
                assignPatientOptions={assignPatientOptions}
                patientAssignSearch={patientAssignSearch}
                setPatientAssignSearch={setPatientAssignSearch}
                patientAssignPick={patientAssignPick}
                setPatientAssignPick={setPatientAssignPick}
                assignBusy={assignBusy}
                onAssignPatientToRoom={onAssignPatientToRoom}
                onDuplicate={duplicateRoom}
                onDelete={deleteRoom}
              />
              </div>
            </aside>

            {/* Inspector drawer toggle (small screens) */}
            <div className="flex items-center justify-between border-t border-border/70 px-3 py-2 lg:hidden">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-input bg-background px-3 py-2 text-sm font-semibold hover:bg-accent"
                onClick={() => setInspectorOpen(true)}
              >
                {t("floorplan.roomProps")}
              </button>
              {selected ? (
                <span className="truncate text-sm font-medium text-foreground">{selected.label}</span>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border/70 bg-card p-8 text-center">
          <p className="text-sm text-foreground-variant">
            {facilityId === "" ? t("floorplan.selectBuildingFirst") : t("floorplan.selectFloor")}
          </p>
        </div>
      )}

      {message ? (
        <p
          className={`text-sm ${
            [
              t("floorplan.saved"),
              t("floorplan.savedPartialNodeLinks"),
              t("floorplan.savedWithUnmappedNodeLinks"),
              t("floorplan.buildingCreated"),
              t("floorplan.floorCreated"),
              t("floorplan.assignPatientSuccess"),
              t("floorplan.removePatientFromRoomSuccess"),
            ].includes(message)
              ? "text-primary"
              : "text-error"
          }`}
        >
          {message}
        </p>
      ) : null}

      {/* Inspector drawer (small screens) */}
      {inspectorOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setInspectorOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 top-0 h-full w-[min(90vw,340px)] overflow-y-auto border-l border-border bg-card p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">{t("floorplan.roomProps")}</p>
              <button
                type="button"
                className="p-1 rounded-lg hover:bg-surface-container-low text-foreground-variant"
                aria-label={t("floorplan.cancel")}
                onClick={() => setInspectorOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <RoomInspector
              t={t}
              user={user}
              selected={selected}
              selectedNumericRoomId={selectedNumericRoomId}
              canvasNodeLabel={canvasNodeLabel}
              dbNodeLabel={dbNodeLabel}
              nodeAssignOutOfSync={nodeAssignOutOfSync}
              smartDevicesInRoom={smartDevicesInRoom}
              patientsInRoom={patientsInRoom}
              devicesList={devicesList}
              unlinkingPatientId={unlinkingPatientId}
              onRemovePatientFromRoom={onRemovePatientFromRoom}
              roomDeviceTab={roomDeviceTab}
              setRoomDeviceTab={setRoomDeviceTab}
              nodeDeviceOptions={nodeDeviceOptions}
              nodeDeviceSearch={nodeDeviceSearch}
              setNodeDeviceSearch={setNodeDeviceSearch}
              selectedNodeDevice={selectedNodeDevice}
              updateSelected={updateSelected}
              nodeEmptyPool={nodeEmptyPool}
              nodeEmptyNoMatch={nodeEmptyNoMatch}
              captureBusy={captureBusy}
              capturePreviewUrl={capturePreviewUrl}
              handleCaptureNodePreview={handleCaptureNodePreview}
              filteredSmartDeviceOptions={filteredSmartDeviceOptions}
              smartDeviceSearch={smartDeviceSearch}
              setSmartDeviceSearch={setSmartDeviceSearch}
              onLinkSmartDeviceToRoom={onLinkSmartDeviceToRoom}
              onUnlinkSmartDeviceFromRoom={onUnlinkSmartDeviceFromRoom}
              smartEmptyPool={smartEmptyPool}
              smartEmptyNoMatch={smartEmptyNoMatch}
              assignPatientOptions={assignPatientOptions}
              patientAssignSearch={patientAssignSearch}
              setPatientAssignSearch={setPatientAssignSearch}
              patientAssignPick={patientAssignPick}
              setPatientAssignPick={setPatientAssignPick}
              assignBusy={assignBusy}
              onAssignPatientToRoom={onAssignPatientToRoom}
              onDuplicate={duplicateRoom}
              onDelete={deleteRoom}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ToolbarButton({
  children,
  ariaLabel,
  title,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  ariaLabel: string;
  title?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={title ?? ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md border border-transparent px-2 text-sm font-medium text-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function ToolbarToggleButton({
  children,
  ariaLabel,
  title,
  active,
  onClick,
}: {
  children: React.ReactNode;
  ariaLabel: string;
  title?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={title ?? ariaLabel}
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition-colors ${
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-input bg-background text-foreground-variant hover:bg-accent hover:text-foreground"
      }`}
    >
      {children}
      {active ? <span className="sr-only">(on)</span> : <span className="sr-only">(off)</span>}
    </button>
  );
}

function SaveStateBadge({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground-variant">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        Saving…
      </span>
    );
  }
  if (state === "unsaved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        Unsaved changes
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
        <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white">!</span>
        Save failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
      <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="8" cy="8" r="7" fill="currentColor" opacity="0.15" />
        <path d="M5 8.5l2 2 4-4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Saved
    </span>
  );
}

function ScopeSelect({
  icon,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  onEdit,
  onDelete,
  onAdd,
  addLabel,
}: {
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  disabled?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onAdd?: () => void;
  addLabel?: string;
}) {
  return (
    <div className="inline-flex items-center gap-1">
      <div className="relative inline-flex items-center group">
        <span className="pointer-events-none absolute left-2.5 flex items-center text-primary">{icon}</span>
        <select
          className="input-field appearance-none pl-8 pr-7 text-sm font-semibold rounded-lg border-border/70 hover:border-primary/50 focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 transition-colors cursor-pointer"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-label={placeholder}
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 h-4 w-4 text-primary/70 group-hover:text-primary transition-colors" />
      </div>
      {onEdit ? (
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground-variant hover:bg-accent hover:text-foreground"
          aria-label="Edit"
          onClick={onEdit}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      ) : null}
      {onDelete ? (
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
          aria-label="Delete"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : null}
      {onAdd ? (
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm font-medium text-primary hover:bg-primary/10"
          onClick={onAdd}
        >
          <Plus className="h-3.5 w-3.5" />
          {addLabel}
        </button>
      ) : null}
    </div>
  );
}

type RoomInspectorProps = {
  t: (key: string) => string;
  user: { role?: string } | null | undefined;
  selected: FloorplanRoomShape | null;
  selectedNumericRoomId: number | null;
  canvasNodeLabel: string | null;
  dbNodeLabel: string | null;
  nodeAssignOutOfSync: boolean;
  smartDevicesInRoom: SmartDevice[];
  patientsInRoom: ListPatientsResponse[number][];
  devicesList: Device[];
  unlinkingPatientId: number | null;
  onRemovePatientFromRoom: (patientId: number) => void;
  roomDeviceTab: "node" | "smart";
  setRoomDeviceTab: (tab: "node" | "smart") => void;
  nodeDeviceOptions: { id: string; title: string; subtitle?: string }[];
  nodeDeviceSearch: string;
  setNodeDeviceSearch: (v: string) => void;
  selectedNodeDevice: Device | null;
  updateSelected: (patch: Partial<FloorplanRoomShape>) => void;
  nodeEmptyPool: boolean;
  nodeEmptyNoMatch: boolean;
  captureBusy: boolean;
  capturePreviewUrl: string | null;
  handleCaptureNodePreview: () => void;
  filteredSmartDeviceOptions: { id: string; title: string; subtitle?: string }[];
  smartDeviceSearch: string;
  setSmartDeviceSearch: (v: string) => void;
  onLinkSmartDeviceToRoom: (id: number) => void;
  onUnlinkSmartDeviceFromRoom: (id: number) => void;
  smartEmptyPool: boolean;
  smartEmptyNoMatch: boolean;
  assignPatientOptions: { id: string; title: string; subtitle?: string }[];
  patientAssignSearch: string;
  setPatientAssignSearch: (v: string) => void;
  patientAssignPick: string | null;
  setPatientAssignPick: (v: string | null) => void;
  assignBusy: boolean;
  onAssignPatientToRoom: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

function RoomInspector(props: RoomInspectorProps) {
  const {
    t,
    selected,
    selectedNumericRoomId,
    canvasNodeLabel,
    nodeAssignOutOfSync,
    smartDevicesInRoom,
    patientsInRoom,
    devicesList,
    unlinkingPatientId,
    onRemovePatientFromRoom,
    roomDeviceTab,
    setRoomDeviceTab,
    nodeDeviceOptions,
    nodeDeviceSearch,
    setNodeDeviceSearch,
    selectedNodeDevice,
    updateSelected,
    nodeEmptyPool,
    nodeEmptyNoMatch,
    captureBusy,
    capturePreviewUrl,
    handleCaptureNodePreview,
    filteredSmartDeviceOptions,
    smartDeviceSearch,
    setSmartDeviceSearch,
    onLinkSmartDeviceToRoom,
    onUnlinkSmartDeviceFromRoom,
    smartEmptyPool,
    smartEmptyNoMatch,
    assignPatientOptions,
    patientAssignSearch,
    setPatientAssignSearch,
    patientAssignPick,
    setPatientAssignPick,
    assignBusy,
    onAssignPatientToRoom,
    onDuplicate,
    onDelete,
  } = props;

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showResidentPicker, setShowResidentPicker] = useState(false);
  const [showDevicePicker, setShowDevicePicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset expand states when switching rooms (ref-based to avoid effect cascading renders)
  const prevRoomIdRef = useRef<string | null>(null);
  const currentRoomId = selected?.id ?? null;
  if (prevRoomIdRef.current !== currentRoomId) {
    prevRoomIdRef.current = currentRoomId;
    if (showAdvanced) setShowAdvanced(false);
    if (showResidentPicker) setShowResidentPicker(false);
    if (showDevicePicker) setShowDevicePicker(false);
    if (confirmDelete) setConfirmDelete(false);
  }

  if (!selected) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-foreground">{t("floorplan.roomProps")}</p>
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/70 bg-surface-container-low/40 p-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container-low text-foreground-variant">
            <Layers className="h-5 w-5" />
          </div>
          <p className="text-sm text-foreground-variant">{t("floorplan.selectRoom")}</p>
        </div>
      </div>
    );
  }

  const roomType = normalizeRoomType(selected.room_type);
  const patientNames = patientsInRoom
    .map((p) => [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || `#${p.id}`)
    .join(", ");
  const smartDeviceNames = smartDevicesInRoom
    .map((sd) => sd.name?.trim() || sd.ha_entity_id)
    .join(", ");

  return (
    <div className="space-y-4">
      {/* Room title */}
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-base font-semibold text-foreground">{selected.label}</p>
      </div>

      {/* ── ROOM PROPERTIES ── */}
      <section className="space-y-2.5">
        <SectionLabel>{t("floorplan.sectionProperties")}</SectionLabel>
        <Field label={t("floorplan.label")}>
          <input
            className="input-field text-sm"
            value={selected.label}
            onChange={(e) => updateSelected({ label: e.target.value })}
          />
        </Field>
        <Field label={t("floorplan.roomType")}>
          <select
            className="input-field text-sm"
            value={roomType}
            onChange={(e) => updateSelected({ room_type: e.target.value as FloorplanRoomType })}
          >
            {FLOORPLAN_ROOM_TYPES.map((rt) => (
              <option key={rt} value={rt}>
                {t(`floorplan.roomType.${rt}`)}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("floorplan.width")}>
            <input
              type="number"
              className="input-field text-sm"
              value={Math.round(selected.w)}
              onChange={(e) => updateSelected({ w: Number(e.target.value) || 1 })}
            />
          </Field>
          <Field label={t("floorplan.height")}>
            <input
              type="number"
              className="input-field text-sm"
              value={Math.round(selected.h)}
              onChange={(e) => updateSelected({ h: Number(e.target.value) || 1 })}
            />
          </Field>
        </div>
      </section>

      <Divider />

      {/* ── OCCUPANCY ── */}
      <section className="space-y-2">
        <SectionLabel>{t("floorplan.sectionOccupancy")}</SectionLabel>
        {selectedNumericRoomId == null ? (
          <p className="text-xs text-foreground-variant">{t("floorplan.assignPatientNeedSavedRoom")}</p>
        ) : (
          <>
            {/* Compact summary */}
            <div className="text-sm text-foreground">
              {patientsInRoom.length === 0 ? (
                <p className="text-foreground-variant">{t("floorplan.residentsNone")}</p>
              ) : (
                <div className="space-y-1">
                  <p className="font-medium truncate">{patientNames}</p>
                  <p className="text-xs text-foreground-variant">
                    {patientsInRoom.length === 1
                      ? t("floorplan.residentsAssigned").replace("{n}", "1")
                      : t("floorplan.residentsAssigned_other").replace("{n}", String(patientsInRoom.length))}
                  </p>
                </div>
              )}
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
              onClick={() => setShowResidentPicker((v) => !v)}
              aria-expanded={showResidentPicker}
            >
              <UserPlus className="h-3.5 w-3.5" />
              {t("floorplan.manageResidents")}
            </button>
            {/* Expanded resident management */}
            {showResidentPicker ? (
              <div className="space-y-2 rounded-md border border-outline-variant/30 bg-surface-container-low/40 p-2.5">
                {patientsInRoom.length > 0 ? (
                  <ul className="space-y-1">
                    {patientsInRoom.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 min-w-0">
                        <Link
                          href={`/admin/patients/${p.id}`}
                          className="min-w-0 flex-1 truncate text-xs font-medium text-primary hover:underline"
                        >
                          {[p.first_name, p.last_name].filter(Boolean).join(" ").trim() || `#${p.id}`}
                        </Link>
                        <button
                          type="button"
                          className="shrink-0 text-[10px] font-semibold text-error hover:underline disabled:opacity-40 disabled:pointer-events-none"
                          disabled={unlinkingPatientId !== null}
                          onClick={() => void onRemovePatientFromRoom(p.id)}
                        >
                          {unlinkingPatientId === p.id ? "…" : t("floorplan.removePatientFromRoom")}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <SearchableListboxPicker
                  inputId={`floorplans-panel-assign-patient-${selected.id}`}
                  listboxId={`floorplans-panel-assign-patient-list-${selected.id}`}
                  options={assignPatientOptions}
                  search={patientAssignSearch}
                  onSearchChange={setPatientAssignSearch}
                  searchPlaceholder={t("floorplan.searchResidents")}
                  selectedOptionId={patientAssignPick}
                  onSelectOption={(id) => setPatientAssignPick(id)}
                  disabled={assignPatientOptions.length === 0}
                  listboxAriaLabel={t("floorplan.searchResidents")}
                  noMatchMessage={t("patients.listNoMatches")}
                  emptyStateMessage={assignPatientOptions.length === 0 ? t("patients.empty") : null}
                  emptyNoMatch={
                    assignPatientOptions.length === 0 && patientAssignSearch.trim().length > 0
                  }
                  listPresentation="portal"
                />
                <button
                  type="button"
                  className="gradient-cta w-full px-2.5 py-1.5 rounded-md text-xs font-semibold disabled:opacity-50"
                  disabled={assignBusy || !patientAssignPick}
                  onClick={() => void onAssignPatientToRoom()}
                >
                  {assignBusy ? "…" : t("floorplan.assignPatientButton")}
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      <Divider />

      {/* ── DEVICES ── */}
      <section className="space-y-2">
        <SectionLabel>{t("floorplan.sectionDevices")}</SectionLabel>
        {/* Compact summary */}
        <dl className="space-y-1.5 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-xs text-foreground-variant">{t("floorplan.nodeLabel")}</dt>
            <dd className="truncate text-xs font-medium text-foreground text-right">
              {canvasNodeLabel ?? t("floorplan.notAssigned")}
            </dd>
          </div>
          {nodeAssignOutOfSync ? (
            <p className="text-[10px] text-amber-700 dark:text-amber-200/90">
              {t("floorplan.summaryPendingSave")}
            </p>
          ) : null}
          {selectedNumericRoomId != null ? (
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-xs text-foreground-variant">{t("floorplan.smartDevicesLabel")}</dt>
              <dd className="truncate text-xs font-medium text-foreground text-right">
                {smartDevicesInRoom.length === 0 ? t("floorplan.notAssigned") : smartDeviceNames}
              </dd>
            </div>
          ) : null}
        </dl>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
          onClick={() => setShowDevicePicker((v) => !v)}
          aria-expanded={showDevicePicker}
        >
          <Layers className="h-3.5 w-3.5" />
          {t("floorplan.manageDevices")}
        </button>
        {/* Expanded device management */}
        {showDevicePicker ? (
          <div className="space-y-2.5 rounded-md border border-outline-variant/30 bg-surface-container-low/40 p-2.5">
            {/* Link type tabs */}
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t("floorplan.sectionDevices")}>
              {(
                [
                  { key: "node" as const, labelKey: "floorplan.linkTabNode" },
                  { key: "smart" as const, labelKey: "floorplan.linkTabSmart" },
                ] as const
              ).map((tab) => {
                const active = roomDeviceTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setRoomDeviceTab(tab.key);
                      setNodeDeviceSearch("");
                      setSmartDeviceSearch("");
                    }}
                    className={`rounded-md border px-2 py-1 text-xs font-semibold transition-smooth ${
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
            {roomDeviceTab === "node" ? (
              <div className="space-y-2">
                <SearchableListboxPicker
                  inputId={`floorplans-panel-node-combobox-${selected.id}`}
                  listboxId={`floorplans-panel-node-listbox-${selected.id}`}
                  options={nodeDeviceOptions}
                  search={nodeDeviceSearch}
                  onSearchChange={setNodeDeviceSearch}
                  searchPlaceholder={t("floorplan.searchNodeDevice")}
                  selectedOptionId={selected.node_device_id || null}
                  onSelectOption={(id) => {
                    const linked = devicesList.find((device) => device.device_id === id) ?? null;
                    updateSelected({
                      node_device_id: id,
                      device_id: linked?.id ?? null,
                    });
                  }}
                  disabled={nodeEmptyPool}
                  listboxAriaLabel={t("floorplan.selectNodeDevice")}
                  noMatchMessage={t("floorplan.noNodeDeviceMatches")}
                  emptyStateMessage={nodeEmptyPool ? t("floorplan.noDevicesInCategory") : null}
                  emptyNoMatch={nodeEmptyNoMatch}
                  listPresentation="portal"
                />
                {selected.node_device_id ? (
                  <div className="flex flex-col gap-1.5 rounded-md border border-primary/25 bg-primary/5 px-2.5 py-1.5 text-xs text-foreground">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">
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
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-md border border-outline-variant/40 bg-surface-container-low px-2 py-1 text-xs font-semibold text-foreground hover:bg-surface-container-high disabled:opacity-50"
                        disabled={
                          captureBusy ||
                          !selected.node_device_id ||
                          (selectedNodeDevice != null &&
                            (selectedNodeDevice.hardware_type || "").toLowerCase() !== "node")
                        }
                        onClick={() => void handleCaptureNodePreview()}
                      >
                        <Camera className="h-3.5 w-3.5 shrink-0 opacity-80" />
                        {captureBusy ? "…" : t("floorplan.captureLive")}
                      </button>
                    </div>
                    {capturePreviewUrl ? (
                      <div className="overflow-hidden rounded-md border border-outline-variant/30 bg-black/5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={capturePreviewUrl}
                          alt=""
                          className="max-h-32 w-full object-contain"
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2">
                {selectedNumericRoomId == null ? (
                  <p className="text-xs text-foreground-variant">
                    {t("floorplan.assignPatientNeedSavedRoom")}
                  </p>
                ) : (
                  <>
                    {smartDevicesInRoom.length > 0 ? (
                      <ul className="space-y-1">
                        {smartDevicesInRoom.map((sd) => (
                          <li
                            key={sd.id}
                            className="flex items-center gap-2 rounded-md border border-outline-variant/25 bg-surface-container-low/60 px-2 py-1 text-xs"
                          >
                            <span className="min-w-0 flex-1 truncate font-medium">
                              {sd.name || sd.ha_entity_id}
                            </span>
                            <button
                              type="button"
                              className="shrink-0 font-semibold text-primary hover:underline"
                              onClick={() => void onUnlinkSmartDeviceFromRoom(sd.id)}
                            >
                              {t("floorplan.smartUnlink")}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <SearchableListboxPicker
                      inputId={`floorplans-panel-smart-combobox-${selected.id}`}
                      listboxId={`floorplans-panel-smart-listbox-${selected.id}`}
                      options={filteredSmartDeviceOptions}
                      search={smartDeviceSearch}
                      onSearchChange={setSmartDeviceSearch}
                      searchPlaceholder={t("floorplan.searchSmartDevice")}
                      selectedOptionId={null}
                      onSelectOption={(id) => {
                        const n = Number(id);
                        if (!Number.isFinite(n)) return;
                        void onLinkSmartDeviceToRoom(n);
                      }}
                      disabled={smartEmptyPool}
                      listboxAriaLabel={t("floorplan.linkTabSmart")}
                      noMatchMessage={t("floorplan.noNodeDeviceMatches")}
                      emptyStateMessage={smartEmptyPool ? t("patients.empty") : null}
                      emptyNoMatch={smartEmptyNoMatch}
                      listPresentation="portal"
                    />
                  </>
                )}
              </div>
            )}
          </div>
        ) : null}
      </section>

      <Divider />

      {/* ── ADVANCED (collapsed by default) ── */}
      <section className="space-y-2">
        <button
          type="button"
          className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground-variant hover:text-foreground"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
        >
          <ChevronRight
            className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? "rotate-90" : ""}`}
          />
          {t("floorplan.sectionAdvanced")}
        </button>
        {showAdvanced ? (
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("floorplan.xPos")}>
              <input
                type="number"
                className="input-field text-sm"
                value={Math.round(selected.x)}
                onChange={(e) => updateSelected({ x: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label={t("floorplan.yPos")}>
              <input
                type="number"
                className="input-field text-sm"
                value={Math.round(selected.y)}
                onChange={(e) => updateSelected({ y: Number(e.target.value) || 0 })}
              />
            </Field>
          </div>
        ) : null}
      </section>

      {/* ── ACTIONS ── */}
      <div className="space-y-2 border-t border-outline-variant/25 pt-3">
        <button
          type="button"
          className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
          onClick={onDuplicate}
        >
          <Copy className="h-4 w-4" />
          {t("floorplan.duplicateRoom")}
        </button>
        {confirmDelete ? (
          <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
            <p className="text-xs text-destructive font-medium">{t("floorplan.confirmDeleteRoom")}</p>
            <div className="flex gap-2">
              <button
                type="button"
                className="inline-flex flex-1 items-center justify-center rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("floorplan.deleteRoom")}
              </button>
              <button
                type="button"
                className="inline-flex flex-1 items-center justify-center rounded-md border border-input bg-background px-2 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                onClick={() => setConfirmDelete(false)}
              >
                {t("floorplan.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-4 w-4" />
            {t("floorplan.deleteRoom")}
          </button>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-foreground-variant">
      {children}
    </p>
  );
}

function Divider() {
  return <hr className="border-outline-variant/20" />;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-foreground-variant">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
