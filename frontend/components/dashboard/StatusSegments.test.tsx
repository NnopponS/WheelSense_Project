import { render, screen } from "@testing-library/react";
import { StatusSegments } from "./StatusSegments";

it("shows exact current-state proportions with a complete accessible description", () => {
  render(<StatusSegments total={10} label="6 online, 3 stale, 1 missing" segments={[{ value: 6, tone: "success" }, { value: 3, tone: "warning" }, { value: 1, tone: "muted" }]} />);
  const bar = screen.getByRole("img", { name: "6 online, 3 stale, 1 missing" });
  expect([...bar.children].map(child => child.getAttribute("style"))).toEqual(["width: 60%;", "width: 30%;", "width: 10%;"]);
});

it("does not draw a healthy segment for an unconfigured category", () => {
  render(<StatusSegments total={0} label="Not configured" segments={[{ value: 0, tone: "success" }]} />);
  expect(screen.getByRole("img")).toBeEmptyDOMElement();
});
