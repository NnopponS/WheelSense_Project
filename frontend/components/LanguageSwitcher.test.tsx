import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import LanguageSwitcher from "./LanguageSwitcher";

describe("LanguageSwitcher", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = "en";
  });

  it("provides 44px language targets and preserves pressed state", () => {
    render(
      <I18nProvider>
        <LanguageSwitcher compact />
      </I18nProvider>,
    );

    const english = screen.getByRole("button", { name: "Switch to English" });
    const thai = screen.getByRole("button", { name: "Switch to Thai" });

    expect(english).toHaveClass("min-h-11", "min-w-11");
    expect(thai).toHaveClass("min-h-11", "min-w-11");
    expect(english).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(thai);

    expect(thai).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.lang).toBe("th");
  });
});
