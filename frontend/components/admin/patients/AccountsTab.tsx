"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Search, Shield } from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import UserAvatar from "@/components/shared/UserAvatar";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { hasCapability } from "@/lib/permissions";
import { getAccountManagementPath } from "@/lib/routes";
import type { ListCaregiversResponse, ListPatientsResponse, ListUsersResponse } from "@/lib/api/task-scope-types";

type User = ListUsersResponse[number];

const STAFF_ROLES: User["role"][] = ["admin", "head_caregiver", "caregiver"];

const USER_ROLE_TO_I18N: Record<string, TranslationKey> = {
  admin: "personnel.role.admin",
  head_caregiver: "personnel.role.headCaregiver",
  head_nurse: "personnel.role.headCaregiver",
  supervisor: "personnel.role.headCaregiver",
  caregiver: "personnel.role.caregiver",
  observer: "personnel.role.caregiver",
  patient: "personnel.role.patient",
};

function formatUserRole(role: string, t: (key: TranslationKey) => string): string {
  const key = USER_ROLE_TO_I18N[role];
  return key ? t(key) : role.replace(/_/g, " ");
}

function personName(firstName?: string | null, lastName?: string | null, fallback = "Person"): string {
  return `${firstName || ""} ${lastName || ""}`.trim() || fallback;
}

const QK = {
  caregivers: ["admin", "patients", "accounts", "caregivers"] as const,
  patients: ["admin", "patients", "accounts", "patients"] as const,
  users: ["admin", "patients", "accounts", "users"] as const,
};

export function AccountsTab() {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const canManageAccounts = me?.role === "admin" && hasCapability(me.role, "users.manage");

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | User["role"]>("all");
  const [accountKindFilter, setAccountKindFilter] = useState<"all" | "staff" | "patient">("all");

  const caregiversQuery = useQuery({
    queryKey: QK.caregivers,
    queryFn: () => api.listCaregivers({ limit: 1000 }),
  });
  const patientsQuery = useQuery({
    queryKey: QK.patients,
    queryFn: () => api.listPatients({ limit: 1000 }),
  });
  const usersQuery = useQuery({
    queryKey: QK.users,
    queryFn: () => api.listUsers(),
  });

  const caregivers = (caregiversQuery.data ?? []) as ListCaregiversResponse;
  const patients = (patientsQuery.data ?? []) as ListPatientsResponse;
  const users = (usersQuery.data ?? []) as User[];
  const q = search.trim().toLowerCase();

  const accountRows = users.filter((item) => {
    const rowKind = item.role === "patient" ? "patient" : "staff";
    if (accountKindFilter !== "all" && rowKind !== accountKindFilter) return false;
    if (roleFilter !== "all" && item.role !== roleFilter) return false;
    if (!q) return true;
    const linkedStaff = caregivers.find((cg) => cg.id === item.caregiver_id);
    const linkedPatient = patients.find((pt) => pt.id === item.patient_id);
    return (
      item.username.toLowerCase().includes(q) ||
      String(item.id).includes(q) ||
      item.role.toLowerCase().includes(q) ||
      `${linkedStaff?.first_name || ""} ${linkedStaff?.last_name || ""}`.toLowerCase().includes(q) ||
      `${linkedPatient?.first_name || ""} ${linkedPatient?.last_name || ""}`.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          className="input-field py-2 text-sm capitalize"
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value as "all" | User["role"])}
        >
          <option value="all">{t("personnel.filterAllRoles")}</option>
          {[...STAFF_ROLES, "patient"].map((role) => (
            <option key={role} value={role}>
              {formatUserRole(role, t)}
            </option>
          ))}
        </select>
        <select
          className="input-field py-2 text-sm"
          value={accountKindFilter}
          onChange={(event) =>
            setAccountKindFilter(event.target.value as "all" | "staff" | "patient")
          }
        >
          <option value="all">{t("personnel.filterAllAccountTypes")}</option>
          <option value="staff">{t("personnel.filterStaffAccounts")}</option>
          <option value="patient">{t("personnel.filterPatientAccounts")}</option>
        </select>
        <div className="relative min-w-[16rem]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("personnel.searchPlaceholderAccounts")}
            className="pl-9"
          />
        </div>
      </div>

      {usersQuery.isLoading ? (
        <div className="flex min-h-56 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-2">
          {accountRows.map((row) => {
            const linkedStaff = row.caregiver_id != null ? caregivers.find((cg) => cg.id === row.caregiver_id) : undefined;
            const linkedPatient = row.patient_id != null ? patients.find((pt) => pt.id === row.patient_id) : undefined;
            const displayName = linkedStaff
              ? personName(linkedStaff.first_name, linkedStaff.last_name, row.username)
              : linkedPatient
                ? personName(linkedPatient.first_name, linkedPatient.last_name, row.username)
                : row.username;
            const avatarUrl =
              row.profile_image_url?.trim() ||
              linkedStaff?.photo_url?.trim() ||
              linkedPatient?.photo_url?.trim() ||
              null;
            return (
              <div
                key={row.id}
                className="flex items-center justify-between rounded-xl border border-border p-3"
              >
                <div className="flex items-center gap-3">
                  <UserAvatar
                    username={displayName}
                    profileImageUrl={avatarUrl}
                    sizePx={44}
                    fallbackClassName="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-200"
                  />
                  <div>
                    <p className="font-medium">{row.username}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("personnel.accountLineAccount")} #{row.id} - {formatUserRole(row.role, t)}
                      {row.caregiver_id ? ` - ${t("personnel.lineStaffRef")}${row.caregiver_id}` : ""}
                      {row.patient_id ? ` - ${t("personnel.linePatientRef")}${row.patient_id}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={row.is_active ? "success" : "outline"}>
                    {row.is_active ? t("common.active") : t("common.inactive")}
                  </Badge>
                  {canManageAccounts ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`${getAccountManagementPath(me?.role || "admin")}?kind=${row.role === "patient" ? "patient" : "staff"}&q=${encodeURIComponent(row.username)}`}>
                        <Shield className="h-3.5 w-3.5" />
                        {t("personnel.manage")}
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
          {accountRows.length === 0 ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t("personnel.emptyAccounts")}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
