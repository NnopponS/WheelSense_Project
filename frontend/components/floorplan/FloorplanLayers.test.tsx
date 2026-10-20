import { fireEvent, render, screen } from "@testing-library/react";
import { FloorplanLayers } from "./FloorplanLayers";
import { REFERENCE_BACKGROUND } from "@/lib/floorplanEditor";

jest.mock("@/lib/i18n", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [{ id: 1, name: "Other image", mime_type: "image/png", file_url: "/other.png", width: 1000, height: 500 }] }) }));

function setup(importing = false) {
  const onImportReference = jest.fn(), onBackgroundChange = jest.fn();
  render(<FloorplanLayers facilityId={1} floorId={1} editing background={null}
    onBackgroundChange={onBackgroundChange} showGrid onShowGridChange={jest.fn()}
    showStatus onShowStatusChange={jest.fn()} showBackground onShowBackgroundChange={jest.fn()}
    snapEnabled onSnapChange={jest.fn()} onImportReference={onImportReference} importing={importing} />);
  fireEvent.click(screen.getByRole("button", { name: "facilityWorkspace.layers" }));
  return { onImportReference, onBackgroundChange, select: screen.getByRole("combobox", { name: "facilityWorkspace.background" }) };
}

it("selects the supplied plan through the atomic image-and-room import, never the background-only path", () => {
  const { select, onImportReference, onBackgroundChange } = setup();
  fireEvent.change(select, { target: { value: REFERENCE_BACKGROUND.url } });
  expect(onImportReference).toHaveBeenCalledTimes(1);
  expect(onBackgroundChange).not.toHaveBeenCalled();
});

it("keeps unrelated images independent of room geometry", () => {
  const { select, onImportReference, onBackgroundChange } = setup();
  fireEvent.change(select, { target: { value: "/other.png" } });
  expect(onImportReference).not.toHaveBeenCalled();
  expect(onBackgroundChange).toHaveBeenCalledWith(expect.objectContaining({ url: "/other.png", width: 5000, height: 2500 }));
});

it("prevents a second selection while the coordinate import is pending", () => {
  expect(setup(true).select).toBeDisabled();
});
