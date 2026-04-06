"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { KeyRound, Link2, Pencil, Settings2, UserPlus } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useQuery } from "@/hooks/useQuery";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api";
import { hasCapability } from "@/lib/permissions";
import type { User, Patient, Caregiver } from "@/lib/types";
import { ROUTES } from "@/lib/constants";

function formatCaregiver(c: Caregiver): string {
  return `${c.first_name} ${c.last_name} (#${c.id})`;
}

function formatPatient(p: Patient): string {
  return `${p.first_name} ${p.last_name} (#${p.id})`;
}

const USER_ROLES: User["role"][] = [
  "admin",
  "head_nurse",
  "supervisor",
  "observer",
  "patient",
];

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
  const [staffId, setStaffId] = useState<string>("");
  const [patientId, setPatientId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [createUsername, setCreateUsername] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<User["role"]>("observer");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [createBanner, setCreateBanner] = useState<string | null>(null);

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

  const sortedCaregivers = useMemo(() => {
    return [...(caregivers ?? [])].sort((a, b) =>
      `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`),
    );
  }, [caregivers]);

  const sortedPatients = useMemo(() => {
    return [...(patients ?? [])].sort((a, b) =>
      `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`),
    );
  }, [patients]);

  const openEdit = useCallback(
    (u: User) => {
      setEditing(u);
      setStaffId(u.caregiver_id != null ? String(u.caregiver_id) : "");
      setPatientId(u.patient_id != null ? String(u.patient_id) : "");
      setSaveErr(null);
    },
    [],
  );

  const closeEdit = useCallback(() => {
    setEditing(null);
    setSaveErr(null);
  }, []);

  const onSave = useCallback(async () => {
    if (!editing) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const cId = staffId.trim() === "" ? null : Number(staffId);
      const pId = patientId.trim() === "" ? null : Number(patientId);
      await api.put<User>(`/users/${editing.id}`, {
        caregiver_id: cId,
        patient_id: pId,
      });
      await refetch();
      closeEdit();
    } catch (e) {
      setSaveErr(e instanceof ApiError ? e.message : t("accountMgmt.saveError"));
    } finally {
      setSaving(false);
    }
  }, [editing, staffId, patientId, refetch, closeEdit, t]);

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
    <div className="space-y-8 animate-fade-in">
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

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" aria-hidden />
            <h3 className="text-base font-semibold text-on-surface">
              {t("accountMgmt.authCardTitle")}
            </h3>
          </div>
          <p className="text-sm leading-relaxed text-on-surface-variant">
            {t("accountMgmt.authPrimary")}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
            {t("accountMgmt.authLinks")}
          </p>
        </section>

        <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" aria-hidden />
            <h3 className="text-base font-semibold text-on-surface">
              {t("accountMgmt.linkingCardTitle")}
            </h3>
          </div>
          <p className="text-sm leading-relaxed text-on-surface-variant">
            {t("accountMgmt.linkingBody")}
          </p>
        </section>
      </div>

      {!canEdit && (
        <p className="text-sm text-on-surface-variant">{t("accountMgmt.readOnlyHint")}</p>
      )}

      {canEdit && (
        <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" aria-hidden />
            <div>
              <h3 className="text-base font-semibold text-on-surface">{t("admin.users.create")}</h3>
              <p className="text-sm text-on-surface-variant">{t("admin.users.subtitle")}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-on-surface-variant">
                {t("admin.users.username")}
              </label>
              <input
                className="input-field w-full py-2.5 text-sm"
                value={createUsername}
                onChange={(e) => setCreateUsername(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-on-surface-variant">
                {t("admin.users.password")}
              </label>
              <input
                type="password"
                className="input-field w-full py-2.5 text-sm"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-on-surface-variant">
                {t("admin.users.role")}
              </label>
              <select
                className="w-full rounded-xl border border-outline-variant/30 bg-surface px-3 py-2.5 text-sm text-on-surface"
                value={createRole}
                onChange={(e) => setCreateRole(e.target.value as User["role"])}
              >
                {USER_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {createErr ? (
            <p className="mt-3 text-sm text-error" role="alert">
              {createErr}
            </p>
          ) : null}
          {createBanner ? (
            <p className="mt-3 text-sm text-primary">{createBanner}</p>
          ) : null}
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => void onCreateUser()}
              disabled={creating || createUsername.trim().length < 3 || createPassword.trim().length < 6}
              className="gradient-cta rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {creating ? t("common.saving") : t("admin.users.create")}
            </button>
          </div>
        </section>
      )}

      {usersError && (
        <p className="text-sm text-error" role="alert">
          {t("accountMgmt.loadError")}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
        <div className="border-b border-outline-variant/15 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
            {t("accountMgmt.tableCaption")}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
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
                    …
                  </td>
                </tr>
              ) : (
                (users ?? []).map((u) => {
                  const cg = u.caregiver_id != null ? caregiverById.get(u.caregiver_id) : undefined;
                  const pt = u.patient_id != null ? patientById.get(u.patient_id) : undefined;
                  return (
                    <tr key={u.id} className="border-b border-outline-variant/10 last:border-0">
                      <td className="px-4 py-3 font-medium text-on-surface">{u.username}</td>
                      <td className="px-4 py-3 capitalize text-on-surface-variant">
                        {u.role.replace(/_/g, " ")}
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant">
                        {u.is_active ? t("accountMgmt.yes") : t("accountMgmt.no")}
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant">
                        {cg ? formatCaregiver(cg) : t("accountMgmt.none")}
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant">
                        {pt ? formatPatient(pt) : t("accountMgmt.none")}
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
                          <span className="text-on-surface-variant/50">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="account-mgmt-edit-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-6 shadow-xl">
            <h4 id="account-mgmt-edit-title" className="text-lg font-semibold text-on-surface">
              {t("accountMgmt.editTitle")}
            </h4>
            <p className="mt-1 text-sm text-on-surface-variant">{editing.username}</p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-on-surface-variant">
                  {t("accountMgmt.pickStaff")}
                </label>
                <select
                  className="w-full rounded-xl border border-outline-variant/30 bg-surface px-3 py-2.5 text-sm text-on-surface"
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                >
                  <option value="">{t("accountMgmt.clearSelection")}</option>
                  {sortedCaregivers.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {formatCaregiver(c)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-on-surface-variant">
                  {t("accountMgmt.pickPatient")}
                </label>
                <select
                  className="w-full rounded-xl border border-outline-variant/30 bg-surface px-3 py-2.5 text-sm text-on-surface"
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                >
                  <option value="">{t("accountMgmt.clearSelection")}</option>
                  {sortedPatients.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {formatPatient(p)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {saveErr && (
              <p className="mt-3 text-sm text-error" role="alert">
                {saveErr}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeEdit}
                disabled={saving}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container"
              >
                {t("accountMgmt.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void onSave()}
                disabled={saving}
                className="gradient-cta rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? t("accountMgmt.saving") : t("accountMgmt.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
