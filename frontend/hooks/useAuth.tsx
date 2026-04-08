"use client";

import { useCallback, useEffect } from "react";
import type { User } from "@/lib/types";
import { api, clearToken, login as apiLogin, setToken } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth-store";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

async function fetchCurrentUser() {
  const { setUser, setError, setLoading } = useAuthStore.getState();
  try {
    const me = await api.get<User>("/auth/me");
    setUser(me);
    setError(null);
  } catch {
    setUser(null);
  } finally {
    setLoading(false);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setLoading = useAuthStore((state) => state.setLoading);

  useEffect(() => {
    const token = localStorage.getItem("ws_token");
    if (token) {
      setToken(token);
      void fetchCurrentUser();
      return;
    }
    setLoading(false);
  }, [setLoading]);

  return <>{children}</>;
}

export function useAuth(): AuthContextValue {
  const user = useAuthStore((state) => state.user);
  const loading = useAuthStore((state) => state.loading);
  const error = useAuthStore((state) => state.error);
  const setUser = useAuthStore((state) => state.setUser);
  const setLoading = useAuthStore((state) => state.setLoading);
  const setError = useAuthStore((state) => state.setError);
  const reset = useAuthStore((state) => state.reset);

  const refreshUser = useCallback(async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("ws_token") : null;
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    await fetchCurrentUser();
  }, [setLoading, setUser]);

  const login = useCallback(
    async (username: string, password: string) => {
      setError(null);
      setLoading(true);
      try {
        const result = await apiLogin(username, password);
        setToken(result.access_token);
        await fetchCurrentUser();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Login failed");
        setLoading(false);
        throw err;
      }
    },
    [setError, setLoading],
  );

  const logout = useCallback(() => {
    clearToken();
    reset();
  }, [reset]);

  return { user, loading, error, login, logout, refreshUser };
}
