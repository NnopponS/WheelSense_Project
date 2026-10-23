import { isDeviceOnline } from "@/lib/deviceOnline";
import type { Device } from "@/lib/types";

export type DeviceSortKey = "device" | "status" | "last_seen";
export type DeviceSortDirection = "asc" | "desc";

function compareDeviceLabels(left: Device, right: Device): number {
  const leftLabel = left.display_name?.trim() || left.device_id;
  const rightLabel = right.display_name?.trim() || right.device_id;
  const byLabel = leftLabel.localeCompare(rightLabel, undefined, { sensitivity: "base" });
  return byLabel || left.device_id.localeCompare(right.device_id);
}

export function sortRegistryDevices(
  devices: Device[],
  sortKey: DeviceSortKey,
  direction: DeviceSortDirection,
  nowMs: number,
): Device[] {
  return [...devices].sort((left, right) => {
    let result = compareDeviceLabels(left, right);
    if (sortKey === "status") {
      result = Number(isDeviceOnline(left.last_seen, nowMs)) - Number(isDeviceOnline(right.last_seen, nowMs));
    } else if (sortKey === "last_seen") {
      const leftTime = left.last_seen ? new Date(left.last_seen).getTime() : 0;
      const rightTime = right.last_seen ? new Date(right.last_seen).getTime() : 0;
      result = leftTime - rightTime;
    }
    if (result === 0) result = compareDeviceLabels(left, right);
    return direction === "asc" ? result : -result;
  });
}
