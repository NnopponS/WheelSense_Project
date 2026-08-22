# components/admin/RoomFormModal.tsx

- floorOptionTitle · function · L18-L22 — function floorOptionTitle(f: Floor, floorPrefix: string): string
- isPresetRoomType · function · L35-L37 — function isPresetRoomType(v: string): v is (typeof ROOM_TYPE_VALUES)[number]
- RoomFormRoom · interface · L39-L47 — interface RoomFormRoom
- Mode · type · L49-L49 — type Mode = "create" | "edit";
- RoomFormModal · function · L51-L607 — function RoomFormModal({ open, mode, room, defaultFacilityId, defaultFloorId, onClose, onSaved, }: { open: boolean; mode: Mode; room: RoomFormRoom | null; /** When creating, pre-select building / floor from monitoring flow */ defaultFacilityId?: number | null; defaultFloorId?: number | null; onClose: () => void; onSaved: () => void | Promise<void>; })
- onKey · function · L170-L172 — onKey = (e: KeyboardEvent)
