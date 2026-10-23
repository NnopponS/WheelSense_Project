import type { PatientOut } from "@/lib/api/task-scope-types";
import type { Room } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n";

/** Map room id → room row for alert tables (sync lookup). */
export function buildRoomByIdMap(rooms: Room[]): Map<number, Room> {
  return new Map(rooms.map((r) => [r.id, r]));
}

/**
 * One-line facility / floor / room label for a patient row in alert queues.
 */
export function formatPatientRoomLine(
  patient: PatientOut | null | undefined,
  roomById: Map<number, Room>,
  t: (key: TranslationKey) => string,
): string {
  if (!patient) return "";
  if (patient.room_id == null) return t("patients.noRoom");
  const room = roomById.get(patient.room_id);
  if (!room) {
    return `${t("patients.roomDetailsUnavailable")} (#${patient.room_id})`;
  }
  const name = room.name?.trim() || `Room #${room.id}`;
  const loc = [room.facility_name, room.floor_name].filter(Boolean).join(" · ");
  return loc ? `${name} · ${loc}` : name;
}
