export type DemoTheaterStage =
  | "idle"
  | "alert_active"
  | "acknowledged"
  | "staff_moving"
  | "helping"
  | "resolved";

export type DemoPatientVisualState = "idle" | "falling" | "helping" | "recovered";
export type DemoStaffVisualState = "idle" | "phone" | "walking" | "helping";
export type DemoRoomTone = "normal" | "danger" | "accepted" | "response" | "resolved";

export type DemoAlertStatus = "active" | "acknowledged" | "resolved" | "pending" | "unknown";
export type DemoTaskStatus = "pending" | "in_progress" | "completed" | "cancelled" | "unknown";

export function patientVisualStateForStage(stage: DemoTheaterStage): DemoPatientVisualState {
  if (stage === "alert_active" || stage === "acknowledged" || stage === "staff_moving") {
    return "falling";
  }
  if (stage === "helping") return "helping";
  if (stage === "resolved") return "recovered";
  return "idle";
}

export function staffVisualStateForStage(stage: DemoTheaterStage): DemoStaffVisualState {
  if (stage === "acknowledged") return "phone";
  if (stage === "staff_moving") return "walking";
  if (stage === "helping") return "helping";
  return "idle";
}

export function roomToneForStage(stage: DemoTheaterStage): DemoRoomTone {
  if (stage === "alert_active") return "danger";
  if (stage === "acknowledged") return "accepted";
  if (stage === "staff_moving" || stage === "helping") return "response";
  if (stage === "resolved") return "resolved";
  return "normal";
}

export function deriveStageFromSystemState(input: {
  alertStatus?: DemoAlertStatus | string | null;
  taskStatus?: DemoTaskStatus | string | null;
  staffArrived?: boolean;
}): DemoTheaterStage {
  const alertStatus = normalizeAlertStatus(input.alertStatus);
  const taskStatus = normalizeTaskStatus(input.taskStatus);

  if (alertStatus === "resolved" || taskStatus === "completed") return "resolved";
  if (input.staffArrived) return "helping";
  if (taskStatus === "in_progress") return "staff_moving";
  if (alertStatus === "acknowledged") return "acknowledged";
  if (alertStatus === "active" || alertStatus === "pending") return "alert_active";
  return "idle";
}

export function normalizeAlertStatus(value: string | null | undefined): DemoAlertStatus {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "active") return "active";
  if (normalized === "acknowledged") return "acknowledged";
  if (normalized === "resolved") return "resolved";
  if (normalized === "pending") return "pending";
  return "unknown";
}

export function normalizeTaskStatus(value: string | null | undefined): DemoTaskStatus {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "pending") return "pending";
  if (normalized === "in_progress") return "in_progress";
  if (normalized === "completed") return "completed";
  if (normalized === "cancelled") return "cancelled";
  return "unknown";
}

export function demoStepLabel(stage: DemoTheaterStage): string {
  switch (stage) {
    case "alert_active":
      return "Alert active";
    case "acknowledged":
      return "Caregiver accepted";
    case "staff_moving":
      return "Staff dispatch";
    case "helping":
      return "Care in room";
    case "resolved":
      return "Resolved";
    case "idle":
    default:
      return "Ready";
  }
}

