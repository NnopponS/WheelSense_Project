"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n";
import { useQuery } from "@/hooks/useQuery";
import EmptyState from "@/components/EmptyState";
import CaregiverCardGrid from "@/components/admin/caregivers/CaregiverCardGrid";
import AddCaregiverModal from "@/components/admin/caregivers/AddCaregiverModal";
import type { Caregiver, User } from "@/lib/types";
import { Plus, Search, UserCog, X } from "lucide-react";

type RoleFilter = "all" | "admin" | "head_nurse" | "supervisor" | "observer";
type ActiveFilter = "all" | "active" | "inactive";

function normalizeCaregiverRole(role: string): string {
  return role.trim().toLowerCase();
}

function matchesRoleFilter(c: Caregiver, roleFilter: RoleFilter): boolean {
  if (roleFilter === "all") return true;
  return normalizeCaregiverRole(c.role) === roleFilter;
}

function matchesActiveFilter(c: Caregiver, activeFilter: ActiveFilter): boolean {
  if (activeFilter === "all") return true;
  if (activeFilter === "active") return c.is_active;
  return !c.is_active;
}

export default function CaregiversPage() {
  const { t } = useTranslation();
  const { data: caregivers, isLoading: loadingCaregivers, refetch } = useQuery<Caregiver[]>("/caregivers");
  const { data: users, isLoading: loadingUsers } = useQuery<User[]>("/users");

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [addModalOpen, setAddModalOpen] = useState(false);

  const filtered = useMemo(() => {
    const list = caregivers ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((c) => {
      if (!matchesRoleFilter(c, roleFilter)) return false;
      if (!matchesActiveFilter(c, activeFilter)) return false;
      if (!q) return true;
      const blob = `${c.first_name} ${c.last_name} ${c.role} ${c.phone} ${c.email} ${c.id}`
        .toLowerCase();
      return blob.includes(q);
    });
  }, [caregivers, search, roleFilter, activeFilter]);

  const isLoading = loadingCaregivers || loadingUsers;
  const unlinkedStaffAccounts =
    users?.filter(
      (item) =>
        item.is_active &&
        (item.role === "admin" ||
          item.role === "head_nurse" ||
          item.role === "supervisor" ||
          item.role === "observer") &&
        item.caregiver_id == null,
    ).length ?? 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-on-surface">{t("caregivers.title")}</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            {t("caregivers.directorySubtitle")}
          </p>
        </div>
        <button
          type="button"
          className="gradient-cta inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-smooth hover:opacity-90"
          onClick={() => setAddModalOpen(true)}
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t("caregivers.addNew")}
        </button>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="relative max-w-lg flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-outline"
            aria-hidden
          />
          <input
            type="search"
            placeholder={t("caregivers.searchDetailed")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`input-field input-field--leading-icon w-full rounded-xl py-2.5 text-sm ${search.trim() ? "pr-10" : ""}`}
            aria-label={t("caregivers.search")}
          />
          {search.trim() ? (
            <button
              type="button"
              aria-label={t("caregivers.clearSearchAria")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
              onClick={() => setSearch("")}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex min-w-[160px] flex-col gap-1">
            <label htmlFor="caregiver-role-filter" className="text-xs text-on-surface-variant">
              {t("caregivers.filterRole")}
            </label>
            <select
              id="caregiver-role-filter"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
              className="input-field rounded-xl py-2 text-sm"
            >
              <option value="all">{t("devicesDetail.tabAll")}</option>
              <option value="admin">{t("shell.roleAdmin")}</option>
              <option value="head_nurse">{t("shell.roleHeadNurse")}</option>
              <option value="supervisor">{t("shell.roleSupervisor")}</option>
              <option value="observer">{t("shell.roleObserver")}</option>
            </select>
          </div>
          <div className="flex min-w-[160px] flex-col gap-1">
            <label htmlFor="caregiver-active-filter" className="text-xs text-on-surface-variant">
              {t("caregivers.filterStatus")}
            </label>
            <select
              id="caregiver-active-filter"
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
              className="input-field rounded-xl py-2 text-sm"
            >
              <option value="all">{t("alerts.all")}</option>
              <option value="active">{t("common.active")}</option>
              <option value="inactive">{t("common.inactive")}</option>
            </select>
          </div>
        </div>
      </div>

      {unlinkedStaffAccounts > 0 ? (
        <div className="rounded-xl border border-amber-400/45 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-semibold">
            {unlinkedStaffAccounts} active staff account(s) are missing caregiver links.
          </span>{" "}
          <Link href="/admin/account-management" className="font-semibold underline">
            Open account management
          </Link>
          {" "}to connect each account to the correct staff profile.
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div
            className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent"
            role="status"
            aria-label={t("common.loading")}
          />
        </div>
      ) : !caregivers?.length ? (
        <EmptyState icon={UserCog} message={t("caregivers.empty")} />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low/50 py-12 text-center text-sm text-on-surface-variant">
          {t("caregivers.listNoMatches")}
        </div>
      ) : (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-on-surface-variant">
            {t("caregivers.allStaff")}
          </h3>
          <CaregiverCardGrid caregivers={filtered} users={users} basePath="/admin/caregivers" />
        </div>
      )}

      <AddCaregiverModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onCreated={() => void refetch()}
      />
    </div>
  );
}
