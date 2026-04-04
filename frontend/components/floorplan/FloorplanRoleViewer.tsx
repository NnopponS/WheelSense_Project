"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@/hooks/useQuery";
import type { Facility, Floor } from "@/lib/types";
import {
  normalizeFloorplanRooms,
  type FloorplanLayoutResponse,
} from "@/lib/floorplanLayout";
import { useTranslation } from "@/lib/i18n";
import FloorplanCanvas from "./FloorplanCanvas";
import { MapPin } from "lucide-react";

type Props = {
  /** Extra class on the outer section wrapper */
  className?: string;
};

/**
 * Facility + floor pickers, GET saved layout, read-only canvas (for observer / supervisor dashboards).
 */
export default function FloorplanRoleViewer({ className = "" }: Props) {
  const { t } = useTranslation();
  const [facilityId, setFacilityId] = useState<number | "">("");
  const [floorId, setFloorId] = useState<number | "">("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: facilities, isLoading: loadingFac } = useQuery<Facility[]>(
    "/facilities",
  );
  const floorsEndpoint =
    facilityId === "" ? null : `/facilities/${facilityId}/floors`;
  const { data: floors, isLoading: loadingFloors } = useQuery<Floor[]>(
    floorsEndpoint,
  );

  useEffect(() => {
    if (facilityId !== "" || !facilities?.length) return;
    setFacilityId(facilities[0].id);
  }, [facilities, facilityId]);

  useEffect(() => {
    setFloorId("");
  }, [facilityId]);

  useEffect(() => {
    if (floorId !== "" || !floors?.length) return;
    setFloorId(floors[0].id);
  }, [floors, floorId]);

  const layoutEndpoint = useMemo(() => {
    if (facilityId === "" || floorId === "") return null;
    return `/future/floorplans/layout?facility_id=${facilityId}&floor_id=${floorId}`;
  }, [facilityId, floorId]);

  const {
    data: layoutRes,
    isLoading: loadingLayout,
    error: layoutError,
  } = useQuery<FloorplanLayoutResponse>(layoutEndpoint);

  const rooms = useMemo(
    () => normalizeFloorplanRooms(layoutRes?.layout_json),
    [layoutRes],
  );

  useEffect(() => {
    setSelectedId(null);
  }, [layoutRes, facilityId, floorId]);

  const noop = () => {};

  if (!loadingFac && (!facilities?.length || facilities.length === 0)) {
    return (
      <section className={`surface-card p-5 ${className}`.trim()}>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-on-surface mb-2 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          {t("floorplan.viewTitle")}
        </h3>
        <p className="text-sm text-on-surface-variant">{t("floorplan.noFacilities")}</p>
      </section>
    );
  }

  return (
    <section className={`surface-card p-5 ${className}`.trim()}>
      <div className="mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-on-surface flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          {t("floorplan.viewTitle")}
        </h3>
        <p className="text-xs text-on-surface-variant mt-1">
          {t("floorplan.viewSubtitle")}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 mb-4">
        <div>
          <label className="text-xs font-medium text-on-surface-variant block mb-1">
            {t("floorplan.building")}
          </label>
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
        </div>
        <div>
          <label className="text-xs font-medium text-on-surface-variant block mb-1">
            {t("floorplan.floor")}
          </label>
          <select
            className="input-field text-sm w-full"
            value={floorId === "" ? "" : String(floorId)}
            onChange={(e) => {
              const v = e.target.value;
              setFloorId(v === "" ? "" : Number(v));
            }}
            disabled={facilityId === "" || loadingFloors}
          >
            <option value="">{t("floorplan.selectFloor")}</option>
            {(floors ?? []).map((fl) => (
              <option key={fl.id} value={fl.id}>
                {fl.name || String(fl.floor_number)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {facilityId !== "" && floorId !== "" && loadingFloors === false && (
        floors?.length === 0 ? (
          <p className="text-sm text-on-surface-variant">{t("floorplan.noFloors")}</p>
        ) : loadingLayout ? (
          <div className="min-h-[320px] flex items-center justify-center rounded-xl border border-outline-variant/30 bg-surface-container-low/80">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : layoutError ? (
          <p className="text-sm text-error">{t("floorplan.layoutError")}</p>
        ) : rooms.length === 0 ? (
          <p className="text-sm text-on-surface-variant">{t("floorplan.emptyLayout")}</p>
        ) : (
          <>
            <FloorplanCanvas
              readOnly
              rooms={rooms}
              onRoomsChange={noop}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            <p className="text-xs text-on-surface-variant mt-2">
              {t("floorplan.readOnlyHint")}
            </p>
          </>
        )
      )}
    </section>
  );
}
