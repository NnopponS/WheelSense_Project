import type { Room } from "@/lib/types";

/** Single-line label for patient room in QuickInfo cards (aligned with admin patient detail). */
export function patientRoomQuickInfoValue(params: {
  roomId: number | null | undefined;
  room: Room | undefined;
  isLoading: boolean;
  t: (key: string) => string;
}): string {
  const { roomId, room, isLoading, t } = params;
  if (roomId == null) return t("patients.noRoom");
  if (isLoading) return t("common.loading");
  if (room) {
    const name = room.name?.trim() || `Room #${room.id}`;
    const loc = [room.facility_name, room.floor_name].filter(Boolean).join(" · ");
    return loc ? `${name} · ${loc}` : name;
  }
  return `#${roomId} — ${t("patients.roomDetailsUnavailable")}`;
}
