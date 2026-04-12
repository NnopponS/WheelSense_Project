"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, KeyRound, Search, Shield, UserCog, UserPlus, Users } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { hasCapability } from "@/lib/permissions";
import type { Caregiver, Patient, User as AppUser } from "@/lib/types";
import type {
  ListCaregiversResponse,
  ListPatientsResponse,
  ListUsersResponse,
} from "@/lib/api/task-scope-types";

type ViewTab = "staff" | "patients" | "accounts";
type User = ListUsersResponse[number];

function personnelTabFromQuery(raw: string | null | undefined): ViewTab | null {
  if (!raw) return null;
  const s = raw.toLowerCase().trim();
  if (s === "staff" || s === "patients" || s === "accounts") return s;
  return null;
}

const STAFF_ROLES: User["role"][] = ["admin", "head_nurse", "supervisor", "observer"];
const NEW_STAFF_ROLES: Array<"head_nurse" | "supervisor" | "observer"> = [
  "head_nurse",
  "supervisor",
  "observer",
];

const PERSONNEL_QK = {
  caregivers: ["admin", "personnel", "caregivers"] as const,
  patients: ["admin", "personnel", "patients"] as const,
  users: ["admin", "personnel", "users"] as const,
};

function PersonnelPageContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const canProvision =
    me &&
    hasCapability(me.role, "patients.manage") &&
    hasCapability(me.role, "users.manage");

  const [tab, setTab] = useState<ViewTab>("staff");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | User["role"]>("all");
  const [patientStatusFilter, setPatientStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [accountKindFilter, setAccountKindFilter] = useState<"all" | "staff" | "patient">("all");

  const [staffDialogOpen, setStaffDialogOpen] = useState(false);
  const [sfFirst, setSfFirst] = useState("");
  const [sfLast, setSfLast] = useState("");
  const [sfRole, setSfRole] = useState<"head_nurse" | "supervisor" | "observer">("observer");
  const [sfUser, setSfUser] = useState("");
  const [sfPass, setSfPass] = useState("");
  const [sfBusy, setSfBusy] = useState(false);
  const [sfErr, setSfErr] = useState<string | null>(null);

  const [patientDialogOpen, setPatientDialogOpen] = useState(false);
  const [ptFirst, setPtFirst] = useState("");
  const [ptLast, setPtLast] = useState("");
  const [ptNick, setPtNick] = useState("");
  const [ptCare, setPtCare] = useState<"normal" | "special" | "critical">("normal");
  const [ptUser, setPtUser] = useState("");
  const [ptPass, setPtPass] = useState("");
  const [ptBusy, setPtBusy] = useState(false);
  const [ptErr, setPtErr] = useState<string | null>(null);

  const caregiversQuery = useQuery({
    queryKey: PERSONNEL_QK.caregivers,
    queryFn: () => api.listCaregivers({ limit: 1000 }),
  });
  const patientsQuery = useQuery({
    queryKey: PERSONNEL_QK.patients,
    queryFn: () => api.listPatients({ limit: 1000 }),
  });
  const usersQuery = useQuery({
    queryKey: PERSONNEL_QK.users,
    queryFn: () => api.listUsers(),
  });

  const invalidatePersonnel = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [...PERSONNEL_QK.caregivers] });
    await queryClient.invalidateQueries({ queryKey: [...PERSONNEL_QK.patients] });
    await queryClient.invalidateQueries({ queryKey: [...PERSONNEL_QK.users] });
  }, [queryClient]);

  const resetStaffForm = useCallback(() => {
    setSfFirst("");
    setSfLast("");
    setSfRole("observer");
    setSfUser("");
    setSfPass("");
    setSfErr(null);
  }, []);

  const resetPatientForm = useCallback(() => {
    setPtFirst("");
    setPtLast("");
    setPtNick("");
    setPtCare("normal");
    setPtUser("");
    setPtPass("");
    setPtErr(null);
  }, []);

  useEffect(() => {
    const parsed = personnelTabFromQuery(searchParams.get("tab"));
    if (parsed) setTab(parsed);
  }, [searchParams]);

  const onPersonnelTabChange = useCallback(
    (v: ViewTab) => {
      setTab(v);
      const path = v === "staff" ? "/admin/personnel" : `/admin/personnel?tab=${encodeURIComponent(v)}`;
      router.replace(path, { scroll: false });
    },
    [router],
  );

  const onSubmitStaffPlusAccount = useCallback(async () => {
    if (!canProvision) return;
    if (sfFirst.trim().length < 1 || sfLast.trim().length < 1) {
      setSfErr(t("personnel.formRequiredNames"));
      return;
    }
    if (sfUser.trim().length < 3 || sfPass.trim().length < 6) {
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
        employee_code: "",
        department: "Nursing",
        employment_type: "full_time",
        specialty: "",
        license_number: "",
        phone: "",
        email: "",
        emergency_contact_name: "",
        emergency_contact_phone: "",
        photo_url: "",
      });
      await api.post<AppUser>("/users", {
        username: sfUser.trim(),
        password: sfPass.trim(),
        role: sfRole,
        is_active: true,
        caregiver_id: cg.id,
        patient_id: null,
        profile_image_url: "",
      });
      resetStaffForm();
      setStaffDialogOpen(false);
      await invalidatePersonnel();
    } catch (e) {
      setSfErr(e instanceof ApiError ? e.message : t("personnel.saveFailed"));
    } finally {
      setSfBusy(false);
    }
  }, [
    canProvision,
    invalidatePersonnel,
    resetStaffForm,
    sfFirst,
    sfLast,
    sfPass,
    sfRole,
    sfUser,
    t,
  ]);

  const onSubmitPatientPlusAccount = useCallback(async () => {
    if (!canProvision) return;
    if (ptFirst.trim().length < 1 || ptLast.trim().length < 1) {
      setPtErr(t("personnel.formRequiredNames"));
      return;
    }
    if (ptUser.trim().length < 3 || ptPass.trim().length < 6) {
      setPtErr(t("personnel.formRequiredCredentials"));
      return;
    }
    setPtBusy(true);
    setPtErr(null);
    try {
      const patient = await api.post<Patient>("/patients", {
        first_name: ptFirst.trim(),
        last_name: ptLast.trim(),
        nickname: ptNick.trim(),
        date_of_birth: null,
        gender: "",
        height_cm: null,
        weight_kg: null,
        blood_type: "",
        medical_conditions: [],
        allergies: [],
        medications: [],
        past_surgeries: [],
        care_level: ptCare,
        mobility_type: "wheelchair",
        notes: "",
        room_id: null,
      });
      await api.post<AppUser>("/users", {
        username: ptUser.trim(),
        password: ptPass.trim(),
        role: "patient",
        is_active: true,
        caregiver_id: null,
        patient_id: patient.id,
        profile_image_url: "",
      });
      resetPatientForm();
      setPatientDialogOpen(false);
      await invalidatePersonnel();
    } catch (e) {
      setPtErr(e instanceof ApiError ? e.message : t("personnel.saveFailed"));
    } finally {
      setPtBusy(false);
    }
  }, [
    canProvision,
    invalidatePersonnel,
    ptCare,
    ptFirst,
    ptLast,
    ptNick,
    ptPass,
    ptUser,
    resetPatientForm,
    t,
  ]);

  const caregivers = (caregiversQuery.data ?? []) as ListCaregiversResponse;
  const patients = (patientsQuery.data ?? []) as ListPatientsResponse;
  const users = (usersQuery.data ?? []) as User[];
  const isLoading = caregiversQuery.isLoading || patientsQuery.isLoading || usersQuery.isLoading;
  const q = search.trim().toLowerCase();
  const accountByCaregiverId = new Map(
    users
      .filter((item) => item.caregiver_id != null)
      .map((item) => [item.caregiver_id as number, item] as const),
  );
  const accountByPatientId = new Map(
    users
      .filter((item) => item.patient_id != null)
      .map((item) => [item.patient_id as number, item] as const),
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

  const patientRows = patients.filter((item) => {
    if (patientStatusFilter === "active" && !item.is_active) return false;
    if (patientStatusFilter === "inactive" && item.is_active) return false;
    if (!q) return true;
    return (
      `${item.first_name} ${item.last_name}`.toLowerCase().includes(q) ||
      (item.nickname || "").toLowerCase().includes(q) ||
      String(item.id).includes(q)
    );
  });

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

  const stats = {
    staff: caregivers.filter((item) => item.is_active).length,
    patients: patients.filter((item) => item.is_active).length,
    accounts: users.filter((item) => item.is_active).length,
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Personnel Workspace</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            One workspace for staff, patients, and accounts with searchable ID/name filters.
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline">Staff {stats.staff}</Badge>
          <Badge variant="outline">Patients {stats.patients}</Badge>
          <Badge variant="outline">Accounts {stats.accounts}</Badge>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Tabs value={tab} onValueChange={(v) => onPersonnelTabChange(v as ViewTab)} className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <TabsList className="grid w-full grid-cols-3 md:w-auto">
                <TabsTrigger value="staff">Staff</TabsTrigger>
                <TabsTrigger value="patients">Patients</TabsTrigger>
                <TabsTrigger value="accounts">Accounts</TabsTrigger>
              </TabsList>

              <div className="flex flex-wrap gap-2">
                {tab === "staff" || tab === "accounts" ? (
                  <select
                    className="input-field py-2 text-sm capitalize"
                    value={roleFilter}
                    onChange={(event) => setRoleFilter(event.target.value as "all" | User["role"])}
                  >
                    <option value="all">All Roles</option>
                    {[...STAFF_ROLES, "patient"].map((role) => (
                      <option key={role} value={role}>
                        {role.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                ) : null}
                {tab === "patients" ? (
                  <select
                    className="input-field py-2 text-sm"
                    value={patientStatusFilter}
                    onChange={(event) =>
                      setPatientStatusFilter(event.target.value as "all" | "active" | "inactive")
                    }
                  >
                    <option value="all">All patients</option>
                    <option value="active">Active only</option>
                    <option value="inactive">Inactive only</option>
                  </select>
                ) : null}
                {tab === "accounts" ? (
                  <select
                    className="input-field py-2 text-sm"
                    value={accountKindFilter}
                    onChange={(event) =>
                      setAccountKindFilter(event.target.value as "all" | "staff" | "patient")
                    }
                  >
                    <option value="all">All account types</option>
                    <option value="staff">Staff accounts</option>
                    <option value="patient">Patient accounts</option>
                  </select>
                ) : null}
                <div className="relative min-w-[16rem]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={tab === "accounts" ? "Search by ID, username, linked name" : "Search by ID or name"}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>

            {isLoading ? (
              <div className="flex min-h-56 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : (
              <>
              <TabsContent value="staff" className="m-0 space-y-2">
                {staffRows.map((row) => {
                  const linkedAccount = accountByCaregiverId.get(row.id);
                  return (
                  <div
                    key={row.id}
                    className="flex items-center justify-between rounded-xl border border-border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-blue-100 p-2 text-blue-600 dark:bg-blue-900/30">
                        <UserCog className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium">{row.first_name} {row.last_name}</p>
                        <p className="text-xs text-muted-foreground">{row.role} - {row.department || "No department"} - #{row.id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={row.is_active ? "success" : "outline"}>
                        {row.is_active ? "Active" : "Inactive"}
                      </Badge>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/admin/caregivers/${row.id}`}>
                          Open
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/admin/account-management?kind=staff&q=${encodeURIComponent(linkedAccount?.username || String(row.id))}`}>
                          {linkedAccount ? "Account" : "Create account"}
                        </Link>
                      </Button>
                    </div>
                  </div>
                )})}
                {staffRows.length === 0 ? (
                  <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No staff found.</p>
                ) : null}
              </TabsContent>

              <TabsContent value="patients" className="m-0 space-y-2">
                {patientRows.map((row) => {
                  const linkedAccount = accountByPatientId.get(row.id);
                  return (
                  <div
                    key={row.id}
                    className="flex items-center justify-between rounded-xl border border-border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-green-100 p-2 text-green-600 dark:bg-green-900/30">
                        <Users className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium">{row.first_name} {row.last_name}</p>
                        <p className="text-xs text-muted-foreground">Patient #{row.id}{row.nickname ? ` - ${row.nickname}` : ""}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={row.is_active ? "success" : "outline"}>
                        {row.is_active ? "Active" : "Inactive"}
                      </Badge>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/admin/patients/${row.id}`}>
                          Open
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/admin/account-management?kind=patient&q=${encodeURIComponent(linkedAccount?.username || String(row.id))}`}>
                          {linkedAccount ? "Account" : "Create account"}
                        </Link>
                      </Button>
                    </div>
                  </div>
                )})}
                {patientRows.length === 0 ? (
                  <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No patients found.</p>
                ) : null}
              </TabsContent>

              <TabsContent value="accounts" className="m-0 space-y-2">
                {accountRows.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between rounded-xl border border-border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-violet-100 p-2 text-violet-600 dark:bg-violet-900/30">
                        <KeyRound className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium">{row.username}</p>
                        <p className="text-xs text-muted-foreground">
                          Account #{row.id} - {row.role.replace(/_/g, " ")}
                          {row.caregiver_id ? ` - Staff #${row.caregiver_id}` : ""}
                          {row.patient_id ? ` - Patient #${row.patient_id}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={row.is_active ? "success" : "outline"}>
                        {row.is_active ? "Active" : "Inactive"}
                      </Badge>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/admin/account-management?kind=${row.role === "patient" ? "patient" : "staff"}&q=${encodeURIComponent(row.username)}`}>
                          <Shield className="h-3.5 w-3.5" />
                          Manage
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
                {accountRows.length === 0 ? (
                  <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No accounts found.</p>
                ) : null}
              </TabsContent>
              </>
            )}
          </Tabs>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href="/admin/caregivers">
            <UserCog className="h-4 w-4" />
            Staff directory
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin/patients">
            <Users className="h-4 w-4" />
            Patient roster
          </Link>
        </Button>
        {canProvision ? (
          <>
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
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                resetPatientForm();
                setPatientDialogOpen(true);
              }}
            >
              <UserPlus className="h-4 w-4" />
              {t("personnel.addPatientAccount")}
            </Button>
          </>
        ) : null}
        <Button asChild>
          <Link href="/admin/account-management">
            <UserPlus className="h-4 w-4" />
            {t("personnel.openAccountMgmt")}
          </Link>
        </Button>
      </div>

      <Dialog open={staffDialogOpen} onOpenChange={(o) => { setStaffDialogOpen(o); if (!o) resetStaffForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("personnel.addStaffTitle")}</DialogTitle>
            <DialogDescription>{t("personnel.addStaffDescription")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 px-1 pb-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label htmlFor="ps-first">{t("personnel.firstName")}</Label>
                <Input id="ps-first" value={sfFirst} onChange={(e) => setSfFirst(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="ps-last">{t("personnel.lastName")}</Label>
                <Input id="ps-last" value={sfLast} onChange={(e) => setSfLast(e.target.value)} className="mt-1" />
              </div>
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
                    {r.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="ps-user">{t("personnel.username")}</Label>
              <Input id="ps-user" value={sfUser} onChange={(e) => setSfUser(e.target.value)} autoComplete="off" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="ps-pass">{t("personnel.password")}</Label>
              <Input id="ps-pass" type="password" value={sfPass} onChange={(e) => setSfPass(e.target.value)} autoComplete="new-password" className="mt-1" />
            </div>
            {sfErr ? <p className="text-sm text-destructive">{sfErr}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStaffDialogOpen(false)}>
              {t("accountMgmt.cancel")}
            </Button>
            <Button type="button" disabled={sfBusy} onClick={() => void onSubmitStaffPlusAccount()}>
              {sfBusy ? t("common.loading") : t("personnel.createStaffUser")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={patientDialogOpen} onOpenChange={(o) => { setPatientDialogOpen(o); if (!o) resetPatientForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("personnel.addPatientTitle")}</DialogTitle>
            <DialogDescription>{t("personnel.addPatientDescription")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 px-1 pb-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label htmlFor="pp-first">{t("personnel.firstName")}</Label>
                <Input id="pp-first" value={ptFirst} onChange={(e) => setPtFirst(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="pp-last">{t("personnel.lastName")}</Label>
                <Input id="pp-last" value={ptLast} onChange={(e) => setPtLast(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div>
              <Label htmlFor="pp-nick">{t("personnel.nickname")}</Label>
              <Input id="pp-nick" value={ptNick} onChange={(e) => setPtNick(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="pp-care">{t("personnel.careLevel")}</Label>
              <select
                id="pp-care"
                className="input-field mt-1 w-full py-2 text-sm"
                value={ptCare}
                onChange={(e) => setPtCare(e.target.value as typeof ptCare)}
              >
                <option value="normal">normal</option>
                <option value="special">special</option>
                <option value="critical">critical</option>
              </select>
            </div>
            <div>
              <Label htmlFor="pp-user">{t("personnel.username")}</Label>
              <Input id="pp-user" value={ptUser} onChange={(e) => setPtUser(e.target.value)} autoComplete="off" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="pp-pass">{t("personnel.password")}</Label>
              <Input id="pp-pass" type="password" value={ptPass} onChange={(e) => setPtPass(e.target.value)} autoComplete="new-password" className="mt-1" />
            </div>
            {ptErr ? <p className="text-sm text-destructive">{ptErr}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPatientDialogOpen(false)}>
              {t("accountMgmt.cancel")}
            </Button>
            <Button type="button" disabled={ptBusy} onClick={() => void onSubmitPatientPlusAccount()}>
              {ptBusy ? t("common.loading") : t("personnel.createPatientUser")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function PersonnelPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      }
    >
      <PersonnelPageContent />
    </Suspense>
  );
}
