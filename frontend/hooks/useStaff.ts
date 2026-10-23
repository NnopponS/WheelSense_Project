"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StaffUser {
  id: number;
  username: string;
  display_name: string;
  role: string;
  is_active: boolean;
  caregiver_id?: number | null;
  patient_id?: number | null;
}

// ── Query Keys ────────────────────────────────────────────────────────────────

export const staffKeys = {
  all: ["staff"] as const,
  search: (roles?: string, search?: string) => [...staffKeys.all, "search", roles, search] as const,
};

// ── Hooks ─────────────────────────────────────────────────────────────────────

/**
 * Fetch workspace staff/users with optional role filter and search
 * Supports searching by role (head_nurse, supervisor, observer, admin)
 */
export function useStaff(params?: { roles?: string; search?: string; limit?: number }) {
  return useQuery({
    queryKey: staffKeys.search(params?.roles, params?.search),
    queryFn: async () => {
      const users = await api.searchUsers({
        q: params?.search,
        roles: params?.roles,
        limit: params?.limit ?? 100,
      });
      return users as StaffUser[];
    },
    staleTime: 30_000, // 30 seconds
  });
}

/**
 * Fetch all staff with specific roles
 * Returns grouped by role for easier selection UI
 */
export function useStaffByRole(roles?: string[]) {
  const rolesParam = roles?.join(",");
  
  return useQuery({
    queryKey: staffKeys.search(rolesParam, undefined),
    queryFn: async () => {
      const users = await api.searchUsers({
        roles: rolesParam,
        limit: 100,
      });
      return users as StaffUser[];
    },
    staleTime: 30_000,
  });
}

/**
 * Fetch all staff in workspace (no filter)
 */
export function useAllStaff() {
  return useQuery({
    queryKey: staffKeys.search(undefined, undefined),
    queryFn: async () => {
      const users = await api.searchUsers({ limit: 200 });
      return users as StaffUser[];
    },
    staleTime: 30_000,
  });
}
