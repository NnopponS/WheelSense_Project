import { act, renderHook } from "@testing-library/react";
import { useAlertRowHighlight } from "./useAlertRowHighlight";

it("targets the visible mobile row and respects reduced motion", () => {
  jest.useFakeTimers();
  const desktop = document.createElement("div");
  desktop.id = "ws-alert-12";
  const mobile = document.createElement("div");
  mobile.id = "ws-alert-12-mobile";
  mobile.getClientRects = jest.fn(() => [{ width: 300 }] as unknown as DOMRectList);
  mobile.scrollIntoView = jest.fn();
  document.body.append(desktop, mobile);
  const matchMedia = window.matchMedia;
  window.matchMedia = jest.fn(() => ({ matches: true }) as MediaQueryList);
  const { unmount } = renderHook(() => useAlertRowHighlight(12, true));
  act(() => { jest.advanceTimersByTime(200); });
  expect(mobile.scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "center" });
  unmount();
  desktop.remove();
  mobile.remove();
  window.matchMedia = matchMedia;
  jest.useRealTimers();
});
