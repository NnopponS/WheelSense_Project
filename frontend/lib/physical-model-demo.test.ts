import type { Room } from "@/lib/types";
import {
  buildPhysicalModelRooms,
  getPhysicalModelMappingForRoomName,
  PHYSICAL_MODEL_ROOM_MAPPINGS,
} from "./physical-model-demo";

function room(id: number, name: string): Room {
  return {
    id,
    name,
    adjacent_rooms: [],
    config: {},
    description: "",
    floor_id: null,
    node_device_id: null,
    room_type: "general",
  };
}

describe("physical model demo mapping", () => {
  it("maps the physical model aliases onto current WheelSense rooms", () => {
    expect(getPhysicalModelMappingForRoomName("Room 401")?.alias).toBe("Bedroom");
    expect(getPhysicalModelMappingForRoomName("Room 402")?.alias).toBe("Living Room");
    expect(getPhysicalModelMappingForRoomName("Bathroom")?.alias).toBe("Bathroom");
    expect(getPhysicalModelMappingForRoomName("Dining Room")?.alias).toBe("Kitchen / Dining");
  });

  it("keeps the deterministic 4-room demo order", () => {
    const rooms = [
      room(401, "Room 401"),
      room(402, "Room 402"),
      room(10, "Bathroom"),
      room(11, "Dining Room"),
    ];

    const mapped = buildPhysicalModelRooms(rooms);

    expect(mapped).toHaveLength(4);
    expect(mapped.map((item) => item.alias)).toEqual(PHYSICAL_MODEL_ROOM_MAPPINGS.map((item) => item.alias));
    expect(mapped.map((item) => item.room?.name)).toEqual([
      "Room 401",
      "Room 402",
      "Bathroom",
      "Dining Room",
    ]);
  });
});
