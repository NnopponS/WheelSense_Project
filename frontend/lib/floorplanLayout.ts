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
