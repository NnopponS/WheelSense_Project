# lib/floorplanSaveProvision.ts

- alignFloorplanShapesToRegistryDevices · function · L11-L26 — function alignFloorplanShapesToRegistryDevices( shapes: FloorplanRoomShape[], devices: Device[], ): FloorplanRoomShape[]
- provisionRoomsForUnmappedFloorplanNodes · function · L33-L63 — async function provisionRoomsForUnmappedFloorplanNodes( postRoom: (body: Record<string, unknown>) => Promise<{ id: number; name: string }>, shapes: FloorplanRoomShape[], baseRefs: FloorRoomRef[], floorId: number, ): Promise<{ workingShapes: FloorplanRoomShape[]; mergedRefs: FloorRoomRef[] }>
