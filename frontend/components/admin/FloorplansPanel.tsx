"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { ListPatientsResponse } from "@/lib/api/task-scope-types";
import { getQueryPollingMs, getQueryStaleTimeMs } from "@/lib/queryEndpointDefaults";
import { refetchOrThrow } from "@/lib/refetchOrThrow";
import { useTranslation } from "@/lib/i18n";
import {
  normalizeRoomShapeIds,
  resolveLayoutShapeToFloorRoomId,
} from "@/lib/floorplanRoomResolve";
import {
  alignFloorplanShapesToRegistryDevices,
  provisionRoomsForUnmappedFloorplanNodes,
} from "@/lib/floorplanSaveProvision";
import type { Device, DeviceDetail, Facility, Floor, Room, SmartDevice } from "@/lib/types";
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
  Building2,
  Camera,
  ChevronRight,
  Layers,
  MapPin,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserPlus,
  X,
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
      setRooms(mergeRoomNodesFromFloor(fromLayout, floorRooms ?? undefined));
      setSelectedId(null);
      return;
    }
    if (floorRooms == null) {
      return;
    }
    if (floorRooms.length > 0) {
      setRooms(mergeRoomNodesFromFloor(bootstrapRoomsFromDbFloor(floorRooms), floorRooms));
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
      if (failedNodePatches > 0) {
        setMessage(t("floorplan.savedPartialNodeLinks"));
      } else if (skippedNodePatches > 0) {
        setMessage(t("floorplan.savedWithUnmappedNodeLinks"));
      } else {
        setMessage(t("floorplan.saved"));
      }
      await refetch();
      await queryClient.invalidateQueries({ queryKey: ["admin", "floorplans-panel", "floor-rooms"] });
      await queryClient.invalidateQueries({ queryKey: ["device-detail-drawer", "rooms"] });
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : t("floorplan.saveFailed"));
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
              <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-foreground-variant bg-surface/80 px-3 py-1.5 rounded-xl border border-outline-variant/20 sm:max-w-[min(100%,28rem)]">
                <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="min-w-0 break-words font-medium text-foreground/90">{selectedFacilityName}</span>
                <ChevronRight className="w-3.5 h-3.5 opacity-60 shrink-0" aria-hidden />
                <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="min-w-0 break-words font-medium text-foreground/90">{selectedFloorLabel}</span>
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
                  <div className="w-full max-w-[12rem]">
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

        <div className="px-5 py-4 border-t border-outline-variant/20 bg-surface-container-low/40 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <p className="text-xs font-medium text-foreground-variant shrink-0">
            {t("floorplan.actions")}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2 sm:min-w-0 sm:flex-1">
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
                <div className="rounded-lg border border-outline-variant/30 bg-surface-container-low/55 p-3 text-xs space-y-2.5">
                  <p className="font-semibold text-foreground leading-tight">
                    {t("floorplan.roomLiveSummaryTitle")}
                  </p>
                  <dl className="space-y-2">
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-variant">
                        {t("floorplan.summaryNodeCanvas")}
                      </dt>
                      <dd className="mt-0.5 font-medium text-foreground break-words">
                        {canvasNodeLabel ?? t("floorplan.summaryNone")}
                      </dd>
                    </div>
                    {selectedNumericRoomId != null ? (
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-variant">
                          {t("floorplan.summaryNodeSaved")}
                        </dt>
                        <dd className="mt-0.5 font-medium text-foreground break-words">
                          {dbNodeLabel ?? t("floorplan.summaryNone")}
                        </dd>
                        {nodeAssignOutOfSync ? (
                          <p className="mt-1 text-[10px] text-amber-800 dark:text-amber-200/90">
                            {t("floorplan.summaryPendingSave")}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    {selectedNumericRoomId != null ? (
                      <>
                        <div>
                          <dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-variant">
                            {t("floorplan.summarySmart")}
                          </dt>
                          <dd className="mt-0.5 text-foreground break-words">
                            {smartDevicesInRoom.length === 0 ? (
                              t("floorplan.summaryNone")
                            ) : (
                              <span className="font-medium">
                                {smartDevicesInRoom
                                  .map((sd) => sd.name?.trim() || sd.ha_entity_id)
                                  .join(", ")}
                              </span>
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-variant">
                            {t("floorplan.summaryPatients")}
                          </dt>
                          <dd className="mt-0.5 text-foreground">
                            {patientsInRoom.length === 0 ? (
                              t("floorplan.summaryPatientsEmpty")
                            ) : (
                              <ul className="space-y-1.5">
                                {patientsInRoom.map((p) => (
                                  <li key={p.id} className="flex items-center gap-2 min-w-0">
                                    <Link
                                      href={`/admin/patients/${p.id}`}
                                      className="min-w-0 flex-1 truncate font-medium text-primary hover:underline"
                                    >
                                      {[p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
                                        `#${p.id}`}
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
                            )}
                          </dd>
                        </div>
                      </>
                    ) : (
                      <p className="text-foreground-variant">{t("floorplan.assignPatientNeedSavedRoom")}</p>
                    )}
                  </dl>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-outline-variant/25 pt-2">
                    <Link
                      href="/admin/devices?tab=node"
                      className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                    >
                      {t("floorplan.adminDevicesLink")}
                    </Link>
                    <Link
                      href="/admin/personnel?tab=patients"
                      className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                    >
                      {t("floorplan.adminPersonnelLink")}
                    </Link>
                  </div>
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
                  {roomDeviceTab === "node" ? (
                    <div>
                      <p className="mb-1.5 text-[11px] text-foreground-variant leading-snug">
                        {t("floorplan.beforeSearchHint")}
                      </p>
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
                        selectedOptionId={selected.node_device_id || null}
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
                      {selected.node_device_id ? (
                        <div className="mt-2 flex flex-col gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-foreground">
                          <div className="flex flex-wrap items-center gap-2">
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
                          <p className="text-[11px] text-foreground-variant leading-snug">
                            {t("floorplan.captureLiveHint")}
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/40 bg-surface-container-low px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-container-high disabled:opacity-50"
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
                              {/* Dynamic device photo URL (may be cross-origin); skip next/image remote config */}
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={capturePreviewUrl}
                                alt=""
                                className="max-h-40 w-full object-contain"
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedNumericRoomId == null ? (
                        <p className="text-xs text-foreground-variant">
                          {t("floorplan.assignPatientNeedSavedRoom")}
                        </p>
                      ) : (
                        <>
                          <p className="text-[11px] text-foreground-variant leading-snug">
                            {t("floorplan.beforeSearchHint")}
                          </p>
                          <div>
                            <p className="mb-1.5 text-xs font-medium text-foreground">
                              {t("floorplan.smartInRoom")}
                            </p>
                            {smartDevicesInRoom.length === 0 ? (
                              <p className="text-xs text-foreground-variant">—</p>
                            ) : (
                              <ul className="space-y-1.5">
                                {smartDevicesInRoom.map((sd) => (
                                  <li
                                    key={sd.id}
                                    className="flex items-center gap-2 rounded-md border border-outline-variant/25 bg-surface-container-low/60 px-2 py-1.5 text-xs"
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
                            )}
                          </div>
                          <div>
                            <p className="mb-2 text-xs font-medium text-foreground-variant">
                              {t("floorplan.deviceSearchStep")}
                            </p>
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
                              emptyStateMessage={
                                smartEmptyPool ? t("patients.empty") : null
                              }
                              emptyNoMatch={smartEmptyNoMatch}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-3 border-t border-outline-variant/25 pt-3">
                  <p className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
                    <UserPlus className="h-4 w-4" />
                    {t("floorplan.assignPatientSection")}
                  </p>
                  {selectedNumericRoomId == null ? (
                    <p className="text-xs text-foreground-variant">{t("floorplan.assignPatientNeedSavedRoom")}</p>
                  ) : (
                    <>
                      <div className="rounded-md border border-outline-variant/25 bg-surface-container-low/40 px-2.5 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground-variant">
                          {t("floorplan.currentPatientsInRoom")}
                        </p>
                        {patientsInRoom.length === 0 ? (
                          <p className="mt-1 text-xs text-foreground-variant">{t("floorplan.summaryNone")}</p>
                        ) : (
                          <ul className="mt-1.5 space-y-1.5">
                            {patientsInRoom.map((p) => (
                              <li key={p.id} className="flex items-center gap-2 min-w-0">
                                <Link
                                  href={`/admin/patients/${p.id}`}
                                  className="min-w-0 flex-1 truncate text-xs font-medium text-primary hover:underline"
                                >
                                  {[p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
                                    `#${p.id}`}
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
                        )}
                      </div>
                      <p className="text-xs text-foreground-variant">{t("floorplan.assignPatientPick")}</p>
                      <SearchableListboxPicker
                        inputId={`floorplans-panel-assign-patient-${selected.id}`}
                        listboxId={`floorplans-panel-assign-patient-list-${selected.id}`}
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
