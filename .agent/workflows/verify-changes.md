---
description: Mandatory verification workflow after making any code changes — build, docker test, and error check
---

# Verify Changes

Run this workflow after making any code changes to the WheelSense project.

> **IMPORTANT (PowerShell):** NEVER use `&&` to chain commands — PowerShell does not support it.
> Always use separate `run_command` calls with the `Cwd` parameter set to the correct directory.
> Example: `run_command("npm run build", Cwd="c:\\...\\frontend")` — NOT `cd frontend && npm run build`.

## Steps

// turbo
1. **Run `npm run build` in the frontend** to ensure the frontend compiles correctly:
   ```
   npm run build
   ```
   Cwd: `c:\Users\worap\Documents\TSE\LE402\WheelSense\frontend`

   - If the build fails, **fix all errors** before proceeding.
   - Do NOT skip this step. Every change must pass the build.

// turbo
2. **Rebuild and start Docker Compose** (always no-cache to avoid stale code):
   ```
   docker compose up --build -d
   ```
   Cwd: `c:\Users\worap\Documents\TSE\LE402\WheelSense\WheelSense2.0`

   > Note: `docker-compose.yml` has `no_cache: true` set for frontend and backend services, so `--build` will always do a full rebuild.

// turbo
3. **Check container logs** for startup errors:
   ```
   docker compose logs --tail=30
   ```
   Cwd: `c:\Users\worap\Documents\TSE\LE402\WheelSense\WheelSense2.0`

   - If any container fails to start, fix the issue and repeat from step 1.

4. **Report results** to the user — confirm build status and container health.
