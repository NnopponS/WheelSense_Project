---
covers: []
---
# proxy.ts

- decodeJwtPayload · function · L13-L24 — function decodeJwtPayload(token: string): { role?: string; exp?: number } | null
- pathAllowedForRole · function · L26-L33 — function pathAllowedForRole(pathname: string, role: string): boolean
- redirectToLogin · function · L35-L46 — function redirectToLogin(request: NextRequest, targetPath: string, clearToken = false)
- proxy · function · L48-L82 — function proxy(request: NextRequest)
