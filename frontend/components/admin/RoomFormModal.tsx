"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { useQuery } from "@/hooks/useQuery";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api";
import { withWorkspaceScope } from "@/lib/workspaceQuery";
import type { Facility, Floor } from "@/lib/types";
import { X } from "lucide-react";

const ROOM_TYPE_KEYS: TranslationKey[] = [
  "monitoring.roomTypes.general",
  "monitoring.roomTypes.bedroom",
  "monitoring.roomTypes.bathroom",
  "monitoring.roomTypes.dining",
  "monitoring.roomTypes.therapy",
  "monitoring.roomTypes.outdoor",
];

const ROOM_TYPE_VALUES = ["general", "bedroom", "bathroom", "dining", "therapy", "outdoor"] as const;

function isPresetRoomType(v: string): v is (typeof ROOM_TYPE_VALUES)[number] {
  return (ROOM_TYPE_VALUES as readonly string[]).includes(v);
}

export interface RoomFormRoom {
  id: number;
  name: string;
  description: string;
  floor_id: number | null;
  facility_id: number | null;
  room_type: string;
  node_device_id: string | null;
}

type Mode = "create" | "edit";

export default function RoomFormModal({
  open,
  mode,
  room,
  defaultFacilityId,
  defaultFloorId,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: Mode;
  room: RoomFormRoom | null;
  /** When creating, pre-select building / floor from monitoring flow */
  defaultFacilityId?: number | null;
  defaultFloorId?: number | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const titleId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [facilityId, setFacilityId] = useState<number | "">("");
  const [floorId, setFloorId] = useState<number | "">("");
  const [typeChoice, setTypeChoice] = useState<(typeof ROOM_TYPE_VALUES)[number] | "other">("general");
  const [typeOther, setTypeOther] = useState("");
  const [nodeDeviceId, setNodeDeviceId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const facilitiesEndpoint = useMemo(
    () => (open ? withWorkspaceScope("/facilities", user?.workspace_id) : null),
    [open, user?.workspace_id],
  );
  const { data: facilities, isLoading: facilitiesLoading } = useQuery<Facility[]>(
    facilitiesEndpoint,
  );

  const floorsEndpoint = useMemo(() => {
    if (!open || facilityId === "") return null;
    return withWorkspaceScope(`/facilities/${facilityId}/floors`, user?.workspace_id);
  }, [open, facilityId, user?.workspace_id]);
  const { data: floors, isLoading: floorsLoading } = useQuery<Floor[]>(floorsEndpoint);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && room) {
      setName(room.name);
      setDescription(room.description ?? "");
      setFacilityId(room.facility_id ?? "");
      setFloorId(room.floor_id ?? "");
      const rt = room.room_type?.trim() || "general";
      if (isPresetRoomType(rt)) {
        setTypeChoice(rt);
        setTypeOther("");
      } else {
        setTypeChoice("other");
        setTypeOther(rt);
      }
      setNodeDeviceId(room.node_device_id ?? "");
    } else if (mode === "create") {
      setName("");
      setDescription("");
      setFacilityId(defaultFacilityId ?? "");
      setFloorId(defaultFloorId ?? "");
      setTypeChoice("general");
      setTypeOther("");
      setNodeDeviceId("");
    }
    setError(null);
  }, [open, mode, room, defaultFacilityId, defaultFloorId]);

  useEffect(() => {
    if (!open) return;
    const tmr = requestAnimationFrame(() => nameInputRef.current?.focus());
    return () => cancelAnimationFrame(tmr);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleFacilityChange = useCallback((value: string) => {
    if (value === "") {
      setFacilityId("");
      setFloorId("");
      return;
    }
    setFacilityId(Number(value));
    setFloorId("");
  }, []);

  const submit = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("monitoring.roomForm.nameRequired"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const floorPayload = facilityId === "" ? null : floorId === "" ? null : Number(floorId);
      const nodePayload = nodeDeviceId.trim() === "" ? null : nodeDeviceId.trim();
      const resolvedType =
        typeChoice === "other" ? typeOther.trim() || "general" : typeChoice;

      if (mode === "create") {
        await api.post("/rooms", {
          name: trimmed,
          description: description.trim(),
          floor_id: floorPayload,
          room_type: resolvedType,
          node_device_id: nodePayload,
        });
      } else if (room) {
        await api.patch(`/rooms/${room.id}`, {
          name: trimmed,
          description: description.trim(),
          floor_id: floorPayload,
          room_type: resolvedType,
          node_device_id: nodePayload,
        });
      }
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("monitoring.roomForm.saveFailed"));
    } finally {
      setSubmitting(false);
    }
  }, [
    name,
    description,
    facilityId,
    floorId,
    typeChoice,
    typeOther,
    nodeDeviceId,
    mode,
    room,
    onClose,
    onSaved,
    t,
  ]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="surface-card w-full max-w-md max-h-[min(90vh,640px)] overflow-y-auto shadow-elevated rounded-2xl p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 id={titleId} className="text-lg font-semibold text-on-surface">
            {mode === "create" ? t("monitoring.roomForm.titleCreate") : t("monitoring.roomForm.titleEdit")}
          </h3>
          <button
            type="button"
            className="p-2 rounded-lg hover:bg-surface-container-low text-on-surface-variant"
            onClick={onClose}
            aria-label={t("monitoring.roomForm.close")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div>
            <label htmlFor="room-name" className="text-xs font-medium text-on-surface-variant">
              {t("monitoring.roomForm.name")}
            </label>
            <input
              ref={nameInputRef}
              id="room-name"
              className="input-field mt-1 w-full text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="room-desc" className="text-xs font-medium text-on-surface-variant">
              {t("monitoring.roomForm.description")}
            </label>
            <textarea
              id="room-desc"
              className="input-field mt-1 w-full text-sm min-h-[72px] resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="room-facility" className="text-xs font-medium text-on-surface-variant">
              {t("monitoring.roomForm.facility")}
            </label>
            <select
              id="room-facility"
              className="input-field mt-1 w-full text-sm"
              value={facilityId === "" ? "" : String(facilityId)}
              onChange={(e) => handleFacilityChange(e.target.value)}
              disabled={facilitiesLoading}
            >
              <option value="">{t("monitoring.roomForm.noFacility")}</option>
              {(facilities ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            {!facilitiesLoading && facilities?.length === 0 ? (
              <p className="text-xs text-on-surface-variant mt-1">{t("monitoring.roomForm.addFacilityFirst")}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="room-floor" className="text-xs font-medium text-on-surface-variant">
              {t("monitoring.roomForm.floor")}
            </label>
            <select
              id="room-floor"
              className="input-field mt-1 w-full text-sm"
              value={floorId === "" ? "" : String(floorId)}
              onChange={(e) => setFloorId(e.target.value === "" ? "" : Number(e.target.value))}
              disabled={facilityId === "" || floorsLoading}
            >
              <option value="">{t("monitoring.roomForm.noFloor")}</option>
              {(floors ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name?.trim()
                    ? `${f.name} (${t("monitoring.floorPrefix")} ${f.floor_number})`
                    : `${t("monitoring.floorPrefix")} ${f.floor_number}`}
                </option>
              ))}
            </select>
            {facilityId !== "" && !floorsLoading && floors?.length === 0 ? (
              <p className="text-xs text-on-surface-variant mt-1">{t("monitoring.roomForm.noFloorsInBuilding")}</p>
            ) : null}
            {mode === "edit" &&
            room?.floor_id &&
            facilityId !== "" &&
            !floorsLoading &&
            floors &&
            floors.length > 0 &&
            !floors.some((f) => f.id === room.floor_id) ? (
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                {t("monitoring.roomForm.floorMismatch")}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="room-type" className="text-xs font-medium text-on-surface-variant">
              {t("monitoring.roomForm.roomType")}
            </label>
            <select
              id="room-type"
              className="input-field mt-1 w-full text-sm"
              value={typeChoice}
              onChange={(e) =>
                setTypeChoice(
                  e.target.value === "other"
                    ? "other"
                    : (e.target.value as (typeof ROOM_TYPE_VALUES)[number]),
                )
              }
            >
              {ROOM_TYPE_VALUES.map((val, i) => (
                <option key={val} value={val}>
                  {t(ROOM_TYPE_KEYS[i])}
                </option>
              ))}
              <option value="other">{t("monitoring.roomTypes.other")}</option>
            </select>
            {typeChoice === "other" ? (
              <input
                className="input-field mt-2 w-full text-sm"
                value={typeOther}
                onChange={(e) => setTypeOther(e.target.value)}
                placeholder={t("monitoring.roomForm.customTypePlaceholder")}
              />
            ) : null}
          </div>

          <div>
            <label htmlFor="room-node" className="text-xs font-medium text-on-surface-variant">
              {t("monitoring.roomForm.nodeDevice")}
            </label>
            <input
              id="room-node"
              className="input-field mt-1 w-full text-sm font-mono"
              value={nodeDeviceId}
              onChange={(e) => setNodeDeviceId(e.target.value)}
              placeholder={t("monitoring.roomForm.nodePlaceholder")}
            />
          </div>

          {error ? <p className="text-sm text-error">{error}</p> : null}

          <div className="flex flex-wrap gap-2 justify-end pt-2">
            <button
              type="button"
              className="px-4 py-2 rounded-xl text-sm font-medium border border-outline-variant/40 hover:bg-surface-container-low"
              onClick={onClose}
              disabled={submitting}
            >
              {t("monitoring.roomForm.cancel")}
            </button>
            <button
              type="submit"
              className="gradient-cta px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
              disabled={submitting}
            >
              {submitting ? "…" : mode === "create" ? t("monitoring.roomForm.create") : t("monitoring.roomForm.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
