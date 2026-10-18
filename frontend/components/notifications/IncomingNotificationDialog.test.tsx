import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@/lib/i18n";
import { api } from "@/lib/api";
import type { Notification } from "@/hooks/useNotifications";
import { IncomingNotificationDialog } from "./IncomingNotificationDialog";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 1, workspace_id: 1 } }) }));
jest.mock("@/lib/api", () => ({ api: { acknowledgeAlert: jest.fn().mockResolvedValue({}), resolveAlert: jest.fn().mockResolvedValue({}) } }));
const notification: Notification = {
  id: "alert-91", type: "alert", title: "Resident needs assistance", message: "Recorded alert evidence", timestamp: "2026-10-18T08:00:00Z", read: false,
  data: { id: 91, workspace_id: 1, patient_id: null, device_id: null, timestamp: "2026-10-18T08:00:00Z", alert_type: "manual_test", severity: "critical", title: "Resident needs assistance", description: "Recorded alert evidence", data: {}, status: "active", acknowledged_by: null, acknowledged_at: null, resolved_at: null },
};
const dismiss = jest.fn();
function renderDialog(canTriage = true) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><I18nProvider><IncomingNotificationDialog notification={notification} pendingCount={1} canTriage={canTriage} isSimulator soundEnabled onEnableSound={jest.fn()} onDismiss={dismiss} /></I18nProvider></QueryClientProvider>);
}
beforeEach(() => { jest.clearAllMocks(); });
it("dismisses a popup without acknowledging or resolving the alert", () => {
  renderDialog();
  expect(screen.getByRole("dialog", { name: notification.title })).toBeVisible();
  expect(screen.getByText("Simulation · synthetic data")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss popup" }));
  expect(dismiss).toHaveBeenCalledWith("alert-91");
  expect(api.acknowledgeAlert).not.toHaveBeenCalled();
  expect(api.resolveAlert).not.toHaveBeenCalled();
});
it("acknowledges only after an explicit caregiver action", async () => {
  renderDialog();
  fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
  await waitFor(() => expect(api.acknowledgeAlert).toHaveBeenCalledWith(91, { caregiver_id: null }));
  expect(api.resolveAlert).not.toHaveBeenCalled();
});
it("does not expose clinical triage actions to patients", () => {
  renderDialog(false);
  expect(screen.queryByRole("button", { name: "Acknowledge" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Resolve" })).not.toBeInTheDocument();
});
