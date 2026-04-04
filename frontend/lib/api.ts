/* ═══════════════════════════════════════════════════════════════════════════
   API Client — fetch wrapper with JWT auth, error handling, typed responses
   ═══════════════════════════════════════════════════════════════════════════ */

import { API_BASE } from "./constants";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function readCookieToken(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)ws_token=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("ws_token") ?? readCookieToken();
}

/** Persist JWT for client `fetch` + Edge `middleware` (same-site cookie). */
export function setToken(token: string): void {
  localStorage.setItem("ws_token", token);
  const maxAge = 60 * 60 * 24 * 7;
  document.cookie = `ws_token=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

export function clearToken(): void {
  localStorage.removeItem("ws_token");
  if (typeof document !== "undefined") {
    document.cookie =
      "ws_token=; path=/; max-age=0; SameSite=Lax";
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Don't set Content-Type for FormData (browser sets multipart boundary)
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new ApiError(401, "Unauthorized");
  }

  if (!res.ok) {
    const raw = await res.text();
    let msg = res.statusText || "Error";
    try {
      const j = JSON.parse(raw) as { detail?: unknown };
      if (j.detail !== undefined) {
        msg =
          typeof j.detail === "string"
            ? j.detail
            : Array.isArray(j.detail)
              ? j.detail
                  .map((e) =>
                    typeof e === "object" && e && "msg" in e
                      ? String((e as { msg: unknown }).msg)
                      : JSON.stringify(e),
                  )
                  .join("; ")
              : JSON.stringify(j.detail);
      }
    } catch {
      if (raw.trim()) msg = raw.slice(0, 200);
    }
    throw new ApiError(res.status, msg);
  }

  if (res.status === 204 || res.status === 205) {
    return undefined as T;
  }

  const raw = await res.text();
  if (!raw.trim()) {
    return undefined as T;
  }
  return JSON.parse(raw) as T;
}

/** Login with username/password via OAuth2 form */
export async function login(
  username: string,
  password: string,
): Promise<{ access_token: string; token_type: string }> {
  const form = new URLSearchParams();
  form.append("username", username);
  form.append("password", password);

  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "Login failed" }));
    throw new ApiError(res.status, body.detail || "Login failed");
  }

  return res.json();
}

// ── Convenience methods ─────────────────────────────────────────────────────

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint),

  post: <T>(endpoint: string, data?: unknown) =>
    request<T>(endpoint, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    }),

  put: <T>(endpoint: string, data: unknown) =>
    request<T>(endpoint, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  patch: <T>(endpoint: string, data: unknown) =>
    request<T>(endpoint, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  delete: <T>(endpoint: string) =>
    request<T>(endpoint, { method: "DELETE" }),
};

export { ApiError };
