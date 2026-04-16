"use client";

import { useCallback, useEffect } from "react";
import type { User } from "@/lib/types";
import { api, ApiError, login as apiLogin } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useMobileAuthHandshake } from "@/hooks/useMobileAuthHandshake";

type ImpersonationState = {
  active: boolean;
  actorAdminId: number | null;
  targetUserId: number | null;
};

type AuthMeUser = User & {
  impersonation?: boolean;
  impersonated_by_user_id?: number | null;
};

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  impersonation: ImpersonationState;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  startImpersonation: (targetUserId: number) => Promise<void>;
  stopImpersonation: () => Promise<void>;
}

function readImpersonationFromMe(user: AuthMeUser | null): ImpersonationState {
  if (!user?.impersonation) {
    return { active: false, actorAdminId: null, targetUserId: null };
  }
  return {
    active: true,
    actorAdminId:
      typeof user.impersonated_by_user_id === "number" ? user.impersonated_by_user_id : null,
    targetUserId: typeof user.id === "number" ? user.id : null,
  };
}

type AuthHydrateResponse = {
  authenticated: boolean;
  user: AuthMeUser | null;
};

async function fetchCurrentUser() {
  const { setUser, setError, setLoading, setImpersonation } = useAuthStore.getState();
  try {
    let res: AuthHydrateResponse | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        res = await api.get<AuthHydrateResponse>("/auth/session");
        break;
      } catch (error) {
        lastError = error;
        const status = error instanceof ApiError ? error.status : null;
        const shouldRetry = status != null && [502, 503, 504].includes(status) && attempt === 0;
        if (!shouldRetry) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }
    if (!res) {
      throw (lastError instanceof Error ? lastError : new Error("Could not load account"));
    }
    if (res.authenticated && res.user) {
      setUser(res.user);
      setImpersonation(readImpersonationFromMe(res.user));
      setError(null);
    } else {
      setUser(null);
      setImpersonation({ active: false, actorAdminId: null, targetUserId: null });
      setError(null);
    }
  } catch (err) {
    setUser(null);
    setImpersonation({ active: false, actorAdminId: null, targetUserId: null });
    setError(err instanceof Error ? err.message : "Could not load account");
  } finally {
    setLoading(false);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setLoading = useAuthStore((state) => state.setLoading);

  // On initial load, fetch session normally (cookie-based for web users).
  useEffect(() => {
    setLoading(true);
    void fetchCurrentUser();
  }, [setLoading]);

  // When loaded inside the WheelSense mobile WebView, exchange the injected
  // JWT for an HttpOnly session cookie, then re-fetch the user so the auth
  // state reflects the mobile user without showing the login form.
  useMobileAuthHandshake(() => {
    void fetchCurrentUser();
  });

  return <>{children}</>;
}

export function useAuth(): AuthContextValue {
  const user = useAuthStore((state) => state.user);
  const loading = useAuthStore((state) => state.loading);
  const error = useAuthStore((state) => state.error);
  const impersonation = useAuthStore((state) => state.impersonation);
  const setUser = useAuthStore((state) => state.setUser);
  const setLoading = useAuthStore((state) => state.setLoading);
  const setError = useAuthStore((state) => state.setError);
  const setImpersonation = useAuthStore((state) => state.setImpersonation);
  const reset = useAuthStore((state) => state.reset);

  const refreshUser = useCallback(async () => {
    setLoading(true);
    await fetchCurrentUser();
  }, [setLoading]);

  const login = useCallback(
    async (username: string, password: string) => {
      setError(null);
      setLoading(true);
      try {
        await apiLogin(username, password);
        await fetchCurrentUser();
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Login failed",
        );
        setLoading(false);
        throw err;
      }
    },
    [setError, setLoading],
  );

  const logout = useCallback(() => {
    setLoading(false);
    void api.logout().catch(() => undefined);
    reset();
  }, [reset, setLoading]);

  const startImpersonation = useCallback(
    async (targetUserId: number) => {
      setError(null);
      setLoading(true);
      try {
        await api.startImpersonation(targetUserId);
        await fetchCurrentUser();
      } catch (err) {
        setImpersonation({ active: false, actorAdminId: null, targetUserId: null });
        setLoading(false);
        throw err;
      }
    },
    [setError, setImpersonation, setLoading],
  );

  const stopImpersonation = useCallback(async () => {
    setLoading(true);
    try {
      await api.stopImpersonation();
      await fetchCurrentUser();
    } catch (err) {
      setUser(null);
      setImpersonation({ active: false, actorAdminId: null, targetUserId: null });
      setLoading(false);
      throw err;
    }
  }, [setImpersonation, setLoading, setUser]);

  return {
    user,
    loading,
    error,
    impersonation,
    login,
    logout,
    refreshUser,
    startImpersonation,
    stopImpersonation,
  };
}
