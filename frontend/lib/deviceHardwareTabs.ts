import type { TranslationKey } from "@/lib/i18n";
import type { Device, HardwareType, VitalReading } from "@/lib/types";

/** Same pill filters as admin Devices (Polar / Sense = Verity Sense + mobile Polar SDK streams). */
export const DEVICE_HARDWARE_TABS: Array<{ key: HardwareType | "all"; labelKey: TranslationKey }> = [
  { key: "all", labelKey: "devicesDetail.tabAll" },
  { key: "wheelchair", labelKey: "devicesDetail.tabWheelchair" },
  { key: "node", labelKey: "devicesDetail.tabNode" },
  { key: "polar_sense", labelKey: "devicesDetail.tabPolar" },
  { key: "mobile_phone", labelKey: "devicesDetail.tabMobile" },
];

/** Admin fleet view: registry hardware tabs plus smart-home (Home Assistant) mappings. */
export type DeviceFleetTab = HardwareType | "all" | "smart_ha";

const TAB_QUERY_SLUG: Record<DeviceFleetTab, string> = {
  all: "all",
  wheelchair: "wheelchair",
  node: "node",
  polar_sense: "polar_sense",
  mobile_phone: "mobile_phone",
  smart_ha: "smart_home",
};

export const DEVICE_FLEET_TABS: Array<{ key: DeviceFleetTab; labelKey: TranslationKey }> = [
  ...DEVICE_HARDWARE_TABS,
  { key: "smart_ha", labelKey: "devicesDetail.tabSmartDevice" },
];

const QUERY_TO_FLEET_TAB: Record<string, DeviceFleetTab> = {
  all: "all",
  wheelchair: "wheelchair",
  node: "node",
  polar_sense: "polar_sense",
  mobile_phone: "mobile_phone",
  smart_home: "smart_ha",
  ha: "smart_ha",
  home_assistant: "smart_ha",
  polar: "polar_sense",
  mobile: "mobile_phone",
  phone: "mobile_phone",
};

/** Parse `?tab=` from /admin/devices (accepts aliases). */
export function fleetTabFromQuery(tab: string | null | undefined): DeviceFleetTab {
  if (!tab) return "all";
  const t = tab.toLowerCase().trim();
  return QUERY_TO_FLEET_TAB[t] ?? "all";
}

export function fleetTabToQuery(tab: DeviceFleetTab): string {
  return TAB_QUERY_SLUG[tab];
}

/**
 * Polar / Sense tab: registered Polar hardware, Polar mobile SDK posts, and HR relay via wheelchair BLE/demo seed.
 */
export function vitalMatchesHardwareTab(
  v: VitalReading,
  tab: HardwareType | "all",
  devicesByDeviceId: Map<string, Device>,
): boolean {
  if (tab === "all") return true;
  const dev = devicesByDeviceId.get(v.device_id);
  const hw = dev?.hardware_type;
  // Legacy MQTT rows may still be mobile_app until migrated
  const hwNorm = hw === "mobile_app" ? "mobile_phone" : hw;
  if (hwNorm === tab) return true;
  if (tab === "polar_sense") {
    if (v.source === "polar_sdk") return true;
    if (v.source === "mobile_ble") return true;
    if (hwNorm === "wheelchair" && (v.source === "ble" || v.source === "sim_seed")) return true;
  }
  return false;
}
