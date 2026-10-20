import type { ListAlertsResponse } from "./api/task-scope-types";

const severityRank: Record<string, number> = { critical: 3, warning: 2, info: 1 };
export function sortOverviewAlerts(alerts: ListAlertsResponse) {
  return [...alerts].sort((a, b) => (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0) || b.timestamp.localeCompare(a.timestamp));
}

export function overviewRoomTone(room: { roomId: number | null; nodeId?: string | null; patientIds: number[]; nodeStatus?: string; alertCount: number }, alerts: ListAlertsResponse = []): "critical" | "warning" | "success" | "info" {
  const matching = alerts.filter(alert =>
    (room.roomId != null && String(alert.data?.room_id) === String(room.roomId)) ||
    Boolean(room.nodeId && alert.device_id === room.nodeId) ||
    (alert.patient_id != null && room.patientIds.includes(alert.patient_id)),
  );
  if (matching.some(alert => alert.severity === "critical")) return "critical";
  if (matching.some(alert => alert.severity === "warning") || room.alertCount > 0 || ["stale", "offline"].includes(room.nodeStatus ?? "")) return "warning";
  return room.nodeStatus === "online" ? "success" : "info";
}
