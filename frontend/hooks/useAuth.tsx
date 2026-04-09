"use client";

import { useCallback, useEffect } from "react";
import type { User } from "@/lib/types";
import { api, clearToken, getToken, login as apiLogin, setToken } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth-store";

const ADMIN_TOKEN_STORAGE_KEY = "ws_admin_token_before_impersonation";

type ImpersonationState = {
  active: boolean;
  actorAdminId: number | null;
  targetUserId: number | null;
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

function decodeJwtPayload(token: string | null): Record<string, unknown> | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return JSON.parse(window.atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readImpersonationFromToken(token: string | null): ImpersonationState {
  if (typeof window === "undefined") {
    return { active: false, actorAdminId: null, targetUserId: null };
  }
  const payload = decodeJwtPayload(token);
  const actorAdminId =
    typeof payload?.actor_admin_id === "number"
      ? payload.actor_admin_id
      : typeof payload?.actor_admin_id === "string"
        ? Number(payload.actor_admin_id)
        : null;
  const targetUserId =
    typeof payload?.impersonated_user_id === "number"
      ? payload.impersonated_user_id
      : typeof payload?.impersonated_user_id === "string"
        ? Number(payload.impersonated_user_id)
        : null;
  const hasStoredAdminToken = Boolean(sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY));
  const active = payload?.impersonation === true || hasStoredAdminToken;
  return {
    active,
    actorAdminId: Number.isFinite(actorAdminId) ? actorAdminId : null,
    targetUserId: Number.isFinite(targetUserId) ? targetUserId : null,
  };
}

async function fetchCurrentUser() {
  const { setUser, setError, setLoading, setImpersonation } = useAuthStore.getState();
  try {
    const me = await api.get<User>("/auth/me");
    setUser(me);
    setImpersonation(readImpersonationFromToken(getToken()));
    setError(null);
  } catch {
    setUser(null);
    setImpersonation({ active: false, actorAdminId: null, targetUserId: null });
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
  const impersonation = useAuthStore((state) => state.impersonation);
  const setUser = useAuthStore((state) => state.setUser);
  const setLoading = useAuthStore((state) => state.setLoading);
  const setError = useAuthStore((state) => state.setError);
  const setImpersonation = useAuthStore((state) => state.setImpersonation);
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
        sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
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
    sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    clearToken();
    reset();
  }, [reset]);

  const startImpersonation = useCallback(
    async (targetUserId: number) => {
      const currentToken = getToken();
      if (!currentToken) throw new Error("No active admin session.");
      if (!sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)) {
        sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, currentToken);
      }
      setError(null);
      setLoading(true);
      try {
        const result = await api.startImpersonation(targetUserId);
        setToken(result.access_token);
        await fetchCurrentUser();
      } catch (err) {
        const adminToken = sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
        if (adminToken) setToken(adminToken);
        sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
        setImpersonation({ active: false, actorAdminId: null, targetUserId: null });
        setLoading(false);
        throw err;
      }
    },
    [setError, setImpersonation, setLoading],
  );

  const stopImpersonation = useCallback(async () => {
    const adminToken = sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
    if (!adminToken) {
      clearToken();
      reset();
      setImpersonation({ active: false, actorAdminId: null, targetUserId: null });
      return;
    }
    setLoading(true);
    setToken(adminToken);
    sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    await fetchCurrentUser();
  }, [reset, setImpersonation, setLoading]);

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
