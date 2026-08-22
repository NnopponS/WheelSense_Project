"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Search, UserPlus } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import UserAvatar from "@/components/shared/UserAvatar";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { hasCapability } from "@/lib/permissions";
import { getCaregiverDetailPath, getAccountManagementPath } from "@/lib/routes";
import type { Caregiver, User as AppUser } from "@/lib/types";
import type { ListCaregiversResponse, ListUsersResponse } from "@/lib/api/task-scope-types";

type User = ListUsersResponse[number];

const STAFF_ROLES: User["role"][] = ["admin", "head_caregiver", "caregiver"];
const NEW_STAFF_ROLES: Array<"head_caregiver" | "caregiver"> = ["head_caregiver", "caregiver"];

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

const STAFF_QK = ["admin", "patients", "staff", "caregivers"] as const;
const USERS_QK = ["admin", "patients", "staff", "users"] as const;

export function StaffTab() {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const canManageAccounts = me?.role === "admin" && hasCapability(me.role, "users.manage");
  const canProvision =
    !!me && hasCapability(me.role, "patients.manage") && hasCapability(me.role, "users.manage");

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | User["role"]>("all");

  const [staffDialogOpen, setStaffDialogOpen] = useState(false);
  const [sfFirst, setSfFirst] = useState("");
  const [sfLast, setSfLast] = useState("");
  const [sfRole, setSfRole] = useState<"head_caregiver" | "caregiver">("caregiver");
  const [sfEmployeeCode, setSfEmployeeCode] = useState("");
  const [sfDepartment, setSfDepartment] = useState("Nursing");
  const [sfSpecialty, setSfSpecialty] = useState("");
  const [sfLicense, setSfLicense] = useState("");
  const [sfPhone, setSfPhone] = useState("");
  const [sfEmail, setSfEmail] = useState("");
  const [sfUser, setSfUser] = useState("");
  const [sfPass, setSfPass] = useState("");
  const [sfCreateLogin, setSfCreateLogin] = useState(false);
  const [sfBusy, setSfBusy] = useState(false);
  const [sfErr, setSfErr] = useState<string | null>(null);

  const caregiversQuery = useQuery({
    queryKey: STAFF_QK,
    queryFn: () => api.listCaregivers({ limit: 1000 }),
  });
  const usersQuery = useQuery({
    queryKey: USERS_QK,
    queryFn: () => api.listUsers(),
  });

  const invalidateStaff = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [...STAFF_QK] });
    await queryClient.invalidateQueries({ queryKey: [...USERS_QK] });
  }, [queryClient]);

  const resetStaffForm = useCallback(() => {
    setSfFirst("");
    setSfLast("");
    setSfRole("caregiver");
    setSfEmployeeCode("");
    setSfDepartment("Nursing");
    setSfSpecialty("");
    setSfLicense("");
    setSfPhone("");
    setSfEmail("");
    setSfUser("");
    setSfPass("");
    setSfCreateLogin(false);
    setSfErr(null);
  }, []);

  const onSubmitStaffPlusAccount = useCallback(async () => {
    if (!canProvision) return;
    if (sfFirst.trim().length < 1 || sfLast.trim().length < 1) {
      setSfErr(t("personnel.formRequiredNames"));
      return;
    }
    if (sfCreateLogin && (sfUser.trim().length < 3 || sfPass.trim().length < 6)) {
      setSfErr(t("personnel.formRequiredCredentials"));
      return;
    }
    setSfBusy(true);
    setSfErr(null);
    try {
      const cg = await api.post<Caregiver>("/caregivers", {
        first_name: sfFirst.trim(),
        last_name: sfLast.trim(),
        role: sfRole,
        employee_code: sfEmployeeCode.trim(),
        department: sfDepartment.trim(),
        employment_type: "full_time",
        specialty: sfSpecialty.trim(),
        license_number: sfLicense.trim(),
        phone: sfPhone.trim(),
        email: sfEmail.trim(),
        emergency_contact_name: "",
        emergency_contact_phone: "",
        photo_url: "",
      });
      if (sfCreateLogin) {
        await api.post<AppUser>("/users", {
          username: sfUser.trim(),
          password: sfPass.trim(),
          role: sfRole,
          is_active: true,
          caregiver_id: cg.id,
          patient_id: null,
          profile_image_url: "",
        });
      }
      resetStaffForm();
      setStaffDialogOpen(false);
      await invalidateStaff();
    } catch (e) {
      setSfErr(e instanceof ApiError ? e.message : t("personnel.saveFailed"));
    } finally {
      setSfBusy(false);
    }
  }, [
    canProvision,
    invalidateStaff,
    resetStaffForm,
    sfFirst,
    sfLast,
    sfDepartment,
    sfEmail,
    sfEmployeeCode,
    sfCreateLogin,
    sfPass,
    sfPhone,
    sfRole,
    sfSpecialty,
    sfLicense,
    sfUser,
    t,
  ]);

  const caregivers = (caregiversQuery.data ?? []) as ListCaregiversResponse;
  const users = (usersQuery.data ?? []) as User[];
  const q = search.trim().toLowerCase();
  const accountByCaregiverId = new Map(
    users
      .filter((item) => item.caregiver_id != null)
      .map((item) => [item.caregiver_id as number, item] as const),
  );

  const staffRows = caregivers.filter((item) => {
    if (roleFilter !== "all" && item.role !== roleFilter) return false;
    if (!q) return true;
    return (
      `${item.first_name} ${item.last_name}`.toLowerCase().includes(q) ||
      item.role.toLowerCase().includes(q) ||
      (item.department || "").toLowerCase().includes(q) ||
      String(item.id).includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
          <div className="relative min-w-[16rem]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("personnel.searchPlaceholderDefault")}
              className="pl-9"
            />
          </div>
        </div>
        {canProvision ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              resetStaffForm();
              setStaffDialogOpen(true);
            }}
          >
            <UserPlus className="h-4 w-4" />
            {t("personnel.addStaffAccount")}
          </Button>
        ) : null}
      </div>

      {caregiversQuery.isLoading ? (
        <div className="flex min-h-56 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-2">
          {staffRows.map((row) => {
            const linkedAccount = accountByCaregiverId.get(row.id);
            const fullName = personName(row.first_name, row.last_name, `Staff #${row.id}`);
            return (
              <div
                key={row.id}
                className="flex items-center justify-between rounded-xl border border-border p-3"
              >
                <div className="flex items-center gap-3">
                  <UserAvatar
                    username={fullName}
                    profileImageUrl={row.photo_url || linkedAccount?.profile_image_url || null}
                    sizePx={44}
                    fallbackClassName="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200"
                  />
                  <div>
                    <p className="font-medium">{fullName}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatUserRole(row.role, t)} - {row.department || t("personnel.noDepartment")} - #{row.id}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={row.is_active ? "success" : "outline"}>
                    {row.is_active ? t("common.active") : t("common.inactive")}
                  </Badge>
                  <Button asChild variant="outline" size="sm">
                    <Link href={getCaregiverDetailPath(me?.role || "admin", row.id)}>
                      {t("personnel.rowOpen")}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  {canManageAccounts ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`${getAccountManagementPath(me?.role || "admin")}?kind=staff&q=${encodeURIComponent(linkedAccount?.username || String(row.id))}`}>
                        {linkedAccount ? t("personnel.accountLinked") : t("personnel.accountCreate")}
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
          {staffRows.length === 0 ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t("personnel.emptyStaff")}
            </p>
          ) : null}
        </div>
      )}

      <Dialog open={staffDialogOpen} onOpenChange={(o) => { setStaffDialogOpen(o); if (!o) resetStaffForm(); }}>
        <DialogContent className="flex max-h-[92vh] min-h-0 w-[min(100%-2rem,70rem)] flex-col gap-0 overflow-hidden rounded-3xl border border-outline-variant/25 bg-surface p-0 shadow-2xl">
          <DialogHeader className="shrink-0 border-b border-outline-variant/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-6 py-4">
            <DialogTitle className="text-xl font-bold text-foreground">{t("personnel.addStaffTitle")}</DialogTitle>
            <DialogDescription className="text-sm text-foreground-variant">{t("personnel.addStaffDescription")}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="space-y-5">
              <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-low px-4 py-4">
                <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground-variant">{t("caregivers.sectionAbout")}</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <Label htmlFor="ps-first">{t("personnel.firstName")}</Label>
                    <Input id="ps-first" value={sfFirst} onChange={(e) => setSfFirst(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="ps-last">{t("personnel.lastName")}</Label>
                    <Input id="ps-last" value={sfLast} onChange={(e) => setSfLast(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="ps-role">{t("personnel.staffRole")}</Label>
                    <select
                      id="ps-role"
                      className="input-field mt-1 w-full py-2 text-sm capitalize"
                      value={sfRole}
                      onChange={(e) => setSfRole(e.target.value as typeof sfRole)}
                    >
                      {NEW_STAFF_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {formatUserRole(r, t)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="ps-employee">{t("caregivers.employeeCode")}</Label>
                    <Input id="ps-employee" value={sfEmployeeCode} onChange={(e) => setSfEmployeeCode(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="ps-department">{t("caregivers.department")}</Label>
                    <Input id="ps-department" value={sfDepartment} onChange={(e) => setSfDepartment(e.target.value)} className="mt-1" />
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="ps-specialty">{t("caregivers.specialty")}</Label>
                    <Input id="ps-specialty" value={sfSpecialty} onChange={(e) => setSfSpecialty(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="ps-license">{t("caregivers.licenseLabel")}</Label>
                    <Input id="ps-license" value={sfLicense} onChange={(e) => setSfLicense(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="ps-phone">{t("clinical.table.phone")}</Label>
                    <Input id="ps-phone" value={sfPhone} onChange={(e) => setSfPhone(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="ps-email">{t("clinical.table.email")}</Label>
                    <Input id="ps-email" type="email" value={sfEmail} onChange={(e) => setSfEmail(e.target.value)} className="mt-1" />
                  </div>
                </div>
              </section>
              <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-low px-4 py-4">
                <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground-variant">{t("patients.sectionLinkedAccounts")}</p>
                {canManageAccounts ? (
                  <div className="mb-4 flex items-start gap-3">
                    <Checkbox
                      id="ps-create-login"
                      checked={sfCreateLogin}
                      onCheckedChange={(v) => setSfCreateLogin(v === true)}
                    />
                    <div className="space-y-1">
                      <Label htmlFor="ps-create-login" className="cursor-pointer font-medium leading-snug">
                        {t("personnel.createLoginLabel")}
                      </Label>
                      <p className="text-sm text-muted-foreground">{t("personnel.createLoginHint")}</p>
                    </div>
                  </div>
                ) : null}
                {canManageAccounts && sfCreateLogin ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="ps-user">{t("personnel.username")}</Label>
                      <Input id="ps-user" value={sfUser} onChange={(e) => setSfUser(e.target.value)} autoComplete="off" className="mt-1" />
                    </div>
                    <div>
                      <Label htmlFor="ps-pass">{t("personnel.password")}</Label>
                      <Input id="ps-pass" type="password" value={sfPass} onChange={(e) => setSfPass(e.target.value)} autoComplete="new-password" className="mt-1" />
                    </div>
                  </div>
                ) : null}
              </section>
              {sfErr ? <p className="text-sm font-medium text-destructive">{sfErr}</p> : null}
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t border-outline-variant/20 bg-surface-container/40 px-6 py-4">
            <Button type="button" variant="outline" onClick={() => setStaffDialogOpen(false)}>
              {t("accountMgmt.cancel")}
            </Button>
            <Button type="button" disabled={sfBusy} onClick={() => void onSubmitStaffPlusAccount()}>
              {sfBusy
                ? t("common.loading")
                : sfCreateLogin
                  ? t("personnel.submitStaffWithLogin")
                  : t("personnel.submitStaffSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
