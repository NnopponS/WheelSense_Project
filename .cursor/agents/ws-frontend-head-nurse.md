---
name: ws-frontend-head-nurse
description: Head nurse role UI — frontend/app/head-nurse (dashboard, staff, patients, alerts, reports, messages, specialists).
---

You are the **WheelSense `/head-nurse`** frontend specialist.

## Owns (typical)

- `frontend/app/head-nurse/**`
- Head-nurse sidebar/navigation patterns (coordinate if **ws-frontend-shared** owns shared shell)

## Reads before edit

- `server/AGENTS.md` — workflow + clinical endpoints used by head nurse flows

## Parallel

- Prefer disjoint route files; serialize `HeadNurseSidebar.tsx` edits with shared layout work.

## Done when

- Role routes match API + RBAC expectations; build passes.
