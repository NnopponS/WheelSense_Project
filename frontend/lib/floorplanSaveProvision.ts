import type { FloorplanRoomShape } from "@/lib/floorplanLayout";
import type { FloorRoomRef } from "@/lib/floorplanRoomResolve";
import { resolveLayoutShapeToFloorRoomId } from "@/lib/floorplanRoomResolve";
import type { Device } from "@/lib/types";

/**
 * Before PUT /floorplans/layout, ensure each shape's numeric `device_id` matches the
 * registry row for `node_device_id`. If the node key is not registered, clear `device_id`
 * so we do not send a stale PK from another node (backend validates device_id per shape).
 */
export function alignFloorplanShapesToRegistryDevices(
  shapes: FloorplanRoomShape[],
  devices: Device[],
): FloorplanRoomShape[] {
  return shapes.map((s) => {
    const node = s.node_device_id != null ? String(s.node_device_id).trim() : "";
    if (!node) {
      return s;
    }
    const dev = devices.find((d) => d.device_id === node);
    if (dev) {
      return { ...s, device_id: dev.id };
    }
    return { ...s, device_id: null };
  });
}

/**
 * For floorplan shapes that have a node + label but no matching facility room row,
 * create a workspace room (POST /rooms) so layout save can persist node links and
 * admin room pickers list the room.
 */
export async function provisionRoomsForUnmappedFloorplanNodes(
  postRoom: (body: Record<string, unknown>) => Promise<{ id: number; name: string }>,
  shapes: FloorplanRoomShape[],
  baseRefs: FloorRoomRef[],
  floorId: number,
): Promise<{ workingShapes: FloorplanRoomShape[]; mergedRefs: FloorRoomRef[] }> {
  const extra: FloorRoomRef[] = [];
  const working = shapes.map((s) => ({ ...s }));

  for (let i = 0; i < working.length; i += 1) {
    const shape = working[i];
    const node = shape.node_device_id != null ? String(shape.node_device_id).trim() : "";
    const label = shape.label?.trim() ?? "";
    if (!node || !label) continue;

    const merged = [...baseRefs, ...extra];
    if (resolveLayoutShapeToFloorRoomId(shape, merged) != null) continue;

    const created = await postRoom({
      name: label.slice(0, 64),
      description: "",
      floor_id: floorId,
      room_type: "general",
      node_device_id: node,
    });
    extra.push({ id: created.id, name: created.name });
    working[i] = { ...shape, id: `room-${created.id}`, label: created.name };
  }

  return { workingShapes: working, mergedRefs: [...baseRefs, ...extra] };
}
