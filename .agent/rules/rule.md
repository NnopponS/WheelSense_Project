---
trigger: always_on
---

## Mandatory Error Prevention

1. **No Duplicate Errors:** When you fix an error, you MUST ensure the same type of error does not recur elsewhere in the codebase. After fixing any error:
   - Search the entire codebase for similar patterns that could cause the same error.
   - Fix ALL instances of the same issue, not just the one reported.
   - Document what you fixed and why, so the same mistake is not repeated.

2. **Root Cause Analysis:** Before fixing any error, identify the root cause using the `systematic-debugging` skill. Do NOT apply band-aid fixes. Understand WHY the error happened and fix the underlying cause.

3. **Error Tracking:** When encountering a new type of error, briefly note the error pattern and its fix so it can be referenced in future work.

## Mandatory Build & Verification

4. **Always `npm run build` Before Finishing:** After ANY code change to the frontend, run `npm run build` from `frontend/` to verify the build succeeds. Do not consider work complete until the build passes.

5. **Always Docker Compose After Changes:** After making any changes to backend or frontend code:
   - Run `docker compose up --build -d` from `WheelSense2.0/` directory.
   - Check container logs for errors with `docker compose logs --tail=30`.
   - Fix any startup failures before reporting completion.

6. **Use the `/verify-changes` workflow** to ensure all verification steps are followed consistently.

## Auto Skill Usage

7. **Automatically read relevant skills** before starting any task. Use the `/use-skill` workflow to identify which skills apply. Always prioritize project-specific skills over community skills.

8. **Skills are mandatory references**, not optional. When working on frontend code, you MUST read the `nextjs-frontend` skill. When working on backend code, you MUST read the `fastapi-backend` skill. When debugging, you MUST read `systematic-debugging`.

## Project Conventions

9. **Frontend:** Next.js 16, TypeScript, Tailwind CSS v4, Zustand store, React Query. Follow `nextjs-frontend` skill conventions.

10. **Backend:** Python FastAPI, async-first, aiosqlite, aiomqtt. Follow `fastapi-backend` skill patterns.

11. **Docker:** All services run via Docker Compose in `WheelSense2.0/`. Follow `docker-deployment` skill.

12. **MQTT:** Follow `mqtt-protocol` skill for message format and topic structure.
