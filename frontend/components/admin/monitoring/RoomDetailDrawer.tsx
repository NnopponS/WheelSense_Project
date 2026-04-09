"use client";

import { useTranslation } from "@/lib/i18n";
import { X, Pencil } from "lucide-react";
import RoomSmartDevicesPanel from "@/components/admin/monitoring/RoomSmartDevicesPanel";

export interface RoomDetailRoom {
  id: number;
  name: string;
  description: string;
  floor_id: number | null;
  floor_name: string | null;
  floor_number: number | null;
  facility_id: number | null;
  facility_name: string | null;
  room_type: string;
  node_device_id: string | null;
}

export default function RoomDetailDrawer({
  room,
  open,
  onClose,
  onEdit,
}: {
  room: RoomDetailRoom | null;
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  if (!open || !room) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label={t("monitoring.roomForm.close")}
      />
      <aside className="relative z-50 w-full max-w-md h-full surface-card shadow-elevated border-l border-outline-variant/30 overflow-y-auto p-5 animate-fade-in">
        <div className="flex items-start justify-between gap-2 mb-4">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-on-surface truncate">{room.name}</h3>
            <p className="text-xs text-on-surface-variant mt-1">
              {room.facility_name?.trim() || t("monitoring.unassignedFacility")}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              className="p-2 rounded-lg hover:bg-surface-container-low"
              onClick={onEdit}
              aria-label={t("monitoring.roomForm.titleEdit")}
            >
              <Pencil className="w-4 h-4 text-on-surface-variant" />
            </button>
            <button
              type="button"
              className="p-2 rounded-lg hover:bg-surface-container-low"
              onClick={onClose}
              aria-label={t("monitoring.roomForm.close")}
            >
              <X className="w-4 h-4 text-on-surface-variant" />
            </button>
          </div>
        </div>

        <p className="text-sm text-on-surface-variant mb-4">
          {t("monitoring.flow.roomDetail")}
        </p>

        <div className="mb-4 rounded-xl border border-outline-variant/25 bg-surface-container-low/40 px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-on-surface-variant">
            Node link
          </p>
          <p className="mt-1 text-sm font-medium text-on-surface">
            {room.node_device_id?.trim() || "No node linked"}
          </p>
        </div>

        <RoomSmartDevicesPanel roomId={room.id} />
      </aside>
    </div>
  );
}
