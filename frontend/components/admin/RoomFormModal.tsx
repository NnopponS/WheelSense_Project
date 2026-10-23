"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { getQueryPollingMs, getQueryStaleTimeMs } from "@/lib/queryEndpointDefaults";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api";
import { withWorkspaceScope } from "@/lib/workspaceQuery";
import type { Device, Facility, Floor } from "@/lib/types";
import SearchableListboxPicker, {
  type SearchableListboxOption,
} from "@/components/shared/SearchableListboxPicker";
import { X } from "lucide-react";

const ROOM_FORM_NONE_ID = "__none";

function floorOptionTitle(f: Floor, floorPrefix: string): string {
  return f.name?.trim()
    ? `${f.name} (${floorPrefix} ${f.floor_number})`
    : `${floorPrefix} ${f.floor_number}`;
}

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
  const facilityLabelId = useId();
  const facilityInputId = useId();
  const facilityListboxId = useId();
  const floorLabelId = useId();
  const floorInputId = useId();
  const floorListboxId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [facilityId, setFacilityId] = useState<number | "">("");
  const [floorId, setFloorId] = useState<number | "">("");
  const [typeChoice, setTypeChoice] = useState<(typeof ROOM_TYPE_VALUES)[number] | "other">("general");
  const [typeOther, setTypeOther] = useState("");
  const [nodeDeviceId, setNodeDeviceId] = useState("");
  const [nodeSearch, setNodeSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facilitySearch, setFacilitySearch] = useState("");
  const [floorSearch, setFloorSearch] = useState("");

  const facilitiesEndpoint = useMemo(
    () => (open ? withWorkspaceScope("/facilities", user?.workspace_id) : null),
    [open, user?.workspace_id],
  );
  const { data: facilities, isLoading: facilitiesLoading } = useQuery({
    queryKey: ["admin", "room-form", "facilities", facilitiesEndpoint],
    queryFn: () => api.get<Facility[]>(facilitiesEndpoint!),
    enabled: Boolean(facilitiesEndpoint),
    staleTime: facilitiesEndpoint ? getQueryStaleTimeMs(facilitiesEndpoint) : 0,
    refetchInterval: facilitiesEndpoint ? getQueryPollingMs(facilitiesEndpoint) : false,
    retry: 3,
  });

  const floorsEndpoint = useMemo(() => {
    if (!open || facilityId === "") return null;
    return withWorkspaceScope(`/facilities/${facilityId}/floors`, user?.workspace_id);
  }, [open, facilityId, user?.workspace_id]);
  const { data: floors, isLoading: floorsLoading } = useQuery({
    queryKey: ["admin", "room-form", "floors", floorsEndpoint, facilityId],
    queryFn: () => api.get<Floor[]>(floorsEndpoint!),
    enabled: Boolean(floorsEndpoint),
    staleTime: floorsEndpoint ? getQueryStaleTimeMs(floorsEndpoint) : 0,
    refetchInterval: floorsEndpoint ? getQueryPollingMs(floorsEndpoint) : false,
    retry: 3,
  });
  const devicesEndpoint = useMemo(
    () => (open ? withWorkspaceScope("/devices", user?.workspace_id) : null),
    [open, user?.workspace_id],
  );
  const { data: devices, isLoading: devicesLoading } = useQuery({
    queryKey: ["admin", "room-form", "devices", devicesEndpoint],
    queryFn: () => api.get<Device[]>(devicesEndpoint!),
    enabled: Boolean(devicesEndpoint),
    staleTime: devicesEndpoint ? getQueryStaleTimeMs(devicesEndpoint) : 0,
    refetchInterval: devicesEndpoint ? getQueryPollingMs(devicesEndpoint) : false,
    retry: 3,
  });

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
    setFacilitySearch("");
    setFloorSearch("");
    setNodeSearch("");
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

  const floorPrefix = t("monitoring.floorPrefix");

  const { facilityOptions, facilityEmptyNoMatch } = useMemo(() => {
    const q = facilitySearch.trim().toLowerCase();
    const noneTitle = t("monitoring.roomForm.noFacility");
    const noneMatches =
      !q || noneTitle.toLowerCase().includes(q) || q === "none";
    const list = facilities ?? [];
    const filtered = !q
      ? list
      : list.filter(
          (f) =>
            f.name.toLowerCase().includes(q) || String(f.id).includes(q),
        );
    const opts: SearchableListboxOption[] = [];
    if (noneMatches) {
      opts.push({ id: ROOM_FORM_NONE_ID, title: noneTitle });
    }
    opts.push(
      ...filtered.map((f) => ({
        id: String(f.id),
        title: f.name,
        subtitle: `#${f.id}`,
      })),
    );
    const emptyNoMatch =
      !facilitiesLoading &&
      facilitySearch.trim().length > 0 &&
      opts.length === 0;
    return { facilityOptions: opts, facilityEmptyNoMatch: emptyNoMatch };
  }, [facilities, facilitySearch, facilitiesLoading, t]);

  const facilityEmptyPool =
    !facilitiesLoading && (facilities?.length ?? 0) === 0;

  const { floorOptions, floorEmptyNoMatch } = useMemo(() => {
    if (facilityId === "") {
      return {
        floorOptions: [] as SearchableListboxOption[],
        floorEmptyNoMatch: false,
      };
    }
    const q = floorSearch.trim().toLowerCase();
    const noneTitle = t("monitoring.roomForm.noFloor");
    const noneMatches =
      !q || noneTitle.toLowerCase().includes(q) || q === "none";
    const list = floors ?? [];
    const filtered = !q
      ? list
      : list.filter((f) => {
          const title = floorOptionTitle(f, floorPrefix).toLowerCase();
          return (
            title.includes(q) ||
            String(f.floor_number).includes(q) ||
            String(f.id).includes(q) ||
            (f.name?.trim().toLowerCase().includes(q) ?? false)
          );
        });
    const opts: SearchableListboxOption[] = [];
    if (noneMatches) {
      opts.push({ id: ROOM_FORM_NONE_ID, title: noneTitle });
    }
    opts.push(
      ...filtered.map((f) => ({
        id: String(f.id),
        title: floorOptionTitle(f, floorPrefix),
        subtitle: `#${f.id}`,
      })),
    );
    const emptyNoMatch =
      !floorsLoading &&
      floorSearch.trim().length > 0 &&
      opts.length === 0;
    return { floorOptions: opts, floorEmptyNoMatch: emptyNoMatch };
  }, [
    facilityId,
    floors,
    floorSearch,
    floorsLoading,
    floorPrefix,
    t,
  ]);

  const floorNoFloorsYet =
    facilityId !== "" &&
    !floorsLoading &&
    (floors?.length ?? 0) === 0;

  const nodeDeviceOptions = useMemo(() => {
    const pool = (devices ?? []).filter((device) => device.hardware_type === "node");
    const q = nodeSearch.trim().toLowerCase();
    const filtered = !q
      ? pool
      : pool.filter((device) => {
          const title = (device.display_name || device.device_id).toLowerCase();
          return (
            title.includes(q) ||
            device.device_id.toLowerCase().includes(q) ||
            (device.device_type || "").toLowerCase().includes(q)
          );
        });
    return filtered.map((device) => ({
      id: device.device_id,
      title: device.display_name?.trim() || device.device_id,
      subtitle: `${device.device_id}${device.device_type ? ` · ${device.device_type}` : ""}`,
    }));
  }, [devices, nodeSearch]);

  const nodeEmptyNoMatch =
    !devicesLoading && nodeSearch.trim().length > 0 && nodeDeviceOptions.length === 0;
  const nodeEmptyPool =
    !devicesLoading &&
    (devices?.filter((device) => device.hardware_type === "node").length ?? 0) === 0;

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
          <h3 id={titleId} className="text-lg font-semibold text-foreground">
            {mode === "create" ? t("monitoring.roomForm.titleCreate") : t("monitoring.roomForm.titleEdit")}
          </h3>
          <button
            type="button"
            className="p-2 rounded-lg hover:bg-surface-container-low text-foreground-variant"
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
            <label htmlFor="room-name" className="text-xs font-medium text-foreground-variant">
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
            <label htmlFor="room-desc" className="text-xs font-medium text-foreground-variant">
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
            <label
              id={facilityLabelId}
              htmlFor={facilityInputId}
              className="text-xs font-medium text-foreground-variant"
            >
              {t("monitoring.roomForm.facility")}
            </label>
            <div className="mt-1">
              <SearchableListboxPicker
                inputId={facilityInputId}
                listboxId={facilityListboxId}
                ariaLabelledBy={facilityLabelId}
                options={facilityOptions}
                search={facilitySearch}
                onSearchChange={setFacilitySearch}
                searchPlaceholder={t("monitoring.roomForm.searchFacility")}
                selectedOptionId={
                  facilityId === "" ? ROOM_FORM_NONE_ID : String(facilityId)
                }
                onSelectOption={(id) => {
                  if (id === ROOM_FORM_NONE_ID) {
                    setFacilityId("");
                    setFloorId("");
                  } else {
                    setFacilityId(Number(id));
                    setFloorId("");
                  }
                  setFacilitySearch("");
                  setFloorSearch("");
                }}
                disabled={facilitiesLoading}
                listboxAriaLabel={t("monitoring.roomForm.selectFacility")}
                noMatchMessage={t("monitoring.roomForm.noFacilityMatchesSearch")}
                emptyNoMatch={facilityEmptyNoMatch}
                listPresentation="portal"
                listboxZIndex={160}
              />
            </div>
            {facilityEmptyPool ? (
              <p className="text-xs text-foreground-variant mt-1">
                {t("monitoring.roomForm.addFacilityFirst")}
              </p>
            ) : null}
          </div>

          <div>
            <label
              id={floorLabelId}
              htmlFor={floorInputId}
              className="text-xs font-medium text-foreground-variant"
            >
              {t("monitoring.roomForm.floor")}
            </label>
            <div className="mt-1">
              <SearchableListboxPicker
                inputId={floorInputId}
                listboxId={floorListboxId}
                ariaLabelledBy={floorLabelId}
                options={floorOptions}
                search={floorSearch}
                onSearchChange={setFloorSearch}
                searchPlaceholder={t("monitoring.roomForm.searchFloor")}
                selectedOptionId={
                  floorId === "" ? ROOM_FORM_NONE_ID : String(floorId)
                }
                onSelectOption={(id) => {
                  if (id === ROOM_FORM_NONE_ID) {
                    setFloorId("");
                  } else {
                    setFloorId(Number(id));
                  }
                  setFloorSearch("");
                }}
                disabled={facilityId === "" || floorsLoading}
                listboxAriaLabel={t("monitoring.roomForm.selectFloor")}
                noMatchMessage={t("monitoring.roomForm.noFloorMatchesSearch")}
                emptyNoMatch={floorEmptyNoMatch}
                listPresentation="portal"
                listboxZIndex={160}
              />
            </div>
            {floorNoFloorsYet ? (
              <p className="text-xs text-foreground-variant mt-1">
                {t("monitoring.roomForm.noFloorsInBuilding")}
              </p>
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
            <label htmlFor="room-type" className="text-xs font-medium text-foreground-variant">
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
            <label htmlFor="room-node" className="text-xs font-medium text-foreground-variant">
              {t("monitoring.roomForm.nodeDevice")}
            </label>
            <div className="mt-1">
              <SearchableListboxPicker
                inputId="room-node"
                listboxId="room-node-listbox"
                options={nodeDeviceOptions}
                search={nodeSearch}
                onSearchChange={setNodeSearch}
                searchPlaceholder={t("floorplan.searchNodeDevice")}
                selectedOptionId={nodeDeviceId || null}
                onSelectOption={(id) => {
                  setNodeDeviceId(id);
                  setNodeSearch("");
                }}
                disabled={devicesLoading || nodeEmptyPool}
                listboxAriaLabel={t("floorplan.selectNodeDevice")}
                noMatchMessage={t("floorplan.noNodeDeviceMatches")}
                emptyNoMatch={nodeEmptyNoMatch}
                listPresentation="portal"
                listboxZIndex={160}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline disabled:text-foreground-variant disabled:no-underline"
                disabled={!nodeDeviceId}
                onClick={() => {
                  setNodeDeviceId("");
                  setNodeSearch("");
                }}
              >
                {t("floorplan.noNode")}
              </button>
              {nodeEmptyPool ? (
                <span className="text-xs text-foreground-variant">{t("floorplan.noDevicesInCategory")}</span>
              ) : null}
            </div>
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
