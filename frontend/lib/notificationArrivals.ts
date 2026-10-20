import type { Notification, NotificationType } from "@/hooks/useNotifications";

export type NotificationSeen = Map<NotificationType, Map<string, string>>;
type Source = { type: NotificationType; ready: boolean; items: Notification[] };

/** First successful read establishes each source's baseline; only later changes interrupt. */
export function collectNotificationArrivals(seen: NotificationSeen, sources: Source[]): Notification[] {
  const arrivals: Notification[] = [];
  for (const source of sources) {
    if (!source.ready) continue;
    const previous = seen.get(source.type);
    const signature = (item: Notification) => item.type === "workflow_job" ? item.timestamp : `${item.timestamp}|${item.message}`;
    if (!previous) {
      seen.set(source.type, new Map(source.items.map(item => [item.id, signature(item)])));
      continue;
    }
    for (const item of source.items) {
      const next = signature(item);
      if (!item.read && (!previous.has(item.id) || (item.type === "workflow_job" && previous.get(item.id) !== next))) arrivals.push(item);
      previous.set(item.id, next);
    }
  }
  return arrivals;
}

export function notificationRank(item: Notification): number {
  const severity = item.type === "alert" && item.data && "severity" in item.data ? item.data.severity : item.priority;
  return severity === "critical" || severity === "urgent" ? 0 : severity === "warning" || severity === "high" ? 1 : 2;
}

/** Polls can update an already-visible alert without creating another notification. */
export function refreshNotificationQueue(queued: Notification[], current: Notification[], arrivals: Notification[], readyTypes: readonly NotificationType[]): Notification[] {
  const byId = new Map(current.map(item => [item.id, item]));
  const ready = new Set(readyTypes);
  const merged = new Map(queued.filter(item => !ready.has(item.type) || byId.get(item.id)?.read === false).map(item => [item.id, byId.get(item.id) ?? item]));
  arrivals.forEach(item => merged.set(item.id, item));
  return [...merged.values()].sort((a, b) => notificationRank(a) - notificationRank(b));
}
