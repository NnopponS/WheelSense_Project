# lib/nodeDeviceRoomKey.ts

- DeviceNodeLinkFields · type · L7-L11 — type DeviceNodeLinkFields = { device_id: string; display_name?: string | null; config?: Record<string, unknown>; };
- extractWsnLabelFromDisplayName · function · L13-L16 — function extractWsnLabelFromDisplayName(name: string | null | undefined): string | null
- preferredRoomNodeDeviceKey · function · L19-L26 — function preferredRoomNodeDeviceKey(detail: DeviceNodeLinkFields): string
- roomNodeDeviceMatchesDevice · function · L28-L43 — function roomNodeDeviceMatchesDevice( roomNodeId: string | null | undefined, detail: DeviceNodeLinkFields, ): boolean
