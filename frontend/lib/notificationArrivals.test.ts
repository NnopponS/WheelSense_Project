import { collectNotificationArrivals, notificationRank, refreshNotificationQueue, type NotificationSeen } from "./notificationArrivals";
import type { Notification } from "@/hooks/useNotifications";

const notice = (id: string, type: Notification["type"] = "alert", read = false, timestamp = "2026-10-18T08:00:00Z"): Notification => ({ id, type, title: id, message: "Evidence", timestamp, read });

it("bootstraps each source separately without replaying historical notifications", () => {
  const seen: NotificationSeen = new Map();
  expect(collectNotificationArrivals(seen, [{ type: "alert", ready: true, items: [notice("old")] }, { type: "message", ready: false, items: [] }])).toEqual([]);
  expect(collectNotificationArrivals(seen, [{ type: "message", ready: true, items: [notice("old-message", "message")] }])).toEqual([]);
  expect(collectNotificationArrivals(seen, [{ type: "alert", ready: true, items: [notice("old"), notice("new")] }]).map(n => n.id)).toEqual(["new"]);
});

it("never repeats a dismissed ID when it disappears and returns", () => {
  const seen: NotificationSeen = new Map();
  collectNotificationArrivals(seen, [{ type: "alert", ready: true, items: [] }]);
  expect(collectNotificationArrivals(seen, [{ type: "alert", ready: true, items: [notice("new")] }])).toHaveLength(1);
  collectNotificationArrivals(seen, [{ type: "alert", ready: true, items: [] }]);
  expect(collectNotificationArrivals(seen, [{ type: "alert", ready: true, items: [notice("new")] }])).toEqual([]);
});

it("announces unread job updates once and suppresses terminal/read records", () => {
  const seen: NotificationSeen = new Map();
  const source = (item: Notification) => [{ type: "workflow_job" as const, ready: true, items: [item] }];
  collectNotificationArrivals(seen, source(notice("job", "workflow_job")));
  const update = notice("job", "workflow_job", false, "2026-10-18T08:01:00Z");
  expect(collectNotificationArrivals(seen, source(update))).toEqual([update]);
  expect(collectNotificationArrivals(seen, source(update))).toEqual([]);
  expect(collectNotificationArrivals(seen, source(notice("job", "workflow_job", true, "2026-10-18T08:02:00Z")))).toEqual([]);
});

it("prioritizes critical alerts over ordinary notices", () => {
  expect(notificationRank({ ...notice("critical"), priority: "urgent" })).toBeLessThan(notificationRank(notice("message", "message")));
});

it("refreshes same-ID severity, evidence and queue order after a poll", () => {
  const queued = [{ ...notice("first"), priority: "high" as const }, notice("escalated")];
  const updated = { ...notice("escalated"), priority: "urgent" as const, title: "Critical now", message: "Updated evidence" };
  const result = refreshNotificationQueue(queued, [queued[0], updated], [], ["alert"]);
  expect(result[0]).toEqual(updated);
});
it("removes handled records while preserving last-known data from unavailable sources", () => {
  const queued = [notice("handled"), notice("mail", "message")];
  expect(refreshNotificationQueue(queued, [notice("handled", "alert", true)], [], ["alert"])).toEqual([queued[1]]);
});
