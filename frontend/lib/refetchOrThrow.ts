import type { QueryObserverResult } from "@tanstack/react-query";

/** After `await refetch()`, throw if the query errored (convenient for try/catch around mutations + refetch). */
export async function refetchOrThrow<T>(
  refetch: () => Promise<QueryObserverResult<T, Error>>,
): Promise<T | null> {
  const result = await refetch();
  if (result.error) throw result.error;
  return result.data ?? null;
}
