import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { I18nProvider } from "@/lib/i18n";
import { PatientSosHero } from "./PatientSosHero";

function renderHero(
  props: Partial<ComponentProps<typeof PatientSosHero>> = {},
) {
  const onRaise = jest.fn();
  render(
    <I18nProvider>
      <PatientSosHero isPending={false} onRaise={onRaise} {...props} />
    </I18nProvider>,
  );
  return { onRaise };
}

describe("PatientSosHero", () => {
  it("requires confirmation before raising an emergency SOS", () => {
    const { onRaise } = renderHero();

    fireEvent.click(screen.getByRole("button", { name: /emergency sos/i }));
    expect(onRaise).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /send sos now/i }));
    expect(onRaise).toHaveBeenCalledWith("sos");
  });

  it("keeps non-emergency assistance immediate", () => {
    const { onRaise } = renderHero();

    fireEvent.click(screen.getByRole("button", { name: /notify staff that you need assistance/i }));
    expect(onRaise).toHaveBeenCalledWith("assistance");
  });

  it("announces the persistent success state", () => {
    renderHero({ result: { kind: "sos", status: "sent" } });

    expect(screen.getByRole("status")).toHaveTextContent(/emergency sos sent/i);
  });
});
