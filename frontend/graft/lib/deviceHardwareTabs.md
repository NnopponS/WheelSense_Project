# lib/deviceHardwareTabs.ts

- DeviceFleetTab · type · L14-L14 — type DeviceFleetTab = HardwareType | "all" | "smart_ha";
- fleetTabFromQuery · function · L45-L49 — function fleetTabFromQuery(tab: string | null | undefined): DeviceFleetTab
- fleetTabToQuery · function · L51-L53 — function fleetTabToQuery(tab: DeviceFleetTab): string
- vitalMatchesHardwareTab · function · L58-L75 — function vitalMatchesHardwareTab( v: VitalReading, tab: HardwareType | "all", devicesByDeviceId: Map<string, Device>, ): boolean
