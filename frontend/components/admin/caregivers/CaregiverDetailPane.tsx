"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useId, useMemo, useState, type ChangeEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "@/lib/i18n";
import { getQueryPollingMs, getQueryStaleTimeMs } from "@/lib/queryEndpointDefaults";
import { refetchOrThrow } from "@/lib/refetchOrThrow";
import type { Caregiver, Patient, Room, User } from "@/lib/types";
import { ageYears } from "@/lib/age";
import { useFixedNowMs } from "@/hooks/useFixedNowMs";
import SearchableListboxPicker, {
  type SearchableListboxOption,
} from "@/components/shared/SearchableListboxPicker";
import UserAvatar from "@/components/shared/UserAvatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StaffRoutineAndCalendarPanel } from "@/components/admin/caregivers/StaffRoutineAndCalendarPanel";
import { PersonSensorStatusPanel } from "@/components/shared/PersonSensorStatusPanel";
import { StaffTimelinePanel } from "@/components/staff/StaffTimelinePanel";
import type { CareScheduleOut, CareTaskOut } from "@/lib/api/task-scope-types";
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
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { hasCapability } from "@/lib/permissions";
import { formatStaffRoleLabel } from "@/lib/staffRoleLabel";
import { imageFileToResizedSquareJpegBlob, looksLikeImageFile } from "@/lib/profileImageProcess";

type Props = {
  caregiver: Caregiver;
  linkedUsers: User[];
  onUserUpdated?: () => void;
  onCaregiverUpdated?: (next: Caregiver) => void;
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

type ZoneDraft = {
  zoneId: number | null;
  zoneName: string;
  roomId: number | null;
  isActive: boolean;
};

type CaregiverPatientAccessResponse =
  | Array<{ patient_id?: number; id?: number }>
  | { patient_ids?: number[]; patients?: Array<{ patient_id?: number; id?: number }> };

type ShiftDraft = {
  shiftId: number | null;
  shiftDate: string;
  startTime: string;
  endTime: string;
  shiftType: string;
  notes: string;
};

const ROOM_NONE_ID = "__none";
const SHIFT_TYPE_OPTIONS = [
  { value: "regular", label: "Regular" },
  { value: "overtime", label: "Overtime" },
  { value: "on_call", label: "On call" },
] as const;

/* ── Helpers ──────────────────────────────────────────────────────────── */

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

function formatRoomLabel(room: Room | null | undefined): string {
  if (!room) return "No room";
  return room.name?.trim() || `Room #${room.id}`;
}

function formatRoomContext(room: Room | null | undefined): string {
  if (!room) return "No room";
  const parts = [
    room.facility_name?.trim() || null,
    room.floor_name?.trim() ||
      (typeof room.floor_number === "number" && !Number.isNaN(room.floor_number)
        ? `Floor ${room.floor_number}`
        : null),
    formatRoomLabel(room),
  ].filter(Boolean);
  return parts.join(" · ");
}

function formatPatientLabel(patient: Patient): string {
  const name = `${patient.first_name} ${patient.last_name}`.trim();
  return name || `Patient #${patient.id}`;
}

function patientSearchText(patient: Patient): string {
  return [
    formatPatientLabel(patient),
    `#${patient.id}`,
    patient.room_id != null ? `room ${patient.room_id}` : null,
    patient.care_level,
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.trim().toLowerCase())
    .join(" ");
}

function extractPatientAccessIds(response: CaregiverPatientAccessResponse | null | undefined): number[] {
  if (!response) return [];
  if (!Array.isArray(response) && Array.isArray(response.patient_ids)) {
    return response.patient_ids.filter((id): id is number => typeof id === "number");
  }
  const rows = Array.isArray(response) ? response : response.patients ?? [];
  return rows
    .map((row) => (typeof row.patient_id === "number" ? row.patient_id : row.id))
    .filter((id): id is number => typeof id === "number");
}

function roomSearchText(room: Room): string {
  return [
    room.facility_name,
    room.floor_name,
    room.floor_number != null ? String(room.floor_number) : null,
    room.name,
    `#${room.id}`,
    room.node_device_id,
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.trim().toLowerCase())
    .join(" ");
}

const SHIFT_BADGE: Record<string, string> = {
  regular: "bg-primary-fixed/60 text-primary",
  overtime: "bg-tertiary-fixed/60 text-tertiary",
  on_call: "bg-secondary-fixed/60 text-secondary",
};

function ZoneDialog({
  open,
  mode,
  draft,
  setDraft,
  roomSearch,
  setRoomSearch,
  roomOptions,
  roomLoading,
  roomEmptyNoMatch,
  roomEmptyPool,
  submitting,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit";
  draft: ZoneDraft;
  setDraft: (updater: (prev: ZoneDraft) => ZoneDraft) => void;
  roomSearch: string;
  setRoomSearch: (value: string) => void;
  roomOptions: SearchableListboxOption[];
  roomLoading: boolean;
  roomEmptyNoMatch: boolean;
  roomEmptyPool: boolean;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  const zoneNameInputId = useId();
  const roomLabelId = useId();
  const roomInputId = useId();
  const roomListboxId = useId();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="w-[min(100%-1.5rem,42rem)] max-h-[92vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("caregivers.addZone") : t("caregivers.editZone")}</DialogTitle>
          <DialogDescription>
            {t("caregivers.zoneDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 pb-2 pt-1">
          <div>
            <label htmlFor={zoneNameInputId} className="text-xs font-medium text-foreground-variant">
              {t("caregivers.zoneName")}
            </label>
            <input
              id={zoneNameInputId}
              className="input-field mt-1 w-full text-sm"
              value={draft.zoneName}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, zoneName: e.target.value }))
              }
              placeholder={t("caregivers.zoneNamePlaceholder")}
            />
          </div>

          <div>
            <label
              id={roomLabelId}
              htmlFor={roomInputId}
              className="text-xs font-medium text-foreground-variant"
            >
              {t("floorplan.label")}
            </label>
            <div className="mt-1">
              <SearchableListboxPicker
                inputId={roomInputId}
                listboxId={roomListboxId}
                ariaLabelledBy={roomLabelId}
                options={roomOptions}
                search={roomSearch}
                onSearchChange={setRoomSearch}
                searchPlaceholder={t("caregivers.roomSearchPlaceholder")}
                selectedOptionId={
                  draft.roomId === null ? ROOM_NONE_ID : String(draft.roomId)
                }
                onSelectOption={(id) => {
                  if (id === ROOM_NONE_ID) {
                    setDraft((prev) => ({ ...prev, roomId: null }));
                    setRoomSearch(t("floorplan.summaryNone"));
                    return;
                  }
                  const selected = roomOptions.find((opt) => opt.id === id);
                  const selectedTitle = selected?.title ?? `Room #${id}`;
                  setDraft((prev) => ({
                    ...prev,
                    roomId: Number(id),
                    zoneName: prev.zoneName.trim() ? prev.zoneName : selectedTitle,
                  }));
                  setRoomSearch(selectedTitle);
                }}
                disabled={roomLoading}
                listboxAriaLabel={t("floorplan.selectRoom")}
                noMatchMessage={t("caregivers.noMatchingRooms")}
                emptyStateMessage={t("caregivers.noRoomsAvailable")}
                emptyNoMatch={roomEmptyNoMatch}
                listPresentation="portal"
                listboxZIndex={170}
              />
            </div>
            {roomEmptyPool ? (
              <p className="mt-1 text-xs text-foreground-variant">
                {t("caregivers.noRoomsHint")}
              </p>
            ) : null}
          </div>

          {mode === "edit" ? (
            <div>
              <label className="text-xs font-medium text-foreground-variant">
                {t("caregivers.activeStatus")}
              </label>
              <Select
                value={draft.isActive ? "active" : "inactive"}
                onValueChange={(value) =>
                  setDraft((prev) => ({
                    ...prev,
                    isActive: value === "active",
                  }))
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={t("caregivers.selectStatus")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t("patients.statusActive")}</SelectItem>
                  <SelectItem value="inactive">{t("patients.statusInactive")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-xs text-foreground-variant">
              {t("caregivers.newZoneActiveHint")}
            </p>
          )}

          {error ? <p className="text-sm text-error">{error}</p> : null}
        </div>

        <DialogFooter className="px-6 pb-6">
          <button
            type="button"
            className="rounded-xl border border-outline-variant/40 px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-container-low"
            onClick={onClose}
            disabled={submitting}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="gradient-cta rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
            onClick={onSubmit}
            disabled={submitting}
          >
            {submitting
              ? t("common.saving")
              : mode === "create"
                ? t("caregivers.addZone")
                : t("caregivers.editStaffSave")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShiftDialog({
  open,
  mode,
  draft,
  setDraft,
  submitting,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit";
  draft: ShiftDraft;
  setDraft: (updater: (prev: ShiftDraft) => ShiftDraft) => void;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  const shiftDateInputId = useId();
  const startTimeInputId = useId();
  const endTimeInputId = useId();
  const notesInputId = useId();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="w-[min(100%-1.5rem,42rem)] max-h-[92vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("caregivers.addShift") : t("caregivers.editShift")}</DialogTitle>
          <DialogDescription>
            {t("caregivers.shiftDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 pb-2 pt-1">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor={shiftDateInputId}
                className="text-xs font-medium text-foreground-variant"
              >
                {t("caregivers.shiftDate")}
              </label>
              <input
                id={shiftDateInputId}
                type="date"
                className="input-field mt-1 w-full text-sm"
                value={draft.shiftDate}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, shiftDate: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground-variant">
                {t("caregivers.shiftType")}
              </label>
              <Select
                value={draft.shiftType}
                onValueChange={(value) =>
                  setDraft((prev) => ({ ...prev, shiftType: value }))
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={t("caregivers.selectShiftType")} />
                </SelectTrigger>
                <SelectContent>
                  {SHIFT_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(`caregivers.shiftType.${option.value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor={startTimeInputId}
                className="text-xs font-medium text-foreground-variant"
              >
                {t("caregivers.startTime")}
              </label>
              <input
                id={startTimeInputId}
                type="time"
                className="input-field mt-1 w-full text-sm"
                value={draft.startTime}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, startTime: e.target.value }))
                }
              />
            </div>
            <div>
              <label
                htmlFor={endTimeInputId}
                className="text-xs font-medium text-foreground-variant"
              >
                {t("caregivers.endTime")}
              </label>
              <input
                id={endTimeInputId}
                type="time"
                className="input-field mt-1 w-full text-sm"
                value={draft.endTime}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, endTime: e.target.value }))
                }
              />
            </div>
          </div>

          <div>
            <label
              htmlFor={notesInputId}
              className="text-xs font-medium text-foreground-variant"
            >
              {t("adminCaregivers.notesLabel")}
            </label>
            <textarea
              id={notesInputId}
              className="input-field mt-1 min-h-[96px] w-full resize-y text-sm"
              value={draft.notes}
              onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder={t("caregivers.shiftNotesPlaceholder")}
            />
          </div>

          {error ? <p className="text-sm text-error">{error}</p> : null}
        </div>

        <DialogFooter className="px-6 pb-6">
          <button
            type="button"
            className="rounded-xl border border-outline-variant/40 px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-container-low"
            onClick={onClose}
            disabled={submitting}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="gradient-cta rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
            onClick={onSubmit}
            disabled={submitting}
          >
            {submitting
              ? t("common.saving")
              : mode === "create"
                ? t("caregivers.addShift")
                : t("caregivers.editStaffSave")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
    username: string;
    role: string;
    is_active: boolean;
    caregiver_id: number | null;
    patient_id: number | null;
    password?: string;
  };
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState(user.username);
  const [role, setRole] = useState<User["role"]>(user.role);
  const [caregiverId, setCaregiverId] = useState(user.caregiver_id != null ? String(user.caregiver_id) : "");
  const [patientId, setPatientId] = useState(user.patient_id != null ? String(user.patient_id) : "");
  const [newPassword, setNewPassword] = useState("");
  const [isActive, setIsActive] = useState(user.is_active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload: UserManagePayload = {
        username: username.trim(),
        role: role.trim(),
        is_active: isActive,
        caregiver_id: caregiverId.trim() ? Number(caregiverId) : null,
        patient_id: patientId.trim() ? Number(patientId) : null,
      };
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
    setUsername(user.username);
    setRole(user.role);
    setCaregiverId(user.caregiver_id != null ? String(user.caregiver_id) : "");
    setPatientId(user.patient_id != null ? String(user.patient_id) : "");
    setNewPassword("");
    setIsActive(user.is_active);
    setError(null);
  }

  if (editing && canManage) {
    return (
      <li className="rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-3 text-sm animate-fade-in shadow-sm">
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label htmlFor={`username-${user.id}`} className="block text-[10px] uppercase font-bold text-foreground-variant">
                {t("admin.users.username")}
              </label>
              <input
                id={`username-${user.id}`}
                className="mt-1 w-full rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-1.5 text-xs text-foreground"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor={`role-${user.id}`} className="block text-[10px] uppercase font-bold text-foreground-variant">
                {t("admin.users.role")}
              </label>
              <select
                id={`role-${user.id}`}
                className="mt-1 w-full rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-1.5 text-xs text-foreground capitalize"
                value={role}
                onChange={(e) => setRole(e.target.value as User["role"])}
              >
                <option value="admin">{t("shell.roleAdmin")}</option>
                <option value="head_nurse">{t("shell.roleHeadNurse")}</option>
                <option value="supervisor">{t("shell.roleSupervisor")}</option>
                <option value="observer">{t("shell.roleObserver")}</option>
                <option value="patient">{t("shell.rolePatient")}</option>
              </select>
            </div>
            <div>
              <label htmlFor={`caregiver-link-${user.id}`} className="block text-[10px] uppercase font-bold text-foreground-variant">
                {t("accountMgmt.pickStaff")}
              </label>
              <input
                id={`caregiver-link-${user.id}`}
                className="mt-1 w-full rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-1.5 text-xs text-foreground"
                value={caregiverId}
                onChange={(e) => setCaregiverId(e.target.value)}
                placeholder={t("accountMgmt.clearSelection")}
              />
            </div>
            <div>
              <label htmlFor={`patient-link-${user.id}`} className="block text-[10px] uppercase font-bold text-foreground-variant">
                {t("accountMgmt.pickPatient")}
              </label>
              <input
                id={`patient-link-${user.id}`}
                className="mt-1 w-full rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-1.5 text-xs text-foreground"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                placeholder={t("accountMgmt.clearSelection")}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`active-toggle-${user.id}`}
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary"
            />
            <label htmlFor={`active-toggle-${user.id}`} className="text-xs font-medium text-foreground">
              {t("patients.statusActive")}
            </label>
          </div>

          <div>
            <label htmlFor={`pwd-${user.id}`} className="block text-[10px] uppercase font-bold text-foreground-variant">
              {t("settings.newPassword")}
            </label>
            <input
              id={`pwd-${user.id}`}
              type="password"
              placeholder={t("patients.editorPasswordOptionalHint")}
              className="mt-1 w-full rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-1.5 text-xs text-foreground"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>

          {error && <p className="text-xs text-critical">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-foreground-variant hover:bg-surface-container-high transition-smooth"
              onClick={handleCancel}
              disabled={saving}
            >
              {t("common.cancel")}
            </button>
            <button
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary/90 transition-smooth"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-xl bg-surface-container-low px-3 py-2.5 text-sm group">
      <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-foreground">{username}</span>
        <div className="flex items-center gap-3">
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
              user.is_active
                ? "care-normal"
                : "bg-surface-container text-outline"
            }`}
          >
            {user.is_active ? t("patients.statusActive") : t("patients.statusInactive")}
          </span>
          <button
            type="button"
            className="opacity-0 group-hover:opacity-100 transition-opacity text-xs font-semibold text-primary hover:underline px-1"
            onClick={() => setEditing(true)}
            disabled={!canManage}
          >
            {t("accountMgmt.editLinks")}
          </button>
        </div>
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-foreground-variant">
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
  onCaregiverUpdated,
}: Props) {
  const { t } = useTranslation();
  const nowMs = useFixedNowMs();
  const { user } = useAuth();
  const fullName = `${caregiver.first_name} ${caregiver.last_name}`.trim();
  const caregiverPhotoUrl = caregiver.photo_url?.trim() || null;
  const canManageSchedule = Boolean(
    user && hasCapability(user.role, "caregivers.schedule.manage"),
  );
  const canManagePatientAccess = Boolean(
    user &&
      (hasCapability(user.role, "patients.manage") ||
        hasCapability(user.role, "caregivers.manage")),
  );
  const canManageAccounts = Boolean(user && hasCapability(user.role, "users.manage"));
  const canEditCaregiverPhoto = Boolean(user && hasCapability(user.role, "patients.manage"));
  /** Ward-lead directory: useful for observers/supervisors and for head-nurse peer lookup (excludes self below). */
  const showHeadNurseGuide =
    caregiver.role === "observer" ||
    caregiver.role === "supervisor" ||
    caregiver.role === "head_nurse";

  const roomsEndpoint = "/rooms";
  const { data: rooms, isLoading: roomsLoading } = useQuery({
    queryKey: ["admin", "caregivers", "detail", caregiver.id, "rooms"],
    queryFn: () => api.get<Room[]>(roomsEndpoint),
    staleTime: getQueryStaleTimeMs(roomsEndpoint),
    refetchInterval: getQueryPollingMs(roomsEndpoint),
    retry: 3,
  });
  const shiftsEndpoint = `/caregivers/${caregiver.id}/shifts`;
  const {
    data: shifts,
    isLoading: shiftsLoading,
    refetch: refetchShiftsBase,
  } = useQuery({
    queryKey: ["admin", "caregivers", "detail", caregiver.id, "shifts"],
    queryFn: () => api.get<ShiftOut[]>(shiftsEndpoint),
    staleTime: getQueryStaleTimeMs(shiftsEndpoint),
    refetchInterval: getQueryPollingMs(shiftsEndpoint),
    retry: 3,
  });
  const zonesEndpoint = `/caregivers/${caregiver.id}/zones`;
  const {
    data: zones,
    isLoading: zonesLoading,
    refetch: refetchZonesBase,
  } = useQuery({
    queryKey: ["admin", "caregivers", "detail", caregiver.id, "zones"],
    queryFn: () => api.get<ZoneOut[]>(zonesEndpoint),
    staleTime: getQueryStaleTimeMs(zonesEndpoint),
    refetchInterval: getQueryPollingMs(zonesEndpoint),
    retry: 3,
  });
  const patientsEndpoint = "/patients";
  const { data: patients } = useQuery({
    queryKey: ["admin", "caregivers", "detail", caregiver.id, "patients"],
    queryFn: () => api.get<Patient[]>(patientsEndpoint),
    staleTime: getQueryStaleTimeMs(patientsEndpoint),
    refetchInterval: getQueryPollingMs(patientsEndpoint),
    retry: 3,
  });
  const patientAccessEndpoint = `/caregivers/${caregiver.id}/patients`;
  const {
    data: patientAccess,
    isLoading: patientAccessLoading,
    refetch: refetchPatientAccessBase,
  } = useQuery({
    queryKey: ["admin", "caregivers", "detail", caregiver.id, "patient-access"],
    queryFn: () => api.get<CaregiverPatientAccessResponse>(patientAccessEndpoint),
    staleTime: getQueryStaleTimeMs(patientAccessEndpoint),
    refetchInterval: getQueryPollingMs(patientAccessEndpoint),
    retry: 3,
  });
  const staffRosterEndpoint = "/caregivers?limit=1000";
  const { data: allStaffCaregivers, isLoading: headNursesLoading } = useQuery({
    queryKey: ["admin", "caregivers", "workspace-staff-roster", caregiver.workspace_id],
    queryFn: () => api.get<Caregiver[]>(staffRosterEndpoint),
    staleTime: getQueryStaleTimeMs(staffRosterEndpoint),
    refetchInterval: getQueryPollingMs(staffRosterEndpoint),
    enabled: showHeadNurseGuide,
    retry: 3,
  });
  const headNurses = useMemo(() => {
    const all = (allStaffCaregivers ?? []).filter((c) => c.role === "head_nurse");
    if (caregiver.role === "head_nurse") {
      return all.filter((c) => c.id !== caregiver.id);
    }
    return all;
  }, [allStaffCaregivers, caregiver.id, caregiver.role]);
  const linkedUserIds = useMemo(() => new Set(linkedUsers.map((linkedUser) => linkedUser.id)), [linkedUsers]);
  const staffTasksQuery = useQuery({
    queryKey: ["admin", "caregivers", "detail", caregiver.id, "staff-tasks"],
    queryFn: () => api.listWorkflowTasks({ limit: 240 }),
    staleTime: 30_000,
    enabled: linkedUsers.length > 0,
  });
  const staffSchedulesQuery = useQuery({
    queryKey: ["admin", "caregivers", "detail", caregiver.id, "staff-schedules"],
    queryFn: () => api.listWorkflowSchedules({ limit: 200 }),
    staleTime: 30_000,
    enabled: linkedUsers.length > 0,
  });
  const staffTimelineTasks = useMemo(
    () =>
      ((staffTasksQuery.data ?? []) as CareTaskOut[]).filter(
        (item) => item.assigned_user_id != null && linkedUserIds.has(item.assigned_user_id),
      ),
    [linkedUserIds, staffTasksQuery.data],
  );
  const staffTimelineSchedules = useMemo(
    () =>
      ((staffSchedulesQuery.data ?? []) as CareScheduleOut[]).filter(
        (item) => item.assigned_user_id != null && linkedUserIds.has(item.assigned_user_id),
      ),
    [linkedUserIds, staffSchedulesQuery.data],
  );
  const hasAnyHeadNurseInWorkspace = useMemo(
    () => (allStaffCaregivers ?? []).some((c) => c.role === "head_nurse"),
    [allStaffCaregivers],
  );
  const refetchShifts = useCallback(() => refetchOrThrow(refetchShiftsBase), [refetchShiftsBase]);
  const refetchZones = useCallback(() => refetchOrThrow(refetchZonesBase), [refetchZonesBase]);
  const refetchPatientAccess = useCallback(() => refetchOrThrow(refetchPatientAccessBase), [refetchPatientAccessBase]);
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false);
  const [zoneDialogMode, setZoneDialogMode] = useState<"create" | "edit">("create");
  const [zoneDraft, setZoneDraft] = useState<ZoneDraft>({
    zoneId: null,
    zoneName: "",
    roomId: null,
    isActive: true,
  });
  const [zoneRoomSearch, setZoneRoomSearch] = useState("");
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [shiftDialogMode, setShiftDialogMode] = useState<"create" | "edit">("create");
  const [shiftDraft, setShiftDraft] = useState<ShiftDraft>({
    shiftId: null,
    shiftDate: "",
    startTime: "08:00",
    endTime: "16:00",
    shiftType: "regular",
    notes: "",
  });
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [zoneSubmitting, setZoneSubmitting] = useState(false);
  const [shiftSubmitting, setShiftSubmitting] = useState(false);
  const [patientAccessSearch, setPatientAccessSearch] = useState("");
  const [patientAccessDraftIds, setPatientAccessDraftIds] = useState<number[]>([]);
  const [patientAccessSaving, setPatientAccessSaving] = useState(false);
  const [patientAccessError, setPatientAccessError] = useState<string | null>(null);
  const [aboutEditing, setAboutEditing] = useState(false);
  const [contactEditing, setContactEditing] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [caregiverPhotoBusy, setCaregiverPhotoBusy] = useState(false);
  const [caregiverPhotoErr, setCaregiverPhotoErr] = useState<string | null>(null);
  const caregiverPhotoInputId = useId();
  const [profileDraft, setProfileDraft] = useState({
    first_name: caregiver.first_name ?? "",
    last_name: caregiver.last_name ?? "",
    role: caregiver.role ?? "observer",
    employee_code: caregiver.employee_code ?? "",
    department: caregiver.department ?? "",
    specialty: caregiver.specialty ?? "",
    license_number: caregiver.license_number ?? "",
    emergency_contact_name: caregiver.emergency_contact_name ?? "",
    emergency_contact_phone: caregiver.emergency_contact_phone ?? "",
    is_active: caregiver.is_active,
  });
  const [contactDraft, setContactDraft] = useState({
    phone: caregiver.phone ?? "",
    email: caregiver.email ?? "",
  });
  const patientAccessInputId = useId();
  const patientAccessListboxId = useId();
  const [mainTab, setMainTab] = useState<"overview" | "work">("overview");

  useEffect(() => {
    setPatientAccessDraftIds(extractPatientAccessIds(patientAccess));
  }, [patientAccess]);
  useEffect(() => {
    setProfileDraft({
      first_name: caregiver.first_name ?? "",
      last_name: caregiver.last_name ?? "",
      role: caregiver.role ?? "observer",
      employee_code: caregiver.employee_code ?? "",
      department: caregiver.department ?? "",
      specialty: caregiver.specialty ?? "",
      license_number: caregiver.license_number ?? "",
      emergency_contact_name: caregiver.emergency_contact_name ?? "",
      emergency_contact_phone: caregiver.emergency_contact_phone ?? "",
      is_active: caregiver.is_active,
    });
    setContactDraft({
      phone: caregiver.phone ?? "",
      email: caregiver.email ?? "",
    });
    setProfileError(null);
    setCaregiverPhotoErr(null);
    setAboutEditing(false);
    setContactEditing(false);
  }, [caregiver]);

  const roomsById = useMemo(
    () => new Map((rooms ?? []).map((room) => [room.id, room] as const)),
    [rooms],
  );

  const roomOptions = useMemo<SearchableListboxOption[]>(() => {
    const q = zoneRoomSearch.trim().toLowerCase();
    const list = rooms ?? [];
    const filtered = !q
      ? list
      : list.filter((room) => roomSearchText(room).includes(q));
    const options: SearchableListboxOption[] = [];
    if (!q || "no room".includes(q)) {
      options.push({
        id: ROOM_NONE_ID,
        title: "No room",
      });
    }
    options.push(
      ...filtered.map((room) => ({
        id: String(room.id),
        title: room.name?.trim() || `Room #${room.id}`,
        subtitle: [
          room.facility_name?.trim() || "No facility",
          room.floor_name?.trim() ||
            (typeof room.floor_number === "number" && !Number.isNaN(room.floor_number)
              ? `Floor ${room.floor_number}`
              : "No floor"),
          room.node_device_id ? `node ${room.node_device_id}` : null,
          `#${room.id}`,
        ]
          .filter((part): part is string => Boolean(part))
          .join(" · "),
      })),
    );
    return options;
  }, [rooms, zoneRoomSearch]);

  const roomEmptyPool = !roomsLoading && (rooms?.length ?? 0) === 0;
  const roomEmptyNoMatch =
    !roomsLoading && !roomEmptyPool && zoneRoomSearch.trim().length > 0 && roomOptions.length === 0;

  const patientCountByRoomId = useMemo(() => {
    const counts = new Map<number, number>();
    (patients ?? []).forEach((patient) => {
      if (patient.room_id == null) return;
      counts.set(patient.room_id, (counts.get(patient.room_id) ?? 0) + 1);
    });
    return counts;
  }, [patients]);

  const linkedPatients = useMemo(() => {
    if (!patients?.length || !zones?.length) return [];
    const roomIds = new Set(
      zones.map((z) => z.room_id).filter((id): id is number => id != null),
    );
    return patients.filter((p) => p.room_id != null && roomIds.has(p.room_id));
  }, [patients, zones]);

  const patientAccessDraftSet = useMemo(
    () => new Set(patientAccessDraftIds),
    [patientAccessDraftIds],
  );

  const patientAccessSelectedPatients = useMemo(() => {
    if (!patients?.length) return [];
    return patientAccessDraftIds
      .map((id) => patients.find((patient) => patient.id === id))
      .filter((patient): patient is Patient => Boolean(patient));
  }, [patientAccessDraftIds, patients]);

  const patientAccessOptions = useMemo<SearchableListboxOption[]>(() => {
    const q = patientAccessSearch.trim().toLowerCase();
    return (patients ?? [])
      .filter((patient) => !patientAccessDraftSet.has(patient.id))
      .filter((patient) => !q || patientSearchText(patient).includes(q))
      .slice(0, 80)
      .map((patient) => ({
        id: String(patient.id),
        title: formatPatientLabel(patient),
        subtitle: patient.room_id != null ? `Room #${patient.room_id}` : `Patient #${patient.id}`,
      }));
  }, [patientAccessDraftSet, patientAccessSearch, patients]);

  async function handleSavePatientAccess() {
    if (!canManagePatientAccess) return;
    setPatientAccessSaving(true);
    setPatientAccessError(null);
    try {
      await api.put(`/caregivers/${caregiver.id}/patients`, {
        patient_ids: patientAccessDraftIds,
      });
      await refetchPatientAccess();
    } catch (e) {
      setPatientAccessError(e instanceof ApiError ? e.message : "Failed to save patient access");
    } finally {
      setPatientAccessSaving(false);
    }
  }

  const openCreateZone = useCallback(() => {
    setZoneDialogMode("create");
    setZoneDraft({
      zoneId: null,
      zoneName: "",
      roomId: null,
      isActive: true,
    });
    setZoneRoomSearch("");
    setScheduleError(null);
    setZoneDialogOpen(true);
  }, []);

  const openEditZone = useCallback((zone: ZoneOut) => {
    setZoneDialogMode("edit");
    setZoneDraft({
      zoneId: zone.id,
      zoneName: zone.zone_name ?? "",
      roomId: zone.room_id,
      isActive: zone.is_active,
    });
    setZoneRoomSearch(zone.room_id != null ? formatRoomContext(roomsById.get(zone.room_id)) : "");
    setScheduleError(null);
    setZoneDialogOpen(true);
  }, [roomsById]);

  async function handleSubmitZone() {
    if (!canManageSchedule) return;
    const payload = {
      zone_name: zoneDraft.zoneName.trim(),
      room_id: zoneDraft.roomId,
    };
    if (!payload.zone_name) {
      setScheduleError("Zone name is required");
      return;
    }
    setScheduleError(null);
    setZoneSubmitting(true);
    try {
      if (zoneDialogMode === "create") {
        await api.post(`/caregivers/${caregiver.id}/zones`, payload);
      } else if (zoneDraft.zoneId != null) {
        await api.patch(`/caregivers/${caregiver.id}/zones/${zoneDraft.zoneId}`, {
          ...payload,
          is_active: zoneDraft.isActive,
        });
      }
      setZoneDialogOpen(false);
      await refetchZones();
    } catch (e) {
      setScheduleError(e instanceof ApiError ? e.message : "Failed to save zone");
    } finally {
      setZoneSubmitting(false);
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

  const openCreateShift = useCallback(() => {
    setShiftDialogMode("create");
    setShiftDraft({
      shiftId: null,
      shiftDate: "",
      startTime: "08:00",
      endTime: "16:00",
      shiftType: "regular",
      notes: "",
    });
    setScheduleError(null);
    setShiftDialogOpen(true);
  }, []);

  const openEditShift = useCallback((shift: ShiftOut) => {
    setShiftDialogMode("edit");
    setShiftDraft({
      shiftId: shift.id,
      shiftDate: String(shift.shift_date),
      startTime: formatTime(String(shift.start_time)),
      endTime: formatTime(String(shift.end_time)),
      shiftType: shift.shift_type,
      notes: shift.notes ?? "",
    });
    setScheduleError(null);
    setShiftDialogOpen(true);
  }, []);

  async function handleSubmitShift() {
    if (!canManageSchedule || !shiftDraft.shiftDate) return;
    setScheduleError(null);
    const payload = {
      shift_date: shiftDraft.shiftDate,
      start_time: `${shiftDraft.startTime}:00`,
      end_time: `${shiftDraft.endTime}:00`,
      shift_type: shiftDraft.shiftType,
      notes: shiftDraft.notes.trim(),
    };
    setShiftSubmitting(true);
    try {
      if (shiftDialogMode === "create") {
        await api.post(`/caregivers/${caregiver.id}/shifts`, payload);
      } else if (shiftDraft.shiftId != null) {
        await api.patch(`/caregivers/${caregiver.id}/shifts/${shiftDraft.shiftId}`, payload);
      }
      setShiftDialogOpen(false);
      await refetchShifts();
    } catch (e) {
      setScheduleError(e instanceof ApiError ? e.message : "Failed to save shift");
    } finally {
      setShiftSubmitting(false);
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

  async function saveProfileSection() {
    if (!profileDraft.first_name.trim() || !profileDraft.last_name.trim()) {
      setProfileError(t("patients.editorErrFirstName"));
      return;
    }
    setProfileSaving(true);
    setProfileError(null);
    try {
      const updated = await api.patch<Caregiver>(`/caregivers/${caregiver.id}`, {
        first_name: profileDraft.first_name.trim(),
        last_name: profileDraft.last_name.trim(),
        role: profileDraft.role,
        employee_code: profileDraft.employee_code.trim(),
        department: profileDraft.department.trim(),
        specialty: profileDraft.specialty.trim(),
        license_number: profileDraft.license_number.trim(),
        emergency_contact_name: profileDraft.emergency_contact_name.trim(),
        emergency_contact_phone: profileDraft.emergency_contact_phone.trim(),
        is_active: profileDraft.is_active,
      });
      onCaregiverUpdated?.(updated);
      setAboutEditing(false);
    } catch (e) {
      setProfileError(e instanceof ApiError ? e.message : t("caregivers.detailLoadError"));
    } finally {
      setProfileSaving(false);
    }
  }

  async function saveContactSection() {
    setProfileSaving(true);
    setProfileError(null);
    try {
      const updated = await api.patch<Caregiver>(`/caregivers/${caregiver.id}`, {
        phone: contactDraft.phone.trim(),
        email: contactDraft.email.trim(),
      });
      onCaregiverUpdated?.(updated);
      setContactEditing(false);
    } catch (e) {
      setProfileError(e instanceof ApiError ? e.message : t("caregivers.detailLoadError"));
    } finally {
      setProfileSaving(false);
    }
  }

  const onPickCaregiverPhoto = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !canEditCaregiverPhoto) return;
      if (!looksLikeImageFile(file)) {
        setCaregiverPhotoErr(t("profile.avatar.errorFileType"));
        return;
      }
      setCaregiverPhotoBusy(true);
      setCaregiverPhotoErr(null);
      try {
        const blob = await imageFileToResizedSquareJpegBlob(file);
        const fd = new FormData();
        fd.append("file", blob, "avatar.jpg");
        const updated = await api.postForm<Caregiver>(`/caregivers/${caregiver.id}/profile-image`, fd);
        onCaregiverUpdated?.(updated);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404 && e.message === "Not Found") {
          setCaregiverPhotoErr(t("profile.avatar.errorUploadEndpointMissing"));
        } else {
          setCaregiverPhotoErr(e instanceof ApiError ? e.message : t("profile.avatar.errorUpload"));
        }
      } finally {
        setCaregiverPhotoBusy(false);
        event.target.value = "";
      }
    },
    [canEditCaregiverPhoto, caregiver.id, onCaregiverUpdated, t],
  );

  const onRemoveCaregiverPhoto = useCallback(async () => {
    if (!canEditCaregiverPhoto) return;
    setCaregiverPhotoBusy(true);
    setCaregiverPhotoErr(null);
    try {
      const updated = await api.patch<Caregiver>(`/caregivers/${caregiver.id}`, { photo_url: "" });
      onCaregiverUpdated?.(updated);
    } catch (e) {
      setCaregiverPhotoErr(e instanceof ApiError ? e.message : t("profile.avatar.errorUpload"));
    } finally {
      setCaregiverPhotoBusy(false);
    }
  }, [canEditCaregiverPhoto, caregiver.id, onCaregiverUpdated, t]);

  return (
    <div className="w-full space-y-6" aria-labelledby="caregiver-detail-heading">
      <Tabs
        value={mainTab}
        onValueChange={(v) => setMainTab(v as "overview" | "work")}
        className="w-full"
      >
        <TabsList className="mb-4 grid h-auto w-full max-w-lg grid-cols-2 gap-1 p-1">
          <TabsTrigger value="overview" className="text-sm">
            {t("caregivers.detailTabOverview")}
          </TabsTrigger>
          <TabsTrigger value="work" className="text-sm">
            {t("caregivers.detailTabWork")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-0 space-y-5">

          {/* ── HERO HEADER ────────────────────────────────────────────────── */}
          <section className="relative overflow-hidden rounded-2xl border border-outline-variant/20 bg-gradient-to-br from-surface-container to-surface shadow-sm">
            {/* edit toolbar */}
            {user && hasCapability(user.role, "patients.manage") && (
              <div className="absolute right-4 top-4 z-10">
                {aboutEditing ? (
                  <div className="flex items-center gap-2">
                    <button type="button" className="rounded-lg border border-outline-variant/30 bg-surface px-3 py-1.5 text-xs font-medium text-foreground-variant hover:bg-surface-container-high" onClick={() => setAboutEditing(false)} disabled={profileSaving}>{t("common.cancel")}</button>
                    <button type="button" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary/90 disabled:opacity-50" onClick={() => void saveProfileSection()} disabled={profileSaving}>{profileSaving ? t("common.saving") : t("common.save")}</button>
                  </div>
                ) : (
                  <button type="button" className="rounded-lg border border-outline-variant/30 bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-container-high" onClick={() => setAboutEditing(true)}>{t("common.edit")}</button>
                )}
              </div>
            )}

            <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:p-6">
              {/* Avatar */}
              <div className="flex shrink-0 flex-col items-center gap-2">
                <div className="relative h-28 w-28 overflow-hidden rounded-2xl border-2 border-outline-variant/25 bg-gradient-to-br from-primary/20 to-primary/5 shadow-md sm:h-32 sm:w-32">
                  {canEditCaregiverPhoto && (
                    <label htmlFor={caregiverPhotoInputId} className={`absolute inset-0 z-[5] cursor-pointer ${caregiverPhotoBusy ? "pointer-events-none" : ""}`} aria-hidden="true" />
                  )}
                  {caregiverPhotoUrl ? (
                    <Image src={caregiverPhotoUrl} alt={fullName || `Staff #${caregiver.id}`} fill unoptimized className="object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-primary/50">
                      {caregiver.first_name?.[0]}{caregiver.last_name?.[0]}
                    </div>
                  )}
                  {canEditCaregiverPhoto && caregiverPhotoUrl && (
                    <button type="button" className="absolute right-1 top-1 z-10 rounded bg-black/50 px-1.5 py-0.5 text-[9px] font-semibold text-white hover:bg-black/70 disabled:opacity-50" disabled={caregiverPhotoBusy} onClick={() => void onRemoveCaregiverPhoto()}>{t("profile.avatar.removePhoto")}</button>
                  )}
                </div>
                {canEditCaregiverPhoto && (
                  <label htmlFor={caregiverPhotoInputId} className="cursor-pointer text-[10px] text-primary hover:underline">{t("profile.avatar.localFileLabel")}</label>
                )}
                <input id={caregiverPhotoInputId} type="file" accept="image/*" disabled={caregiverPhotoBusy} onChange={(e) => void onPickCaregiverPhoto(e)} className="sr-only" />
                {caregiverPhotoErr && <p className="text-center text-[10px] text-destructive">{caregiverPhotoErr}</p>}
                <span className="rounded-md bg-surface-container-high px-2 py-0.5 font-mono text-[9px] text-foreground-variant">#{caregiver.id}</span>
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <h1 id="caregiver-detail-heading" className="text-2xl font-bold leading-tight text-foreground sm:text-3xl">
                  {aboutEditing ? (`${profileDraft.first_name} ${profileDraft.last_name}`.trim() || `Staff #${caregiver.id}`) : (fullName || `Staff #${caregiver.id}`)}
                </h1>

                {aboutEditing ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1"><span className="text-xs text-foreground-variant">{t("personnel.firstName")}</span><input className="input-field w-full text-sm" value={profileDraft.first_name} onChange={(e) => setProfileDraft((p) => ({ ...p, first_name: e.target.value }))} /></label>
                    <label className="space-y-1"><span className="text-xs text-foreground-variant">{t("personnel.lastName")}</span><input className="input-field w-full text-sm" value={profileDraft.last_name} onChange={(e) => setProfileDraft((p) => ({ ...p, last_name: e.target.value }))} /></label>
                    <label className="space-y-1"><span className="text-xs text-foreground-variant">{t("admin.users.role")}</span><select className="input-field w-full text-sm" value={profileDraft.role} onChange={(e) => setProfileDraft((p) => ({ ...p, role: e.target.value }))}><option value="admin">{t("shell.roleAdmin")}</option><option value="head_nurse">{t("shell.roleHeadNurse")}</option><option value="supervisor">{t("shell.roleSupervisor")}</option><option value="observer">{t("shell.roleObserver")}</option></select></label>
                    <label className="space-y-1"><span className="text-xs text-foreground-variant">{t("caregivers.employeeCode")}</span><input className="input-field w-full text-sm" value={profileDraft.employee_code} onChange={(e) => setProfileDraft((p) => ({ ...p, employee_code: e.target.value }))} /></label>
                    <label className="space-y-1"><span className="text-xs text-foreground-variant">{t("caregivers.department")}</span><input className="input-field w-full text-sm" value={profileDraft.department} onChange={(e) => setProfileDraft((p) => ({ ...p, department: e.target.value }))} /></label>
                    <label className="space-y-1"><span className="text-xs text-foreground-variant">{t("caregivers.specialty")}</span><input className="input-field w-full text-sm" value={profileDraft.specialty} onChange={(e) => setProfileDraft((p) => ({ ...p, specialty: e.target.value }))} /></label>
                    <label className="space-y-1"><span className="text-xs text-foreground-variant">{t("caregivers.licenseLabel")}</span><input className="input-field w-full text-sm" value={profileDraft.license_number} onChange={(e) => setProfileDraft((p) => ({ ...p, license_number: e.target.value }))} /></label>
                    <label className="space-y-1"><span className="text-xs text-foreground-variant">{t("caregivers.emergencyContactName")}</span><input className="input-field w-full text-sm" value={profileDraft.emergency_contact_name} onChange={(e) => setProfileDraft((p) => ({ ...p, emergency_contact_name: e.target.value }))} /></label>
                    <label className="space-y-1"><span className="text-xs text-foreground-variant">{t("caregivers.emergencyContactPhone")}</span><input className="input-field w-full text-sm" value={profileDraft.emergency_contact_phone} onChange={(e) => setProfileDraft((p) => ({ ...p, emergency_contact_phone: e.target.value }))} /></label>
                    <label className="flex items-center gap-2 pt-5 text-sm text-foreground"><input type="checkbox" checked={profileDraft.is_active} onChange={(e) => setProfileDraft((p) => ({ ...p, is_active: e.target.checked }))} />{t("common.active")}</label>
                  </div>
                ) : (
                  <>
                    <p className="mt-0.5 text-sm text-foreground-variant">{formatStaffRoleLabel(caregiver.role, t)}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${caregiver.is_active ? "care-normal" : "bg-surface-container-high text-outline"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${caregiver.is_active ? "bg-emerald-500" : "bg-outline"}`} />
                        {caregiver.is_active ? t("patients.statusActive") : t("patients.statusInactive")}
                      </span>
                      {caregiver.department?.trim() && <span className="rounded-full bg-surface-container-high px-3 py-1 text-xs font-medium text-foreground-variant">{caregiver.department}</span>}
                      {caregiver.employment_type?.trim() && <span className="rounded-full border border-outline-variant/30 px-3 py-1 text-xs font-medium text-foreground-variant">{caregiver.employment_type}</span>}
                    </div>
                    {/* Detail grid */}
                    <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs text-foreground-variant sm:grid-cols-3">
                      {[
                        { label: t("caregivers.employeeCode"), value: caregiver.employee_code?.trim() },
                        { label: t("caregivers.specialty"), value: caregiver.specialty?.trim() },
                        { label: t("caregivers.licenseLabel"), value: caregiver.license_number?.trim() },
                        { label: t("caregivers.emergencyContactName"), value: caregiver.emergency_contact_name?.trim() },
                        { label: t("caregivers.emergencyContactPhone"), value: caregiver.emergency_contact_phone?.trim() },
                      ].filter(({ value }) => value).map(({ label, value }) => (
                        <div key={label}>
                          <span className="block text-[10px] uppercase tracking-wide">{label}</span>
                          <span className="font-medium text-foreground">{value}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {profileError && <p className="mt-3 text-sm text-critical">{profileError}</p>}
              </div>
            </div>

            {/* ── Contact bar ──────────────────────────────────────────────── */}
            {(caregiver.phone?.trim() || caregiver.email?.trim()) && !contactEditing && (
              <div className="flex flex-wrap items-center gap-4 border-t border-outline-variant/15 px-6 py-3">
                {caregiver.phone?.trim() && (
                  <a href={`tel:${caregiver.phone.replace(/\s/g, "")}`} className="flex items-center gap-1.5 text-xs font-medium text-foreground-variant hover:text-primary">
                    <Phone className="h-3.5 w-3.5" />{caregiver.phone}
                  </a>
                )}
                {caregiver.email?.trim() && (
                  <a href={`mailto:${caregiver.email}`} className="flex items-center gap-1.5 text-xs font-medium text-foreground-variant hover:text-primary">
                    <Mail className="h-3.5 w-3.5" />{caregiver.email}
                  </a>
                )}
                {user && hasCapability(user.role, "patients.manage") && (
                  <button type="button" className="ml-auto text-xs font-semibold text-primary hover:underline" onClick={() => setContactEditing(true)}>{t("common.edit")}</button>
                )}
              </div>
            )}
            {contactEditing && (
              <div className="flex flex-wrap items-center gap-3 border-t border-outline-variant/15 px-6 py-4">
                <input className="input-field flex-1 text-sm min-w-[12rem]" placeholder={t("caregivers.phone")} value={contactDraft.phone} onChange={(e) => setContactDraft((p) => ({ ...p, phone: e.target.value }))} />
                <input className="input-field flex-1 text-sm min-w-[12rem]" placeholder={t("caregivers.email")} value={contactDraft.email} onChange={(e) => setContactDraft((p) => ({ ...p, email: e.target.value }))} />
                <button type="button" className="rounded-lg px-3 py-1.5 text-xs font-medium text-foreground-variant hover:bg-surface-container-high" onClick={() => setContactEditing(false)} disabled={profileSaving}>{t("common.cancel")}</button>
                <button type="button" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary/90 disabled:opacity-50" onClick={() => void saveContactSection()} disabled={profileSaving}>{profileSaving ? t("common.saving") : t("common.save")}</button>
              </div>
            )}
          </section>

          {/* ── MAIN + SIDEBAR GRID ───────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <div className="space-y-5 xl:col-span-2">

              <PersonSensorStatusPanel personType="staff" personId={caregiver.id} compact />

              <StaffTimelinePanel tasks={staffTimelineTasks} schedules={staffTimelineSchedules} />

              {/* Patient Access */}
              <div className="surface-card rounded-2xl border border-outline-variant/20 p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" aria-hidden />
                    <h2 className="text-sm font-semibold text-foreground">{t("caregivers.sectionPatientAccess")}</h2>
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">{patientAccessDraftIds.length}</span>
                  </div>
                  {canManagePatientAccess && (
                    <button type="button" className="rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary/90 disabled:opacity-50" onClick={() => void handleSavePatientAccess()} disabled={patientAccessSaving}>{patientAccessSaving ? t("caregivers.patientAccessSaving") : t("caregivers.patientAccessSave")}</button>
                  )}
                </div>
                {canManagePatientAccess && (
                  <div className="mb-4">
                    <SearchableListboxPicker inputId={patientAccessInputId} listboxId={patientAccessListboxId} options={patientAccessOptions} search={patientAccessSearch} onSearchChange={setPatientAccessSearch} searchPlaceholder={t("caregivers.patientAccessSearchPlaceholder")} selectedOptionId={null} onSelectOption={(pid) => { const n = Number(pid); if (!Number.isFinite(n)) return; setPatientAccessDraftIds((prev) => prev.includes(n) ? prev : [...prev, n]); setPatientAccessSearch(""); }} disabled={patientAccessLoading} listboxAriaLabel={t("caregivers.patientAccessListbox")} noMatchMessage={t("caregivers.patientAccessNoMatch")} emptyStateMessage={patientAccessOptions.length === 0 ? t("caregivers.patientAccessNoPool") : null} emptyNoMatch={patientAccessSearch.trim().length > 0} />
                  </div>
                )}
                {patientAccessError && <p className="mb-3 text-sm text-critical">{patientAccessError}</p>}
                {patientAccessLoading ? (
                  <div className="flex justify-center py-6"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
                ) : patientAccessSelectedPatients.length === 0 ? (
                  <p className="text-sm text-foreground-variant">{t("caregivers.patientAccessEmpty")}</p>
                ) : (
                  <ul className="divide-y divide-outline-variant/10">
                    {patientAccessSelectedPatients.map((patient) => (
                      <li key={patient.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                        <Link href={`/admin/patients/${patient.id}`} className="min-w-0 flex-1">
                          <p className="font-semibold text-foreground text-sm">{formatPatientLabel(patient)}</p>
                          <p className="text-xs text-foreground-variant">{patient.room_id != null ? `Room #${patient.room_id}` : `Patient #${patient.id}`} · {patient.care_level}</p>
                        </Link>
                        {canManagePatientAccess && (
                          <button type="button" className="shrink-0 text-xs font-semibold text-critical hover:underline" onClick={() => setPatientAccessDraftIds((prev) => prev.filter((pid) => pid !== patient.id))}>{t("caregivers.patientAccessRemove")}</button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Linked patients via zones */}
              <div className="surface-card rounded-2xl border border-outline-variant/20 p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" aria-hidden />
                  <h2 className="text-sm font-semibold text-foreground">{t("caregivers.sectionLinkedPatients")}</h2>
                </div>
                {linkedPatients.length === 0 ? (
                  <p className="text-sm text-foreground-variant">{t("caregivers.linkedPatientsEmpty")}</p>
                ) : (
                  <ul className="divide-y divide-outline-variant/10">
                    {linkedPatients.map((p) => (
                      <li key={p.id}>
                        <Link href={`/admin/patients/${p.id}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 hover:text-primary transition-smooth">
                          <UserAvatar
                            username={`${p.first_name} ${p.last_name}`.trim() || `Patient #${p.id}`}
                            profileImageUrl={p.photo_url}
                            sizePx={32}
                            fallbackClassName="bg-surface-container-high text-foreground-variant"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-foreground text-sm">{p.first_name} {p.last_name}</p>
                            <p className="text-xs text-foreground-variant">{t("patients.age")}: {ageYears(p.date_of_birth, nowMs) ?? "—"} · {p.care_level}</p>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-outline" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Head nurses guide */}
              {showHeadNurseGuide && (
                <div className="surface-card rounded-2xl border border-outline-variant/20 p-5 shadow-sm">
                  <div className="mb-1 flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" aria-hidden />
                    <h2 className="text-sm font-semibold text-foreground">{t("caregivers.sectionHeadNurses")}</h2>
                  </div>
                  <p className="mb-4 text-xs text-foreground-variant">{t("caregivers.headNursesHint")}</p>
                  {headNursesLoading ? (
                    <div className="flex justify-center py-6"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
                  ) : headNurses.length === 0 ? (
                    <p className="text-sm text-foreground-variant">{caregiver.role === "head_nurse" && hasAnyHeadNurseInWorkspace ? t("caregivers.headNursesPeerOnlySelf") : t("caregivers.headNursesEmpty")}</p>
                  ) : (
                    <ul className="divide-y divide-outline-variant/10">
                      {headNurses.map((hn) => (
                        <li key={hn.id}>
                          <Link href={`/admin/caregivers/${hn.id}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 hover:text-primary transition-smooth">
                            <UserAvatar
                              username={`${hn.first_name} ${hn.last_name}`.trim() || `Staff #${hn.id}`}
                              profileImageUrl={hn.photo_url}
                              sizePx={32}
                              fallbackClassName="bg-primary/10 text-primary"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-foreground text-sm">{hn.first_name} {hn.last_name}</p>
                              <p className="text-xs text-foreground-variant">{formatStaffRoleLabel(hn.role, t)}{hn.employee_code?.trim() ? ` · ${hn.employee_code.trim()}` : ""}</p>
                            </div>
                            <ChevronRight className="h-4 w-4 shrink-0 text-outline" aria-hidden />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Linked user accounts */}
              <div className="surface-card rounded-2xl border border-outline-variant/20 p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <UserCircle2 className="h-4 w-4 text-primary" aria-hidden />
                  <h2 className="text-sm font-semibold text-foreground">{t("patients.sectionLinkedAccounts")}</h2>
                </div>
                {linkedUsers.length === 0 ? (
                  <p className="text-sm text-foreground-variant">{t("caregivers.noLinkedAccountRecord")}</p>
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
              </div>

              {scheduleError && <p className="text-sm text-critical">{scheduleError}</p>}

              <p className="text-xs text-foreground-variant">Staff ID: {caregiver.id} · Workspace: {caregiver.workspace_id}</p>
            </div>{/* end main col */}

            {/* ── SIDEBAR ──────────────────────────────────────────────────── */}
            <aside className="space-y-5">

              {/* Zone assignments */}
              <div className="surface-card rounded-2xl border border-outline-variant/20 p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" aria-hidden />
                    <h2 className="text-sm font-semibold text-foreground">{t("caregivers.sectionZones")}</h2>
                  </div>
                  {canManageSchedule && (
                    <button type="button" className="min-h-11 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-on-primary hover:bg-primary/90" onClick={openCreateZone}>+ {t("common.add")}</button>
                  )}
                </div>
                {zonesLoading ? (
                  <div className="flex justify-center py-4"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
                ) : !zones?.length ? (
                  <p className="text-sm text-foreground-variant">—</p>
                ) : (
                  <ul className="space-y-2">
                    {zones.map((z) => {
                      const room = z.room_id != null ? roomsById.get(z.room_id) ?? null : null;
                      const patientCount = z.room_id != null ? patientCountByRoomId.get(z.room_id) ?? 0 : 0;
                      const mapHref = room && room.facility_id != null && room.floor_id != null ? `/head-nurse/floorplans?facility=${room.facility_id}&floor=${room.floor_id}&view=map&room=${room.id}` : null;
                      return (
                        <li key={z.id} className="rounded-xl border border-outline-variant/15 bg-surface-container-low/60 px-3 py-3 text-xs">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground text-sm">{z.zone_name || formatRoomLabel(room) || "—"}</p>
                              <p className="text-foreground-variant">{formatRoomContext(room)}</p>
                              <p className="text-foreground-variant">{t("dashboard.ward.patients")}: {patientCount}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase ${z.is_active ? "care-normal" : "bg-surface-container text-outline"}`}>{z.is_active ? t("patients.statusActive") : t("patients.statusInactive")}</span>
                              {mapHref && <Link href={mapHref} className="text-sm font-semibold text-primary hover:underline">{t("dashboard.map.openMap")}</Link>}
                            </div>
                          </div>
                          {canManageSchedule && (
                            <div className="mt-2 flex gap-2">
                              <button type="button" className="text-sm font-semibold text-primary hover:underline" onClick={() => openEditZone(z)}>{t("common.edit")}</button>
                              <button type="button" className="text-sm font-semibold text-critical hover:underline" onClick={() => void handleDeleteZone(z.id)}>{t("common.delete")}</button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Shift schedule */}
              <div className="surface-card rounded-2xl border border-outline-variant/20 p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" aria-hidden />
                    <h2 className="text-sm font-semibold text-foreground">{t("caregivers.shiftSchedule")}</h2>
                  </div>
                  {canManageSchedule && (
                    <button type="button" className="min-h-11 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-on-primary hover:bg-primary/90" onClick={openCreateShift}>+ {t("common.add")}</button>
                  )}
                </div>
                {shiftsLoading ? (
                  <div className="flex justify-center py-4"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
                ) : !shifts?.length ? (
                  <p className="text-sm text-foreground-variant">—</p>
                ) : (
                  <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {shifts.map((s) => (
                      <li key={s.id} className="rounded-xl border border-outline-variant/15 bg-surface-container-low/60 px-3 py-2.5 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-foreground">{formatDate(s.shift_date)}</p>
                            <p className="text-foreground-variant">{formatTime(s.start_time)} – {formatTime(s.end_time)}{s.notes ? ` · ${s.notes}` : ""}</p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-sm font-semibold ${SHIFT_BADGE[s.shift_type] ?? "bg-surface-container text-outline"}`}>{t(`caregivers.shiftType.${s.shift_type}`)}</span>
                        </div>
                        {canManageSchedule && (
                          <div className="mt-1.5 flex gap-2">
                            <button type="button" className="text-sm font-semibold text-primary hover:underline" onClick={() => openEditShift(s)}>{t("common.edit")}</button>
                            <button type="button" className="text-sm font-semibold text-critical hover:underline" onClick={() => void handleDeleteShift(s.id)}>{t("common.delete")}</button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Joined date */}
              <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/50 px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-foreground-variant">
                  <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>{t("caregivers.addedAt")} {formatDate(caregiver.created_at)}</span>
                </div>
              </div>
            </aside>
          </div>{/* end main+sidebar grid */}
        </TabsContent>

        <TabsContent value="work" className="mt-0">
          <StaffRoutineAndCalendarPanel linkedUsers={linkedUsers} />
        </TabsContent>
      </Tabs>

      <ZoneDialog
        open={zoneDialogOpen}
        mode={zoneDialogMode}
        draft={zoneDraft}
        setDraft={setZoneDraft}
        roomSearch={zoneRoomSearch}
        setRoomSearch={setZoneRoomSearch}
        roomOptions={roomOptions}
        roomLoading={roomsLoading}
        roomEmptyNoMatch={roomEmptyNoMatch}
        roomEmptyPool={roomEmptyPool}
        submitting={zoneSubmitting}
        error={scheduleError}
        onClose={() => setZoneDialogOpen(false)}
        onSubmit={() => void handleSubmitZone()}
      />

      <ShiftDialog
        open={shiftDialogOpen}
        mode={shiftDialogMode}
        draft={shiftDraft}
        setDraft={setShiftDraft}
        submitting={shiftSubmitting}
        error={scheduleError}
        onClose={() => setShiftDialogOpen(false)}
        onSubmit={() => void handleSubmitShift()}
      />
    </div>
  );
}
