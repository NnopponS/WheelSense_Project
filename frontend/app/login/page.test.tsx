import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { useAuth } from "../../hooks/useAuth";
import LoginPage from "./page";

const replace = jest.fn();
const login = jest.fn();

jest.mock("../../hooks/useAuth", () => ({ useAuth: jest.fn() }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

function renderLogin() {
  mockedUseAuth.mockReturnValue({ login, user: null, loading: false } as unknown as ReturnType<typeof useAuth>);
  return render(
    <I18nProvider>
      <LoginPage />
    </I18nProvider>,
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    document.documentElement.lang = "en";
    document.title = "";
  });

  it("announces field-specific required errors and focuses the first invalid input", () => {
    renderLogin();

    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    const username = screen.getByLabelText("Username");
    const password = screen.getByLabelText("Password");
    const usernameError = screen.getByText("Username is required");
    const passwordError = screen.getByText("Password is required");

    expect(screen.getByRole("alert")).toHaveTextContent("Please correct the highlighted fields");
    expect(username).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(username).toHaveAttribute("aria-describedby", usernameError.id);
    expect(password).toHaveAttribute("aria-describedby", passwordError.id);
    expect(username).toHaveFocus();

    fireEvent.change(username, { target: { value: "operator" } });
    expect(username).not.toHaveAttribute("aria-invalid");
    expect(usernameError).not.toBeInTheDocument();
  });

  it("keeps backend failures separate from required-field validation", async () => {
    login.mockRejectedValueOnce(new Error("Authentication unavailable"));
    renderLogin();

    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "operator" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Authentication unavailable"));
    expect(screen.getByLabelText("Username")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Password")).not.toHaveAttribute("aria-invalid");
  });

  it("toggles password visibility without changing the password", () => {
    renderLogin();
    const password = screen.getByLabelText("Password");

    fireEvent.change(password, { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Toggle password visibility" }));

    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveValue("secret");
  });

  it("updates the localized document title", () => {
    renderLogin();
    expect(document.title).toBe("Sign In — WheelSense Smart Care Platform");
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    fireEvent.click(screen.getByRole("button", { name: "Switch to Thai" }));

    expect(document.title).toBe("เข้าสู่ระบบ — WheelSense แพลตฟอร์มดูแลอัจฉริยะ");
    expect(document.documentElement.lang).toBe("th");
    expect(screen.getByText("กรุณากรอกชื่อผู้ใช้")).toBeInTheDocument();
    expect(screen.getByText("กรุณากรอกรหัสผ่าน")).toBeInTheDocument();
  });
});
