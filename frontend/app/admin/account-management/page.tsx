"use client";

import { useCallback, useId, useMemo, useState } from "react";
import Link from "next/link";
import { KeyRound, Pencil, Settings2, Trash2, UserPlus } from "lucide-react";
import SearchableListboxPicker, {
  type SearchableListboxOption,
} from "@/components/shared/SearchableListboxPicker";
import { useTranslation } from "@/lib/i18n";
import { useQuery } from "@/hooks/useQuery";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api";
import { hasCapability } from "@/lib/permissions";
import type { User, Patient, Caregiver } from "@/lib/types";
import { ROUTES } from "@/lib/constants";

const USER_ROLES: User["role"][] = [
  "admin",
  "head_nurse",
  "supervisor",
  "observer",
  "patient",
];

const NO_SELECTION = "__none__";

type AccountDraft = {
  username: string;
  password: string;
  role: User["role"];
  isActive: boolean;
  caregiverId: string;
  patientId: string;
};

function formatCaregiver(c: Caregiver): string {
  return `${c.first_name} ${c.last_name}`.trim() || `Staff #${c.id}`;
}

function formatPatient(p: Patient): string {
  return `${p.first_name} ${p.last_name}`.trim() || `Patient #${p.id}`;
}

function roleLabel(role: User["role"]): string {
  return role.replace(/_/g, " ");
}

function matchText(values: Array<string | number | null | undefined>, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return values.filter(Boolean).join(" ").toLowerCase().includes(q);
}

export default function AccountManagementPage() {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const canEdit = me ? hasCapability(me.role, "users.manage") : false;

  const { data: users, isLoading: loadingUsers, error: usersError, refetch } =
    useQuery<User[]>("/users");
  const { data: patients, isLoading: loadingPatients } = useQuery<Patient[]>("/patients");
  const { data: caregivers, isLoading: loadingCaregivers } =
    useQuery<Caregiver[]>("/caregivers");

  const [editing, setEditing] = useState<User | null>(null);
  const [draft, setDraft] = useState<AccountDraft | null>(null);
  const [staffSearch, setStaffSearch] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [tableSearch, setTableSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [createUsername, setCreateUsername] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<User["role"]>("observer");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [createBanner, setCreateBanner] = useState<string | null>(null);

  const staffLabelId = useId();
  const staffInputId = useId();
  const staffListboxId = useId();
  const patientLabelId = useId();
  const patientInputId = useId();
  const patientListboxId = useId();

  const caregiverById = useMemo(() => {
    const m = new Map<number, Caregiver>();
    for (const c of caregivers ?? []) m.set(c.id, c);
    return m;
  }, [caregivers]);

  const patientById = useMemo(() => {
    const m = new Map<number, Patient>();
    for (const p of patients ?? []) m.set(p.id, p);
    return m;
  }, [patients]);

  const caregiverOptions = useMemo<SearchableListboxOption[]>(() => {
    const q = staffSearch.trim().toLowerCase();
    const list = [...(caregivers ?? [])]
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
  }, [caregivers, staffSearch, t]);

  const patientOptions = useMemo<SearchableListboxOption[]>(() => {
    const q = patientSearch.trim().toLowerCase();
    const list = [...(patients ?? [])]
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
  }, [patientSearch, patients, t]);

  const filteredUsers = useMemo(() => {
    return [...(users ?? [])].filter((u) => {
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
  }, [caregiverById, patientById, tableSearch, users]);

  const openEdit = useCallback(
    (u: User) => {
      const caregiver = u.caregiver_id != null ? caregiverById.get(u.caregiver_id) : null;
      const patient = u.patient_id != null ? patientById.get(u.patient_id) : null;
      setEditing(u);
      setDraft({
        username: u.username,
        password: "",
        role: u.role,
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
      await api.put<User>(`/users/${editing.id}`, payload);
      await refetch();
      closeEdit();
    } catch (e) {
      setSaveErr(e instanceof ApiError ? e.message : t("accountMgmt.saveError"));
    } finally {
      setSaving(false);
    }
  }, [closeEdit, draft, editing, refetch, t]);

  const onSoftDelete = useCallback(async () => {
    if (!editing) return;
    if (!window.confirm(`Deactivate ${editing.username} and remove identity links?`)) return;
    setDeleting(true);
    setSaveErr(null);
    try {
      await api.delete(`/users/${editing.id}`);
      await refetch();
      closeEdit();
    } catch (e) {
      setSaveErr(e instanceof ApiError ? e.message : t("accountMgmt.saveError"));
    } finally {
      setDeleting(false);
    }
  }, [closeEdit, editing, refetch, t]);

  const onCreateUser = useCallback(async () => {
    if (!canEdit) return;
    if (createUsername.trim().length < 3 || createPassword.trim().length < 6) return;
    setCreating(true);
    setCreateErr(null);
    setCreateBanner(null);
    try {
      await api.post<User>("/users", {
        username: createUsername.trim(),
        password: createPassword.trim(),
        role: createRole,
        is_active: true,
        caregiver_id: null,
        patient_id: null,
      });
      setCreateUsername("");
      setCreatePassword("");
      setCreateRole("observer");
      setCreateBanner(t("admin.users.created"));
      await refetch();
    } catch (e) {
      setCreateErr(e instanceof ApiError ? e.message : t("accountMgmt.saveError"));
    } finally {
      setCreating(false);
    }
  }, [canEdit, createPassword, createRole, createUsername, refetch, t]);

  const loading = loadingUsers || loadingPatients || loadingCaregivers;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-on-surface">{t("nav.myAccount")}</h2>
          <p className="mt-1 max-w-3xl text-sm text-on-surface-variant">
            {t("accountMgmt.subtitle")}
          </p>
        </div>
        <Link
          href={ROUTES.PROFILE}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-2.5 text-sm font-medium text-on-surface transition-smooth hover:bg-surface-container"
        >
          <Settings2 className="h-4 w-4 text-outline" aria-hidden />
          {t("accountMgmt.profileCta")}
        </Link>
      </div>

      {!canEdit && (
        <p className="text-sm text-on-surface-variant">{t("accountMgmt.readOnlyHint")}</p>
      )}

      {canEdit && (
        <section className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" aria-hidden />
            <div>
              <h3 className="text-base font-semibold text-on-surface">{t("admin.users.create")}</h3>
              <p className="text-sm text-on-surface-variant">{t("admin.users.subtitle")}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-on-surface-variant">
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
              <span className="mb-1 block text-xs font-medium text-on-surface-variant">
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
              <span className="mb-1 block text-xs font-medium text-on-surface-variant">
                {t("admin.users.role")}
              </span>
              <select
                className="input-field w-full py-2.5 text-sm capitalize"
                value={createRole}
                onChange={(e) => setCreateRole(e.target.value as User["role"])}
              >
                {USER_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {roleLabel(role)}
                  </option>
                ))}
              </select>
            </label>
          </div>
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

      {usersError && <p className="text-sm text-error" role="alert">{t("accountMgmt.loadError")}</p>}

      <section className="overflow-hidden rounded-xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
        <div className="flex flex-col gap-3 border-b border-outline-variant/15 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
            {t("accountMgmt.tableCaption")}
          </p>
          <input
            className="input-field max-w-sm py-2 text-sm"
            type="search"
            value={tableSearch}
            onChange={(event) => setTableSearch(event.target.value)}
            placeholder={t("common.search")}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-outline-variant/15 bg-surface-container-low/80">
                <th className="px-4 py-3 font-semibold text-on-surface">{t("accountMgmt.colUser")}</th>
                <th className="px-4 py-3 font-semibold text-on-surface">{t("accountMgmt.colRole")}</th>
                <th className="px-4 py-3 font-semibold text-on-surface">{t("accountMgmt.colActive")}</th>
                <th className="px-4 py-3 font-semibold text-on-surface">{t("accountMgmt.colStaff")}</th>
                <th className="px-4 py-3 font-semibold text-on-surface">{t("accountMgmt.colPatient")}</th>
                <th className="px-4 py-3 font-semibold text-on-surface">{t("accountMgmt.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-on-surface-variant">
                    {t("common.loading")}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const cg = u.caregiver_id != null ? caregiverById.get(u.caregiver_id) : undefined;
                  const pt = u.patient_id != null ? patientById.get(u.patient_id) : undefined;
                  return (
                    <tr key={u.id} className="border-b border-outline-variant/10 last:border-0">
                      <td className="px-4 py-3 font-medium text-on-surface">
                        <div className="flex items-center gap-2">
                          <KeyRound className="h-4 w-4 text-outline" aria-hidden />
                          {u.username}
                        </div>
                      </td>
                      <td className="px-4 py-3 capitalize text-on-surface-variant">{roleLabel(u.role)}</td>
                      <td className="px-4 py-3 text-on-surface-variant">
                        {u.is_active ? t("accountMgmt.yes") : t("accountMgmt.no")}
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant">
                        {cg ? `${formatCaregiver(cg)} (#${cg.id})` : t("accountMgmt.none")}
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant">
                        {pt ? `${formatPatient(pt)} (#${pt.id})` : t("accountMgmt.none")}
                      </td>
                      <td className="px-4 py-3">
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => openEdit(u)}
                            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-primary-fixed/15"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                            {t("accountMgmt.editLinks")}
                          </button>
                        ) : (
                          <span className="text-on-surface-variant/50">{t("accountMgmt.none")}</span>
                        )}
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
          <div className="w-full max-w-2xl rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 id="account-mgmt-edit-title" className="text-lg font-semibold text-on-surface">
                  {t("accountMgmt.editTitle")}
                </h4>
                <p className="mt-1 text-sm text-on-surface-variant">{editing.username}</p>
              </div>
              <span className="rounded-full bg-surface-container px-3 py-1 text-xs capitalize text-on-surface-variant">
                {roleLabel(editing.role)}
              </span>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-on-surface-variant">
                  {t("admin.users.username")}
                </span>
                <input
                  className="input-field py-2.5 text-sm"
                  value={draft.username}
                  onChange={(event) => setDraft((prev) => prev ? { ...prev, username: event.target.value } : prev)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-on-surface-variant">
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
                <span className="mb-1 block text-xs font-medium text-on-surface-variant">
                  {t("admin.users.role")}
                </span>
                <select
                  className="input-field py-2.5 text-sm capitalize"
                  value={draft.role}
                  onChange={(event) =>
                    setDraft((prev) => prev ? { ...prev, role: event.target.value as User["role"] } : prev)
                  }
                >
                  {USER_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {roleLabel(role)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-3 rounded-lg border border-outline-variant/25 bg-surface-container-low px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(event) =>
                    setDraft((prev) => prev ? { ...prev, isActive: event.target.checked } : prev)
                  }
                />
                <span className="text-sm font-medium text-on-surface">{t("accountMgmt.colActive")}</span>
              </label>
              <div>
                <label id={staffLabelId} htmlFor={staffInputId} className="mb-1 block text-xs font-medium text-on-surface-variant">
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
                <label id={patientLabelId} htmlFor={patientInputId} className="mb-1 block text-xs font-medium text-on-surface-variant">
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
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-error/30 px-4 py-2.5 text-sm font-medium text-error hover:bg-error-container disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                {deleting ? t("common.saving") : "Deactivate account"}
              </button>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeEdit}
                  disabled={saving || deleting}
                  className="rounded-lg px-4 py-2.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container"
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
