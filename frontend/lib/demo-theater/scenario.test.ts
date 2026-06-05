import {
  demoStepLabel,
  deriveStageFromSystemState,
  patientVisualStateForStage,
  roomToneForStage,
  staffVisualStateForStage,
} from "./scenario";

describe("demo theater scenario mapping", () => {
  it("maps an active alert to the falling room state", () => {
    const stage = deriveStageFromSystemState({ alertStatus: "active", taskStatus: "pending" });

    expect(stage).toBe("alert_active");
    expect(patientVisualStateForStage(stage)).toBe("falling");
    expect(staffVisualStateForStage(stage)).toBe("idle");
    expect(roomToneForStage(stage)).toBe("danger");
  });

  it("maps acknowledgement to the caregiver phone state", () => {
    const stage = deriveStageFromSystemState({ alertStatus: "acknowledged", taskStatus: "pending" });

    expect(stage).toBe("acknowledged");
    expect(staffVisualStateForStage(stage)).toBe("phone");
    expect(roomToneForStage(stage)).toBe("accepted");
  });

  it("maps an in-progress response to staff movement", () => {
    const stage = deriveStageFromSystemState({
      alertStatus: "acknowledged",
      taskStatus: "in_progress",
    });

    expect(stage).toBe("staff_moving");
    expect(patientVisualStateForStage(stage)).toBe("falling");
    expect(staffVisualStateForStage(stage)).toBe("walking");
    expect(roomToneForStage(stage)).toBe("response");
  });

  it("shows in-room help after the staff actor arrives", () => {
    const stage = deriveStageFromSystemState({
      alertStatus: "acknowledged",
      taskStatus: "in_progress",
      staffArrived: true,
    });

    expect(stage).toBe("helping");
    expect(patientVisualStateForStage(stage)).toBe("helping");
    expect(staffVisualStateForStage(stage)).toBe("helping");
  });

  it("maps resolved alert or completed task to recovered", () => {
    const fromAlert = deriveStageFromSystemState({ alertStatus: "resolved", taskStatus: "in_progress" });
    const fromTask = deriveStageFromSystemState({ alertStatus: "acknowledged", taskStatus: "completed" });

    expect(fromAlert).toBe("resolved");
    expect(fromTask).toBe("resolved");
    expect(patientVisualStateForStage(fromAlert)).toBe("recovered");
    expect(roomToneForStage(fromAlert)).toBe("resolved");
    expect(demoStepLabel(fromAlert)).toBe("Resolved");
  });
});
