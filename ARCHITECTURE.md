# Architecture

## Runtime Overview

WheelSense has three runtime layers:

1. `firmware/`
   - `M5StickCPlus2`: wheelchair device firmware publishing IMU, battery, and BLE RSSI telemetry over MQTT
   - `Node_Tsimcam`: camera + BLE beacon node publishing registration, status, and image data over MQTT
2. `server/`
   - FastAPI API
   - PostgreSQL-backed models/services
   - MQTT ingestion, localization, motion training/prediction, alerts, camera/photo flows
   - MCP server mounted at `/mcp`
3. `frontend/`
   - Next.js 16 role-based dashboards (`/admin`, `/head-nurse`, `/supervisor`, `/observer`, `/patient`)
   - token-based auth using cookie + localStorage
   - `/api/*` proxy route forwarding to FastAPI

## Frontend Runtime Notes

- The Next.js app is normally served by the `wheelsense-platform-web` Docker service.
  - The web image is compiled at build time; after changing frontend code, rebuild/recreate the service:
    `docker compose -f server/docker-compose.yml build wheelsense-platform-web`
    then `docker compose -f server/docker-compose.yml up -d wheelsense-platform-web`.
  - For local hot reload, stop `wheelsense-platform-web` and run `npm run dev` in `frontend/`.
- `frontend/app/api/[[...path]]/route.ts` is the canonical browser-to-FastAPI proxy.
  - It must resolve `WHEELSENSE_API_ORIGIN`/`API_PROXY_TARGET` at request time for Docker standalone runtime.
  - Do not forward hop-by-hop headers or stale `content-length`; the Node fetch implementation should calculate request body length.
- Protected app paths redirect through `/login?next=...`.
  - `frontend/proxy.ts` preserves the full target path and query string in `next`.
  - `frontend/app/login/page.tsx` sanitizes `next` before redirecting after login.
- `AuthProvider` owns initial `/auth/me` hydration for app layouts.
  - Page-level components should not call `refreshUser()` on mount unless they are intentionally revalidating after a user action.
  - Calling `refreshUser()` during page mount can toggle global auth loading and unmount/remount role layouts.
- Zod object schemas with `.superRefine()` are treated as refined schemas.
  - Do not call `.pick()`, `.omit()`, or `.extend()` on refined schemas.
  - Keep a base `z.object(...)` schema for section derivation and apply `.superRefine()` only to the final form schema.

## Source Hierarchy

For architecture and implementation truth, read in this order:

1. Runtime code under `server/`, `frontend/`, and `firmware/`
2. `server/AGENTS.md`
3. `.agents/workflows/wheelsense.md`
4. `.cursor/skills/*`, `.cursor/rules/*`, `.cursor/agents/*`
5. `docs/adr/*`
6. `docs/plans/*` and `.agents/changes/*`

## Notes

- `server/AGENTS.md` is the canonical backend memory for this repo.
- `frontend/README.md` documents the current web runtime.
- `docs/adr/*` capture architectural intent and accepted decisions.
- `docs/plans/*` are planning/history and may lag behind the current implementation.
