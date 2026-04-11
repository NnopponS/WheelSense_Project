"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, KeyRound, Pencil, Settings2, Trash2, UserPlus, Users } from "lucide-react";
import SearchableListboxPicker, {
  type SearchableListboxOption,
} from "@/components/shared/SearchableListboxPicker";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api";
import { hasCapability } from "@/lib/permissions";
import { ROUTES } from "@/lib/constants";
import type {
  ListCaregiversResponse,
  ListPatientsResponse,
  ListUsersResponse,
} from "@/lib/api/task-scope-types";

type AdminUser = ListUsersResponse[number];
type AdminPatient = ListPatientsResponse[number];
type AdminCaregiver = ListCaregiversResponse[number];

const USER_ROLES = [
  "admin",
  "head_nurse",
  "supervisor",
  "observer",
  "patient",
] as const;
const STAFF_ROLES = ["admin", "head_nurse", "supervisor", "observer"] as const;

const NO_SELECTION = "__none__";

type AccountDraft = {
  username: string;
  password: string;
  role: (typeof USER_ROLES)[number];
  isActive: boolean;
  caregiverId: string;
  patientId: string;
};

function formatCaregiver(c: AdminCaregiver): string {
  return `${c.first_name} ${c.last_name}`.trim() || `Staff #${c.id}`;
}

function formatPatient(p: AdminPatient): string {
  return `${p.first_name} ${p.last_name}`.trim() || `Patient #${p.id}`;
}

function roleLabel(role: string): string {
  return role.replace(/_/g, " ");
}

function isStaffRole(role: string): role is (typeof STAFF_ROLES)[number] {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

function matchText(values: Array<string | number | null | undefined>, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return values.filter(Boolean).join(" ").toLowerCase().includes(q);
}

export default function AccountManagementPage() {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const canEdit = me ? hasCapability(me.role, "users.manage") : false;

  const usersQuery = useQuery({
    queryKey: ["admin", "account-management", "users"],
    queryFn: () => api.listUsers(),
  });
  const patientsQuery = useQuery({
    queryKey: ["admin", "account-management", "patients"],
    queryFn: () => api.listPatients({ limit: 1000 }),
  });
  const caregiversQuery = useQuery({
    queryKey: ["admin", "account-management", "caregivers"],
    queryFn: () => api.listCaregivers({ limit: 1000 }),
  });
  const { refetch: refetchUsers } = usersQuery;

  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [draft, setDraft] = useState<AccountDraft | null>(null);
  const [staffSearch, setStaffSearch] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [tableSearch, setTableSearch] = useState(() => searchParams.get("q") ?? "");
  const [kindFilter, setKindFilter] = useState<"all" | "staff" | "patient">(() => {
    const raw = searchParams.get("kind");
    return raw === "staff" || raw === "patient" ? raw : "all";
  });
  const [roleFilter, setRoleFilter] = useState<"all" | AccountDraft["role"]>(() => {
    const raw = searchParams.get("role");
    return raw && USER_ROLES.includes(raw as AccountDraft["role"]) ? (raw as AccountDraft["role"]) : "all";
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [createUsername, setCreateUsername] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<AccountDraft["role"]>("observer");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [createBanner, setCreateBanner] = useState<string | null>(null);
  const [createCaregiverId, setCreateCaregiverId] = useState(NO_SELECTION);
  const [createPatientId, setCreatePatientId] = useState(NO_SELECTION);
  const [createStaffSearch, setCreateStaffSearch] = useState("");
  const [createPatientSearch, setCreatePatientSearch] = useState("");

  const staffLabelId = useId();
  const staffInputId = useId();
  const staffListboxId = useId();
  const patientLabelId = useId();
  const patientInputId = useId();
  const patientListboxId = useId();
  const createStaffLabelId = useId();
  const createStaffInputId = useId();
  const createStaffListboxId = useId();
  const createPatientLabelId = useId();
  const createPatientInputId = useId();
  const createPatientListboxId = useId();

  const caregiverById = useMemo(() => {
    const m = new Map<number, AdminCaregiver>();
    for (const c of caregiversQuery.data ?? []) m.set(c.id, c);
    return m;
  }, [caregiversQuery.data]);

  const patientById = useMemo(() => {
    const m = new Map<number, AdminPatient>();
    for (const p of patientsQuery.data ?? []) m.set(p.id, p);
    return m;
  }, [patientsQuery.data]);

  const caregiverOptions = useMemo<SearchableListboxOption[]>(() => {
    const q = staffSearch.trim().toLowerCase();
    const list = [...(caregiversQuery.data ?? [])]
      .filter((c) =>
        matchText(
          [c.first_name, c.last_name, c.role, c.email, c.phone, c.employee_code, c.id],
          q,
        ),
      )
      .sort((a, b) => formatCaregiver(a).localeCompare(formatCaregiver(b)));
    return [
      { id: NO_SELECTION, title: t("accountMgmt.clearSelection") },
      ...list.map((c) => ({
        id: String(c.id),
        title: formatCaregiver(c),
        subtitle: [c.role, c.email || c.phone || null, `#${c.id}`].filter(Boolean).join(" - "),
      })),
    ];
  }, [caregiversQuery.data, staffSearch, t]);

  const patientOptions = useMemo<SearchableListboxOption[]>(() => {
    const q = patientSearch.trim().toLowerCase();
    const list = [...(patientsQuery.data ?? [])]
      .filter((p) => matchText([p.first_name, p.last_name, p.nickname, p.id], q))
      .sort((a, b) => formatPatient(a).localeCompare(formatPatient(b)));
    return [
      { id: NO_SELECTION, title: t("accountMgmt.clearSelection") },
      ...list.map((p) => ({
        id: String(p.id),
        title: formatPatient(p),
        subtitle: [p.room_id != null ? `room ${p.room_id}` : null, p.care_level, `#${p.id}`]
          .filter(Boolean)
          .join(" - "),
      })),
    ];
  }, [patientSearch, patientsQuery.data, t]);

  const createCaregiverOptions = useMemo<SearchableListboxOption[]>(() => {
    const q = createStaffSearch.trim().toLowerCase();
    const list = [...(caregiversQuery.data ?? [])]
      .filter((c) =>
        matchText(
          [c.first_name, c.last_name, c.role, c.email, c.phone, c.employee_code, c.id],
          q,
        ),
      )
      .sort((a, b) => formatCaregiver(a).localeCompare(formatCaregiver(b)));
    return [
      { id: NO_SELECTION, title: t("accountMgmt.clearSelection") },
      ...list.map((c) => ({
        id: String(c.id),
        title: formatCaregiver(c),
        subtitle: [c.role, c.email || c.phone || null, `#${c.id}`].filter(Boolean).join(" - "),
      })),
    ];
  }, [caregiversQuery.data, createStaffSearch, t]);

  const createPatientOptions = useMemo<SearchableListboxOption[]>(() => {
    const q = createPatientSearch.trim().toLowerCase();
    const list = [...(patientsQuery.data ?? [])]
      .filter((p) => matchText([p.first_name, p.last_name, p.nickname, p.id], q))
      .sort((a, b) => formatPatient(a).localeCompare(formatPatient(b)));
    return [
      { id: NO_SELECTION, title: t("accountMgmt.clearSelection") },
      ...list.map((p) => ({
        id: String(p.id),
        title: formatPatient(p),
        subtitle: [p.room_id != null ? `room ${p.room_id}` : null, p.care_level, `#${p.id}`]
          .filter(Boolean)
          .join(" - "),
      })),
    ];
  }, [createPatientSearch, patientsQuery.data, t]);

  useEffect(() => {
    if (createRole === "patient") {
      setCreateCaregiverId(NO_SELECTION);
      setCreateStaffSearch("");
      setCreatePatientId(NO_SELECTION);
      setCreatePatientSearch("");
    } else if (isStaffRole(createRole)) {
      setCreatePatientId(NO_SELECTION);
      setCreatePatientSearch("");
    } else {
      setCreateCaregiverId(NO_SELECTION);
      setCreatePatientId(NO_SELECTION);
      setCreateStaffSearch("");
      setCreatePatientSearch("");
    }
  }, [createRole]);

  const filteredUsers = useMemo(() => {
    return [...(usersQuery.data ?? [])].filter((u) => {
      if (kindFilter === "staff" && !isStaffRole(u.role)) return false;
      if (kindFilter === "patient" && u.role !== "patient") return false;
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      const cg = u.caregiver_id != null ? caregiverById.get(u.caregiver_id) : null;
      const pt = u.patient_id != null ? patientById.get(u.patient_id) : null;
      return matchText(
        [
          u.username,
          u.role,
          u.is_active ? "active" : "inactive",
          cg ? formatCaregiver(cg) : null,
          pt ? formatPatient(pt) : null,
          u.id,
        ],
        tableSearch,
      );
    });
  }, [caregiverById, kindFilter, patientById, roleFilter, tableSearch, usersQuery.data]);

  const filteredStats = useMemo(
    () => ({
      total: filteredUsers.length,
      active: filteredUsers.filter((user) => user.is_active).length,
      staff: filteredUsers.filter((user) => isStaffRole(user.role)).length,
      patients: filteredUsers.filter((user) => user.role === "patient").length,
    }),
    [filteredUsers],
  );

  useEffect(() => {
    const params = new URLSearchParams();
    const trimmedSearch = tableSearch.trim();
    if (trimmedSearch) params.set("q", trimmedSearch);
    if (kindFilter !== "all") params.set("kind", kindFilter);
    if (roleFilter !== "all") params.set("role", roleFilter);
    const nextUrl = params.size > 0 ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [kindFilter, pathname, roleFilter, router, tableSearch]);

  const openEdit = useCallback(
    (u: AdminUser) => {
      const caregiver = u.caregiver_id != null ? caregiverById.get(u.caregiver_id) : null;
      const patient = u.patient_id != null ? patientById.get(u.patient_id) : null;
      setEditing(u);
      setDraft({
        username: u.username,
        password: "",
        role: u.role as AccountDraft["role"],
        isActive: u.is_active,
        caregiverId: u.caregiver_id != null ? String(u.caregiver_id) : NO_SELECTION,
        patientId: u.patient_id != null ? String(u.patient_id) : NO_SELECTION,
      });
      setStaffSearch(caregiver ? formatCaregiver(caregiver) : "");
      setPatientSearch(patient ? formatPatient(patient) : "");
      setSaveErr(null);
    },
    [caregiverById, patientById],
  );

  const closeEdit = useCallback(() => {
    setEditing(null);
    setDraft(null);
    setSaveErr(null);
    setStaffSearch("");
    setPatientSearch("");
  }, []);

  const onSave = useCallback(async () => {
    if (!editing || !draft) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const payload: Record<string, unknown> = {
        username: draft.username.trim(),
        role: draft.role,
        is_active: draft.isActive,
        caregiver_id: draft.caregiverId === NO_SELECTION ? null : Number(draft.caregiverId),
        patient_id: draft.patientId === NO_SELECTION ? null : Number(draft.patientId),
      };
      if (draft.password.trim()) payload.password = draft.password.trim();
      await api.put<AdminUser>(`/users/${editing.id}`, payload);
      await refetchUsers();
      closeEdit();
    } catch (e) {
      setSaveErr(e instanceof ApiError ? e.message : t("accountMgmt.saveError"));
    } finally {
      setSaving(false);
    }
  }, [closeEdit, draft, editing, refetchUsers, t]);

  const onSoftDelete = useCallback(async () => {
    if (!editing) return;
    if (!window.confirm(`Deactivate ${editing.username} and remove identity links?`)) return;
    setDeleting(true);
    setSaveErr(null);
    try {
      await api.delete(`/users/${editing.id}`);
      await refetchUsers();
      closeEdit();
    } catch (e) {
      setSaveErr(e instanceof ApiError ? e.message : t("accountMgmt.saveError"));
    } finally {
      setDeleting(false);
    }
  }, [closeEdit, editing, refetchUsers, t]);

  const onCreateUser = useCallback(async () => {
    if (!canEdit) return;
    if (createUsername.trim().length < 3 || createPassword.trim().length < 6) return;
    setCreating(true);
    setCreateErr(null);
    setCreateBanner(null);
    try {
      const caregiver_id =
        isStaffRole(createRole) && createCaregiverId !== NO_SELECTION
          ? Number(createCaregiverId)
          : null;
      const patient_id =
        createRole === "patient" && createPatientId !== NO_SELECTION
          ? Number(createPatientId)
          : null;
      await api.post<AdminUser>("/users", {
        username: createUsername.trim(),
        password: createPassword.trim(),
        role: createRole,
        is_active: true,
        caregiver_id,
        patient_id,
        profile_image_url: "",
      });
      setCreateUsername("");
      setCreatePassword("");
      setCreateRole("observer");
      setCreateCaregiverId(NO_SELECTION);
      setCreatePatientId(NO_SELECTION);
      setCreateStaffSearch("");
      setCreatePatientSearch("");
      setCreateBanner(t("admin.users.created"));
      await refetchUsers();
    } catch (e) {
      setCreateErr(e instanceof ApiError ? e.message : t("accountMgmt.saveError"));
    } finally {
      setCreating(false);
    }
  }, [
    canEdit,
    createCaregiverId,
    createPassword,
    createPatientId,
    createRole,
    createUsername,
    refetchUsers,
    t,
  ]);

  const loading = usersQuery.isLoading || patientsQuery.isLoading || caregiversQuery.isLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Account Management</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Filter by staff/patient and role, then search by account id, username, staff name, or patient name.
          </p>
        </div>
        <Link
          href={ROUTES.PROFILE}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-2.5 text-sm font-medium text-foreground transition-smooth hover:bg-muted"
        >
          <Settings2 className="h-4 w-4 text-muted-foreground" aria-hidden />
          {t("accountMgmt.profileCta")}
        </Link>
      </div>

      {!canEdit && (
        <p className="text-sm text-muted-foreground">{t("accountMgmt.readOnlyHint")}</p>
      )}

      {canEdit && (
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" aria-hidden />
            <div>
              <h3 className="text-base font-semibold text-foreground">{t("admin.users.create")}</h3>
              <p className="text-sm text-muted-foreground">{t("admin.users.subtitle")}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("admin.users.username")}
              </span>
              <input
                className="input-field w-full py-2.5 text-sm"
                value={createUsername}
                onChange={(e) => setCreateUsername(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("admin.users.password")}
              </span>
              <input
                type="password"
                className="input-field w-full py-2.5 text-sm"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("admin.users.role")}
              </span>
              <select
                className="input-field w-full py-2.5 text-sm capitalize"
                value={createRole}
                onChange={(e) => setCreateRole(e.target.value as AccountDraft["role"])}
              >
                {USER_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {roleLabel(role)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t("accountMgmt.createLinkHint")}</p>
          {isStaffRole(createRole) ? (
            <div className="mt-3">
              <label id={createStaffLabelId} htmlFor={createStaffInputId} className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("accountMgmt.pickStaff")}
              </label>
              <SearchableListboxPicker
                inputId={createStaffInputId}
                listboxId={createStaffListboxId}
                ariaLabelledBy={createStaffLabelId}
                options={createCaregiverOptions}
                search={createStaffSearch}
                onSearchChange={setCreateStaffSearch}
                searchPlaceholder="Search staff by name, role, phone, email"
                selectedOptionId={createCaregiverId}
                onSelectOption={(id) => {
                  const selected = id === NO_SELECTION ? null : caregiverById.get(Number(id));
                  setCreateCaregiverId(id);
                  setCreateStaffSearch(selected ? formatCaregiver(selected) : "");
                }}
                listboxAriaLabel={t("accountMgmt.pickStaff")}
                noMatchMessage={t("common.noSearchMatches")}
                emptyNoMatch
                listPresentation="portal"
                listboxZIndex={180}
              />
            </div>
          ) : null}
          {createRole === "patient" ? (
            <div className="mt-3">
              <label id={createPatientLabelId} htmlFor={createPatientInputId} className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("accountMgmt.pickPatient")}
              </label>
              <SearchableListboxPicker
                inputId={createPatientInputId}
                listboxId={createPatientListboxId}
                ariaLabelledBy={createPatientLabelId}
                options={createPatientOptions}
                search={createPatientSearch}
                onSearchChange={setCreatePatientSearch}
                searchPlaceholder="Search patients by name or id"
                selectedOptionId={createPatientId}
                onSelectOption={(id) => {
                  const selected = id === NO_SELECTION ? null : patientById.get(Number(id));
                  setCreatePatientId(id);
                  setCreatePatientSearch(selected ? formatPatient(selected) : "");
                }}
                listboxAriaLabel={t("accountMgmt.pickPatient")}
                noMatchMessage={t("common.noSearchMatches")}
                emptyNoMatch
                listPresentation="portal"
                listboxZIndex={180}
              />
            </div>
          ) : null}
          {createErr ? <p className="mt-3 text-sm text-error" role="alert">{createErr}</p> : null}
          {createBanner ? <p className="mt-3 text-sm text-primary">{createBanner}</p> : null}
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => void onCreateUser()}
              disabled={creating || createUsername.trim().length < 3 || createPassword.trim().length < 6}
              className="gradient-cta rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {creating ? t("common.saving") : t("admin.users.create")}
            </button>
          </div>
        </section>
      )}

      {usersQuery.error && <p className="text-sm text-destructive" role="alert">{t("accountMgmt.loadError")}</p>}

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="grid gap-3 border-b border-border bg-muted/40 px-4 py-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-border bg-background px-3 py-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Visible Accounts</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{filteredStats.total}</p>
          </div>
          <div className="rounded-lg border border-border bg-background px-3 py-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{filteredStats.active}</p>
          </div>
          <div className="rounded-lg border border-border bg-background px-3 py-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Staff Accounts</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{filteredStats.staff}</p>
          </div>
          <div className="rounded-lg border border-border bg-background px-3 py-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Patient Accounts</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{filteredStats.patients}</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("accountMgmt.tableCaption")}
          </p>
          <div className="flex flex-wrap gap-2">
            <select
              className="input-field py-2 text-sm"
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value as "all" | "staff" | "patient")}
            >
              <option value="all">All Accounts</option>
              <option value="staff">Staff</option>
              <option value="patient">Patients</option>
            </select>
            <select
              className="input-field py-2 text-sm capitalize"
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value as "all" | AccountDraft["role"])}
            >
              <option value="all">All Roles</option>
              {USER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </select>
            <input
              className="input-field min-w-[16rem] py-2 text-sm"
              type="search"
              value={tableSearch}
              onChange={(event) => setTableSearch(event.target.value)}
              placeholder="Search by ID, username, or linked name"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 font-semibold text-foreground">{t("accountMgmt.colUser")}</th>
                <th className="px-4 py-3 font-semibold text-foreground">{t("accountMgmt.colRole")}</th>
                <th className="px-4 py-3 font-semibold text-foreground">{t("accountMgmt.colActive")}</th>
                <th className="px-4 py-3 font-semibold text-foreground">{t("accountMgmt.colStaff")}</th>
                <th className="px-4 py-3 font-semibold text-foreground">{t("accountMgmt.colPatient")}</th>
                <th className="px-4 py-3 font-semibold text-foreground">{t("accountMgmt.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    {t("common.loading")}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const cg = u.caregiver_id != null ? caregiverById.get(u.caregiver_id) : undefined;
                  const pt = u.patient_id != null ? patientById.get(u.patient_id) : undefined;
                  return (
                    <tr key={u.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden />
                          {u.username}
                        </div>
                      </td>
                      <td className="px-4 py-3 capitalize text-muted-foreground">{roleLabel(u.role)}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {u.is_active ? t("accountMgmt.yes") : t("accountMgmt.no")}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {cg ? `${formatCaregiver(cg)} (#${cg.id})` : t("accountMgmt.none")}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {pt ? `${formatPatient(pt)} (#${pt.id})` : t("accountMgmt.none")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {canEdit ? (
                            <button
                              type="button"
                              onClick={() => openEdit(u)}
                              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-primary-fixed/15"
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden />
                              {t("accountMgmt.editLinks")}
                            </button>
                          ) : null}
                          {cg ? (
                            <Link
                              href={`/admin/caregivers/${cg.id}`}
                              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
                            >
                              <Users className="h-3.5 w-3.5" aria-hidden />
                              Staff
                              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                            </Link>
                          ) : null}
                          {pt ? (
                            <Link
                              href={`/admin/patients/${pt.id}`}
                              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
                            >
                              <Users className="h-3.5 w-3.5" aria-hidden />
                              Patient
                              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                            </Link>
                          ) : null}
                          {!canEdit && !cg && !pt ? (
                            <span className="text-muted-foreground/50">{t("accountMgmt.none")}</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editing && draft && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="account-mgmt-edit-title"
        >
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 id="account-mgmt-edit-title" className="text-lg font-semibold text-foreground">
                  {t("accountMgmt.editTitle")}
                </h4>
                <p className="mt-1 text-sm text-muted-foreground">{editing.username}</p>
              </div>
              <span className="rounded-full bg-muted px-3 py-1 text-xs capitalize text-muted-foreground">
                {roleLabel(editing.role)}
              </span>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("admin.users.username")}
                </span>
                <input
                  className="input-field py-2.5 text-sm"
                  value={draft.username}
                  onChange={(event) => setDraft((prev) => prev ? { ...prev, username: event.target.value } : prev)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("admin.users.password")}
                </span>
                <input
                  type="password"
                  className="input-field py-2.5 text-sm"
                  value={draft.password}
                  onChange={(event) => setDraft((prev) => prev ? { ...prev, password: event.target.value } : prev)}
                  placeholder="Leave blank to keep current password"
                  autoComplete="new-password"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("admin.users.role")}
                </span>
                <select
                  className="input-field py-2.5 text-sm capitalize"
                  value={draft.role}
                  onChange={(event) =>
                    setDraft((prev) => prev ? { ...prev, role: event.target.value as AccountDraft["role"] } : prev)
                  }
                >
                  {USER_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {roleLabel(role)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(event) =>
                    setDraft((prev) => prev ? { ...prev, isActive: event.target.checked } : prev)
                  }
                />
                <span className="text-sm font-medium text-foreground">{t("accountMgmt.colActive")}</span>
              </label>
              <div>
                <label id={staffLabelId} htmlFor={staffInputId} className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("accountMgmt.pickStaff")}
                </label>
                <SearchableListboxPicker
                  inputId={staffInputId}
                  listboxId={staffListboxId}
                  ariaLabelledBy={staffLabelId}
                  options={caregiverOptions}
                  search={staffSearch}
                  onSearchChange={setStaffSearch}
                  searchPlaceholder="Search staff by name, role, phone, email"
                  selectedOptionId={draft.caregiverId}
                  onSelectOption={(id) => {
                    const selected = id === NO_SELECTION ? null : caregiverById.get(Number(id));
                    setDraft((prev) => prev ? { ...prev, caregiverId: id } : prev);
                    setStaffSearch(selected ? formatCaregiver(selected) : "");
                  }}
                  listboxAriaLabel={t("accountMgmt.pickStaff")}
                  noMatchMessage={t("common.noSearchMatches")}
                  emptyNoMatch
                  listPresentation="portal"
                  listboxZIndex={180}
                />
              </div>
              <div>
                <label id={patientLabelId} htmlFor={patientInputId} className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("accountMgmt.pickPatient")}
                </label>
                <SearchableListboxPicker
                  inputId={patientInputId}
                  listboxId={patientListboxId}
                  ariaLabelledBy={patientLabelId}
                  options={patientOptions}
                  search={patientSearch}
                  onSearchChange={setPatientSearch}
                  searchPlaceholder="Search patients by name or id"
                  selectedOptionId={draft.patientId}
                  onSelectOption={(id) => {
                    const selected = id === NO_SELECTION ? null : patientById.get(Number(id));
                    setDraft((prev) => prev ? { ...prev, patientId: id } : prev);
                    setPatientSearch(selected ? formatPatient(selected) : "");
                  }}
                  listboxAriaLabel={t("accountMgmt.pickPatient")}
                  noMatchMessage={t("common.noSearchMatches")}
                  emptyNoMatch
                  listPresentation="portal"
                  listboxZIndex={180}
                />
              </div>
            </div>

            {saveErr && <p className="mt-3 text-sm text-error" role="alert">{saveErr}</p>}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => void onSoftDelete()}
                disabled={saving || deleting || editing.id === me?.id}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-destructive/30 px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                {deleting ? t("common.saving") : "Deactivate account"}
              </button>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeEdit}
                  disabled={saving || deleting}
                  className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted"
                >
                  {t("accountMgmt.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => void onSave()}
                  disabled={saving || deleting || draft.username.trim().length < 3}
                  className="gradient-cta rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? t("accountMgmt.saving") : t("accountMgmt.save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
