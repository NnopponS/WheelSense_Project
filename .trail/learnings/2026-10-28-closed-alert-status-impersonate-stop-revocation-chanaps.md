---
title: closed alert status + impersonate-stop revocation + session cap
author: Chanaps
date: 2026-10-28
branch: wheelsense-InnoServe
id: l-fe19a696
scope: repo
status: active
src: agent
touches:
  - frontend/app/admin/alerts/page.tsx
  - frontend/components/admin/alerts/AdminAlertsTable.tsx
  - "frontend/app/api/[[...path]]/route.ts"
---

Alerts can carry status 'closed' (set by server/app/services/demo_control.py ~L453); admin alerts UI must treat it as terminal: filter option reuses existing i18n key admin.support.ticketStatusClosed (no alerts.* closed key exists), Badge variant 'secondary' is the muted/neutral choice, Resolve only for active|acknowledged, acknowledge only for active, Critical summary card counts status==='active' only. Alert.status TS union in lib/types.ts still lacks 'closed' — compare via open statuses, never === 'closed', or tsc errors TS2367. Impersonation: POST /api/auth/impersonate/stop is fully handled in the Next proxy; it now calls backend POST /api/auth/logout with the act-as Bearer token (from ws_token cookie) before restoring the ws_admin_token_backup cookie — backend /auth/logout revokes the sid claim's auth_sessions row (verified: revoked_at set, act-as /auth/me -> 401). MAX_CONCURRENT_SESSIONS moved to settings.max_concurrent_sessions (env MAX_CONCURRENT_SESSIONS, default 20); AuthService class attr reads it at import. Live stack containers have baked /app — docker cp edited files + docker restart to test; web image can't be rebuilt quickly so verify proxy changes via local 'npx next dev --webpack -p <port>' with WHEELSENSE_API_ORIGIN=http://127.0.0.1:8000.
