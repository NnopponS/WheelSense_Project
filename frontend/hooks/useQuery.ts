import { useCallback } from "react";
import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { UseQueryOptions } from "@tanstack/react-query";

function getQueryPollingMs(endpoint: string) {
  if (endpoint.startsWith("/alerts")) return 15_000;
  if (endpoint.startsWith("/vitals")) return 15_000;
  if (endpoint.includes("/analytics/")) return 30_000;
  if (endpoint.startsWith("/devices")) return 30_000;
  if (endpoint.startsWith("/ha/devices")) return 30_000;
  return false;
}

function getQueryStaleTimeMs(endpoint: string) {
  if (endpoint.startsWith("/alerts")) return 10_000;
  if (endpoint.startsWith("/vitals")) return 10_000;
  return 30_000;
}

type QueryOptions = {
  staleTime?: number;
  refetchInterval?: number | false;
  retry?: UseQueryOptions["retry"];
  enabled?: boolean;
};

export function useQuery<T>(endpoint: string | null, options?: QueryOptions) {
  const query = useTanstackQuery({
    queryKey: ["api", endpoint],
    enabled: options?.enabled ?? Boolean(endpoint),
    queryFn: () => api.get<T>(endpoint as string),
    staleTime: endpoint ? (options?.staleTime ?? getQueryStaleTimeMs(endpoint)) : 0,
    refetchInterval: endpoint ? (options?.refetchInterval ?? getQueryPollingMs(endpoint)) : false,
    retry: options?.retry ?? 3,
  });

  const fetch = useCallback(async () => {
    if (!endpoint) {
      return null;
    }
    const result = await query.refetch();
    if (result.error) {
      throw result.error;
    }
    return result.data ?? null;
  }, [endpoint, query]);

  return {
    data: query.data ?? null,
    error: (query.error as ApiError | Error | null) ?? null,
    isLoading: endpoint ? query.isLoading : false,
    refetch: fetch,
  };
}
