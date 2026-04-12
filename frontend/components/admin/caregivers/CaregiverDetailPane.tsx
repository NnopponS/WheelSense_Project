"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
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

function formatShiftType(value: string): string {
  const found = SHIFT_TYPE_OPTIONS.find((option) => option.value === value);
  if (found) return found.label;
  return value || "-";
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
          <DialogTitle>{mode === "create" ? "Add zone" : "Edit zone"}</DialogTitle>
          <DialogDescription>
            Assign the zone to a room and keep the ward map aligned.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 pb-2 pt-1">
          <div>
            <label htmlFor={zoneNameInputId} className="text-xs font-medium text-foreground-variant">
              Zone name
            </label>
            <input
              id={zoneNameInputId}
              className="input-field mt-1 w-full text-sm"
              value={draft.zoneName}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, zoneName: e.target.value }))
              }
              placeholder="Ward A / Night round / Mobility watch"
            />
          </div>

          <div>
            <label
              id={roomLabelId}
              htmlFor={roomInputId}
              className="text-xs font-medium text-foreground-variant"
            >
              Room
            </label>
            <div className="mt-1">
              <SearchableListboxPicker
                inputId={roomInputId}
                listboxId={roomListboxId}
                ariaLabelledBy={roomLabelId}
                options={roomOptions}
                search={roomSearch}
                onSearchChange={setRoomSearch}
                searchPlaceholder="Search by facility, floor, room, id, node"
                selectedOptionId={
                  draft.roomId === null ? ROOM_NONE_ID : String(draft.roomId)
                }
                onSelectOption={(id) => {
                  if (id === ROOM_NONE_ID) {
                    setDraft((prev) => ({ ...prev, roomId: null }));
                    setRoomSearch("No room");
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
                listboxAriaLabel="Select room"
                noMatchMessage="No matching rooms"
                emptyStateMessage="No rooms available in this workspace"
                emptyNoMatch={roomEmptyNoMatch}
                listPresentation="portal"
                listboxZIndex={170}
              />
            </div>
            {roomEmptyPool ? (
              <p className="mt-1 text-xs text-foreground-variant">
                No rooms are available yet. You can still leave this zone unassigned.
              </p>
            ) : null}
          </div>

          {mode === "edit" ? (
            <div>
              <label className="text-xs font-medium text-foreground-variant">
                Active status
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
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-xs text-foreground-variant">
              New zones are created as active assignments.
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
            Cancel
          </button>
          <button
            type="button"
            className="gradient-cta rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
            onClick={onSubmit}
            disabled={submitting}
          >
            {submitting ? "Saving..." : mode === "create" ? "Add zone" : "Save changes"}
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
          <DialogTitle>{mode === "create" ? "Add shift" : "Edit shift"}</DialogTitle>
          <DialogDescription>
            Keep the shift schedule consistent with structured date and time fields.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 pb-2 pt-1">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor={shiftDateInputId}
                className="text-xs font-medium text-foreground-variant"
              >
                Shift date
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
                Shift type
              </label>
              <Select
                value={draft.shiftType}
                onValueChange={(value) =>
                  setDraft((prev) => ({ ...prev, shiftType: value }))
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {SHIFT_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
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
                Start time
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
                End time
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
              Notes
            </label>
            <textarea
              id={notesInputId}
              className="input-field mt-1 min-h-[96px] w-full resize-y text-sm"
              value={draft.notes}
              onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Optional handoff or schedule notes"
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
            Cancel
          </button>
          <button
            type="button"
            className="gradient-cta rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
            onClick={onSubmit}
            disabled={submitting}
          >
            {submitting ? "Saving..." : mode === "create" ? "Add shift" : "Save changes"}
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
            <span className="font-semibold text-foreground">{user.username}</span>
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
              Account Active
            </label>
          </div>

          <div>
            <label htmlFor={`pwd-${user.id}`} className="block text-[10px] uppercase font-bold text-foreground-variant">
              New Password (Optional)
            </label>
            <input
              id={`pwd-${user.id}`}
              type="password"
              placeholder="Leave blank to keep same"
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
        <span className="font-medium text-foreground">{user.username}</span>
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
  const patientAccessInputId = useId();
  const patientAccessListboxId = useId();
  const [mainTab, setMainTab] = useState<"overview" | "work">("overview");

  useEffect(() => {
    setPatientAccessDraftIds(extractPatientAccessIds(patientAccess));
  }, [patientAccess]);

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
        <TabsContent value="overview" className="mt-0 space-y-0">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <section className="surface-card rounded-xl border border-outline-variant/20 p-6">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-foreground-variant">
              {t("caregivers.sectionAbout")}
            </p>
            <div className="flex flex-col gap-5 sm:flex-row">
              <div className="relative flex aspect-[4/5] w-full shrink-0 items-end justify-start overflow-hidden rounded-xl border border-outline-variant/20 bg-gradient-to-br from-primary/20 to-primary/5 sm:w-40">
                <span className="absolute bottom-2 left-2 rounded bg-black/35 px-2 py-0.5 font-mono text-[10px] font-semibold text-foreground/90">
                  Staff #{caregiver.id}
                </span>
                {caregiverPhotoUrl ? (
                  <img
                    src={caregiverPhotoUrl}
                    alt={fullName || `Staff #${caregiver.id}`}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-4xl font-bold text-primary/40">
                    {(caregiver.first_name?.[0] || caregiver.last_name?.[0] || "S").toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h1
                  id="caregiver-detail-heading"
                  className="text-2xl font-bold text-foreground"
                >
                  {fullName || `Staff #${caregiver.id}`}
                </h1>
                <p className="mt-1 text-sm text-foreground-variant">
                  {t("admin.users.role")}:{" "}
                  <span className="font-medium text-foreground">
                    {formatStaffRoleLabel(caregiver.role, t)}
                  </span>
                </p>
                <ul className="mt-3 space-y-1.5 text-sm text-foreground-variant">
                  <li>
                    {t("caregivers.employeeCode")}: {caregiver.employee_code?.trim() || "—"}
                  </li>
                  <li>
                    {t("caregivers.department")}: {caregiver.department?.trim() || "—"}
                  </li>
                  <li>
                    {t("caregivers.specialty")}: {caregiver.specialty?.trim() || "—"}
                  </li>
                  <li>
                    {t("caregivers.licenseLabel")}: {caregiver.license_number?.trim() || "—"}
                  </li>
                  <li>
                    {t("caregivers.emergencyContactName")}:{" "}
                    {caregiver.emergency_contact_name?.trim() || "—"}
                  </li>
                  <li>
                    {t("caregivers.emergencyContactPhone")}:{" "}
                    {caregiver.emergency_contact_phone?.trim() || "—"}
                  </li>
                </ul>
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
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 font-semibold text-foreground">
                  <Shield className="h-5 w-5 text-primary" aria-hidden />
                  {t("caregivers.sectionPatientAccess")}
                </h2>
                <p className="mt-1 text-sm text-foreground-variant">
                  {patientAccessDraftIds.length}{" "}
                  {patientAccessDraftIds.length === 1
                    ? t("caregivers.patientAccessCountOne")
                    : t("caregivers.patientAccessCountMany")}
                </p>
              </div>
              {canManagePatientAccess ? (
                <button
                  type="button"
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary/90 disabled:opacity-50"
                  onClick={() => void handleSavePatientAccess()}
                  disabled={patientAccessSaving}
                >
                  {patientAccessSaving
                    ? t("caregivers.patientAccessSaving")
                    : t("caregivers.patientAccessSave")}
                </button>
              ) : null}
            </div>

            {canManagePatientAccess ? (
              <div className="mb-4">
                <SearchableListboxPicker
                  inputId={patientAccessInputId}
                  listboxId={patientAccessListboxId}
                  options={patientAccessOptions}
                  search={patientAccessSearch}
                  onSearchChange={setPatientAccessSearch}
                  searchPlaceholder={t("caregivers.patientAccessSearchPlaceholder")}
                  selectedOptionId={null}
                  onSelectOption={(pid) => {
                    const patientId = Number(pid);
                    if (!Number.isFinite(patientId)) return;
                    setPatientAccessDraftIds((prev) =>
                      prev.includes(patientId) ? prev : [...prev, patientId],
                    );
                    setPatientAccessSearch("");
                  }}
                  disabled={patientAccessLoading}
                  listboxAriaLabel={t("caregivers.patientAccessListbox")}
                  noMatchMessage={t("caregivers.patientAccessNoMatch")}
                  emptyStateMessage={
                    patientAccessOptions.length === 0 ? t("caregivers.patientAccessNoPool") : null
                  }
                  emptyNoMatch={patientAccessSearch.trim().length > 0}
                />
              </div>
            ) : null}

            {patientAccessError ? (
              <p className="mb-3 text-sm text-critical">{patientAccessError}</p>
            ) : null}

            {patientAccessLoading ? (
              <div className="flex justify-center py-6">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : patientAccessSelectedPatients.length === 0 ? (
              <p className="text-sm text-foreground-variant">{t("caregivers.patientAccessEmpty")}</p>
            ) : (
              <ul className="space-y-2">
                {patientAccessSelectedPatients.map((patient) => (
                  <li
                    key={patient.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant/15 bg-surface-container-low/50 p-4"
                  >
                    <Link href={`/admin/patients/${patient.id}`} className="min-w-0">
                      <p className="font-semibold text-foreground">{formatPatientLabel(patient)}</p>
                      <p className="text-xs text-foreground-variant">
                        {patient.room_id != null ? `Room #${patient.room_id}` : `Patient #${patient.id}`} ·{" "}
                        {patient.care_level}
                      </p>
                    </Link>
                    {canManagePatientAccess ? (
                      <button
                        type="button"
                        className="shrink-0 text-xs font-semibold text-critical hover:underline"
                        onClick={() =>
                          setPatientAccessDraftIds((prev) => prev.filter((pid) => pid !== patient.id))
                        }
                      >
                        {t("caregivers.patientAccessRemove")}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="surface-card rounded-xl border border-outline-variant/20 p-6">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-foreground">
              <Users className="h-5 w-5 text-primary" aria-hidden />
              {t("caregivers.sectionLinkedPatients")}
            </h2>
            {linkedPatients.length === 0 ? (
              <p className="text-sm text-foreground-variant">{t("caregivers.linkedPatientsEmpty")}</p>
            ) : (
              <ul className="space-y-2">
                {linkedPatients.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/admin/patients/${p.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant/15 bg-surface-container-low/50 p-4 transition-smooth hover:border-primary/30 hover:shadow-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">
                          {p.first_name} {p.last_name}
                        </p>
                        <p className="text-xs text-foreground-variant">
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

          {showHeadNurseGuide ? (
            <section className="surface-card rounded-xl border border-outline-variant/20 p-6">
              <h2 className="mb-2 flex items-center gap-2 font-semibold text-foreground">
                <Users className="h-5 w-5 text-primary" aria-hidden />
                {t("caregivers.sectionHeadNurses")}
              </h2>
              <p className="mb-4 text-sm text-foreground-variant">{t("caregivers.headNursesHint")}</p>
              {headNursesLoading ? (
                <div className="flex justify-center py-6">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : headNurses.length === 0 ? (
                <p className="text-sm text-foreground-variant">
                  {caregiver.role === "head_nurse" && hasAnyHeadNurseInWorkspace
                    ? t("caregivers.headNursesPeerOnlySelf")
                    : t("caregivers.headNursesEmpty")}
                </p>
              ) : (
                <ul className="space-y-2">
                  {headNurses.map((hn) => (
                    <li key={hn.id}>
                      <Link
                        href={`/admin/caregivers/${hn.id}`}
                        className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant/15 bg-surface-container-low/50 p-4 transition-smooth hover:border-primary/30 hover:shadow-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">
                            {hn.first_name} {hn.last_name}
                          </p>
                          <p className="text-xs text-foreground-variant">
                            {formatStaffRoleLabel(hn.role, t)}
                            {hn.employee_code?.trim() ? ` · ${hn.employee_code.trim()}` : ""}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-outline" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          <section className="surface-card rounded-xl border border-outline-variant/20 p-6">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-foreground">
              <MapPin className="h-5 w-5 text-primary" aria-hidden />
              {t("caregivers.sectionZones")}
            </h2>
            {canManageSchedule ? (
              <div className="mb-4 flex items-center justify-end">
                <button
                  type="button"
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary/90"
                  onClick={openCreateZone}
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
              <p className="text-sm text-foreground-variant">—</p>
            ) : (
              <ul className="space-y-2">
                {zones.map((z) => (
                  <li
                    key={z.id}
                    className="rounded-xl border border-outline-variant/15 bg-surface-container-low px-4 py-4 text-sm"
                  >
                    {(() => {
                      const room = z.room_id != null ? roomsById.get(z.room_id) ?? null : null;
                      const patientCount =
                        z.room_id != null ? patientCountByRoomId.get(z.room_id) ?? 0 : 0;
                      const mapHref =
                        room && room.facility_id != null && room.floor_id != null
                          ? `/head-nurse/monitoring?facility=${room.facility_id}&floor=${room.floor_id}&view=map&room=${room.id}`
                          : null;
                      return (
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 space-y-1">
                            <p className="font-semibold text-foreground">
                              {z.zone_name || formatRoomLabel(room) || "—"}
                            </p>
                            <p className="text-xs text-foreground-variant">
                              {formatRoomContext(room)}
                            </p>
                            <p className="text-xs text-foreground-variant">
                              Linked patients: {patientCount}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                            <span
                              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${
                                z.is_active ? "care-normal" : "bg-surface-container text-outline"
                              }`}
                            >
                              {z.is_active
                                ? t("patients.statusActive")
                                : t("patients.statusInactive")}
                            </span>
                            {mapHref ? (
                              <Link
                                href={mapHref}
                                className="rounded-full border border-outline-variant/25 px-2.5 py-1 text-[10px] font-semibold uppercase text-primary hover:bg-primary/5"
                              >
                                Open map
                              </Link>
                            ) : null}
                            {canManageSchedule ? (
                              <>
                                <button
                                  type="button"
                                  className="text-xs font-semibold text-primary hover:underline"
                                  onClick={() => openEditZone(z)}
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
                              </>
                            ) : null}
                          </div>
                        </div>
                      );
                    })()}
                  </li>
                ))}
              </ul>
            )}
          </section>

                    <section className="surface-card rounded-xl border border-outline-variant/20 p-6">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-foreground">
              <Clock className="h-5 w-5 text-primary" aria-hidden />
              Shift schedule
            </h2>
            {canManageSchedule ? (
              <div className="mb-4 flex items-center justify-end">
                <button
                  type="button"
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary/90"
                  onClick={openCreateShift}
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
              <p className="text-sm text-foreground-variant">—</p>
            ) : (
              <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {shifts.map((s) => (
                  <li
                    key={s.id}
                    className="rounded-xl border border-outline-variant/15 bg-surface-container-low px-4 py-3 text-sm"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <p className="font-medium text-foreground">{formatDate(s.shift_date)}</p>
                        <p className="text-xs text-foreground-variant">
                          {formatTime(s.start_time)} – {formatTime(s.end_time)}
                          {s.notes ? ` · ${s.notes}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            SHIFT_BADGE[s.shift_type] ?? "bg-surface-container text-outline"
                          }`}
                        >
                          {formatShiftType(s.shift_type)}
                        </span>
                        {canManageSchedule ? (
                          <>
                            <button
                              type="button"
                              className="text-xs font-semibold text-primary hover:underline"
                              onClick={() => openEditShift(s)}
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
                          </>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="surface-card rounded-xl border border-outline-variant/20 p-6">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-foreground">
              <UserCircle2 className="h-5 w-5 text-primary" aria-hidden />
              {t("patients.sectionLinkedAccounts")}
            </h2>
            {linkedUsers.length === 0 ? (
              <p className="text-sm text-foreground-variant">
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

          <p className="text-xs text-foreground-variant">
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
        </TabsContent>
        <TabsContent value="work" className="mt-0">
          <StaffRoutineAndCalendarPanel linkedUsers={linkedUsers} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
