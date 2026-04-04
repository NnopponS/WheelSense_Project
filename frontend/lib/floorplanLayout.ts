export type FloorplanRoomShape = {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  device_id: number | null;
  power_kw: number | null;
};

export interface FloorplanLayoutResponse {
  facility_id: number;
  floor_id: number;
  layout_json: {
    version?: number;
    rooms?: Array<{
      id: string;
      label?: string;
      x: number;
      y: number;
      w: number;
      h: number;
      device_id?: number | null;
      power_kw?: number | null;
    }>;
  };
  updated_at: string | null;
}

export function normalizeFloorplanRooms(
  raw: FloorplanLayoutResponse["layout_json"] | undefined,
): FloorplanRoomShape[] {
  const rooms = raw?.rooms;
  if (!Array.isArray(rooms)) return [];
  return rooms.map((r) => ({
    id: String(r.id),
    label: r.label ?? "Room",
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    device_id: r.device_id ?? null,
    power_kw: r.power_kw ?? null,
  }));
}

/** When saved layout has no rooms yet, place boxes from workspace rooms on this floor (matches seed_demo grid). */
export function bootstrapRoomsFromDbFloor(
  floorRooms: Array<{ id: number; name: string }>,
): FloorplanRoomShape[] {
  const sorted = [...floorRooms].sort((a, b) => a.id - b.id);
  const cols = 4;
  const gap = 2;
  const w = 22;
  const h = 20;
  return sorted.map((r, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    let x = 2 + (w + gap) * col;
    let y = 2 + (h + gap) * row;
    x = Math.min(x, 100 - w - 0.01);
    y = Math.min(y, 100 - h - 0.01);
    return {
      id: `room-${r.id}`,
      label: r.name,
      x,
      y,
      w,
      h,
      device_id: null,
      power_kw: null,
    };
  });
}
