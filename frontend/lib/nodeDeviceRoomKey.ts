/**
 * Room.node_device_id often stores a beacon label (WSN_*) while the registry row uses CAM_* + ble_node_id.
 * Align PATCH payloads and client-side matching with server node_device_alias rules.
 */

/** Fields needed to resolve WSN/CAM vs room.node_device_id (subset of Device / DeviceDetail). */
export type DeviceNodeLinkFields = {
  device_id: string;
  display_name?: string | null;
  config?: Record<string, unknown>;
};

export function extractWsnLabelFromDisplayName(name: string | null | undefined): string | null {
  const m = /\b(WSN_\d+)\b/i.exec(String(name ?? ""));
  return m ? m[1] : null;
}

/** Value to store on Room.node_device_id when linking this registry device to a room. */
export function preferredRoomNodeDeviceKey(detail: DeviceNodeLinkFields): string {
  const cfg = detail.config && typeof detail.config === "object" ? detail.config : {};
  const ble = typeof cfg.ble_node_id === "string" ? cfg.ble_node_id.trim() : "";
  if (ble) return ble;
  const fromName = extractWsnLabelFromDisplayName(detail.display_name);
  if (fromName) return fromName;
  return detail.device_id;
}

export function roomNodeDeviceMatchesDevice(
  roomNodeId: string | null | undefined,
  detail: DeviceNodeLinkFields,
): boolean {
  if (!roomNodeId || !String(roomNodeId).trim()) return false;
  const key = String(roomNodeId).trim();
  if (key === detail.device_id) return true;
  const pref = preferredRoomNodeDeviceKey(detail);
  if (key === pref) return true;
  const cfg = detail.config && typeof detail.config === "object" ? detail.config : {};
  const ble = typeof cfg.ble_node_id === "string" ? cfg.ble_node_id.trim() : "";
  if (ble && key === ble) return true;
  const wsn = extractWsnLabelFromDisplayName(detail.display_name);
  if (wsn && key === wsn) return true;
  return false;
}
