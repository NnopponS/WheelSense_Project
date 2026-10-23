import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AiSettingsPanel from "./AiSettingsPanel";
import { api } from "@/lib/api";

jest.mock("@/lib/api", () => ({ api: { get: jest.fn(), put: jest.fn() } }));
jest.mock("@/lib/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

test.each(["openai", "openrouter"])("saves %s model and key, then clears the secret field", async (provider) => {
  const settings = { provider, model: "saved-model", workspace_default_provider: provider,
    workspace_default_model: "saved-model", openai_configured: true, openrouter_configured: true };
  jest.mocked(api.get).mockImplementation(async (path) => {
    if (path === "/settings/ai") return settings;
    if (path.endsWith("/status")) return { connected: false };
    return { models: [], reachable: true };
  });
  jest.mocked(api.put).mockResolvedValue(settings);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <AiSettingsPanel />
  </QueryClientProvider>);
  const model = await screen.findByDisplayValue("saved-model");
  fireEvent.change(model, { target: { value: "new-model" } });
  const key = screen.getByLabelText("settings.ai.apiKey");
  expect(key).toHaveAttribute("type", "password");
  fireEvent.change(key, { target: { value: "test-replacement-key" } });
  fireEvent.click(screen.getByRole("button", { name: "settings.ai.saveWorkspace" }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith("/settings/ai/global", {
    default_provider: provider, default_model: "new-model", api_key: "test-replacement-key",
  }));
  await waitFor(() => expect(key).toHaveValue(""));
});
