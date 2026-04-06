"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { api, ApiError } from "@/lib/api";
import { splitList } from "@/lib/patientFormParse";
import SearchableListboxPicker from "@/components/shared/SearchableListboxPicker";
import { Plus, Trash2, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { hasCapability } from "@/lib/permissions";
import type {
  Device,
  DeviceAssignment,
  MedicalConditionEntry,
  Patient,
  PatientContact,
  PatientMedication,
  PatientPastSurgery,
  Room,
  User,
} from "@/lib/types";

const CARE_LEVELS = ["normal", "special", "critical"] as const;
const MOBILITY = ["wheelchair", "walker", "independent"] as const;
const BLOOD_TYPES = ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

export type SensorCategoryId = "wheelchair" | "polar" | "mobile";

const SENSOR_CATEGORY_ORDER: SensorCategoryId[] = ["wheelchair", "polar", "mobile"];

const NO_ROOM_OPTION_ID = "";

function roomDisplayTitle(r: Room): string {
  return `${r.name}${r.floor_name ? ` · ${r.floor_name}` : ""}`;
}

/** UI bucket → registry `hardware_type` values → `device_role` for POST /patients/…/devices */
const SENSOR_CATEGORY_CONFIG: Record<
  SensorCategoryId,
  { hardwareTypes: string[]; deviceRole: string }
> = {
  wheelchair: { hardwareTypes: ["wheelchair", "node"], deviceRole: "wheelchair_sensor" },
  polar: { hardwareTypes: ["polar_sense"], deviceRole: "polar_hr" },
  mobile: { hardwareTypes: ["mobile_phone"], deviceRole: "mobile" },
};

function medicalConditionsToRaw(conditions: MedicalConditionEntry[]): string {
  return (conditions ?? [])
    .map((c) => {
      if (typeof c === "string") return c;
      const o = c as Record<string, unknown>;
      if (typeof o.label === "string") return o.label;
      if (typeof o.name === "string") return o.name;
      if (typeof o.condition === "string") return o.condition;
      return String(o.type ?? "");
    })
    .filter(Boolean)
    .join(", ");
}

export interface PatientEditorModalProps {
  open: boolean;
  patientId: string;
  patient: Patient;
  primaryContact: PatientContact | null;
  activeAssignments: DeviceAssignment[];
  allPortalUsers: User[];
  linkedPortalUsers: User[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}

export default function PatientEditorModal({
  open,
  patientId,
  patient,
  primaryContact,
  activeAssignments,
  allPortalUsers,
  linkedPortalUsers,
  onClose,
  onSaved,
}: PatientEditorModalProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canManageAccounts = Boolean(user && hasCapability(user.role, "users.manage"));
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [addDeviceId, setAddDeviceId] = useState("");
  const [sensorCategory, setSensorCategory] = useState<SensorCategoryId>("wheelchair");
  const [deviceSearch, setDeviceSearch] = useState("");
  const [deviceListOpen, setDeviceListOpen] = useState(false);
  const [roomSearch, setRoomSearch] = useState("");
  const [roomListOpen, setRoomListOpen] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [accountMode, setAccountMode] = useState<"none" | "existing" | "new">("none");
  const [userSearch, setUserSearch] = useState("");
  const [userListOpen, setUserListOpen] = useState(false);
  const [selectedExistingUserId, setSelectedExistingUserId] = useState<number | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nickname, setNickname] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [careLevel, setCareLevel] = useState<string>("normal");
  const [mobilityType, setMobilityType] = useState<string>("wheelchair");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [bloodType, setBloodType] = useState("");
  const [chronicRaw, setChronicRaw] = useState("");
  const [allergiesRaw, setAllergiesRaw] = useState("");
  const [notes, setNotes] = useState("");
  const [medications, setMedications] = useState<PatientMedication[]>([
    { name: "", dosage: "", frequency: "", instructions: "" },
  ]);
  const [surgeries, setSurgeries] = useState<PatientPastSurgery[]>([
    { procedure: "", facility: "", year: "" },
  ]);
  const [roomId, setRoomId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [primaryContactId, setPrimaryContactId] = useState<number | null>(null);
  const [ecContactType, setEcContactType] = useState("emergency");
  const [ecName, setEcName] = useState("");
  const [ecRelationship, setEcRelationship] = useState("");
  const [ecPhone, setEcPhone] = useState("");
  const [ecEmail, setEcEmail] = useState("");
  const [ecNotes, setEcNotes] = useState("");

  const syncFromProps = useCallback(() => {
    setFirstName(patient.first_name ?? "");
    setLastName(patient.last_name ?? "");
    setNickname(patient.nickname ?? "");
    setDateOfBirth(patient.date_of_birth ? String(patient.date_of_birth).slice(0, 10) : "");
    setGender(patient.gender ?? "");
    setCareLevel(patient.care_level ?? "normal");
    setMobilityType(patient.mobility_type ?? "wheelchair");
    setHeightCm(patient.height_cm != null ? String(patient.height_cm) : "");
    setWeightKg(patient.weight_kg != null ? String(patient.weight_kg) : "");
    setBloodType(patient.blood_type ?? "");
    setChronicRaw(medicalConditionsToRaw(patient.medical_conditions ?? []));
    setAllergiesRaw((patient.allergies ?? []).join(", "));
    setNotes(patient.notes ?? "");
    const meds = patient.medications?.length
      ? [...patient.medications]
      : [{ name: "", dosage: "", frequency: "", instructions: "" }];
    setMedications(meds.length ? meds : [{ name: "", dosage: "", frequency: "", instructions: "" }]);
    const sx = patient.past_surgeries?.length
      ? [...patient.past_surgeries]
      : [{ procedure: "", facility: "", year: "" }];
    setSurgeries(sx.length ? sx : [{ procedure: "", facility: "", year: "" }]);
    const prid = patient.room_id != null ? String(patient.room_id) : "";
    setRoomId(prid);
    setRoomSearch(prid ? "" : t("patients.noRoom"));
    setRoomListOpen(false);
    setIsActive(patient.is_active !== false);
    const pc = primaryContact;
    setPrimaryContactId(pc?.id ?? null);
    setEcContactType(pc?.contact_type ?? "emergency");
    setEcName(pc?.name ?? "");
    setEcRelationship(pc?.relationship ?? "");
    setEcPhone(pc?.phone ?? "");
    setEcEmail(pc?.email ?? "");
    setEcNotes(pc?.notes ?? "");
    setFormError("");
    setAddDeviceId("");
    setSensorCategory("wheelchair");
    setDeviceSearch("");
    setDeviceListOpen(false);
    const linked = linkedPortalUsers[0] ?? null;
    if (linked) {
      setAccountMode("existing");
      setSelectedExistingUserId(linked.id);
      setUserSearch(linked.username);
    } else {
      setAccountMode("none");
      setSelectedExistingUserId(null);
      setUserSearch("");
    }
    setUserListOpen(false);
    setNewUsername("");
    setNewPassword("");
    setAccountError(null);
    setAccountMessage(null);
  }, [patient, primaryContact, t, linkedPortalUsers]);

  useEffect(() => {
    if (!open) return;
    syncFromProps();
  }, [open, syncFromProps]);

  useEffect(() => {
    if (!open) return;
    const prid = patient.room_id != null ? String(patient.room_id) : "";
    if (roomId !== prid) return;
    if (!prid) {
      setRoomSearch(t("patients.noRoom"));
      return;
    }
    const r = rooms.find((x) => String(x.id) === prid);
    if (!r) return;
    setRoomSearch((prev) => (prev.trim() === "" ? roomDisplayTitle(r) : prev));
  }, [open, patient.room_id, roomId, rooms, t]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const [r, d] = await Promise.all([
          api.get<Room[]>("/rooms"),
          api.get<Device[]>("/devices"),
        ]);
        if (!cancelled) {
          setRooms(r);
          setDevices(d);
        }
      } catch {
        if (!cancelled) {
          setRooms([]);
          setDevices([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleClose = useCallback(() => {
    if (submitting || linkBusy || accountSaving) return;
    onClose();
  }, [submitting, linkBusy, accountSaving, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (roomListOpen) {
        e.preventDefault();
        setRoomListOpen(false);
        return;
      }
      if (deviceListOpen) {
        e.preventDefault();
        setDeviceListOpen(false);
        return;
      }
      if (userListOpen) {
        e.preventDefault();
        setUserListOpen(false);
        return;
      }
      handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, handleClose, roomListOpen, deviceListOpen, userListOpen]);

  const addMedRow = () =>
    setMedications((m) => [...m, { name: "", dosage: "", frequency: "", instructions: "" }]);
  const removeMedRow = (i: number) =>
    setMedications((m) => (m.length <= 1 ? m : m.filter((_, j) => j !== i)));

  const addSxRow = () =>
    setSurgeries((s) => [...s, { procedure: "", facility: "", year: "" }]);
  const removeSxRow = (i: number) =>
    setSurgeries((s) => (s.length <= 1 ? s : s.filter((_, j) => j !== i)));

  const handleUnlink = async (deviceId: string) => {
    if (!window.confirm(t("patients.unlinkConfirm"))) return;
    try {
      await api.delete(
        `/patients/${patientId}/devices/${encodeURIComponent(deviceId)}`,
      );
      await onSaved();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("patients.deviceUnlinkError");
      setFormError(msg);
    }
  };

  const handleLinkDevice = async () => {
    const id = addDeviceId.trim();
    if (!id) return;
    setLinkBusy(true);
    setFormError("");
    try {
      await api.post(`/patients/${patientId}/devices`, {
        device_id: id,
        device_role: SENSOR_CATEGORY_CONFIG[sensorCategory].deviceRole,
      });
      setAddDeviceId("");
      setDeviceSearch("");
      setDeviceListOpen(false);
      await onSaved();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("patients.deviceLinkError");
      setFormError(msg);
    } finally {
      setLinkBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fn = firstName.trim();
    const ln = lastName.trim();
    if (!fn || !ln) {
      setFormError(t("patients.nameRequired"));
      return;
    }
    if (primaryContactId != null && (!ecName.trim() || !ecPhone.trim())) {
      setFormError(t("patients.ecRequiredForSave"));
      return;
    }
    setSubmitting(true);
    setFormError("");
    let rollbackPatient = false;
    const rollbackPayload: Record<string, unknown> = {
      first_name: patient.first_name,
      last_name: patient.last_name,
      nickname: patient.nickname ?? "",
      date_of_birth: patient.date_of_birth ?? null,
      gender: patient.gender ?? "",
      care_level: patient.care_level ?? "normal",
      mobility_type: patient.mobility_type ?? "wheelchair",
      height_cm: patient.height_cm ?? null,
      weight_kg: patient.weight_kg ?? null,
      blood_type: patient.blood_type ?? "",
      medical_conditions: patient.medical_conditions ?? [],
      allergies: patient.allergies ?? [],
      medications: patient.medications ?? [],
      past_surgeries: patient.past_surgeries ?? [],
      notes: patient.notes ?? "",
      room_id: patient.room_id ?? null,
      is_active: patient.is_active !== false,
    };
    try {
      const height =
        heightCm.trim() === "" ? null : Number.parseFloat(heightCm.replace(",", "."));
      const weight =
        weightKg.trim() === "" ? null : Number.parseFloat(weightKg.replace(",", "."));
      const medPayload = medications
        .filter((row) => (row.name || "").trim())
        .map((row) => ({
          name: (row.name || "").trim(),
          dosage: (row.dosage || "").trim(),
          frequency: (row.frequency || "").trim(),
          instructions: (row.instructions || "").trim(),
        }));
      const sxPayload = surgeries
        .filter((row) => (row.procedure || "").trim())
        .map((row) => ({
          procedure: (row.procedure || "").trim(),
          facility: (row.facility || "").trim(),
          year: row.year === "" || row.year == null ? null : Number(row.year) || row.year,
        }));

      const payload: Record<string, unknown> = {
        first_name: fn,
        last_name: ln,
        nickname: nickname.trim(),
        date_of_birth: dateOfBirth.trim() || null,
        gender: gender.trim(),
        care_level: careLevel,
        mobility_type: mobilityType,
        height_cm: height != null && !Number.isNaN(height) ? height : null,
        weight_kg: weight != null && !Number.isNaN(weight) ? weight : null,
        blood_type: bloodType,
        medical_conditions: splitList(chronicRaw),
        allergies: splitList(allergiesRaw),
        medications: medPayload,
        past_surgeries: sxPayload,
        notes: notes.trim(),
        room_id: roomId === "" ? null : Number(roomId),
        is_active: isActive,
      };

      await api.patch<Patient>(`/patients/${patientId}`, payload);
      rollbackPatient = true;

      if (primaryContactId != null) {
        await api.patch(`/patients/${patientId}/contacts/${primaryContactId}`, {
          contact_type: ecContactType.trim() || "emergency",
          name: ecName.trim(),
          relationship: ecRelationship.trim(),
          phone: ecPhone.trim(),
          email: ecEmail.trim(),
          notes: ecNotes.trim(),
          is_primary: true,
        });
      } else if (ecName.trim() && ecPhone.trim()) {
        await api.post(`/patients/${patientId}/contacts`, {
          contact_type: ecContactType.trim() || "emergency",
          name: ecName.trim(),
          relationship: ecRelationship.trim(),
          phone: ecPhone.trim(),
          email: ecEmail.trim(),
          notes: ecNotes.trim(),
          is_primary: true,
        });
      }
      rollbackPatient = false;

      await onSaved();
      onClose();
    } catch (err) {
      if (rollbackPatient) {
        try {
          await api.patch(`/patients/${patientId}`, rollbackPayload);
        } catch {
          // Best-effort rollback only; preserve the original error message.
        }
      }
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("patients.saveError");
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const sensorHardwareSet = useMemo(
    () => new Set(SENSOR_CATEGORY_CONFIG[sensorCategory].hardwareTypes.map((h) => h.toLowerCase())),
    [sensorCategory],
  );

  const linkableDevices = useMemo(() => {
    const assigned = new Set(activeAssignments.map((a) => a.device_id));
    return devices.filter((d) => {
      if (assigned.has(d.device_id)) return false;
      const hw = (d.hardware_type || "").toLowerCase();
      return sensorHardwareSet.has(hw);
    });
  }, [devices, activeAssignments, sensorHardwareSet]);

  const filteredLinkableDevices = useMemo(() => {
    const q = deviceSearch.trim().toLowerCase();
    if (!q) return linkableDevices;
    return linkableDevices.filter((d) => {
      const label = (d.display_name || "").toLowerCase();
      const id = (d.device_id || "").toLowerCase();
      return label.includes(q) || id.includes(q);
    });
  }, [linkableDevices, deviceSearch]);

  const deviceLinkOptions = useMemo(
    () =>
      filteredLinkableDevices.map((d) => ({
        id: d.device_id,
        title: d.display_name || d.device_id,
        subtitle: `${d.device_id}${d.hardware_type ? ` · ${d.hardware_type}` : ""}`,
      })),
    [filteredLinkableDevices],
  );

  const deviceLinkEmptyNoMatch =
    linkableDevices.length > 0 &&
    filteredLinkableDevices.length === 0 &&
    deviceSearch.trim().length > 0;

  const selectedDeviceForLink = useMemo(
    () => devices.find((d) => d.device_id === addDeviceId) ?? null,
    [devices, addDeviceId],
  );

  const allRoomPickerOptions = useMemo(() => {
    const rows: { id: string; title: string; subtitle?: string }[] = rooms.map((r) => ({
      id: String(r.id),
      title: roomDisplayTitle(r),
      subtitle: `ID ${r.id}`,
    }));
    return [{ id: NO_ROOM_OPTION_ID, title: t("patients.noRoom") }, ...rows];
  }, [rooms, t]);

  const filteredRoomOptions = useMemo(() => {
    const q = roomSearch.trim().toLowerCase();
    if (!q) return allRoomPickerOptions;
    return allRoomPickerOptions.filter((o) => {
      const title = o.title.toLowerCase();
      const sub = (o.subtitle ?? "").toLowerCase();
      const id = o.id.toLowerCase();
      return title.includes(q) || sub.includes(q) || id.includes(q);
    });
  }, [allRoomPickerOptions, roomSearch]);

  const roomPickerEmptyNoMatch =
    allRoomPickerOptions.length > 0 &&
    filteredRoomOptions.length === 0 &&
    roomSearch.trim().length > 0;

  const selectedRoomForDisplay = useMemo(
    () => (roomId ? rooms.find((r) => String(r.id) === roomId) ?? null : null),
    [rooms, roomId],
  );

  const hasUnassignedDevicesAnywhere = useMemo(() => {
    const assigned = new Set(activeAssignments.map((a) => a.device_id));
    return devices.some((d) => !assigned.has(d.device_id));
  }, [devices, activeAssignments]);

  const userOptions = useMemo(() => {
    const currentLinkedId = linkedPortalUsers[0]?.id ?? null;
    return allPortalUsers
      .filter(
        (u) =>
          currentLinkedId === u.id ||
          (u.role === "patient" && u.patient_id == null),
      )
      .map((u) => ({
        id: String(u.id),
        title: u.username,
        subtitle: `${u.role}${u.is_active ? "" : " · inactive"}`,
      }));
  }, [allPortalUsers, linkedPortalUsers]);

  const filteredUserOptions = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return userOptions;
    return userOptions.filter((o) => {
      const title = o.title.toLowerCase();
      const subtitle = (o.subtitle ?? "").toLowerCase();
      return title.includes(q) || subtitle.includes(q);
    });
  }, [userOptions, userSearch]);

  const userPickerEmptyNoMatch =
    userOptions.length > 0 &&
    filteredUserOptions.length === 0 &&
    userSearch.trim().length > 0;

  const currentLinkedUser = linkedPortalUsers[0] ?? null;

  async function handleSaveAccountLink() {
    if (!canManageAccounts) return;
    setAccountSaving(true);
    setAccountError(null);
    setAccountMessage(null);
    try {
      if (accountMode === "none") {
        if (currentLinkedUser) {
          await api.put(`/users/${currentLinkedUser.id}`, { patient_id: null });
        }
      } else if (accountMode === "existing") {
        if (!selectedExistingUserId) {
          throw new Error("Select an existing patient account");
        }
        const selectedUser =
          allPortalUsers.find((u) => u.id === selectedExistingUserId) ?? null;
        if (!selectedUser) {
          throw new Error("Selected account was not found");
        }
        if (selectedUser.id !== currentLinkedUser?.id && selectedUser.role !== "patient") {
          throw new Error("Only patient accounts can be linked here");
        }
        await api.put(`/users/${selectedExistingUserId}`, {
          patient_id: Number(patientId),
        });
      } else if (accountMode === "new") {
        if (newUsername.trim().length < 3 || newPassword.trim().length < 6) {
          throw new Error("Username and password do not meet requirements");
        }
        await api.post("/users", {
          username: newUsername.trim(),
          password: newPassword.trim(),
          role: "patient",
          is_active: true,
          patient_id: Number(patientId),
        });
      }

      await onSaved();
      setAccountMessage(t("devicesDetail.saved"));
    } catch (err) {
      setAccountError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("patients.saveError"),
      );
    } finally {
      setAccountSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={handleClose}
    >
      <div
        className="surface-card w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-outline-variant/25 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-patient-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-outline-variant/20 bg-surface-container-low px-6 py-4">
          <h3 id="edit-patient-title" className="text-lg font-semibold text-on-surface">
            {t("patients.editTitle")}
          </h3>
          <button
            type="button"
            className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high shrink-0"
            onClick={handleClose}
            aria-label={t("patients.createCancel")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <FormSection title={t("patients.editRoomDevices")}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("patients.room")}>
                <div className="space-y-2">
                  <span id="patient-room-combobox-label" className="sr-only">
                    {t("patients.room")}
                  </span>
                  <SearchableListboxPicker
                    inputId="patient-room-combobox"
                    listboxId="patient-editor-room-listbox"
                    options={filteredRoomOptions}
                    search={roomSearch}
                    onSearchChange={setRoomSearch}
                    searchPlaceholder={t("patients.searchRoomsByNameFloorOrId")}
                    selectedOptionId={roomId}
                    onSelectOption={(id) => {
                      setRoomId(id);
                      if (id === NO_ROOM_OPTION_ID) {
                        setRoomSearch(t("patients.noRoom"));
                      } else {
                        const r = rooms.find((x) => String(x.id) === id);
                        setRoomSearch(r ? roomDisplayTitle(r) : id);
                      }
                    }}
                    disabled={submitting}
                    listboxAriaLabel={t("patients.selectRoom")}
                    noMatchMessage={t("patients.noRoomMatches")}
                    emptyNoMatch={roomPickerEmptyNoMatch}
                    listPresentation="portal"
                    listboxZIndex={200}
                    listOpen={roomListOpen}
                    onListOpenChange={setRoomListOpen}
                    inputType="text"
                    enterKeyHint="done"
                    ariaLabelledBy="patient-room-combobox-label"
                  />
                  {roomId !== "" && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-on-surface">
                      <span className="truncate font-medium">
                        {t("patients.roomSelected")}:{" "}
                        {selectedRoomForDisplay
                          ? roomDisplayTitle(selectedRoomForDisplay)
                          : `ID ${roomId}`}
                      </span>
                      <button
                        type="button"
                        className="ml-auto shrink-0 font-semibold text-primary hover:underline"
                        onClick={() => {
                          setRoomId("");
                          setRoomSearch(t("patients.noRoom"));
                        }}
                        disabled={submitting}
                      >
                        {t("patients.clearDeviceSelection")}
                      </button>
                    </div>
                  )}
                </div>
              </Field>
              <Field label={t("patients.accountStatus")}>
                <label className="flex items-center gap-2 text-sm text-on-surface mt-2">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    disabled={submitting}
                  />
                  {t("patients.activePatient")}
                </label>
              </Field>
            </div>
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
                {t("patients.devicesSection")}
              </p>
              {activeAssignments.length === 0 ? (
                <p className="text-sm text-on-surface-variant">—</p>
              ) : (
                <ul className="space-y-2">
                  {activeAssignments.map((a) => (
                    <li
                      key={`${a.device_id}-${a.device_role}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-outline-variant/15 px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-on-surface truncate">{a.device_id}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-on-surface-variant">{a.device_role}</span>
                        <button
                          type="button"
                          className="text-xs font-medium text-error hover:underline"
                          onClick={() => void handleUnlink(a.device_id)}
                          disabled={submitting || linkBusy}
                        >
                          {t("patients.unlinkDevice")}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low/40 p-3 pt-4 space-y-3">
                <p className="text-xs text-on-surface-variant -mt-1">
                  {t("patients.deviceLinkHintTwoStep")}
                </p>
                <div>
                  <p className="mb-2 text-xs font-medium text-on-surface-variant">
                    {t("patients.sensorTypeStep")}
                  </p>
                  <div
                    className="flex flex-wrap gap-2"
                    role="tablist"
                    aria-label={t("patients.sensorTypeStep")}
                  >
                    {SENSOR_CATEGORY_ORDER.map((cat) => {
                      const active = sensorCategory === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          disabled={submitting || linkBusy}
                          onClick={() => {
                            setSensorCategory(cat);
                            setAddDeviceId("");
                            setDeviceSearch("");
                            setDeviceListOpen(true);
                          }}
                          className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-smooth disabled:opacity-50 ${
                            active
                              ? "border-primary bg-primary/15 text-primary"
                              : "border-outline-variant/30 text-on-surface hover:bg-surface-container-high"
                          }`}
                        >
                          {cat === "wheelchair"
                            ? t("patients.sensorWheelchair")
                            : cat === "polar"
                              ? t("patients.sensorPolar")
                              : t("patients.sensorMobile")}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                  <div className="relative min-w-0 flex-1 space-y-2">
                    <p className="text-xs font-medium text-on-surface-variant" id="patient-device-search-label">
                      {t("patients.sensorSearchStep")}
                    </p>
                    <SearchableListboxPicker
                      inputId="patient-device-combobox"
                      listboxId="patient-editor-device-listbox"
                      options={deviceLinkOptions}
                      search={deviceSearch}
                      onSearchChange={setDeviceSearch}
                      searchPlaceholder={t("patients.searchDevicesByNameOrId")}
                      selectedOptionId={addDeviceId.trim() ? addDeviceId : null}
                      onSelectOption={(id) => {
                        setAddDeviceId(id);
                        const d = devices.find((x) => x.device_id === id);
                        setDeviceSearch(d?.display_name || id);
                      }}
                      disabled={submitting || linkBusy || linkableDevices.length === 0}
                      listboxAriaLabel={t("patients.selectDevice")}
                      noMatchMessage={t("patients.noDeviceMatches")}
                      emptyNoMatch={deviceLinkEmptyNoMatch}
                      listPresentation="portal"
                      listboxZIndex={200}
                      listOpen={deviceListOpen}
                      onListOpenChange={setDeviceListOpen}
                      inputType="text"
                      enterKeyHint="done"
                      ariaLabelledBy="patient-device-search-label"
                    />
                    {addDeviceId && selectedDeviceForLink && (
                      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-on-surface">
                        <span className="truncate font-medium">
                          {t("patients.deviceSelected")}:{" "}
                          {selectedDeviceForLink.display_name || selectedDeviceForLink.device_id}
                        </span>
                        <button
                          type="button"
                          className="ml-auto shrink-0 font-semibold text-primary hover:underline"
                          onClick={() => {
                            setAddDeviceId("");
                            setDeviceSearch("");
                          }}
                          disabled={submitting || linkBusy}
                        >
                          {t("patients.clearDeviceSelection")}
                        </button>
                      </div>
                    )}
                    {linkableDevices.length === 0 && (
                      <p className="text-sm text-on-surface-variant">
                        {hasUnassignedDevicesAnywhere
                          ? t("patients.noDevicesInSensorCategory")
                          : t("patients.allDevicesLinked")}
                      </p>
                    )}
                  </div>
                  <div className="flex w-full shrink-0 flex-col gap-2 lg:w-48">
                    <p className="text-xs text-on-surface-variant">
                      <span className="font-medium text-on-surface">
                        {t("patients.deviceRoleLinksAs")}
                      </span>{" "}
                      <code className="rounded bg-surface-container-high px-1.5 py-0.5 font-mono text-[11px] text-on-surface">
                        {SENSOR_CATEGORY_CONFIG[sensorCategory].deviceRole}
                      </code>
                    </p>
                    <button
                      type="button"
                      className="rounded-xl border border-outline-variant/30 px-4 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-high disabled:opacity-50"
                      onClick={() => void handleLinkDevice()}
                      disabled={submitting || linkBusy || !addDeviceId.trim()}
                    >
                      {t("patients.addDeviceLink")}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </FormSection>

          <FormSection title={t("patients.sectionLinkedAccounts")}>
            {!canManageAccounts ? (
              <p className="text-sm text-on-surface-variant">
                {linkedPortalUsers[0]
                  ? `${linkedPortalUsers[0].username} (${linkedPortalUsers[0].role})`
                  : "—"}
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-smooth ${
                      accountMode === "none"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-outline-variant/30 text-on-surface hover:bg-surface-container-high"
                    }`}
                    onClick={() => {
                      setAccountMode("none");
                      setAccountError(null);
                      setAccountMessage(null);
                    }}
                  >
                    No linked account
                  </button>
                  <button
                    type="button"
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-smooth ${
                      accountMode === "existing"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-outline-variant/30 text-on-surface hover:bg-surface-container-high"
                    }`}
                    onClick={() => {
                      setAccountMode("existing");
                      setAccountError(null);
                      setAccountMessage(null);
                    }}
                  >
                    Use existing account
                  </button>
                  <button
                    type="button"
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-smooth ${
                      accountMode === "new"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-outline-variant/30 text-on-surface hover:bg-surface-container-high"
                    }`}
                    onClick={() => {
                      setAccountMode("new");
                      setAccountError(null);
                      setAccountMessage(null);
                    }}
                  >
                    Create new account
                  </button>
                </div>

                {accountMode === "existing" ? (
                  <div className="space-y-2">
                    <span id="patient-linked-user-label" className="sr-only">
                      Select account
                    </span>
                    <SearchableListboxPicker
                      inputId="patient-linked-user-combobox"
                      listboxId="patient-editor-user-listbox"
                      options={filteredUserOptions}
                      search={userSearch}
                      onSearchChange={setUserSearch}
                      searchPlaceholder="Search username…"
                      selectedOptionId={
                        selectedExistingUserId != null ? String(selectedExistingUserId) : null
                      }
                      onSelectOption={(id) => {
                        setSelectedExistingUserId(Number(id));
                        const u = allPortalUsers.find((x) => x.id === Number(id));
                        setUserSearch(u?.username ?? id);
                        setAccountError(null);
                        setAccountMessage(null);
                      }}
                      disabled={submitting || accountSaving}
                      listboxAriaLabel="Select existing account"
                      noMatchMessage={t("common.noSearchMatches")}
                      emptyNoMatch={userPickerEmptyNoMatch}
                      listPresentation="portal"
                      listboxZIndex={200}
                      listOpen={userListOpen}
                      onListOpenChange={setUserListOpen}
                      inputType="text"
                      enterKeyHint="done"
                      ariaLabelledBy="patient-linked-user-label"
                    />
                    <p className="text-xs text-on-surface-variant">
                      Linking an account here auto-reassigns any prior account linked to this patient.
                    </p>
                  </div>
                ) : null}

                {accountMode === "new" ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label={`${t("admin.users.username")} *`}>
                      <input
                        className="input-field text-sm w-full"
                        value={newUsername}
                        onChange={(e) => {
                          setNewUsername(e.target.value);
                          setAccountError(null);
                          setAccountMessage(null);
                        }}
                        placeholder="min 3 chars"
                        disabled={submitting || accountSaving}
                      />
                    </Field>
                    <Field label={`${t("admin.users.password")} *`}>
                      <input
                        type="password"
                        className="input-field text-sm w-full"
                        value={newPassword}
                        onChange={(e) => {
                          setNewPassword(e.target.value);
                          setAccountError(null);
                          setAccountMessage(null);
                        }}
                        placeholder="min 6 chars"
                        disabled={submitting || accountSaving}
                      />
                    </Field>
                  </div>
                ) : null}
                {accountError ? (
                  <p className="text-sm text-error" role="alert">
                    {accountError}
                  </p>
                ) : null}
                {accountMessage ? (
                  <p className="text-sm text-primary">{accountMessage}</p>
                ) : null}
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="rounded-xl px-4 py-2 text-sm font-semibold border border-outline-variant/30 text-on-surface hover:bg-surface-container-high disabled:opacity-50"
                    onClick={() => void handleSaveAccountLink()}
                    disabled={submitting || accountSaving}
                  >
                    {accountSaving ? t("common.saving") : t("patients.saveChanges")}
                  </button>
                </div>
              </div>
            )}
          </FormSection>

          <FormSection title={t("patients.formSectionIdentity")}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={`${t("patients.firstName")} *`}>
                <input
                  className="input-field text-sm w-full"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={submitting}
                  required
                />
              </Field>
              <Field label={`${t("patients.lastName")} *`}>
                <input
                  className="input-field text-sm w-full"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={submitting}
                  required
                />
              </Field>
              <Field label={t("patients.nickname")}>
                <input
                  className="input-field text-sm w-full"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  disabled={submitting}
                />
              </Field>
              <Field label={t("patients.dateOfBirth")}>
                <input
                  type="date"
                  className="input-field text-sm w-full"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  disabled={submitting}
                />
              </Field>
              <Field label={t("patients.gender")}>
                <select
                  className="input-field text-sm w-full"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  disabled={submitting}
                >
                  <option value="">{t("patients.genderUnset")}</option>
                  <option value="male">{t("patients.genderMale")}</option>
                  <option value="female">{t("patients.genderFemale")}</option>
                  <option value="other">{t("patients.genderOther")}</option>
                </select>
              </Field>
              <Field label={t("patients.careLevel")}>
                <select
                  className="input-field text-sm w-full"
                  value={careLevel}
                  onChange={(e) => setCareLevel(e.target.value)}
                  disabled={submitting}
                >
                  {CARE_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("patients.mobilityType")} className="sm:col-span-2">
                <select
                  className="input-field text-sm w-full"
                  value={mobilityType}
                  onChange={(e) => setMobilityType(e.target.value)}
                  disabled={submitting}
                >
                  {MOBILITY.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </FormSection>

          <FormSection title={t("patients.formSectionPhysical")}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label={t("patients.heightCm")}>
                <input
                  type="text"
                  inputMode="decimal"
                  className="input-field text-sm w-full"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  disabled={submitting}
                />
              </Field>
              <Field label={t("patients.weightKg")}>
                <input
                  type="text"
                  inputMode="decimal"
                  className="input-field text-sm w-full"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  disabled={submitting}
                />
              </Field>
              <Field label={t("patients.bloodType")}>
                <select
                  className="input-field text-sm w-full"
                  value={bloodType}
                  onChange={(e) => setBloodType(e.target.value)}
                  disabled={submitting}
                >
                  {BLOOD_TYPES.map((bt) => (
                    <option key={bt || "unset"} value={bt}>
                      {bt || "—"}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </FormSection>

          <FormSection title={t("patients.formSectionMedical")}>
            <Field label={t("patients.chronicConditionsHint")}>
              <textarea
                className="input-field text-sm w-full min-h-[72px]"
                placeholder={t("patients.chronicPlaceholder")}
                value={chronicRaw}
                onChange={(e) => setChronicRaw(e.target.value)}
                disabled={submitting}
              />
            </Field>
            <Field label={t("patients.allergiesHint")}>
              <textarea
                className="input-field text-sm w-full min-h-[56px]"
                placeholder={t("patients.allergiesPlaceholder")}
                value={allergiesRaw}
                onChange={(e) => setAllergiesRaw(e.target.value)}
                disabled={submitting}
              />
            </Field>
          </FormSection>

          <FormSection title={t("patients.formSectionSurgeries")}>
            <div className="space-y-3">
              {surgeries.map((row, i) => (
                <div
                  key={i}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end rounded-lg border border-outline-variant/15 p-3"
                >
                  <div className="sm:col-span-5">
                    <label className="text-xs text-on-surface-variant">{t("patients.surgeryProcedure")}</label>
                    <input
                      className="input-field text-sm w-full mt-1"
                      value={row.procedure || ""}
                      onChange={(e) =>
                        setSurgeries((s) =>
                          s.map((r, j) => (j === i ? { ...r, procedure: e.target.value } : r)),
                        )
                      }
                      disabled={submitting}
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label className="text-xs text-on-surface-variant">{t("patients.surgeryFacility")}</label>
                    <input
                      className="input-field text-sm w-full mt-1"
                      value={row.facility || ""}
                      onChange={(e) =>
                        setSurgeries((s) =>
                          s.map((r, j) => (j === i ? { ...r, facility: e.target.value } : r)),
                        )
                      }
                      disabled={submitting}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs text-on-surface-variant">{t("patients.surgeryYear")}</label>
                    <input
                      className="input-field text-sm w-full mt-1"
                      inputMode="numeric"
                      value={row.year ?? ""}
                      onChange={(e) =>
                        setSurgeries((s) =>
                          s.map((r, j) => (j === i ? { ...r, year: e.target.value } : r)),
                        )
                      }
                      disabled={submitting}
                    />
                  </div>
                  <div className="sm:col-span-1 flex justify-end">
                    <button
                      type="button"
                      className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high"
                      onClick={() => removeSxRow(i)}
                      disabled={submitting}
                      aria-label={t("patients.removeRow")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary"
                onClick={addSxRow}
                disabled={submitting}
              >
                <Plus className="w-4 h-4" />
                {t("patients.addSurgeryRow")}
              </button>
            </div>
          </FormSection>

          <FormSection title={t("patients.formSectionMedications")}>
            <div className="space-y-3">
              {medications.map((row, i) => (
                <div key={i} className="rounded-lg border border-outline-variant/15 p-3 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Field label={t("patients.medName")}>
                      <input
                        className="input-field text-sm w-full"
                        value={row.name || ""}
                        onChange={(e) =>
                          setMedications((m) =>
                            m.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)),
                          )
                        }
                        disabled={submitting}
                      />
                    </Field>
                    <Field label={t("patients.medDosage")}>
                      <input
                        className="input-field text-sm w-full"
                        value={row.dosage || ""}
                        onChange={(e) =>
                          setMedications((m) =>
                            m.map((r, j) => (j === i ? { ...r, dosage: e.target.value } : r)),
                          )
                        }
                        disabled={submitting}
                      />
                    </Field>
                    <Field label={t("patients.medFrequency")}>
                      <input
                        className="input-field text-sm w-full"
                        value={row.frequency || ""}
                        onChange={(e) =>
                          setMedications((m) =>
                            m.map((r, j) => (j === i ? { ...r, frequency: e.target.value } : r)),
                          )
                        }
                        disabled={submitting}
                      />
                    </Field>
                  </div>
                  <Field label={t("patients.medInstructions")}>
                    <input
                      className="input-field text-sm w-full"
                      value={row.instructions || ""}
                      onChange={(e) =>
                        setMedications((m) =>
                          m.map((r, j) => (j === i ? { ...r, instructions: e.target.value } : r)),
                        )
                      }
                      disabled={submitting}
                    />
                  </Field>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs text-on-surface-variant hover:text-error"
                      onClick={() => removeMedRow(i)}
                      disabled={submitting}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {t("patients.removeRow")}
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary"
                onClick={addMedRow}
                disabled={submitting}
              >
                <Plus className="w-4 h-4" />
                {t("patients.addMedicationRow")}
              </button>
            </div>
          </FormSection>

          <FormSection title={t("patients.formSectionEmergency")}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("patients.contactType")}>
                <select
                  className="input-field text-sm w-full"
                  value={ecContactType}
                  onChange={(e) => setEcContactType(e.target.value)}
                  disabled={submitting}
                >
                  <option value="emergency">emergency</option>
                  <option value="family">family</option>
                  <option value="doctor">doctor</option>
                  <option value="nurse">nurse</option>
                </select>
              </Field>
              <Field label={t("patients.ecEmail")}>
                <input
                  className="input-field text-sm w-full"
                  type="email"
                  value={ecEmail}
                  onChange={(e) => setEcEmail(e.target.value)}
                  disabled={submitting}
                />
              </Field>
              <Field label={t("patients.ecName")}>
                <input
                  className="input-field text-sm w-full"
                  value={ecName}
                  onChange={(e) => setEcName(e.target.value)}
                  disabled={submitting}
                />
              </Field>
              <Field label={t("patients.ecRelationship")}>
                <input
                  className="input-field text-sm w-full"
                  placeholder={t("patients.ecRelationshipPlaceholder")}
                  value={ecRelationship}
                  onChange={(e) => setEcRelationship(e.target.value)}
                  disabled={submitting}
                />
              </Field>
              <Field label={t("patients.ecPhone")}>
                <input
                  className="input-field text-sm w-full"
                  type="tel"
                  value={ecPhone}
                  onChange={(e) => setEcPhone(e.target.value)}
                  disabled={submitting}
                />
              </Field>
              <Field label={t("patients.contactNotes")} className="sm:col-span-2">
                <textarea
                  className="input-field text-sm w-full min-h-[56px]"
                  value={ecNotes}
                  onChange={(e) => setEcNotes(e.target.value)}
                  disabled={submitting}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title={t("patients.formSectionNotes")}>
            <textarea
              className="input-field text-sm w-full min-h-[80px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={submitting}
            />
          </FormSection>

          {formError && (
            <p className="text-sm text-error" role="alert">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-outline-variant/15">
            <button
              type="button"
              className="px-4 py-2 rounded-xl text-sm font-medium border border-outline-variant/30 text-on-surface"
              onClick={handleClose}
              disabled={submitting}
            >
              {t("patients.createCancel")}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-sm font-semibold gradient-cta disabled:opacity-50"
            >
              {submitting ? "…" : t("patients.saveChanges")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold text-on-surface border-b border-outline-variant/15 pb-2">
        {title}
      </h4>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-xs text-on-surface-variant block mb-1">{label}</label>
      {children}
    </div>
  );
}
