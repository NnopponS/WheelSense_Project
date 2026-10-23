import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StaffWorkflowMailbox, type StaffMailboxVariant } from "./StaffWorkflowMailbox";
import { useAuth } from "@/hooks/useAuth";

jest.mock("@/hooks/useAuth", () => ({ useAuth: jest.fn() }));
jest.mock("@/lib/i18n", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock("@/lib/api", () => ({
  api: {
    listWorkflowMessages: jest.fn().mockResolvedValue([]),
    listPatients: jest.fn().mockResolvedValue([]),
  },
  ApiError: class extends Error {},
}));

test.each([
  ["supervisor", "head_caregiver", "/head-caregiver"],
  ["observer", "caregiver", "/caregiver"],
] as const)("%s mailbox links back to the current role dashboard", (variant, role, expected) => {
  jest.mocked(useAuth).mockReturnValue({ user: { id: 1, role } } as ReturnType<typeof useAuth>);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <StaffWorkflowMailbox variant={variant as StaffMailboxVariant} />
  </QueryClientProvider>);
  expect(screen.getByRole("link", { name: "nav.dashboard" })).toHaveAttribute("href", expected);
});
