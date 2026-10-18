import { act, renderHook } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { useNotifications } from "./useNotifications";

let mockUser = { id: 1, workspace_id: 1, role: "admin" };
const mockAlert = { id: 91, status: "active", title: "Shared alert", description: "Evidence", timestamp: "2026-10-18T08:00:00Z", severity: "critical" };
jest.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock("@tanstack/react-query", () => ({ useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data: queryKey[1] === "alerts" ? [mockAlert] : [] }), useQueryClient: () => ({ invalidateQueries: jest.fn() }) }));
jest.mock("@/lib/alertSound", () => ({ playAlertChime: jest.fn() }));
it("keeps local notification read state inside the authenticated identity", () => {
  const { result, rerender } = renderHook(() => useNotifications(), { wrapper: I18nProvider });
  expect(result.current.unreadCount).toBe(1);
  act(() => result.current.markAsRead("alert-91"));
  expect(result.current.unreadCount).toBe(0);
  mockUser = { id: 2, workspace_id: 1, role: "caregiver" };
  rerender();
  expect(result.current.unreadCount).toBe(1);
  expect(result.current.popupQueue).toEqual([]);
});
