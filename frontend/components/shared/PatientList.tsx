"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n";
import EmptyState from "@/components/EmptyState";
import { Search, Users, X } from "lucide-react";
import type { Patient } from "@/lib/types";
import { useMemo, useState } from "react";
import { ageYears } from "@/lib/age";
import { useFixedNowMs } from "@/hooks/useFixedNowMs";

export type AdminPatientListFilters = {
  careLevel: "all" | Patient["care_level"];
  onCareLevelChange: (v: "all" | Patient["care_level"]) => void;
  activeStatus: "all" | "active" | "inactive";
  onActiveStatusChange: (v: "all" | "active" | "inactive") => void;
  room: "all" | "assigned" | "unassigned";
  onRoomChange: (v: "all" | "assigned" | "unassigned") => void;
};

type Props = {
  patients: Patient[] | null | undefined;
  isLoading: boolean;
  basePath: string;
  /** Appended to each patient link href (e.g. `?edit=1` for admin edit-on-open). */
  patientHrefSuffix?: string;
  searchPlaceholderKey?: "patients.search";
  emptyMessageKey?: "patients.empty";
  /**
   * When false, the list uses `textFilter` from the parent (single shared search with quick-find).
   * @default true
   */
  showSearchInput?: boolean;
  /** Client-side name/ID filter when `showSearchInput` is false. */
  textFilter?: string;
  /** Admin directory: care level, record status, and room assignment filters. */
  adminFilters?: AdminPatientListFilters;
};

function matchesTextFilter(p: Patient, q: string): boolean {
  const trimmed = q.trim().toLowerCase();
  if (!trimmed) return true;
  const full = `${p.first_name ?? ""} ${p.last_name ?? ""}`.toLowerCase().trim();
  return (
    full.includes(trimmed) ||
    String(p.id).includes(trimmed) ||
    (p.first_name?.toLowerCase().includes(trimmed) ?? false) ||
    (p.last_name?.toLowerCase().includes(trimmed) ?? false)
  );
}

function matchesAdminFilters(
  p: Patient,
  f: AdminPatientListFilters,
): boolean {
  if (f.careLevel !== "all" && p.care_level !== f.careLevel) return false;
  if (f.activeStatus === "active" && !p.is_active) return false;
  if (f.activeStatus === "inactive" && p.is_active) return false;
  if (f.room === "assigned" && p.room_id == null) return false;
  if (f.room === "unassigned" && p.room_id != null) return false;
  return true;
}

export default function PatientList({
  patients,
  isLoading,
  basePath,
  patientHrefSuffix = "",
  searchPlaceholderKey = "patients.search",
  emptyMessageKey = "patients.empty",
  showSearchInput = true,
  textFilter = "",
  adminFilters,
}: Props) {
  const { t } = useTranslation();
  const nowMs = useFixedNowMs();
  const [internalSearch, setInternalSearch] = useState("");

  const effectiveSearch = showSearchInput ? internalSearch : textFilter;

  const filtered = useMemo(() => {
    const list = patients ?? [];
    return list.filter((p) => {
      if (!matchesTextFilter(p, effectiveSearch)) return false;
      if (adminFilters && !matchesAdminFilters(p, adminFilters)) return false;
      return true;
    });
  }, [patients, effectiveSearch, adminFilters]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!patients || patients.length === 0) {
    return <EmptyState icon={Users} message={t(emptyMessageKey)} />;
  }

  const hasFilter =
    effectiveSearch.trim().length > 0 ||
    (adminFilters &&
      (adminFilters.careLevel !== "all" ||
        adminFilters.activeStatus !== "all" ||
        adminFilters.room !== "all"));
  const noFilterMatches = hasFilter && filtered.length === 0;

  const filterToolbar =
    adminFilters != null ? (
      <div
        className="sticky top-0 z-[1] -mx-1 mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-outline-variant/25 bg-surface-container-low/95 px-3 py-3 shadow-sm backdrop-blur-sm supports-[backdrop-filter]:bg-surface-container-low/80"
        role="region"
        aria-label="Patient list filters"
      >
        <div className="flex min-w-[10rem] flex-1 flex-col gap-1">
          <label htmlFor="admin-patient-filter-care" className="text-xs font-medium text-foreground-variant">
            {t("patients.careLevel")}
          </label>
          <select
            id="admin-patient-filter-care"
            className="input-field w-full rounded-lg py-2 text-sm"
            value={adminFilters.careLevel}
            onChange={(e) => {
              const v = e.target.value as "all" | Patient["care_level"];
              adminFilters.onCareLevelChange(v);
            }}
          >
            <option value="all">{t("devicesDetail.tabAll")}</option>
            <option value="normal">normal</option>
            <option value="special">special</option>
            <option value="critical">critical</option>
          </select>
        </div>
        <div className="flex min-w-[10rem] flex-1 flex-col gap-1">
          <label htmlFor="admin-patient-filter-active" className="text-xs font-medium text-foreground-variant">
            {t("patients.accountStatus")}
          </label>
          <select
            id="admin-patient-filter-active"
            className="input-field w-full rounded-lg py-2 text-sm"
            value={adminFilters.activeStatus}
            onChange={(e) => {
              const v = e.target.value as "all" | "active" | "inactive";
              adminFilters.onActiveStatusChange(v);
            }}
          >
            <option value="all">{t("devicesDetail.tabAll")}</option>
            <option value="active">{t("patients.statusActive")}</option>
            <option value="inactive">{t("patients.statusInactive")}</option>
          </select>
        </div>
        <div className="flex min-w-[10rem] flex-1 flex-col gap-1">
          <label htmlFor="admin-patient-filter-room" className="text-xs font-medium text-foreground-variant">
            {t("patients.room")}
          </label>
          <select
            id="admin-patient-filter-room"
            className="input-field w-full rounded-lg py-2 text-sm"
            value={adminFilters.room}
            onChange={(e) => {
              const v = e.target.value as "all" | "assigned" | "unassigned";
              adminFilters.onRoomChange(v);
            }}
          >
            <option value="all">{t("devicesDetail.tabAll")}</option>
            <option value="assigned">Room assigned</option>
            <option value="unassigned">{t("patients.noRoom")}</option>
          </select>
        </div>
      </div>
    ) : null;

  return (
    <>
      {showSearchInput ? (
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-outline" />
          <input
            type="text"
            placeholder={t(searchPlaceholderKey)}
            value={internalSearch}
            onChange={(e) => setInternalSearch(e.target.value)}
            className={`input-field input-field--leading-icon w-full rounded-xl py-2.5 text-sm ${internalSearch.trim() ? "pr-10" : ""}`}
          />
          {internalSearch.trim() ? (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-foreground-variant hover:bg-surface-container-high hover:text-foreground"
              aria-label={t("patients.quickFindClear")}
              onClick={() => setInternalSearch("")}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}

      {filterToolbar}

      {noFilterMatches ? (
        <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low/50 py-12 text-center text-sm text-foreground-variant">
          {t("patients.listNoMatches")}
        </div>
      ) : (
        <div
          className={`grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 ${showSearchInput ? "mt-4" : ""} ${adminFilters ? "max-h-[min(72vh,52rem)] overflow-y-auto overscroll-contain pr-1" : ""}`}
        >
          {filtered.map((patient) => (
            <Link
              key={patient.id}
              href={`${basePath}/${patient.id}${patientHrefSuffix}`}
              className="surface-card flex items-center gap-4 p-5 transition-smooth hover:shadow-elevated"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full gradient-cta font-bold text-white">
                {(patient.first_name?.[0] || "P").toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">
                  {patient.first_name} {patient.last_name}
                </p>
                <p className="mt-0.5 text-xs text-foreground-variant">
                  {t("patients.age")}: {ageYears(patient.date_of_birth, nowMs) ?? "—"}{" "}
                  {t("patients.years")}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                  patient.care_level === "critical"
                    ? "care-critical"
                    : patient.care_level === "special"
                      ? "care-special"
                      : "care-normal"
                }`}
              >
                {patient.care_level || "normal"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
