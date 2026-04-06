"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useTranslation } from "@/lib/i18n";
import { useQuery } from "@/hooks/useQuery";
import type { Caregiver, Patient, User } from "@/lib/types";
import { ageYears } from "@/lib/age";
import { useFixedNowMs } from "@/hooks/useFixedNowMs";
import {
  Calendar,
  ChevronRight,
  Clock,
  Mail,
  MapPin,
  Phone,
  Shield,
  UserCircle2,
  Users,
} from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { hasCapability } from "@/lib/permissions";

type Props = {
  caregiver: Caregiver;
  linkedUsers: User[];
  onUserUpdated?: () => void;
};

/* ── Backend DTO shapes ───────────────────────────────────────────────── */

type ShiftOut = {
  id: number;
  caregiver_id: number;
  shift_date: string;
  start_time: string;
  end_time: string;
  shift_type: string;
  notes: string;
};

type ZoneOut = {
  id: number;
  caregiver_id: number;
  room_id: number | null;
  zone_name: string;
  is_active: boolean;
};

/* ── Helpers ──────────────────────────────────────────────────────────── */

function formatStaffRole(role: string): string {
  const r = role.trim().toLowerCase();
  if (r === "head_nurse") return "Head Nurse";
  if (r === "observer" || r === "supervisor") {
    return r.charAt(0).toUpperCase() + r.slice(1);
  }
  return role || "—";
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatTime(t: string): string {
  // backend returns "HH:MM:SS" — show "HH:MM"
  return t.slice(0, 5);
}

const SHIFT_BADGE: Record<string, string> = {
  regular: "bg-primary-fixed/60 text-primary",
  overtime: "bg-tertiary-fixed/60 text-tertiary",
  on_call: "bg-secondary-fixed/60 text-secondary",
};

/* ── User Account Item ────────────────────────────────────────────────── */

function UserAccountItem({
  user,
  onUpdate,
  canManage,
}: {
  user: User;
  onUpdate?: () => void;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  type UserManagePayload = {
    is_active: boolean;
    password?: string;
  };
  const [editing, setEditing] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [isActive, setIsActive] = useState(user.is_active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload: UserManagePayload = { is_active: isActive };
      if (newPassword.trim().length >= 6) {
        payload.password = newPassword.trim();
      }
      await api.put(`/users/${user.id}`, payload);
      setEditing(false);
      setNewPassword("");
      onUpdate?.();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to update user");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setEditing(false);
    setNewPassword("");
    setIsActive(user.is_active);
    setError(null);
  }

  if (editing && canManage) {
    return (
      <li className="rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-3 text-sm animate-fade-in shadow-sm">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-on-surface">{user.username}</span>
          </div>
          
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`active-toggle-${user.id}`}
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary"
            />
            <label htmlFor={`active-toggle-${user.id}`} className="text-xs font-medium text-on-surface">
              Account Active
            </label>
          </div>

          <div>
            <label htmlFor={`pwd-${user.id}`} className="block text-[10px] uppercase font-bold text-on-surface-variant">
              New Password (Optional)
            </label>
            <input
              id={`pwd-${user.id}`}
              type="password"
              placeholder="Leave blank to keep same"
              className="mt-1 w-full rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-1.5 text-xs text-on-surface"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>

          {error && <p className="text-xs text-critical">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:bg-surface-container-high transition-smooth"
              onClick={handleCancel}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary/90 transition-smooth"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-xl bg-surface-container-low px-3 py-2.5 text-sm group">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-on-surface">{user.username}</span>
        <div className="flex items-center gap-3">
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
              user.is_active
                ? "care-normal"
                : "bg-surface-container text-outline"
            }`}
          >
            {user.is_active ? "Active" : "Inactive"}
          </span>
          <button
            type="button"
            className="opacity-0 group-hover:opacity-100 transition-opacity text-xs font-semibold text-primary hover:underline px-1"
            onClick={() => setEditing(true)}
            disabled={!canManage}
          >
            Manage
          </button>
        </div>
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-on-surface-variant">
        <Shield className="h-3.5 w-3.5 text-outline" aria-hidden />
        <span>
          {t("admin.users.role")}: {user.role}
        </span>
      </div>
    </li>
  );
}

/* ── Main component ───────────────────────────────────────────────────── */

export default function CaregiverDetailPane({
  caregiver,
  linkedUsers,
  onUserUpdated,
}: Props) {
  const { t } = useTranslation();
  const nowMs = useFixedNowMs();
  const { user } = useAuth();
  const fullName = `${caregiver.first_name} ${caregiver.last_name}`.trim();
  const canManageSchedule = Boolean(
    user && hasCapability(user.role, "caregivers.schedule.manage"),
  );
  const canManageAccounts = Boolean(user && hasCapability(user.role, "users.manage"));

  const { data: shifts, isLoading: shiftsLoading, refetch: refetchShifts } = useQuery<ShiftOut[]>(
    `/caregivers/${caregiver.id}/shifts`,
  );
  const { data: zones, isLoading: zonesLoading, refetch: refetchZones } = useQuery<ZoneOut[]>(
    `/caregivers/${caregiver.id}/zones`,
  );
  const { data: patients } = useQuery<Patient[]>("/patients");
  const [zoneNameDraft, setZoneNameDraft] = useState("");
  const [zoneRoomIdDraft, setZoneRoomIdDraft] = useState("");
  const [shiftDateDraft, setShiftDateDraft] = useState("");
  const [shiftStartDraft, setShiftStartDraft] = useState("08:00");
  const [shiftEndDraft, setShiftEndDraft] = useState("16:00");
  const [shiftTypeDraft, setShiftTypeDraft] = useState("regular");
  const [shiftNotesDraft, setShiftNotesDraft] = useState("");
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const linkedPatients = useMemo(() => {
    if (!patients?.length || !zones?.length) return [];
    const roomIds = new Set(
      zones.map((z) => z.room_id).filter((id): id is number => id != null),
    );
    return patients.filter((p) => p.room_id != null && roomIds.has(p.room_id));
  }, [patients, zones]);

  async function handleAddZone() {
    if (!canManageSchedule) return;
    setScheduleError(null);
    try {
      await api.post(`/caregivers/${caregiver.id}/zones`, {
        room_id: zoneRoomIdDraft.trim() ? Number(zoneRoomIdDraft) : null,
        zone_name: zoneNameDraft.trim(),
      });
      setZoneNameDraft("");
      setZoneRoomIdDraft("");
      await refetchZones();
    } catch (e) {
      setScheduleError(e instanceof ApiError ? e.message : "Failed to add zone");
    }
  }

  async function handleEditZone(zone: ZoneOut) {
    if (!canManageSchedule) return;
    const zoneName = window.prompt("Zone name", zone.zone_name ?? "");
    if (zoneName == null) return;
    const roomRaw = window.prompt("Room ID (blank for none)", zone.room_id?.toString() ?? "");
    if (roomRaw == null) return;
    const active = window.confirm("Should this zone remain active?");
    setScheduleError(null);
    try {
      await api.patch(`/caregivers/${caregiver.id}/zones/${zone.id}`, {
        zone_name: zoneName.trim(),
        room_id: roomRaw.trim() ? Number(roomRaw) : null,
        is_active: active,
      });
      await refetchZones();
    } catch (e) {
      setScheduleError(e instanceof ApiError ? e.message : "Failed to update zone");
    }
  }

  async function handleDeleteZone(zoneId: number) {
    if (!canManageSchedule) return;
    if (!window.confirm("Delete this zone assignment?")) return;
    setScheduleError(null);
    try {
      await api.delete(`/caregivers/${caregiver.id}/zones/${zoneId}`);
      await refetchZones();
    } catch (e) {
      setScheduleError(e instanceof ApiError ? e.message : "Failed to delete zone");
    }
  }

  async function handleAddShift() {
    if (!canManageSchedule || !shiftDateDraft) return;
    setScheduleError(null);
    try {
      await api.post(`/caregivers/${caregiver.id}/shifts`, {
        shift_date: shiftDateDraft,
        start_time: `${shiftStartDraft}:00`,
        end_time: `${shiftEndDraft}:00`,
        shift_type: shiftTypeDraft,
        notes: shiftNotesDraft.trim(),
      });
      setShiftDateDraft("");
      setShiftNotesDraft("");
      await refetchShifts();
    } catch (e) {
      setScheduleError(e instanceof ApiError ? e.message : "Failed to add shift");
    }
  }

  async function handleEditShift(shift: ShiftOut) {
    if (!canManageSchedule) return;
    const shiftDate = window.prompt("Shift date (YYYY-MM-DD)", String(shift.shift_date));
    if (shiftDate == null) return;
    const startTime = window.prompt("Start time (HH:MM)", formatTime(String(shift.start_time)));
    if (startTime == null) return;
    const endTime = window.prompt("End time (HH:MM)", formatTime(String(shift.end_time)));
    if (endTime == null) return;
    const shiftType = window.prompt("Shift type (regular/overtime/on_call)", shift.shift_type);
    if (shiftType == null) return;
    const notes = window.prompt("Notes", shift.notes ?? "");
    if (notes == null) return;
    setScheduleError(null);
    try {
      await api.patch(`/caregivers/${caregiver.id}/shifts/${shift.id}`, {
        shift_date: shiftDate,
        start_time: `${startTime}:00`,
        end_time: `${endTime}:00`,
        shift_type: shiftType,
        notes,
      });
      await refetchShifts();
    } catch (e) {
      setScheduleError(e instanceof ApiError ? e.message : "Failed to update shift");
    }
  }

  async function handleDeleteShift(shiftId: number) {
    if (!canManageSchedule) return;
    if (!window.confirm("Delete this shift?")) return;
    setScheduleError(null);
    try {
      await api.delete(`/caregivers/${caregiver.id}/shifts/${shiftId}`);
      await refetchShifts();
    } catch (e) {
      setScheduleError(e instanceof ApiError ? e.message : "Failed to delete shift");
    }
  }

  return (
    <div className="w-full space-y-6" aria-labelledby="caregiver-detail-heading">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <section className="surface-card rounded-xl border border-outline-variant/20 p-6">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
              {t("caregivers.sectionAbout")}
            </p>
            <div className="flex flex-col gap-5 sm:flex-row">
              <div className="relative flex aspect-[4/5] w-full shrink-0 items-end justify-start overflow-hidden rounded-xl border border-outline-variant/20 bg-gradient-to-br from-primary/20 to-primary/5 sm:w-40">
                <span className="absolute bottom-2 left-2 rounded bg-black/35 px-2 py-0.5 font-mono text-[10px] font-semibold text-on-surface/90">
                  Staff #{caregiver.id}
                </span>
                <div className="flex h-full w-full items-center justify-center text-4xl font-bold text-primary/40">
                  {(caregiver.first_name?.[0] || caregiver.last_name?.[0] || "S").toUpperCase()}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <h1
                  id="caregiver-detail-heading"
                  className="text-2xl font-bold text-on-surface"
                >
                  {fullName || `Staff #${caregiver.id}`}
                </h1>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {t("admin.users.role")}:{" "}
                  <span className="font-medium text-on-surface">
                    {formatStaffRole(caregiver.role)}
                  </span>
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium uppercase ${
                      caregiver.is_active ? "care-normal" : "bg-surface-container-high text-outline"
                    }`}
                  >
                    {caregiver.is_active ? t("patients.statusActive") : t("patients.statusInactive")}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="surface-card rounded-xl border border-outline-variant/20 p-6">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-on-surface">
              <MapPin className="h-5 w-5 text-primary" aria-hidden />
              {t("caregivers.sectionZones")}
            </h2>
            {canManageSchedule ? (
              <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr,140px,auto]">
                <input
                  className="input-field text-sm"
                  placeholder="Zone name"
                  value={zoneNameDraft}
                  onChange={(e) => setZoneNameDraft(e.target.value)}
                />
                <input
                  className="input-field text-sm"
                  placeholder="Room ID"
                  value={zoneRoomIdDraft}
                  onChange={(e) => setZoneRoomIdDraft(e.target.value)}
                />
                <button
                  type="button"
                  className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-on-primary"
                  onClick={() => void handleAddZone()}
                >
                  Add zone
                </button>
              </div>
            ) : null}
            {zonesLoading ? (
              <div className="flex justify-center py-6">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : !zones?.length ? (
              <p className="text-sm text-on-surface-variant">—</p>
            ) : (
              <ul className="space-y-2">
                {zones.map((z) => (
                  <li
                    key={z.id}
                    className="flex items-center justify-between rounded-xl bg-surface-container-low px-4 py-3 text-sm"
                  >
                    <span className="font-medium text-on-surface">
                      {z.zone_name || (z.room_id != null ? `Room #${z.room_id}` : "—")}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        z.is_active ? "care-normal" : "bg-surface-container text-outline"
                      }`}
                    >
                      {z.is_active ? t("patients.statusActive") : t("patients.statusInactive")}
                    </span>
                    {canManageSchedule ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="text-xs font-semibold text-primary hover:underline"
                          onClick={() => void handleEditZone(z)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-xs font-semibold text-critical hover:underline"
                          onClick={() => void handleDeleteZone(z.id)}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="surface-card rounded-xl border border-outline-variant/20 p-6">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-on-surface">
              <Users className="h-5 w-5 text-primary" aria-hidden />
              {t("caregivers.sectionLinkedPatients")}
            </h2>
            {linkedPatients.length === 0 ? (
              <p className="text-sm text-on-surface-variant">{t("caregivers.linkedPatientsEmpty")}</p>
            ) : (
              <ul className="space-y-2">
                {linkedPatients.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/admin/patients/${p.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant/15 bg-surface-container-low/50 p-4 transition-smooth hover:border-primary/30 hover:shadow-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-on-surface">
                          {p.first_name} {p.last_name}
                        </p>
                        <p className="text-xs text-on-surface-variant">
                          {t("patients.age")}: {ageYears(p.date_of_birth, nowMs) ?? "—"} ·{" "}
                          {p.care_level}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-outline" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="surface-card rounded-xl border border-outline-variant/20 p-6">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-on-surface">
              <Clock className="h-5 w-5 text-primary" aria-hidden />
              Shift schedule
            </h2>
            {canManageSchedule ? (
              <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-[150px,110px,110px,140px,1fr,auto]">
                <input
                  type="date"
                  className="input-field text-sm"
                  value={shiftDateDraft}
                  onChange={(e) => setShiftDateDraft(e.target.value)}
                />
                <input
                  type="time"
                  className="input-field text-sm"
                  value={shiftStartDraft}
                  onChange={(e) => setShiftStartDraft(e.target.value)}
                />
                <input
                  type="time"
                  className="input-field text-sm"
                  value={shiftEndDraft}
                  onChange={(e) => setShiftEndDraft(e.target.value)}
                />
                <select
                  className="input-field text-sm"
                  value={shiftTypeDraft}
                  onChange={(e) => setShiftTypeDraft(e.target.value)}
                >
                  <option value="regular">regular</option>
                  <option value="overtime">overtime</option>
                  <option value="on_call">on_call</option>
                </select>
                <input
                  className="input-field text-sm"
                  placeholder="Notes"
                  value={shiftNotesDraft}
                  onChange={(e) => setShiftNotesDraft(e.target.value)}
                />
                <button
                  type="button"
                  className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-on-primary"
                  onClick={() => void handleAddShift()}
                >
                  Add shift
                </button>
              </div>
            ) : null}
            {shiftsLoading ? (
              <div className="flex justify-center py-6">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : !shifts?.length ? (
              <p className="text-sm text-on-surface-variant">—</p>
            ) : (
              <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {shifts.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-3 rounded-xl bg-surface-container-low px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-on-surface">{formatDate(s.shift_date)}</p>
                      <p className="text-xs text-on-surface-variant">
                        {formatTime(s.start_time)} – {formatTime(s.end_time)}
                        {s.notes ? ` · ${s.notes}` : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        SHIFT_BADGE[s.shift_type] ?? "bg-surface-container text-outline"
                      }`}
                    >
                      {s.shift_type}
                    </span>
                    {canManageSchedule ? (
                      <div className="ml-auto flex items-center gap-2">
                        <button
                          type="button"
                          className="text-xs font-semibold text-primary hover:underline"
                          onClick={() => void handleEditShift(s)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-xs font-semibold text-critical hover:underline"
                          onClick={() => void handleDeleteShift(s.id)}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="surface-card rounded-xl border border-outline-variant/20 p-6">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-on-surface">
              <UserCircle2 className="h-5 w-5 text-primary" aria-hidden />
              {t("patients.sectionLinkedAccounts")}
            </h2>
            {linkedUsers.length === 0 ? (
              <p className="text-sm text-on-surface-variant">
                No user account linked to this caregiver record.
              </p>
            ) : (
              <ul className="space-y-3" role="list">
                {linkedUsers.map((u) => (
                  <UserAccountItem
                    key={u.id}
                    user={u}
                    onUpdate={onUserUpdated}
                    canManage={canManageAccounts}
                  />
                ))}
              </ul>
            )}
          </section>

          {scheduleError ? <p className="text-sm text-critical">{scheduleError}</p> : null}

          <p className="text-xs text-on-surface-variant">
            Staff ID: {caregiver.id} · Workspace: {caregiver.workspace_id}
          </p>
        </div>

        <aside className="space-y-4">
          <section
            className="surface-card rounded-xl border border-outline-variant/20 p-5"
            style={{ background: "var(--color-primary)" }}
          >
            <h2 className="mb-3 flex items-center gap-2 text-[var(--color-on-primary)] font-semibold">
              <Phone className="h-5 w-5 opacity-90" aria-hidden />
              Contact
            </h2>
            <ul className="space-y-3 text-sm text-[var(--color-on-primary)]">
              <li className="flex items-start gap-2">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 opacity-90" aria-hidden />
                <span>{caregiver.phone?.trim() || "—"}</span>
              </li>
              <li className="flex items-start gap-2">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 opacity-90" aria-hidden />
                <span className="break-all">{caregiver.email?.trim() || "—"}</span>
              </li>
              <li className="flex items-start gap-2 opacity-90">
                <Calendar className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>Added {formatDate(caregiver.created_at)}</span>
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
