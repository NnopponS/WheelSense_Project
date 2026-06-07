export type SmartDeviceDisplaySource = {
  id: number | string;
  name?: string | null;
  device_type?: string | null;
};

export function smartDeviceDisplayName(device: SmartDeviceDisplaySource): string {
  return device.name?.trim() || `Smart device #${device.id}`;
}

export function smartDeviceDisplayId(device: SmartDeviceDisplaySource): string {
  return `ID #${device.id}`;
}

export function smartDeviceTypeLabel(device: SmartDeviceDisplaySource): string {
  const cleaned = device.device_type?.trim().replace(/[_-]+/g, " ") ?? "";
  if (!cleaned) return "Device";
  const lower = cleaned.toLowerCase();
  if (lower === "climate" || lower === "ac" || lower === "air conditioner") return "AC";
  return cleaned
    .split(/\s+/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}
