/** Same window as admin device list: seen within this many ms counts as online. */
export const DEVICE_ONLINE_WINDOW_MS = 5 * 60 * 1000;

export function isDeviceOnline(lastSeen: string | null, nowMs: number): boolean {
  if (!lastSeen) return false;
  return nowMs - new Date(lastSeen).getTime() <= DEVICE_ONLINE_WINDOW_MS;
}
