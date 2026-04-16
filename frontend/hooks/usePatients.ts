"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Patient {
  id: number;
  workspace_id: number;
  first_name: string;
  last_name: string;
  nickname: string;
  date_of_birth: string | null;
  gender: string;
  height_cm: number | null;
  weight_kg: number | null;
  blood_type: string;
  photo_url?: string | null;
  medical_conditions: (string | Record<string, unknown>)[];
  allergies: string[];
  medications: Record<string, unknown>[];
  care_level: string;
  mobility_type: string;
  current_mode: string;
  notes: string;
  admitted_at: string;
  is_active: boolean;
  room_id: number | null;
  created_at: string;
}

export interface PatientSelectOption {
  id: number;
  name: string;
  room?: string | null;
  careLevel?: string;
}

// ── Query Keys ────────────────────────────────────────────────────────────────

export const patientKeys = {
  all: ["patients"] as const,
  search: (query?: string) => [...patientKeys.all, "search", query] as const,
};

// ── Hooks ─────────────────────────────────────────────────────────────────────

/**
 * Fetch patients with optional search query
 * Returns all patients if no search query is provided
 */
export function usePatients(params?: { search?: string; limit?: number; is_active?: boolean }) {
  return useQuery({
    queryKey: patientKeys.search(params?.search),
    queryFn: async () => {
      const patients = await api.listPatients({
        q: params?.search,
        limit: params?.limit ?? 100,
        is_active: params?.is_active,
      });
      return patients as Patient[];
    },
    staleTime: 30_000, // 30 seconds
  });
}

/**
 * Fetch only active patients
 */
export function useActivePatients(params?: { search?: string; limit?: number }) {
  return useQuery({
    queryKey: patientKeys.search(params?.search),
    queryFn: async () => {
      const patients = await api.listPatients({
        q: params?.search,
        limit: params?.limit ?? 100,
        is_active: true,
      });
      return patients as Patient[];
    },
    staleTime: 30_000,
  });
}
