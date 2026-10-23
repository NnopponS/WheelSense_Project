import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { FilterBar } from "./FilterBar";

describe("FilterBar", () => {
  it("provides a labeled saved-view selector and reports changes", () => {
    const onSavedViewChange = jest.fn();

    render(
      <I18nProvider>
        <FilterBar
          savedViewValue="all"
          savedViews={[
            { value: "all", label: "All patients" },
            { value: "critical", label: "Critical patients" },
          ]}
          onSavedViewChange={onSavedViewChange}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("region", { name: "Search and filters" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Saved view"), { target: { value: "critical" } });
    expect(onSavedViewChange).toHaveBeenCalledWith("critical");
  });
});
