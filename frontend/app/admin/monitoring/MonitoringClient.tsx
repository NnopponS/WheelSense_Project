"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import { useQuery } from "@/hooks/useQuery";
import { api, ApiError } from "@/lib/api";
import EmptyState from "@/components/EmptyState";
import { Building2, Info, Layers, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import FacilitiesPanel from "@/components/admin/FacilitiesPanel";
import RoomFormModal from "@/components/admin/RoomFormModal";
import FacilityFloorToolbar from "@/components/admin/monitoring/FacilityFloorToolbar";
import RoomDetailDrawer from "@/components/admin/monitoring/RoomDetailDrawer";
import type { RoomDetailRoom } from "@/components/admin/monitoring/RoomDetailDrawer";
import {
  buildMonitoringSearchParams,
  parseMonitoringQuery,
  type MonitoringWorkspaceQuery,
} from "@/lib/monitoringWorkspace";
import type { Facility, Floor } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { withWorkspaceScope } from "@/lib/workspaceQuery";

interface Room {
  id: number;
  name: string;
  description: string;
  floor_id: number | null;
  floor_name: string | null;
  floor_number: number | null;
  facility_id: number | null;
  facility_name: string | null;
  room_type: string;
  node_device_id: string | null;
}

function MapLoadingFallback() {
  const { t } = useTranslation();
  return (
    <div className="flex justify-center py-16 text-sm text-on-surface-variant">
      {t("monitoring.flow.mapLoading")}
    </div>
  );
}

const FloorMapWorkspace = dynamic(
  () => import("@/components/admin/monitoring/FloorMapWorkspace"),
  { ssr: false, loading: () => <MapLoadingFallback /> },
);

export default function MonitoringClient() {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const query = useMemo(() => {
    const o: Record<string, string | string[] | undefined> = {};
    searchParams.forEach((v, k) => {
      o[k] = v;
    });
    return parseMonitoringQuery(o);
  }, [searchParams]);

  const [message, setMessage] = useState<string | null>(null);
  const [roomModalOpen, setRoomModalOpen] = useState(false);
  const [roomModalMode, setRoomModalMode] = useState<"create" | "edit">("edit");
  const [roomModalSnapshot, setRoomModalSnapshot] = useState<Room | null>(null);
  const [detailRoomId, setDetailRoomId] = useState<number | null>(null);

  const replaceQuery = useCallback(
    (patch: Partial<MonitoringWorkspaceQuery>) => {
      const cur = new URLSearchParams(searchParams.toString());
      const next = buildMonitoringSearchParams(patch, cur);
      const s = next.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const facilitiesEndpoint = useMemo(
    () => withWorkspaceScope("/facilities", user?.workspace_id),
    [user?.workspace_id],
  );
  const {
    data: facilities,
    isLoading: loadingFac,
    refetch: refetchFacilities,
  } = useQuery<Facility[]>(facilitiesEndpoint);

  const facilityId = query.facilityId;
  const floorId = query.floorId;
  const view = query.view;

  const floorsEndpoint = useMemo(
    () =>
      facilityId === null
        ? null
        : withWorkspaceScope(`/facilities/${facilityId}/floors`, user?.workspace_id),
    [facilityId, user?.workspace_id],
  );
  const {
    data: floors,
    isLoading: loadingFloors,
    refetch: refetchFloors,
  } = useQuery<Floor[]>(floorsEndpoint);

  const roomsEndpoint = useMemo(
    () =>
      floorId === null ? null : withWorkspaceScope(`/rooms?floor_id=${floorId}`, user?.workspace_id),
    [floorId, user?.workspace_id],
  );
  const { data: rooms, isLoading: loadingRooms, refetch: refetchRooms } = useQuery<Room[]>(
    roomsEndpoint,
  );

  useEffect(() => {
    if (!facilities?.length || facilityId === null) return;
    if (!facilities.some((f) => f.id === facilityId)) {
      replaceQuery({ facilityId: null, floorId: null });
    }
  }, [facilities, facilityId, replaceQuery]);

  useEffect(() => {
    if (!floors?.length || floorId === null) return;
    if (!floors.some((f) => f.id === floorId)) {
      replaceQuery({ floorId: null });
    }
  }, [floors, floorId, replaceQuery]);

  const onFacilityChange = useCallback(
    (id: number | null) => {
      replaceQuery({ facilityId: id, floorId: null, view: view === "map" ? "map" : "list" });
    },
    [replaceQuery, view],
  );

  const onFloorChange = useCallback(
    (id: number | null) => {
      replaceQuery({ floorId: id });
    },
    [replaceQuery],
  );

  const onViewChange = useCallback(
    (v: MonitoringWorkspaceQuery["view"]) => {
      replaceQuery({ view: v });
    },
    [replaceQuery],
  );

  const onMapRoomSelect = useCallback((id: number | null) => {
    setDetailRoomId(id);
  }, []);

  function openCreateRoom() {
    setRoomModalMode("create");
    setRoomModalSnapshot(null);
    setRoomModalOpen(true);
  }

  function openEditRoom(room: Room) {
    setRoomModalMode("edit");
    setRoomModalSnapshot({ ...room });
    setRoomModalOpen(true);
  }

  async function deleteRoom(room: Room) {
    if (!window.confirm(`Delete room "${room.name}"?`)) return;
    try {
      await api.delete<void>(`/rooms/${room.id}`);
      setMessage("Room deleted");
      await refetchRooms();
      if (detailRoomId === room.id) setDetailRoomId(null);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not delete room");
    }
  }

  const floorLabel = (room: Room) => {
    const name = room.floor_name?.trim();
    if (name) return name;
    if (typeof room.floor_number === "number" && !Number.isNaN(room.floor_number)) {
      return `${t("monitoring.floorPrefix")} ${room.floor_number}`;
    }
    return t("monitoring.noFloor");
  };

  const detailRoom: RoomDetailRoom | null = useMemo(() => {
    if (detailRoomId === null || !rooms?.length) return null;
    const r = rooms.find((x) => x.id === detailRoomId);
    return r ?? null;
  }, [detailRoomId, rooms]);

  const overviewFloors = floors?.length ?? 0;
  const overviewRoomsOnFloor = rooms?.length ?? 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-on-surface">{t("nav.roomsMap")}</h2>
        <p className="text-sm text-on-surface-variant mt-1">{t("monitoring.subtitle")}</p>
      </div>

      <FacilityFloorToolbar
        facilities={facilities ?? []}
        floors={floors ?? []}
        facilityId={facilityId}
        floorId={floorId}
        view={view}
        loadingFacilities={loadingFac}
        loadingFloors={loadingFloors}
        onFacilityChange={onFacilityChange}
        onFloorChange={onFloorChange}
        onViewChange={onViewChange}
      />

      {facilityId !== null && (
        <div className="flex flex-wrap gap-3 text-sm text-on-surface-variant">
          <span className="rounded-full px-3 py-1 bg-surface-container-low border border-outline-variant/20">
            {t("monitoring.flow.overviewFloors").replace("{count}", String(overviewFloors))}
          </span>
          {floorId !== null && (
            <span className="rounded-full px-3 py-1 bg-surface-container-low border border-outline-variant/20">
              {t("monitoring.flow.overviewRooms").replace("{count}", String(overviewRoomsOnFloor))}
            </span>
          )}
        </div>
      )}

      {message && <p className="text-sm text-on-surface-variant">{message}</p>}

      {facilityId === null && (
        <EmptyState icon={Building2} message={t("monitoring.flow.selectFacility")} />
      )}

      {facilityId !== null && floors && floors.length === 0 && !loadingFloors && (
        <p className="text-sm text-on-surface-variant">{t("monitoring.flow.noFloors")}</p>
      )}

      {facilityId !== null && floorId === null && floors && floors.length > 0 && (
        <EmptyState icon={Layers} message={t("monitoring.flow.selectFloor")} />
      )}

      {facilityId !== null && floorId !== null && view === "list" && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-on-surface-variant max-w-xl">{t("monitoring.roomsHint")}</p>
            <button
              type="button"
              onClick={openCreateRoom}
              className="inline-flex items-center justify-center gap-2 shrink-0 gradient-cta px-4 py-2.5 rounded-xl text-sm font-semibold"
            >
              <Plus className="w-4 h-4" />
              {t("monitoring.addRoom")}
            </button>
          </div>

          {loadingRooms ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !rooms || rooms.length === 0 ? (
            <EmptyState icon={MapPin} message={t("monitoring.noRooms")} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {rooms.map((room) => (
                <div
                  key={room.id}
                  className="surface-card p-4 hover:shadow-elevated transition-smooth"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-primary-fixed flex items-center justify-center">
                        <MapPin className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-on-surface text-sm truncate">{room.name}</p>
                        <p className="text-xs text-on-surface-variant mt-0.5 truncate">
                          {room.facility_name?.trim() || t("monitoring.unassignedFacility")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="p-2 rounded-lg hover:bg-surface-container-low"
                        onClick={() => setDetailRoomId(room.id)}
                        aria-label="Room details"
                      >
                        <Info className="w-4 h-4 text-on-surface-variant" />
                      </button>
                      <button
                        type="button"
                        className="p-2 rounded-lg hover:bg-surface-container-low"
                        onClick={() => openEditRoom(room)}
                        aria-label="Edit room"
                      >
                        <Pencil className="w-4 h-4 text-on-surface-variant" />
                      </button>
                      <button
                        type="button"
                        className="p-2 rounded-lg hover:bg-error-container/70"
                        onClick={() => void deleteRoom(room)}
                        aria-label="Delete room"
                      >
                        <Trash2 className="w-4 h-4 text-error" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-outline">
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 bg-surface-container-low">
                      <Building2 className="w-3 h-3" />
                      {floorLabel(room)}
                    </span>
                    {room.room_type?.trim() ? (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 bg-surface-container-low">
                        {t("monitoring.typeLabel")}: {room.room_type}
                      </span>
                    ) : null}
                    {room.node_device_id ? (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 bg-surface-container-low">
                        Node: {room.node_device_id}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}

        </>
      )}

      {facilityId !== null && floorId !== null && view === "map" && (
        <FloorMapWorkspace
          facilityId={facilityId}
          floorId={floorId}
          onRoomSelect={onMapRoomSelect}
        />
      )}

      {facilityId !== null && floorId !== null && (
        <RoomFormModal
          open={roomModalOpen}
          mode={roomModalMode}
          room={roomModalSnapshot}
          defaultFacilityId={facilityId}
          defaultFloorId={floorId}
          onClose={() => setRoomModalOpen(false)}
          onSaved={async () => {
            setMessage(
              roomModalMode === "create"
                ? t("monitoring.roomSavedCreate")
                : t("monitoring.roomSavedUpdate"),
            );
            await refetchRooms();
          }}
        />
      )}

      <details className="surface-card border border-outline-variant/20 rounded-2xl overflow-hidden group">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-on-surface hover:bg-surface-container-low/80">
          {t("facilities.title")} — {t("floorplan.newBuilding")}
        </summary>
        <div className="p-4 border-t border-outline-variant/15">
          <FacilitiesPanel
            onChanged={() => {
              void refetchFacilities();
              void refetchFloors();
            }}
          />
        </div>
      </details>

      <RoomDetailDrawer
        room={detailRoom}
        open={detailRoomId !== null && detailRoom !== null}
        onClose={() => setDetailRoomId(null)}
        onEdit={() => {
          if (!detailRoom) return;
          openEditRoom(detailRoom);
        }}
      />
    </div>
  );
}
