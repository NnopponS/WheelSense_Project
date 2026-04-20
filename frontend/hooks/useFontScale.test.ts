import { act, renderHook, waitFor } from "@testing-library/react";
import { useFontScale } from "./useFontScale";

describe("useFontScale", () => {
  beforeEach(() => {
    // Clear localStorage and CSS variable before each test
    window.localStorage.clear();
    document.documentElement.style.removeProperty("--ws-font-scale");
  });

  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.style.removeProperty("--ws-font-scale");
  });

  it("should return default scale (1.0) on initial render", () => {
    const { result } = renderHook(() => useFontScale());
    expect(result.current.scale).toBe(1);
    expect(result.current.isEnlarged).toBe(false);
    expect(result.current.elderClass).toBe("");
  });

  it("should increase scale by 0.125 when increase() is called", () => {
    const { result } = renderHook(() => useFontScale());

    act(() => {
      result.current.increase();
    });

    expect(result.current.scale).toBe(1.125);
  });

  it("should decrease scale by 0.125 when decrease() is called", () => {
    const { result } = renderHook(() => useFontScale());

    act(() => {
      result.current.decrease();
    });

    expect(result.current.scale).toBe(0.875);
  });

  it("should not exceed max scale (1.5) when increasing", () => {
    const { result } = renderHook(() => useFontScale());

    // Increase 6 times (would be 1.75 if unclamped)
    for (let i = 0; i < 6; i++) {
      act(() => {
        result.current.increase();
      });
    }

    expect(result.current.scale).toBe(1.5);
  });

  it("should not go below min scale (0.875) when decreasing", () => {
    const { result } = renderHook(() => useFontScale());

    // Decrease 3 times (would be 0.625 if unclamped)
    for (let i = 0; i < 3; i++) {
      act(() => {
        result.current.decrease();
      });
    }

    expect(result.current.scale).toBe(0.875);
  });

  it("should reset scale to 1.0 when reset() is called", () => {
    const { result } = renderHook(() => useFontScale());

    act(() => {
      result.current.increase();
      result.current.increase();
    });
    expect(result.current.scale).toBe(1.25);

    act(() => {
      result.current.reset();
    });

    expect(result.current.scale).toBe(1);
    expect(result.current.isEnlarged).toBe(false);
  });

  it("should set elderClass when scale > 1", () => {
    const { result } = renderHook(() => useFontScale());

    act(() => {
      result.current.increase();
    });

    expect(result.current.elderClass).toBe("ws-role-elder");
    expect(result.current.isEnlarged).toBe(true);
  });

  it("should persist scale to localStorage", () => {
    const { result } = renderHook(() => useFontScale());

    act(() => {
      result.current.setScale(1.25);
    });

    expect(window.localStorage.getItem("ws-font-scale")).toBe("1.25");
  });

  it("should load scale from localStorage on mount", async () => {
    window.localStorage.setItem("ws-font-scale", "1.375");

    const { result } = renderHook(() => useFontScale());

    await waitFor(() => expect(result.current.scale).toBe(1.375));
    expect(result.current.elderClass).toBe("ws-role-elder");
  });

  it("should clamp invalid stored values to valid range", async () => {
    window.localStorage.setItem("ws-font-scale", "5.0");

    const { result } = renderHook(() => useFontScale());

    await waitFor(() => expect(result.current.scale).toBe(1.5)); // max clamped
  });

  it("should set CSS variable --ws-font-scale on mount", async () => {
    renderHook(() => useFontScale());

    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue("--ws-font-scale")).toBe("1")
    );
  });

  it("should update CSS variable when scale changes", async () => {
    const { result } = renderHook(() => useFontScale());

    act(() => {
      result.current.setScale(1.25);
    });

    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue("--ws-font-scale")).toBe("1.25")
    );
  });
});
