// WSN_* node RSSI collection for WheelSense room localization.
//
// The Node_Tsimcam firmware advertises a BLE beacon whose name is the node id
// with the prefix "WSN_" (e.g. "WSN_001"). The WheelSense server consumes an
// `rssi[]` array of { node, rssi, mac } entries to run KNN / Max-RSSI room
// prediction and to auto-register BLE nodes
// (see server/app/mqtt_handler.py and AGENTS.md MQTT invariants).
//
// This store keeps the most recent RSSI reading per node and evicts stale
// entries so a node that drifts out of range stops being reported.

export const NODE_NAME_PREFIX = 'WSN_';

export type NodeRssiEntry = {
  node: string;
  rssi: number;
  mac: string;
};

type StoredEntry = NodeRssiEntry & { updatedAt: number };

/** Returns true when a scanned BLE advertisement name is a WheelSense node. */
export function isNodeName(name: string | null | undefined): name is string {
  return typeof name === 'string' && name.startsWith(NODE_NAME_PREFIX);
}

/**
 * Normalize a BLE device id into a MAC-like string the server can use.
 * On Android `device.id` is the colon-separated MAC; on iOS it is an opaque
 * UUID (no MAC is exposed), which we pass through unchanged.
 */
export function normalizeMac(deviceId: string | null | undefined): string {
  if (!deviceId) {
    return '';
  }
  const hex = deviceId.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  return hex.length === 12 ? hex : deviceId;
}

export class NodeRssiStore {
  private readonly entries = new Map<string, StoredEntry>();

  /** Record a fresh RSSI reading for a node. */
  observe(node: string, rssi: number, mac: string, now: number = Date.now()): void {
    if (!node || !Number.isFinite(rssi)) {
      return;
    }
    this.entries.set(node, { node, rssi, mac, updatedAt: now });
  }

  /** Remove entries older than ttlMs. */
  evict(ttlMs: number, now: number = Date.now()): void {
    for (const [node, entry] of this.entries) {
      if (now - entry.updatedAt > ttlMs) {
        this.entries.delete(node);
      }
    }
  }

  /**
   * Snapshot of currently-fresh nodes as the server-facing rssi[] array,
   * strongest signal first. Evicts stale entries before snapshotting.
   */
  snapshot(ttlMs: number, now: number = Date.now()): NodeRssiEntry[] {
    this.evict(ttlMs, now);
    return Array.from(this.entries.values())
      .sort((a, b) => b.rssi - a.rssi)
      .map(({ node, rssi, mac }) => ({ node, rssi, mac }));
  }

  /** Number of fresh nodes (after eviction). */
  count(ttlMs: number, now: number = Date.now()): number {
    this.evict(ttlMs, now);
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}
