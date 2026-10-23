import { overviewRoomTone, sortOverviewAlerts } from "./overviewStatus";
import type { ListAlertsResponse } from "./api/task-scope-types";
const alert: ListAlertsResponse[number] = { id: 1, workspace_id: 1, severity: "warning", timestamp: "2026-10-18T01:00:00Z", data: { room_id: 10 }, patient_id: null, device_id: null, alert_type: "monitoring", title: "Recorded alert", description: "Evidence", status: "active", acknowledged_by: null, acknowledged_at: null, resolved_at: null };
const alerts = (rows: Array<Partial<typeof alert>>) => rows.map(row => ({ ...alert, ...row }));
const room = { roomId: 10, nodeId: "node-10", patientIds: [20], nodeStatus: "stale", alertCount: 1 };

it("orders all severities before recency without removing lower-severity alerts", () => {
  expect(sortOverviewAlerts(alerts([{ id: 1, severity: "info" }, { id: 2, severity: "critical" }, { id: 3, severity: "warning" }])).map(row => row.id)).toEqual([2, 3, 1]);
});
it("uses critical color only for matching critical evidence", () => {
  expect(overviewRoomTone(room, alerts([{ severity: "critical", data: { room_id: 11 } }]))).toBe("warning");
  expect(overviewRoomTone(room, alerts([{ severity: "critical" }]))).toBe("critical");
  expect(overviewRoomTone(room, alerts([{ severity: "critical", data: {}, patient_id: 20 }]))).toBe("critical");
  expect(overviewRoomTone(room, alerts([{ severity: "critical", data: {}, device_id: "node-10" }]))).toBe("critical");
  expect(overviewRoomTone({ ...room, roomId: null, patientIds: [], nodeStatus: "unmapped", alertCount: 0 }, [])).toBe("info");
  expect(overviewRoomTone({ ...room, nodeStatus: "online", alertCount: 0 }, [])).toBe("success");
});
