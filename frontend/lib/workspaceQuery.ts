/**
 * Append a cache-busting query param for useQuery when workspace scope matters.
 * FastAPI ignores unknown query parameters; the server still scopes by JWT + DB user.
 */
export function withWorkspaceScope(
  path: string | null,
  workspaceId: number | undefined | null,
): string | null {
  if (path === null) return null;
  if (workspaceId == null) return path;
  return path.includes("?") ? `${path}&_ws=${workspaceId}` : `${path}?_ws=${workspaceId}`;
}
