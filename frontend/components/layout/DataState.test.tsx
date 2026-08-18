import { render, screen } from "@testing-library/react";
import { DataState } from "./DataState";

describe("DataState", () => {
  it("announces offline failures assertively", () => {
    render(<DataState kind="offline" title="Connection unavailable" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Connection unavailable");
  });

  it("announces filtered-empty and stale states without treating them as failures", () => {
    const { rerender } = render(<DataState kind="filtered-empty" title="No matches" />);
    expect(screen.getByRole("status")).toHaveTextContent("No matches");

    rerender(<DataState kind="stale" title="Showing saved data" />);
    expect(screen.getByRole("status")).toHaveTextContent("Showing saved data");
  });
});
