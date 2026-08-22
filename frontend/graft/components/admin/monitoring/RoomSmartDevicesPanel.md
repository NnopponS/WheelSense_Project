# components/admin/monitoring/RoomSmartDevicesPanel.tsx

- RoomSmartDevicesPanelProps · interface · L12-L14 — interface RoomSmartDevicesPanelProps
- RoomSmartDevicesPanel · function · L16-L174 — function RoomSmartDevicesPanel({ roomId }: RoomSmartDevicesPanelProps)
- handleAdd · function · L46-L66 — async function handleAdd()
- handlePatch · function · L68-L76 — async function handlePatch(id: number, patch: Partial<{ name: string; device_type: string; is_active: boolean }>)
- handleDelete · function · L78-L87 — async function handleDelete(id: number)
- DeviceRow · function · L176-L238 — function DeviceRow({ device, onPatch, onDelete, }: { device: SmartDevice; onPatch: (id: number, patch: Partial<{ name: string; device_type: string; is_active: boolean }>) => void; onDelete: (id: number) => void; })
