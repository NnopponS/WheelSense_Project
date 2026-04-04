"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { User } from "@/lib/types";
import {
  api,
  login as apiLogin,
  setToken,
  clearToken,
} from "@/lib/api";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  /** Re-fetch /auth/me (e.g. after workspace change on server). */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMe = useCallback(async () => {
    try {
      const me = await api.get<User>("/auth/me");
      setUser(me);
      setError(null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("ws_token") : null;
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const me = await api.get<User>("/auth/me");
      setUser(me);
      setError(null);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("ws_token");
    if (token) {
      setToken(token);
      fetchMe();
    } else {
      setLoading(false);
    }
  }, [fetchMe]);

  const login = useCallback(
    async (username: string, password: string) => {
      setError(null);
      setLoading(true);
      try {
        const result = await apiLogin(username, password);
        setToken(result.access_token);
        await fetchMe();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Login failed");
        setLoading(false);
        throw err;
      }
    },
    [fetchMe],
  );

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
