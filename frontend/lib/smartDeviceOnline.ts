/** Heuristic: HA mapping is “reachable” when enabled and state is not unknown/unavailable. */
export function isSmartDeviceOnline(sd: {
  is_active: boolean;
  state: string | null | undefined;
}): boolean {
  if (!sd.is_active) return false;
  const s = (sd.state || "").toLowerCase().trim();
  if (!s || s === "unknown" || s === "unavailable") return false;
  return true;
}
