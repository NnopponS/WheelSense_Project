"use client";

import { useTranslation } from "@/lib/i18n";
import type { Facility, Floor } from "@/lib/types";
import type { MonitoringViewMode } from "@/lib/monitoringWorkspace";
import { Building2, Layers, List, Map as MapIcon } from "lucide-react";

export interface FacilityFloorToolbarProps {
  facilities: Facility[];
  floors: Floor[];
  facilityId: number | null;
  floorId: number | null;
  view: MonitoringViewMode;
  loadingFacilities: boolean;
  loadingFloors: boolean;
  onFacilityChange: (id: number | null) => void;
  onFloorChange: (id: number | null) => void;
  onViewChange: (view: MonitoringViewMode) => void;
}

export default function FacilityFloorToolbar({
  facilities,
  floors,
  facilityId,
  floorId,
  view,
  loadingFacilities,
  loadingFloors,
  onFacilityChange,
  onFloorChange,
  onViewChange,
}: FacilityFloorToolbarProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 rounded-2xl border border-outline-variant/25 bg-surface-container-low/50 p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            {t("facilities.title")}
          </label>
          <select
            className="input-field text-sm w-full"
            value={facilityId === null ? "" : String(facilityId)}
            onChange={(e) => {
              const v = e.target.value;
              onFacilityChange(v === "" ? null : Number(v));
            }}
            disabled={loadingFacilities}
          >
            <option value="">{t("floorplan.selectBuilding")}</option>
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            {t("floorplan.floor")}
          </label>
          <select
            className="input-field text-sm w-full"
            value={floorId === null ? "" : String(floorId)}
            onChange={(e) => {
              const v = e.target.value;
              onFloorChange(v === "" ? null : Number(v));
            }}
            disabled={facilityId === null || loadingFloors}
          >
            <option value="">
              {facilityId === null ? t("floorplan.selectBuildingFirst") : t("floorplan.selectFloor")}
            </option>
            {floors.map((fl) => (
              <option key={fl.id} value={fl.id}>
                {fl.name?.trim()
                  ? `${fl.name} (#${fl.floor_number})`
                  : `${t("monitoring.floorPrefix")} ${fl.floor_number}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onViewChange("list")}
          className={`px-4 py-2 rounded-xl text-sm font-medium inline-flex items-center gap-2 transition-smooth ${
            view === "list"
              ? "bg-primary-fixed text-primary"
              : "text-on-surface-variant hover:bg-surface-container-low"
          }`}
        >
          <List className="w-4 h-4" />
          {t("monitoring.flow.viewList")}
        </button>
        <button
          type="button"
          onClick={() => onViewChange("map")}
          className={`px-4 py-2 rounded-xl text-sm font-medium inline-flex items-center gap-2 transition-smooth ${
            view === "map"
              ? "bg-primary-fixed text-primary"
              : "text-on-surface-variant hover:bg-surface-container-low"
          }`}
        >
          <MapIcon className="w-4 h-4" />
          {t("monitoring.flow.viewMap")}
        </button>
      </div>
    </div>
  );
}
