import type { Patient, Room, SmartDevice } from "@/lib/types";
import {
  buildDemoTheaterRooms,
  buildDemoTheaterStaff,
  DEMO_THEATER_SLOT_COUNT,
  roomOccupancyLabel,
} from "./layout";

function room(id: number, name: string): Room {
  return {
    id,
    name,
    adjacent_rooms: [],
    config: {},
    description: "",
    floor_id: null,
    node_device_id: null,
    room_type: "resident",
  };
}

function patient(id: number, roomId: number, nickname = `Patient ${id}`): Patient {
  return {
    id,
    workspace_id: 1,
    first_name: nickname,
    last_name: "",
    nickname,
    date_of_birth: null,
    gender: "unknown",
    height_cm: null,
    weight_kg: null,
    blood_type: "",
    photo_url: null,
    medical_conditions: [],
    allergies: [],
    medications: [],
    past_surgeries: [],
    care_level: "normal",
    mobility_type: "wheelchair",
    current_mode: "normal",
    notes: "",
    admitted_at: "",
    is_active: true,
    room_id: roomId,
    created_at: "",
  };
}

describe("demo theater layout", () => {
  it("shows the selected patient room even when there are more rooms than slots", () => {
    const rooms = Array.from({ length: DEMO_THEATER_SLOT_COUNT + 4 }, (_, index) =>
      room(index + 1, `Room ${String(401 + index)}`),
    );
    const selected = patient(99, rooms[rooms.length - 1].id, "Sam");

    const theaterRooms = buildDemoTheaterRooms({
      rooms,
      patients: [selected],
      smartDevices: [],
      selectedPatientId: selected.id,
    });

    const visibleRoomIds = theaterRooms.map((theaterRoom) => theaterRoom.room?.id);

    expect(visibleRoomIds).toContain(selected.room_id);
    expect(theaterRooms.find((theaterRoom) => theaterRoom.isSelected)?.patients).toContain(selected);
  });

  it("uses every theater slot for current system rooms before falling back to static service labels", () => {
    const rooms = Array.from({ length: DEMO_THEATER_SLOT_COUNT }, (_, index) =>
      room(index + 1, `Room ${String(401 + index)}`),
    );

    const theaterRooms = buildDemoTheaterRooms({
      rooms,
      patients: [],
      smartDevices: [],
      selectedPatientId: null,
    });

    expect(theaterRooms.map((theaterRoom) => theaterRoom.label)).toEqual(rooms.map((visibleRoom) => visibleRoom.name));
  });

  it("groups patients and smart devices by the visible resident room", () => {
    const room401 = room(401, "Room 401");
    const room402 = room(402, "Room 402");
    const devices = [
      { id: 1, room_id: room401.id, is_active: true, name: "Room 401 Light" },
      { id: 2, room_id: room402.id, is_active: true, name: "Room 402 Fan" },
    ] as SmartDevice[];

    const theaterRooms = buildDemoTheaterRooms({
      rooms: [room402, room401],
      patients: [patient(1, room401.id, "Emika"), patient(2, room401.id, "Krit")],
      smartDevices: devices,
      selectedPatientId: 1,
    });

    const selectedRoom = theaterRooms.find((theaterRoom) => theaterRoom.isSelected);

    expect(selectedRoom?.label).toBe("Room 401");
    expect(selectedRoom?.patients).toHaveLength(2);
    expect(selectedRoom?.devices.map((device) => device.name)).toEqual(["Room 401 Light"]);
    expect(roomOccupancyLabel(selectedRoom!)).toBe("2 residents");
  });

  it("places active staff in actor rooms and keeps admin visible as part of the current cast", () => {
    const theaterRooms = buildDemoTheaterRooms({
      rooms: [room(401, "Room 401")],
      patients: [],
      smartDevices: [],
      selectedPatientId: null,
    });
    const staff = [
      { id: 10, username: "observer", role: "observer", is_active: true, display_name: "Helen Brooks" },
      { id: 11, username: "admin", role: "admin", is_active: true, display_name: "Admin" },
    ];

    const staffViews = buildDemoTheaterStaff({
      rooms: theaterRooms,
      staffUsers: staff,
      demoActors: [{ actor_type: "staff", actor_id: 10, display_name: "Helen Brooks", room_id: 401, source: "manual" }],
    });

    expect(staffViews).toHaveLength(2);
    expect(staffViews[0].room.label).toBe("Room 401");
    expect(staffViews[1].user.display_name).toBe("Admin");
    expect(staffViews[1].room.slot.role).toBe("nurse_station");
  });

  it("includes staff actors from demo state even when they are not returned by user search", () => {
    const theaterRooms = buildDemoTheaterRooms({
      rooms: [room(401, "Room 401")],
      patients: [],
      smartDevices: [],
      selectedPatientId: null,
    });

    const staffViews = buildDemoTheaterStaff({
      rooms: theaterRooms,
      staffUsers: [],
      demoActors: [{ actor_type: "staff", actor_id: 77, display_name: "Ada Morgan", role: "admin", room_id: 401, source: "seed" }],
    });

    expect(staffViews).toHaveLength(1);
    expect(staffViews[0].user.display_name).toBe("Ada Morgan");
    expect(staffViews[0].room.label).toBe("Room 401");
  });
});
