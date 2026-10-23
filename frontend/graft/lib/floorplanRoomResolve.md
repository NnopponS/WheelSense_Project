# lib/floorplanRoomResolve.ts

- normalizeRoomLabelForMatch · function · L8-L10 — function normalizeRoomLabelForMatch(value: string | null | undefined): string
- trailingDigitsFromRoomName · function · L13-L16 — function trailingDigitsFromRoomName(name: string | null | undefined): string | null
- FloorRoomRef · type · L18-L18 — type FloorRoomRef = { id: number; name: string };
- matchFloorRoomFromLayoutLabel · function · L24-L58 — function matchFloorRoomFromLayoutLabel( label: string | null | undefined, floorRooms: FloorRoomRef[] | null | undefined, ): FloorRoomRef | null
- resolveLayoutShapeToFloorRoomId · function · L63-L82 — function resolveLayoutShapeToFloorRoomId( shape: { id: string; label: string }, floorRooms: FloorRoomRef[] | null | undefined, ): number | null
- FloorplanShapeLike · type · L84-L84 — type FloorplanShapeLike = { id: string; label: string };
- normalizeRoomShapeIds · function · L90-L107 — function normalizeRoomShapeIds<T extends FloorplanShapeLike>( shapes: T[], floorRooms: FloorRoomRef[] | null | undefined, ): { shapes: T[]; idRemap: Map<string, string> }
