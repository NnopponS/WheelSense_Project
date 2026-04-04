import { useState, useCallback, useEffect } from "react";
import { api, ApiError } from "@/lib/api";

type QueryState<T> = {
  data: T | null;
  error: ApiError | Error | null;
  isLoading: boolean;
};

export function useQuery<T>(endpoint: string | null) {
  const [state, setState] = useState<QueryState<T>>({
    data: null,
    error: null,
    isLoading: true,
  });

  const fetch = useCallback(async () => {
    if (!endpoint) {
      setState((prev) => ({ ...prev, isLoading: false }));
      return;
    }
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const data = await api.get<T>(endpoint);
      setState({ data, error: null, isLoading: false });
    } catch (error: unknown) {
      setState({
        data: null,
        error: error instanceof Error ? error : new Error(String(error)),
        isLoading: false,
      });
    }
  }, [endpoint]);

  useEffect(() => {
    queueMicrotask(() => {
      void fetch();
    });
  }, [fetch]);

  return { ...state, refetch: fetch };
}
