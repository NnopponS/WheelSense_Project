"use client";

import { create } from "zustand";
import type { User } from "@/lib/types";

type AuthState = {
  user: User | null;
  loading: boolean;
  error: string | null;
  impersonation: {
    active: boolean;
    actorAdminId: number | null;
    targetUserId: number | null;
  };
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setImpersonation: (impersonation: AuthState["impersonation"]) => void;
  reset: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  error: null,
  impersonation: { active: false, actorAdminId: null, targetUserId: null },
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setImpersonation: (impersonation) => set({ impersonation }),
  reset: () =>
    set({
      user: null,
      loading: false,
      error: null,
      impersonation: { active: false, actorAdminId: null, targetUserId: null },
    }),
}));
