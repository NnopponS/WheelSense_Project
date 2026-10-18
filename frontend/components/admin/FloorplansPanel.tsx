"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { ListPatientsResponse } from "@/lib/api/task-scope-types";
import { getQueryPollingMs, getQueryStaleTimeMs } from "@/lib/queryEndpointDefaults";
import { refetchOrThrow } from "@/lib/refetchOrThrow";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { getDevicesPath, getPersonnelPath } from "@/lib/routes";
import {
  normalizeRoomShapeIds,
  resolveLayoutShapeToFloorRoomId,
} from "@/lib/floorplanRoomResolve";
import {
  alignFloorplanShapesToRegistryDevices,
  provisionRoomsForUnmappedFloorplanNodes,
} from "@/lib/floorplanSaveProvision";
import type { Device, DeviceDetail, Facility, Floor, Room, SmartDevice } from "@/lib/types";
import FloorplanCanvas, { type FloorplanRoomMeta } from "@/components/floorplan/FloorplanCanvas";
import { RoomInspectorFrame } from "@/components/floorplan/RoomInspectorFrame";
import { FacilityRoomInsights } from "@/components/floorplan/FacilityRoomInsights";
import { FloorplanLayers } from "@/components/floorplan/FloorplanLayers";
import { useFloorplanDraft } from "@/hooks/useFloorplanDraft";
import { readFloorplanBackground, validateFloorplanRooms, applyReferenceCoordinates, REFERENCE_BACKGROUND } from "@/lib/floorplanEditor";
import type { FloorplanPresenceOut } from "@/lib/api/task-scope-types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
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
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserPlus,
  X,
  Undo2,
  Redo2,
  Eye,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import styles from "./facility-workspace.module.css";

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
  workspace = false,
  scopeControls,
  externalScope = null,
  onDirtyChange,
  onFloorChange,
  onBusyChange,
}: {
  embedded?: boolean;
  workspace?: boolean;
  scopeControls?: ReactNode;
  /** Parent-selected facility/floor (e.g. Facility management tabs). Hides duplicate building/floor pickers. */
  externalScope?: FloorplansPanelExternalScope | null;
  onDirtyChange?: (dirty: boolean) => void;
  onFloorChange?: (floorId: number) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [immersive, setImmersive] = useState(false);
  const [mobileMap, setMobileMap] = useState(false);
  const fullscreenOwner = useRef(false);

  useEffect(() => {
    if (!immersive) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement) setImmersive(false);
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && fullscreenOwner.current) {
        fullscreenOwner.current = false;
        setImmersive(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (fullscreenOwner.current && document.fullscreenElement) {
        fullscreenOwner.current = false;
        void document.exitFullscreen().catch(() => {});
      }
    };
  }, [immersive]);

  async function toggleFullscreen() {
    if (immersive) {
      if (fullscreenOwner.current && document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
      }
      setImmersive(false);
      return;
    }
    setImmersive(true);
    try {
      // Keep portaled building/floor dialogs inside the browser's fullscreen element.
      await document.documentElement.requestFullscreen();
      fullscreenOwner.current = true;
    } catch {
      // The immersive layout remains available when browser fullscreen is restricted.
      fullscreenOwner.current = false;
    }
  }

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
  const [facilityId, setFacilityId] = useState<number | "">(externalScope?.facilityId ?? "");
  const [floorId, setFloorId] = useState<number | "">(externalScope?.floorId ?? "");

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
  const { data: floorRooms, isLoading: loadingFloorRooms, error: floorRoomsError } = useQuery({
    queryKey: ["admin", "floorplans-panel", "floor-rooms", floorRoomsEndpoint],
    queryFn: () => api.get<Room[]>(floorRoomsEndpoint!),
    enabled: Boolean(floorRoomsEndpoint),
    staleTime: floorRoomsEndpoint ? getQueryStaleTimeMs(floorRoomsEndpoint) : 0,
    refetchInterval: floorRoomsEndpoint ? getQueryPollingMs(floorRoomsEndpoint) : false,
    retry: 3,
  });

  const { data: devices, error:devicesError } = useQuery({
    queryKey: ["admin", "floorplans-panel", "devices"],
    queryFn: () => api.get<Device[]>("/devices"),
    staleTime: getQueryStaleTimeMs("/devices"),
    refetchInterval: getQueryPollingMs("/devices"),
    retry: 3,
  });

  const { data: smartDevicesRaw = [], error:smartDevicesError, isLoading:loadingSmartDevices, refetch: refetchSmartDevicesBase } = useQuery({
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

  const incoming = useMemo(() => {
    const saved=normalizeFloorplanRooms(layoutRes?.layout_json);
    const initial=saved.length ? saved : floorRooms?.length ? bootstrapRoomsFromDbFloor(floorRooms) : [];
    const merged=mergeRoomNodesFromFloor(initial,floorRooms);
    const hydrated=merged.map(room=>{
      const row=(floorRooms??[]).find(item=>item.id===resolveShapeRoomId(room,floorRooms));
      const device=(devices??[]).find(item=>room.node_device_id ? item.device_id===room.node_device_id : item.id===room.device_id);
      return {...room,room_type:row?.room_type ?? "general",...(device ? {device_id:device.id,node_device_id:device.device_id} : {})};
    });
    const floor=(floors??[]).find(item=>item.id===floorId);
    return {rooms:hydrated,background:readFloorplanBackground(floor?.map_data?.wheelsense_background)};
  },[layoutRes,floorRooms,devices,floors,floorId]);
  const [partialSave,setPartialSave]=useState(false);
  const {state:draft,dispatch:dispatchDraft,change:changeDraft,setRooms,dirty:draftDirty}=useFloorplanDraft(`${facilityId}:${floorId}`,incoming,partialSave);
  const dirty=draftDirty || partialSave;
  const rooms=draft.value.rooms;
  const background=draft.value.background;
  const [editing,setEditing]=useState(false);
  const [inspectorTab,setInspectorTab]=useState("overview");
  const [inspectorCollapsed,setInspectorCollapsed]=useState(false);
  const [inspectorWidth,setInspectorWidth]=useState(320);
  const [roomSearch,setRoomSearch]=useState("");
  const [roomTypeFilter,setRoomTypeFilter]=useState("all");
  const [statusFilter,setStatusFilter]=useState("all");
  const [showGrid,setShowGrid]=useState(true);
  const [showStatus,setShowStatus]=useState(true);
  const [showBackground,setShowBackground]=useState(true);
  const [snapEnabled,setSnapEnabled]=useState(true);
  const [fitRevision,setFitRevision]=useState(0);
  const [referenceBusy,setReferenceBusy]=useState(false);
  const importRequest=useRef<AbortController|null>(null);
  const activeSelection=useRef<string|null>(null);
  const panelRef=useRef<HTMLDivElement>(null);
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

  useEffect(()=>{setSelectedId(null);setPartialSave(false);setEditing(false);setRoomSearch("");setRoomTypeFilter("all");setStatusFilter("all");setMessage(null)},[facilityId,floorId]);
  useEffect(()=>{onDirtyChange?.(dirty)},[dirty,onDirtyChange]);
  useEffect(()=>{onBusyChange?.(saving)},[saving,onBusyChange]);
  useEffect(()=>()=>{importRequest.current?.abort()},[facilityId,floorId]);
  useEffect(()=>{activeSelection.current=`${facilityId}:${floorId}:${selectedId}`},[facilityId,floorId,selectedId]);
  useEffect(()=>{
    if(!dirty)return;
    const beforeUnload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=""};
    const onLink=(event:MouseEvent)=>{
      if(event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.button!==0)return;
      const anchor=(event.target as Element).closest?.("a[href]") as HTMLAnchorElement|null;
      if(!anchor || anchor.target==="_blank" || anchor.download || anchor.href.split("#")[0]===location.href.split("#")[0])return;
      if(!window.confirm(t("facilityWorkspace.discardConfirm"))){event.preventDefault();event.stopPropagation()}
    };
    const navigation=(window as Window & {navigation?:EventTarget}).navigation;
    const onTraverse=(event:Event)=>{
      const traverse=event as Event & {navigationType?:string;hashChange?:boolean;destination?:{url:string}};
      if(traverse.navigationType!=="traverse" || !traverse.cancelable || traverse.hashChange || traverse.destination?.url.split("#")[0]===location.href.split("#")[0])return;
      if(!window.confirm(t("facilityWorkspace.discardConfirm")))traverse.preventDefault();
    };
    navigation?.addEventListener("navigate",onTraverse);
    window.addEventListener("beforeunload",beforeUnload);document.addEventListener("click",onLink,true);
    return()=>{navigation?.removeEventListener("navigate",onTraverse);window.removeEventListener("beforeunload",beforeUnload);document.removeEventListener("click",onLink,true)};
  },[dirty,t]);

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
  const { data: assignPatientsRaw, isLoading: loadingAssignPatients, error: assignPatientsError } = useQuery({
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



  const updateSelected = useCallback(
    (patch: Partial<FloorplanRoomShape>) => {
      if (!selectedId) return;
      setRooms((prev) =>
        prev.map((r) => (r.id === selectedId ? { ...r, ...patch } : r)),
      );
    },
    [selectedId,setRooms],
  );

  async function onSave() {
    if (facilityId === "" || floorId === "") return;
    if(floorRoomsError || floorRooms==null || devicesError || devices==null){setMessage(t("redesign.unavailable"));return;}
    if(JSON.stringify(background)!==JSON.stringify(draft.saved.background) && !floors?.some(floor=>floor.id===floorId)){setMessage(t("redesign.unavailable"));return;}
    if(!validateFloorplanRooms(rooms) || (background && !readFloorplanBackground(background))){setMessage(t("facilityWorkspace.invalidLayout"));return;}
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
          true,
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
      if(!validateFloorplanRooms(alignedForLayout)){setMessage(t("facilityWorkspace.invalidLayout"));return;}

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
        roomNodeUpdates.map((item) => {
          const next=alignedForLayout.find(shape=>resolveLayoutShapeToFloorRoomId(shape,mergedRefs)===item.roomId);
          const previous=draft.saved.rooms.find(shape=>resolveLayoutShapeToFloorRoomId(shape,mergedRefs)===item.roomId);
          return api.patch(`/rooms/${item.roomId}`, {
            node_device_id:item.nodeDeviceId,
            ...(next && previous?.label!==next.label ? {name:next.label} : {}),
            ...(next && previous?.room_type!==next.room_type ? {room_type:next.room_type} : {}),
          });
        }),
      );
      const failedNodePatches = nodePatchResults.filter((result) => result.status === "rejected").length;
      const currentFloor=(floors??[]).find(item=>item.id===floorId);
      if(JSON.stringify(background)!==JSON.stringify(draft.saved.background)) {
        try {
          await api.patch(`/facilities/${facilityId}/floors/${floorId}`,{map_data:{...(currentFloor?.map_data??{}),wheelsense_background:background}});
          await queryClient.invalidateQueries({queryKey:["admin","floorplans-panel","floors"]});
          await queryClient.invalidateQueries({queryKey:["admin","facility-management","floors"]});
        } catch {
          setPartialSave(true);
          setMessage(t("facilityWorkspace.backgroundSaveFailed"));
          return;
        }
      }
      const incomplete=failedNodePatches>0 || skippedNodePatches>0;
      setPartialSave(incomplete);
      if(!incomplete)dispatchDraft({type:"saved",value:{rooms:alignedForLayout,background}});
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
    const captureSelection=`${facilityId}:${floorId}:${selectedId}`;
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
      if(activeSelection.current!==captureSelection)return;
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

  const presenceEndpoint=facilityId!=="" && floorId!=="" ? `/floorplans/presence?facility_id=${facilityId}&floor_id=${floorId}` : null;
  const presenceQuery=useQuery({queryKey:["admin","floorplans-panel","presence",presenceEndpoint],queryFn:()=>api.get<FloorplanPresenceOut>(presenceEndpoint!),enabled:Boolean(presenceEndpoint),refetchInterval:5000,refetchIntervalInBackground:true,staleTime:3000,retry:false});
  const presenceByShape=useMemo(()=>{
    const map=new Map<string,FloorplanPresenceOut["rooms"][number]>();
    if(presenceQuery.isError)return map;
    for(const shape of rooms){const id=resolveShapeRoomId(shape,floorRooms);const live=presenceQuery.data?.rooms.find(room=>room.room_id===id);if(live)map.set(shape.id,live)}
    return map;
  },[rooms,floorRooms,presenceQuery.data,presenceQuery.isError]);
  const roomMeta=useMemo<Record<string,FloorplanRoomMeta>>(()=>Object.fromEntries(rooms.map(shape=>{
    const live=presenceByShape.get(shape.id);
    return [shape.id,{tone:live && live.alert_count>0 ? "critical" : live?.node_status==="offline" || live?.node_status==="stale" ? "warning" : live?.node_status==="online" ? "success" : "info",chips:live ? [{label:`${live.alert_count} ${t("overview.roomAlerts")}`,tone:live.alert_count>0 ? "critical" : "info"}] : [{label:t("redesign.unavailable"),tone:"info"}],detailLines:live ? [t(`overview.node.${live.node_status}`),live.occupants ? live.occupants.map(person=>person.display_name).join(", ") || t("overview.noOccupants") : t("redesign.unavailable")] : []}];
  })),[rooms,presenceByShape,t]);
  const roomTypes=[...new Set(rooms.map(shape=>shape.room_type??"general"))];
  const visibleRoomIds=rooms.filter(shape=>{
    const live=presenceByShape.get(shape.id),type=shape.room_type??"general";
    const query=roomSearch.trim().toLocaleLowerCase();
    return (!query || `${shape.label} ${type}`.toLocaleLowerCase().includes(query)) && (roomTypeFilter==="all" || type===roomTypeFilter) && (statusFilter==="all" || (statusFilter==="alerts" ? Boolean(live?.alert_count) : live?.node_status===statusFilter));
  }).map(shape=>shape.id);
  const canEdit=user?.role==="admin" || user?.role==="head_caregiver";
  const selectRoom=(id:string|null)=>{setSelectedId(id);setInspectorCollapsed(false)};
  const changeMode=(value:string)=>{setEditing(value==="edit");setRoomSearch("");setRoomTypeFilter("all");setStatusFilter("all")};
  const discardDraft=()=>{if(!dirty || window.confirm(t("facilityWorkspace.discardConfirm"))){dispatchDraft({type:"discard"});setPartialSave(false);void refetch();setSelectedId(null);setEditing(false);setFitRevision(value=>value+1)}};
  const removeSelected=()=>{if(!selectedId || !editing || saving)return;if(window.confirm(t("facilityWorkspace.removeBoundaryConfirm"))){setRooms(previous=>previous.filter(room=>room.id!==selectedId));setSelectedId(null)}};
  const importReference=async()=>{
    if(!editing || !window.confirm(t("facilityWorkspace.referenceConfirm")))return;
    const controller=new AbortController();importRequest.current=controller;setReferenceBusy(true);
    try {const reference=await fetch("/floorplans/wheelsense_floorplan_rooms.json",{signal:controller.signal}).then(response=>{if(!response.ok)throw new Error();return response.json()});
      if(controller.signal.aborted)return;
      const next=applyReferenceCoordinates(rooms,reference);
      if(!validateFloorplanRooms(next))throw new Error();
      changeDraft(value=>({...value,rooms:next,background:REFERENCE_BACKGROUND}));setShowBackground(true);setFitRevision(value=>value+1);setMessage(t("facilityWorkspace.referenceDraft"));
    }catch{if(!controller.signal.aborted)setMessage(t("facilityWorkspace.referenceFailed"))}finally{setReferenceBusy(false)}
  };
  useEffect(()=>{
    const keyboard=(event:KeyboardEvent)=>{
      const target=event.target as HTMLElement;
      if(!panelRef.current?.contains(target) && !target.closest("[data-floorplan-inspector]"))return;
      if((event.metaKey||event.ctrlKey) && event.key.toLowerCase()==="s"){event.preventDefault();if(canEdit && !saving && dirty)void onSave()}
      if(!editing || saving || target.closest("input,textarea,select,[contenteditable=true],[role=combobox]"))return;
      if((event.metaKey||event.ctrlKey) && ["z","y"].includes(event.key.toLowerCase())){event.preventDefault();dispatchDraft({type:event.shiftKey||event.key.toLowerCase()==="y" ? "redo" : "undo"})}
      if((event.key==="Delete" || event.key==="Backspace") && target.closest("svg")){event.preventDefault();removeSelected()}
    };
    document.addEventListener("keydown",keyboard);return()=>document.removeEventListener("keydown",keyboard);
  });

  return (
    <div ref={panelRef} className={cn(workspace ? styles.panel : "space-y-6", immersive && styles.immersive)} style={{"--inspector-width":inspectorCollapsed ? "3.5rem" : `${inspectorWidth}px`} as CSSProperties}>
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

      {workspace && <>
        <div className={styles.editorToolbar}>
          {scopeControls}
          <div className={styles.editorActions}>
            <div role="group" aria-label={t("facilityWorkspace.mode")} className="flex gap-1 rounded-lg bg-muted p-1"><Button type="button" variant={editing ? "ghost" : "secondary"} aria-pressed={!editing} onClick={()=>changeMode("view")} disabled={saving}><Eye className="size-4"/>{t("facilityWorkspace.view")}</Button><Button type="button" variant={editing ? "secondary" : "ghost"} aria-pressed={editing} disabled={!canEdit || saving} onClick={()=>changeMode("edit")}><Pencil className="size-4"/>{t("facilityWorkspace.edit")}</Button></div>

            <Button type="button" variant="outline" size="icon" aria-label={t(immersive ? "workspace.exitFullscreen" : "workspace.fullscreen")} title={t(immersive ? "workspace.exitFullscreen" : "workspace.fullscreen")} aria-pressed={immersive} onClick={()=>void toggleFullscreen()}>{immersive ? <Minimize2/> : <Maximize2/>}</Button>
          </div>
        </div>
        <div className={styles.viewBar}>
          <div className={styles.filters}>
            <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden/><Input type="search" className="pl-9" aria-label={t("facilityWorkspace.search")} placeholder={t("facilityWorkspace.search")} value={roomSearch} onChange={event=>setRoomSearch(event.target.value)}/></div>
            <select className="input-field text-sm" aria-label={t("facilityWorkspace.roomType")} value={roomTypeFilter} onChange={event=>setRoomTypeFilter(event.target.value)}><option value="all">{t("facilityWorkspace.allTypes")}</option>{roomTypes.map(type=><option key={type} value={type}>{type}</option>)}</select>
            <select className="input-field text-sm" aria-label={t("facilityWorkspace.status")} value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}>{["all","alerts","online","stale","offline","unmapped"].map(status=><option key={status} value={status}>{t(`facilityWorkspace.filter.${status}`)}</option>)}</select>
              <select aria-label={t("floorplan.selectRoom")} className={cn("input-field text-sm",styles.roomPicker)} value={selectedId??""} onChange={event=>selectRoom(event.target.value||null)}><option value="">{t("floorplan.selectRoom")}</option>{rooms.filter(room=>visibleRoomIds.includes(room.id)).map(room=><option key={room.id} value={room.id}>{room.label}</option>)}</select>
          </div>
          <FloorplanLayers facilityId={Number(facilityId)} floorId={Number(floorId)} editing={editing && !saving} background={background} onBackgroundChange={next=>changeDraft(value=>({...value,background:next}))}
            showGrid={showGrid} onShowGridChange={setShowGrid} showStatus={showStatus} onShowStatusChange={setShowStatus} showBackground={showBackground} onShowBackgroundChange={setShowBackground} snapEnabled={snapEnabled} onSnapChange={setSnapEnabled} importing={referenceBusy} onImportReference={()=>void importReference()}/>
        </div>
        <div className={styles.draftBar} aria-live="polite">
          <span className="text-xs text-muted-foreground">{visibleRoomIds.length}/{rooms.length} {t("overview.rooms")} · {dirty ? t("facilityWorkspace.unsaved") : t("facilityWorkspace.savedLayout")}</span>
          <div className="flex flex-wrap items-center gap-1">
            {editing ? <>
            <Button type="button" variant="outline" disabled={canvasLoading || !!layoutError || saving} onClick={()=>{const room=newRoom();setRooms(previous=>[...previous,room]);selectRoom(room.id);setInspectorTab("layout")}}><Plus />{t("floorplan.addRoom")}</Button>
            <Button type="button" variant="ghost" size="icon" aria-label={t("facilityWorkspace.undo")} title={`${t("facilityWorkspace.undo")} · Ctrl/⌘ Z`} disabled={!editing || !draft.past.length || saving} onClick={()=>dispatchDraft({type:"undo"})}><Undo2/></Button>
            <Button type="button" variant="ghost" size="icon" aria-label={t("facilityWorkspace.redo")} title={`${t("facilityWorkspace.redo")} · Ctrl/⌘ Shift Z`} disabled={!editing || !draft.future.length || saving} onClick={()=>dispatchDraft({type:"redo"})}><Redo2/></Button>
            </> : null}
            {dirty ? <Button type="button" variant="ghost" disabled={saving} onClick={discardDraft}>{t("facilityWorkspace.discard")}</Button> : null}
            {editing || dirty ? <Button type="button" disabled={!canEdit || saving || canvasLoading || !!layoutError || !!floorRoomsError || !!devicesError || !devices || (!dirty && roomsFromLayout.length>0)} onClick={()=>void onSave()}><Save/>{saving ? t("common.saving") : t("floorplan.save")}</Button> : null}
          </div>
        </div>
      </>}
      {!workspace && <div className="rounded-2xl border border-outline-variant/25 bg-surface-container-low/60 shadow-sm overflow-hidden">
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
      </div>}

      {message && (
        <p
          role="status"
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
        <div className={workspace ? styles.stage : "grid gap-4 lg:grid-cols-[1fr_280px]"}>
          <div className={workspace ? styles.canvasColumn : "space-y-2"}>

            {workspace && floors && floors.length>1 ? <nav className={styles.floorRail} aria-label={t("facilityWorkspace.floorNavigation")}>{floors.map(floor=><Button key={floor.id} type="button" variant={floorId===floor.id ? "secondary" : "ghost"} aria-label={floor.name || `${t("floorplan.floor")} ${floor.floor_number}`} aria-current={floorId===floor.id ? "location" : undefined} title={floor.name} onClick={()=>{if(onFloorChange)onFloorChange(floor.id);else if(!dirty || window.confirm(t("facilityWorkspace.discardConfirm")))setFloorId(floor.id)}}>{floor.floor_number}</Button>)}</nav> : null}
            {presenceQuery.isError || floorRoomsError ? <p role="status" className="text-xs text-muted-foreground">{t("overview.presenceUnavailable")}</p> : null}
            {background?.reference && showBackground ? <p className="text-xs text-warning">{t("facilityWorkspace.referenceNotice")}</p> : null}

            {workspace && <div className={styles.mobileDirectory}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{t("redesign.nav.rooms")}</p>
                <Button type="button" variant="outline" aria-pressed={mobileMap} onClick={() => setMobileMap((value) => !value)}>
                  {mobileMap ? t("common.close") : t("floorplan.canvas")}
                </Button>
              </div>
              {canvasLoading && <p role="status" className="text-sm text-muted-foreground">{t("common.loading")}</p>}
              {layoutError && <div role="alert" className="flex flex-col items-start gap-2">
                <p className="text-sm text-destructive">{t("floorplan.layoutError")}</p>
                <Button type="button" variant="outline" onClick={() => void refetch()}>{t("redesign.retry")}</Button>
              </div>}
              <div className={styles.roomList}>
                {rooms.filter(room=>visibleRoomIds.includes(room.id)).map((room) => <Button key={room.id} type="button" variant={selectedId === room.id ? "secondary" : "ghost"}
                  aria-pressed={selectedId === room.id} onClick={() => selectRoom(room.id)}>
                  <span className="min-w-0 truncate">{room.label}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{editing ? `${Math.round(canvasUnitsToPercent(room.w))} × ${Math.round(canvasUnitsToPercent(room.h))}%` : presenceByShape.get(room.id) ? t(`overview.node.${presenceByShape.get(room.id)!.node_status}`) : t("redesign.unavailable")}</span>
                </Button>)}
              </div>
              {!canvasLoading && !layoutError && rooms.length === 0 && <p className="text-sm text-muted-foreground">{t("floorplan.emptyLayout")}</p>}
            </div>}
            <div className={workspace ? styles.mapArea : undefined} data-mobile-map={mobileMap}>
            {!workspace && <p className="text-xs font-medium text-outline uppercase tracking-wide">
              {t("floorplan.canvas")}
            </p>}
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
            ) : rooms.length === 0 || (!editing && !dirty && roomsFromLayout.length===0) ? (
              <div className="min-h-[280px] flex items-center justify-center surface-card px-4">
                <p className="text-sm text-foreground-variant text-center">
                  {rooms.length ? t("redesign.noGeometry") : t("floorplan.emptyLayout")}
                </p>
              </div>
            ) : (
              <div className={workspace ? styles.canvas : undefined}>
              <FloorplanCanvas
                fitContentOnMount
                fillViewport={workspace}
                rooms={rooms}
                onRoomsChange={setRooms}
                readOnly={!editing || saving}
                workspaceTools={workspace}
                background={showBackground ? background : null}
                showGrid={showGrid}
                snapToGrid={snapEnabled}
                visibleRoomIds={visibleRoomIds}
                roomMetaById={showStatus ? roomMeta : {}}
                fitKey={`${facilityId}:${floorId}:${fitRevision}`}
                selectedId={selectedId}
                onSelect={selectRoom}
              />
              </div>
            )}
            <div className={styles.legend} aria-label={t("facilityWorkspace.legend")}>
              <span><span className={styles.alertDot} aria-hidden/> {t("overview.roomAlerts")}</span><span><span className={styles.staleDot} aria-hidden/> {t("overview.stale")} / {t("overview.offline")}</span><span><span className={styles.onlineDot} aria-hidden/> {t("overview.node.online")}</span>
              <span>{editing ? t("facilityWorkspace.editHint") : t("facilityWorkspace.viewHint")}</span>
            </div>
            </div>
          </div>

          <RoomInspectorFrame title={selected?.label || t("floorplan.roomProps")} selected={Boolean(selected)} collapsed={inspectorCollapsed} onCollapsedChange={setInspectorCollapsed} width={inspectorWidth} onWidthChange={setInspectorWidth} onClose={()=>setSelectedId(null)}>
            {!selected ? <div className="space-y-3 py-6"><MapPin className="size-7 text-muted-foreground" aria-hidden/><p className="text-sm font-semibold">{t("floorplan.selectRoom")}</p><p className="text-sm text-muted-foreground">{t("facilityWorkspace.inspectorDescription")}</p></div> : <Tabs value={inspectorTab} onValueChange={setInspectorTab}>
              <TabsList className="mb-4 grid h-auto w-full grid-cols-3" aria-label={t("floorplan.roomProps")}>{["overview","residents","devices","alerts","history","layout"].map(tab=><TabsTrigger key={tab} value={tab} className="min-h-9 px-2 text-xs">{t(`facilityWorkspace.tab.${tab}`)}</TabsTrigger>)}</TabsList>
              <TabsContent value="overview"><FacilityRoomInsights room={dbRoomForSelected} shape={selected} presence={presenceByShape.get(selected.id)} presenceState={presenceQuery.isError ? "unavailable" : presenceQuery.isPending ? "pending" : "ready"} tab="overview" layoutUpdatedAt={layoutRes?.updated_at} residentCount={selectedNumericRoomId==null || loadingAssignPatients || assignPatientsError ? undefined : patientsInRoom.length}/></TabsContent>
              <TabsContent value="alerts"><FacilityRoomInsights room={dbRoomForSelected} shape={selected} presence={presenceByShape.get(selected.id)} presenceState={presenceQuery.isError ? "unavailable" : presenceQuery.isPending ? "pending" : "ready"} tab="alerts" layoutUpdatedAt={layoutRes?.updated_at}/></TabsContent>
              <TabsContent value="history"><FacilityRoomInsights room={dbRoomForSelected} shape={selected} presence={presenceByShape.get(selected.id)} presenceState={presenceQuery.isError ? "unavailable" : presenceQuery.isPending ? "pending" : "ready"} tab="history" layoutUpdatedAt={layoutRes?.updated_at}/></TabsContent>
              <TabsContent value="residents">{assignPatientsError ? <p role="status" className="text-sm text-muted-foreground">{t("redesign.unavailable")}</p> : loadingAssignPatients ? <p className="text-sm text-muted-foreground">{t("common.loading")}</p> : <>
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

              </>}<Link href={`${getPersonnelPath(user?.role || "admin")}?tab=patients`} className="inline-flex min-h-11 items-center text-sm text-primary">{t("floorplan.adminPersonnelLink")}</Link></TabsContent>
              <TabsContent value="devices"><dl className="mb-4 space-y-2 text-xs"><div><dt className="text-muted-foreground">{t("floorplan.summaryNodeSaved")}</dt><dd>{dbNodeLabel ?? t("floorplan.summaryNone")}</dd></div><div><dt className="text-muted-foreground">{t("floorplan.summaryNodeCanvas")}</dt><dd>{canvasNodeLabel ?? t("floorplan.summaryNone")}</dd></div></dl>{nodeAssignOutOfSync ? <p className="mb-3 text-xs text-warning">{t("floorplan.summaryPendingSave")}</p> : null}
                <div className="space-y-3">
                  <p className="text-xs text-foreground-variant">{t("floorplan.nodeDeviceLinkHint")}</p>
                  <div>
                    <p className="mb-2 text-xs font-medium text-foreground-variant">
                      {t("floorplan.deviceCategoryStep")}
                    </p>
                    <div
                      className="flex flex-wrap gap-1.5"
                      role="group"
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
                            aria-pressed={active}
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
                        disabled={nodeEmptyPool || !editing || saving || !!devicesError}
                        listboxAriaLabel={t("floorplan.selectNodeDevice")}
                        noMatchMessage={t("floorplan.noNodeDeviceMatches")}
                        emptyStateMessage={
                          devicesError ? t("redesign.unavailable") : devices==null ? t("common.loading") : nodeEmptyPool ? t("floorplan.noDevicesInCategory") : null
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
                              disabled={!editing || saving}
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
                              disabled={smartEmptyPool || !!smartDevicesError || loadingSmartDevices}
                              listboxAriaLabel={t("floorplan.linkTabSmart")}
                              noMatchMessage={t("floorplan.noNodeDeviceMatches")}
                              emptyStateMessage={
                                smartDevicesError ? t("redesign.unavailable") : loadingSmartDevices ? t("common.loading") : smartEmptyPool ? t("patients.empty") : null
                              }
                              emptyNoMatch={smartEmptyNoMatch}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

              <Link href={`${getDevicesPath(user?.role || "admin")}?tab=node`} className="inline-flex min-h-11 items-center text-sm text-primary">{t("floorplan.adminDevicesLink")}</Link></TabsContent>
              <TabsContent value="layout"><fieldset disabled={!editing || saving} className="space-y-4 disabled:opacity-75">
                <div>
                  <label htmlFor="facility-room-label" className="text-xs text-foreground-variant">
                    {t("floorplan.label")}
                  </label>
                  <input
                    id="facility-room-label"
                    className="input-field mt-1 text-sm"
                    maxLength={128}
                    value={selected.label}
                    onChange={(e) => updateSelected({ label: e.target.value })}
                  />
                </div>

                <label className="block text-xs text-muted-foreground">{t("facilityWorkspace.roomType")}<Input className="mt-1" value={selected.room_type??dbRoomForSelected?.room_type??"general"} maxLength={64} onChange={event=>updateSelected({room_type:event.target.value})}/></label>
                <div className="grid grid-cols-2 gap-3">{(["x","y","w","h"] as const).map(key=><label key={key} className="text-xs text-muted-foreground">{t(`facilityWorkspace.geometry.${key}`)} %<Input className="mt-1" type="number" min={key==="w"||key==="h" ? .1 : 0} max={100} step={.1} value={Number(canvasUnitsToPercent(selected[key]).toFixed(2))} onChange={event=>{if(event.target.value!=="")updateSelected({[key]:Number(event.target.value)*50})}}/></label>)}</div>
                <Button type="button" variant="outline" className="w-full text-destructive" onClick={removeSelected}><Trash2/>{t("facilityWorkspace.removeBoundary")}</Button>
              </fieldset>{!editing ? <Button type="button" className="mt-4" onClick={()=>changeMode("edit")} disabled={!canEdit}>{t("facilityWorkspace.enterEdit")}</Button> : <p className="mt-3 text-xs text-muted-foreground">{t("facilityWorkspace.editHint")}</p>}</TabsContent>
            </Tabs>}
          </RoomInspectorFrame>
        </div>
      )}
    </div>
  );
}
