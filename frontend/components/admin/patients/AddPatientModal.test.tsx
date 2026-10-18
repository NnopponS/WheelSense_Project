import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AddPatientModal from "./AddPatientModal";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
jest.mock("@/hooks/useAuth", () => ({ useAuth: jest.fn() }));
jest.mock("@/lib/i18n", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock("@/lib/api", () => ({
  api: { post: jest.fn(), delete: jest.fn() },
  ApiError: class extends Error {},
}));

beforeEach(() => jest.clearAllMocks());

test.each([
  ["admin", "/admin/patients/42"],
  ["head_caregiver", "/head-caregiver/personnel/42"],
] as const)("%s intake opens the new patient in its own workspace", async (role, destination) => {
  jest.mocked(useAuth).mockReturnValue({ user: { id: 1, role } } as ReturnType<typeof useAuth>);
  jest.mocked(api.post).mockResolvedValue({ id: 42 });
  const onCreated = jest.fn().mockResolvedValue(undefined);
  const onClose = jest.fn();
  render(<AddPatientModal open onCreated={onCreated} onClose={onClose} />);
  fireEvent.change(screen.getByLabelText(/patients.firstName/), { target: { value: "Test" } });
  fireEvent.change(screen.getByLabelText(/patients.lastName/), { target: { value: "Patient" } });
  fireEvent.click(screen.getByRole("button", { name: "patients.createSubmit" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith(destination));
  expect(api.post).toHaveBeenCalledWith("/patients", expect.objectContaining({ first_name: "Test", last_name: "Patient" }));
  expect(onCreated).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});
