import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkflowJobsPanel } from "./WorkflowJobsPanel";
import { api } from "@/lib/api";

const mockUser = { id: 17, username: "Current caregiver", role: "caregiver" };

jest.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock("@/lib/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@/lib/api", () => ({
  api: { listWorkflowJobs: jest.fn(), listPatients: jest.fn(), listUsers: jest.fn() },
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(api.listWorkflowJobs).mockResolvedValue([]);
  jest.mocked(api.listPatients).mockResolvedValue([]);
  jest.mocked(api.listUsers).mockResolvedValue([
    {
      id: 18,
      username: "Other staff",
      role: "caregiver",
      is_active: true,
      workspace_id: 1,
      profile_image_url: "",
      created_at: "2026-10-18T00:00:00Z",
      updated_at: "2026-10-18T00:00:00Z",
    },
  ]);
});

test.each(["caregiver", "head_caregiver"])("%s sees permitted assignees without debug requests", async (role) => {
  mockUser.role = role;
  const debugFetch = jest.fn().mockResolvedValue({});
  const originalFetch = global.fetch;
  const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  global.fetch = debugFetch;
  try {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <WorkflowJobsPanel variant={role === "caregiver" ? "observer" : "supervisor"} />
      </QueryClientProvider>,
    );
    await screen.findByText("workflowJobs.empty");
    fireEvent.click(screen.getAllByRole("button", { name: "workflowJobs.createJobPrimary" })[0]);

    expect(await screen.findByText(role === "caregiver" ? "Current caregiver" : "Other staff")).toBeVisible();
    expect(api.listUsers).toHaveBeenCalledTimes(role === "caregiver" ? 0 : 1);
    expect(debugFetch).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  } finally {
    global.fetch = originalFetch;
    consoleError.mockRestore();
  }
});
