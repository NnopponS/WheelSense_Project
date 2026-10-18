import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { ResolveAlertButton } from "./ResolveAlertButton";

it("requires explicit confirmation and cancellation never resolves the alert", () => {
  const resolve = jest.fn();
  render(<I18nProvider><ResolveAlertButton alertTitle="Resident needs assistance" onConfirm={resolve} /></I18nProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
  expect(screen.getByRole("alertdialog")).toBeVisible();
  expect(resolve).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(resolve).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm resolution" }));
  expect(resolve).toHaveBeenCalledTimes(1);
});
