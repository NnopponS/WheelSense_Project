"use client";

import { useState } from "react";
import { useQuery } from "@/hooks/useQuery";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";
import { useTranslation } from "@/lib/i18n";
import { UserPlus, Shield } from "lucide-react";

const ROLES: User["role"][] = [
  "admin",
  "supervisor",
  "head_nurse",
  "observer",
  "patient",
];

export default function AdminUsersPage() {
  const { t } = useTranslation();
  const { data: users, isLoading, refetch } = useQuery<User[]>("/users");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<User["role"]>("observer");
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || password.length < 6) return;
    setSubmitting(true);
    setBanner(null);
    try {
      await api.post<User>("/users", {
        username: username.trim(),
        password,
        role,
        is_active: true,
        caregiver_id: null,
        patient_id: null,
      });
      setBanner(t("admin.users.created"));
      setUsername("");
      setPassword("");
      await refetch();
    } catch (err) {
      setBanner(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold text-on-surface flex items-center gap-2">
          <Shield className="w-7 h-7 text-primary" />
          {t("admin.users.title")}
        </h2>
        <p className="text-sm text-on-surface-variant mt-1">
          {t("admin.users.subtitle")}
        </p>
      </div>

      <form
        onSubmit={onCreate}
        className="surface-card p-5 space-y-4 border border-outline-variant/15"
      >
        <p className="text-sm font-semibold text-on-surface flex items-center gap-2">
          <UserPlus className="w-4 h-4" />
          {t("admin.users.create")}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="text-xs text-on-surface-variant">
              {t("admin.users.username")}
            </label>
            <input
              className="input-field mt-1 text-sm"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="text-xs text-on-surface-variant">
              {t("admin.users.password")}
            </label>
            <input
              type="password"
              className="input-field mt-1 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="text-xs text-on-surface-variant">
              {t("admin.users.role")}
            </label>
            <select
              className="input-field mt-1 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as User["role"])}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="submit"
          disabled={submitting || username.length < 3 || password.length < 6}
          className="gradient-cta px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
        >
          {submitting ? "…" : t("admin.users.create")}
        </button>
        {banner && (
          <p className="text-sm text-primary font-medium">{banner}</p>
        )}
      </form>

      <div className="surface-card p-4">
        <p className="text-sm font-semibold text-on-surface mb-3">
          {t("admin.users.list")}
        </p>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !users?.length ? (
          <p className="text-sm text-on-surface-variant">—</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-on-surface-variant border-b border-outline-variant/20">
                  <th className="pb-2 pr-4">ID</th>
                  <th className="pb-2 pr-4">{t("admin.users.username")}</th>
                  <th className="pb-2 pr-4">{t("admin.users.role")}</th>
                  <th className="pb-2">{t("common.active")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-outline-variant/10 text-on-surface"
                  >
                    <td className="py-2 pr-4">{u.id}</td>
                    <td className="py-2 pr-4 font-medium">{u.username}</td>
                    <td className="py-2 pr-4">{u.role}</td>
                    <td className="py-2">
                      {u.is_active ? t("common.active") : t("common.inactive")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
