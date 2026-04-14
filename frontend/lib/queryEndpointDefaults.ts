/**
 * Default TanStack Query stale/refetch windows derived from API path prefixes.
 * Shared TanStack defaults for path-shaped GETs; rules match the historical single-wrapper behavior before it was inlined into each call site.
 */
export function getQueryPollingMs(endpoint: string): number | false {
  if (endpoint.startsWith("/alerts")) return 15_000;
  if (endpoint.startsWith("/vitals")) return 15_000;
  if (endpoint.includes("/analytics/")) return 30_000;
  /** Device registry + activity: frequent enough to feel live without hammering the API */
  if (endpoint.startsWith("/devices")) return 8_000;
  if (endpoint.startsWith("/ha/devices")) return 12_000;
  return false;
}

export function getQueryStaleTimeMs(endpoint: string): number {
  if (endpoint.startsWith("/alerts")) return 10_000;
  if (endpoint.startsWith("/vitals")) return 10_000;
  if (endpoint.startsWith("/devices")) return 5_000;
  if (endpoint.startsWith("/ha/devices")) return 8_000;
  return 30_000;
}
