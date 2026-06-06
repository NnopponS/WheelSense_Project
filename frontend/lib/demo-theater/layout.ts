import type { UserSearchResult } from "@/lib/api";
import type { DemoActorOut } from "@/lib/api/task-scope-types";
import type { Patient, Room, SmartDevice } from "@/lib/types";

export type DemoTheaterRoomRole =
  | "resident"
  | "nurse_station"
  | "shared_care"
  | "therapy"
  | "dining";

export type DemoTheaterPosition = {
  x: number;
  y: number;
};

export type DemoTheaterRect = DemoTheaterPosition & {
  width: number;
  height: number;
};

export type DemoTheaterSlot = {
  id: string;
  role: DemoTheaterRoomRole;
  fallbackName: string;
  rect: DemoTheaterRect;
  door: "top" | "bottom" | "left" | "right";
};

export type DemoTheaterRoomView = {
  slot: DemoTheaterSlot;
  room: Room | null;
  label: string;
  patients: Patient[];
  devices: SmartDevice[];
  isSelected: boolean;
};

export type DemoTheaterStaffView = {
  user: UserSearchResult;
  room: DemoTheaterRoomView;
  actor: DemoActorOut | null;
};

export const DEMO_THEATER_SLOTS: DemoTheaterSlot[] = [
  { id: "resident-a", role: "resident", fallbackName: "Resident Room A", rect: { x: 3, y: 7, width: 20, height: 23 }, door: "bottom" },
  { id: "resident-b", role: "resident", fallbackName: "Resident Room B", rect: { x: 27, y: 7, width: 20, height: 23 }, door: "bottom" },
  { id: "resident-c", role: "resident", fallbackName: "Resident Room C", rect: { x: 53, y: 7, width: 20, height: 23 }, door: "bottom" },
  { id: "resident-d", role: "resident", fallbackName: "Resident Room D", rect: { x: 77, y: 7, width: 20, height: 23 }, door: "bottom" },
  { id: "therapy", role: "therapy", fallbackName: "Therapy Bay", rect: { x: 3, y: 38, width: 20, height: 22 }, door: "right" },
  { id: "nurse-station", role: "nurse_station", fallbackName: "Nurse Station", rect: { x: 27, y: 38, width: 20, height: 22 }, door: "right" },
  { id: "shared-care", role: "shared_care", fallbackName: "Shared Care", rect: { x: 53, y: 38, width: 20, height: 22 }, door: "left" },
  { id: "dining", role: "dining", fallbackName: "Dining Lounge", rect: { x: 77, y: 38, width: 20, height: 22 }, door: "left" },
  { id: "resident-e", role: "resident", fallbackName: "Resident Room E", rect: { x: 3, y: 69, width: 20, height: 23 }, door: "top" },
  { id: "resident-f", role: "resident", fallbackName: "Resident Room F", rect: { x: 27, y: 69, width: 20, height: 23 }, door: "top" },
  { id: "resident-g", role: "resident", fallbackName: "Resident Room G", rect: { x: 53, y: 69, width: 20, height: 23 }, door: "top" },
  { id: "resident-h", role: "resident", fallbackName: "Resident Room H", rect: { x: 77, y: 69, width: 20, height: 23 }, door: "top" },
];

export const DEMO_THEATER_RESIDENT_SLOT_COUNT = DEMO_THEATER_SLOTS.filter(
  (slot) => slot.role === "resident",
).length;
export const DEMO_THEATER_SLOT_COUNT = DEMO_THEATER_SLOTS.length;

export function rectCenter(rect: DemoTheaterRect): DemoTheaterPosition {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

export function compareRoomsForDemo(a: Room, b: Room): number {
  const floorDelta = (a.floor_number ?? 0) - (b.floor_number ?? 0);
  if (floorDelta !== 0) return floorDelta;
  const aNumber = roomNumber(a.name);
  const bNumber = roomNumber(b.name);
  if (aNumber !== bNumber) return aNumber - bNumber;
  return a.name.localeCompare(b.name);
}

export function buildDemoTheaterRooms(input: {
  rooms: Room[];
  patients: Patient[];
  smartDevices: SmartDevice[];
  selectedPatientId: number | null;
}): DemoTheaterRoomView[] {
  const selectedPatient = input.patients.find((patient) => patient.id === input.selectedPatientId) ?? null;
  const selectedRoomId = selectedPatient?.room_id ?? null;
  const visibleRooms = pickVisibleRooms(input.rooms, input.patients, selectedRoomId);

  return DEMO_THEATER_SLOTS.map((slot, index) => {
    const room = visibleRooms[index] ?? null;
    const patients = room
      ? input.patients.filter((patient) => patient.room_id === room.id)
      : [];
    const devices = room
      ? input.smartDevices.filter((device) => device.room_id === room.id)
      : [];
    return {
      slot,
      room,
      label: room?.name || slot.fallbackName,
      patients,
      devices,
      isSelected: room != null && room.id === selectedRoomId,
    };
  });
}

export function buildDemoTheaterStaff(input: {
  rooms: DemoTheaterRoomView[];
  staffUsers: UserSearchResult[];
  demoActors: DemoActorOut[];
}): DemoTheaterStaffView[] {
  const station = input.rooms.find((room) => room.slot.role === "nurse_station") ?? input.rooms[0];
  const sharedCare = input.rooms.find((room) => room.slot.role === "shared_care") ?? station;
  const staffActors = input.demoActors.filter((actor) => actor.actor_type === "staff" || actor.actor_type === "user");
  const actorByUserId = new Map(staffActors.map((actor) => [actor.actor_id, actor]));
  const userById = new Map(input.staffUsers.map((staff) => [staff.id, staff]));
  const currentStaffUsers = [
    ...input.staffUsers.filter((staff) => staff.is_active),
    ...staffActors
      .filter((actor) => !userById.has(actor.actor_id))
      .map((actor) => ({
        id: actor.actor_id,
        username: `${actor.actor_type}-${actor.actor_id}`,
        role: actor.role ?? "staff",
        is_active: true,
        caregiver_id: null,
        patient_id: null,
        display_name: actor.display_name,
      })),
  ];

  return currentStaffUsers
    .filter((staff) => staff.role !== "patient")
    .map((staff, index) => {
      const actor = actorByUserId.get(staff.id) ?? null;
      const actorRoom = actor?.room_id
        ? input.rooms.find((room) => room.room?.id === actor.room_id)
        : null;
      return {
        user: staff,
        actor,
        room: actorRoom ?? (index < 4 ? station : sharedCare),
      };
    });
}

export function roomOccupancyLabel(room: DemoTheaterRoomView): string {
  if (room.patients.length === 0) return "Available";
  if (room.patients.length === 1) return "1 resident";
  return `${room.patients.length} residents`;
}

function pickVisibleRooms(rooms: Room[], patients: Patient[], selectedRoomId: number | null): Room[] {
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const occupiedRoomIds = new Set(patients.map((patient) => patient.room_id).filter((id): id is number => id != null));
  const occupiedRooms = Array.from(occupiedRoomIds)
    .map((roomId) => roomById.get(roomId))
    .filter((room): room is Room => room != null)
    .sort(compareRoomsForDemo);
  const otherRooms = rooms
    .filter((room) => !occupiedRoomIds.has(room.id))
    .sort(compareRoomsForDemo);
  const selectedRoom = selectedRoomId != null ? roomById.get(selectedRoomId) ?? null : null;
  const ordered = uniqueRooms([selectedRoom, ...occupiedRooms, ...otherRooms]);

  if (ordered.length <= DEMO_THEATER_SLOT_COUNT) return ordered;
  const visible = ordered.slice(0, DEMO_THEATER_SLOT_COUNT);
  if (selectedRoom && !visible.some((room) => room.id === selectedRoom.id)) {
    visible[visible.length - 1] = selectedRoom;
  }
  return uniqueRooms(visible);
}

function uniqueRooms(rooms: Array<Room | null>): Room[] {
  const seen = new Set<number>();
  return rooms.filter((room): room is Room => {
    if (!room || seen.has(room.id)) return false;
    seen.add(room.id);
    return true;
  });
}

function roomNumber(name: string): number {
  const match = name.match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}
