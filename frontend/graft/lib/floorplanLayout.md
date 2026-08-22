# lib/floorplanLayout.ts

- FloorplanRoomShape · type · L1-L11 — type FloorplanRoomShape = { id: string; label: string; x: number; y: number; w: number; h: number; device_id: number | null; node_device_id?: string | null; power_kw: number | null; };
- FloorplanLayoutResponse · interface · L13-L31 — interface FloorplanLayoutResponse
- percentToCanvasUnits · function · L37-L39 — function percentToCanvasUnits(value: number): number
- canvasUnitsToPercent · function · L41-L43 — function canvasUnitsToPercent(value: number): number
- normalizeCoordinate · function · L45-L53 — function normalizeCoordinate(value: number, version: number): number
- normalizeFloorplanRooms · function · L55-L72 — function normalizeFloorplanRooms( raw: FloorplanLayoutResponse["layout_json"] | undefined, ): FloorplanRoomShape[]
- bootstrapRoomsFromDbFloor · function · L75-L102 — function bootstrapRoomsFromDbFloor( floorRooms: Array<{ id: number; name: string }>, ): FloorplanRoomShape[]
