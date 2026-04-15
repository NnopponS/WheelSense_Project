/**
 * Map floorplan canvas shapes (layout_json) to DB room rows for the selected floor.
 * Layout labels are free text; DB names may be "Room 104" while the canvas shows "104".
 */

import { floorplanRoomIdToNumeric } from "@/lib/monitoringWorkspace";

export function normalizeRoomLabelForMatch(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Trailing digits in a room name, e.g. "Room 104" -> "104", "ห้อง 12" -> "12". */
export function trailingDigitsFromRoomName(name: string | null | undefined): string | null {
  const m = /(\d+)\s*$/.exec(String(name ?? "").trim());
  return m ? m[1] : null;
}

export type FloorRoomRef = { id: number; name: string };

/**
 * Find the DB room on this floor that best matches a canvas label.
 * Used so "104" can resolve to a single row named "Room 104".
 */
export function matchFloorRoomFromLayoutLabel(
  label: string | null | undefined,
  floorRooms: FloorRoomRef[] | null | undefined,
): FloorRoomRef | null {
  if (!floorRooms?.length) return null;
  const labelKey = normalizeRoomLabelForMatch(label);
  if (!labelKey) return null;

  const exact = floorRooms.filter((r) => normalizeRoomLabelForMatch(r.name) === labelKey);
  if (exact.length === 1) return exact[0];

  const digitOnly = labelKey.replace(/\D/g, "");
  if (!digitOnly) return null;

  const byTrailing = floorRooms.filter((r) => trailingDigitsFromRoomName(r.name) === digitOnly);
  if (byTrailing.length === 1) return byTrailing[0];

  // Unique substring (e.g. user pasted full Thai name in the label field).
  if (labelKey.length >= 2) {
    const byInclude = floorRooms.filter((r) => {
      const rn = normalizeRoomLabelForMatch(r.name);
      return rn.includes(labelKey) || (labelKey.length >= 4 && labelKey.includes(rn) && rn.length >= 4);
    });
    if (byInclude.length === 1) return byInclude[0];
  }

  // Unique digit pattern inside the room name (e.g. "Room 104" vs "... 104" in DB).
  if (digitOnly.length >= 1) {
    const re = new RegExp(`(^|[^0-9])${digitOnly}([^0-9]|$)`);
    const byDigitsInName = floorRooms.filter((r) => re.test(String(r.name ?? "")));
    if (byDigitsInName.length === 1) return byDigitsInName[0];
  }

  return null;
}

/**
 * Resolve a layout shape to a numeric `rooms.id` when the shape belongs to `floorRooms`.
 */
export function resolveLayoutShapeToFloorRoomId(
  shape: { id: string; label: string },
  floorRooms: FloorRoomRef[] | null | undefined,
): number | null {
  if (!floorRooms?.length) return null;

  const numericFromId = floorplanRoomIdToNumeric(shape.id);
  if (numericFromId != null && floorRooms.some((r) => r.id === numericFromId)) {
    return numericFromId;
  }

  const rawId = String(shape.id).trim();
  if (/^\d+$/.test(rawId)) {
    const n = Number(rawId);
    if (floorRooms.some((r) => r.id === n)) return n;
  }

  const matched = matchFloorRoomFromLayoutLabel(shape.label, floorRooms);
  return matched?.id ?? null;
}

export type FloorplanShapeLike = { id: string; label: string };

/**
 * When a canvas shape can be matched to a DB room, use stable `room-{id}` as shape id
 * so saves always PATCH the correct row (UUID / ambiguous labels no longer drop node links).
 */
export function normalizeRoomShapeIds<T extends FloorplanShapeLike>(
  shapes: T[],
  floorRooms: FloorRoomRef[] | null | undefined,
): { shapes: T[]; idRemap: Map<string, string> } {
  const idRemap = new Map<string, string>();
  if (!floorRooms?.length) {
    return { shapes, idRemap };
  }
  const out = shapes.map((shape) => {
    const rid = resolveLayoutShapeToFloorRoomId(shape, floorRooms);
    if (rid == null) return shape;
    const canonical = `room-${rid}`;
    if (shape.id === canonical) return shape;
    idRemap.set(shape.id, canonical);
    return { ...shape, id: canonical };
  });
  return { shapes: out, idRemap };
}
