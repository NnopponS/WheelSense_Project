import type { Device } from "@/lib/types";
import { sortRegistryDevices } from "@/lib/deviceFleetSort";

const nowMs = new Date("2026-08-22T12:00:00Z").getTime();
const devices = [
  { id: 1, device_id: "ONLINE", display_name: "Online", hardware_type: "node", last_seen: "2026-08-22T11:59:30Z" },
  { id: 2, device_id: "STALE", display_name: "Stale", hardware_type: "wheelchair", last_seen: "2026-08-21T10:00:00Z" },
  { id: 3, device_id: "UNKNOWN", display_name: "Unknown", hardware_type: "polar_sense", last_seen: null },
] as Device[];

describe("sortRegistryDevices", () => {
  it("prioritizes offline devices when sorting by status", () => {
    expect(sortRegistryDevices(devices, "status", "asc", nowMs).map((device) => device.device_id)).toEqual([
      "STALE",
      "UNKNOWN",
      "ONLINE",
    ]);
  });

  it("sorts newest device signals first", () => {
    expect(sortRegistryDevices(devices, "last_seen", "desc", nowMs).map((device) => device.device_id)).toEqual([
      "ONLINE",
      "STALE",
      "UNKNOWN",
    ]);
  });
});
