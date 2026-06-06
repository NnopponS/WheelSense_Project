import type { Room } from "@/lib/types";

export type PhysicalModelRoomAlias = "Bedroom" | "Living Room" | "Bathroom" | "Kitchen / Dining";

export type PhysicalModelRoomMapping = {
  alias: PhysicalModelRoomAlias;
  physicalZone: "bedroom" | "living_room" | "bathroom" | "kitchen";
  sourceRoomNames: string[];
  deviceKinds: string[];
};

export const PHYSICAL_MODEL_ROOM_MAPPINGS: PhysicalModelRoomMapping[] = [
  {
    alias: "Bedroom",
    physicalZone: "bedroom",
    sourceRoomNames: ["Room 401"],
    deviceKinds: ["light", "fan", "climate", "aircon", "switch"],
  },
  {
    alias: "Living Room",
    physicalZone: "living_room",
    sourceRoomNames: ["Room 402"],
    deviceKinds: ["light", "fan", "climate", "aircon", "tv", "switch"],
  },
  {
    alias: "Bathroom",
    physicalZone: "bathroom",
    sourceRoomNames: ["Bathroom"],
    deviceKinds: ["light", "switch"],
  },
  {
    alias: "Kitchen / Dining",
    physicalZone: "kitchen",
    sourceRoomNames: ["Dining Room"],
    deviceKinds: ["light", "fan", "switch"],
  },
];

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/[_-]/g, " ");
}

export function getPhysicalModelMappingForRoomName(roomName: string | null | undefined) {
  const target = normalize(roomName);
  if (!target) return null;
  return (
    PHYSICAL_MODEL_ROOM_MAPPINGS.find((mapping) => {
      if (normalize(mapping.alias) === target) return true;
      if (normalize(mapping.physicalZone) === target) return true;
      return mapping.sourceRoomNames.some((name) => normalize(name) === target);
    }) ?? null
  );
}

export function getPhysicalModelMappingForRoom(room: Pick<Room, "name"> | null | undefined) {
  return getPhysicalModelMappingForRoomName(room?.name);
}

export function buildPhysicalModelRooms(rooms: Room[]) {
  return PHYSICAL_MODEL_ROOM_MAPPINGS.map((mapping) => ({
    ...mapping,
    room:
      rooms.find((room) =>
        mapping.sourceRoomNames.some((name) => normalize(name) === normalize(room.name)),
      ) ?? null,
  }));
}
