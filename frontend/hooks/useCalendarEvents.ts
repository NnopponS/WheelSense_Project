"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchCalendarEvents } from "@/lib/api/calendar";

export const calendarEventQueryKey = {
  all: ["calendar", "events"] as const,
  range: (args: {
    start_at: string;
    end_at: string;
    patient_id?: number;
    person_user_id?: number;
    person_role?: string;
  }) => [...calendarEventQueryKey.all, args] as const,
};

export function useCalendarEvents(params: {
  start_at: string;
  end_at: string;
  patient_id?: number;
  person_user_id?: number;
  person_role?: string;
  enabled?: boolean;
}) {
  const { start_at, end_at, patient_id, person_user_id, person_role, enabled = true } = params;

  return useQuery({
    queryKey: calendarEventQueryKey.range({
      start_at,
      end_at,
      patient_id,
      person_user_id,
      person_role,
    }),
    queryFn: () =>
      fetchCalendarEvents({
        start_at,
        end_at,
        patient_id,
        person_user_id,
        person_role,
      }),
    enabled,
  });
}
