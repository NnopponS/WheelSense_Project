# Antigravity Specific Workflow

This document provides guidance on how to use Antigravity's unique capabilities within the WheelSense platform.

## Tool Usage

### Planning Mode
- **Always use Planning Mode** for tasks involving multiple components (e.g., adding a new feature that touches both the FastAPI server and Next.js frontend).
- Use `implementation_plan.md` to document the cross-domain impacts.

### Browser Tool
- Use the browser to verify UI changes in the Next.js frontend.
- Use it to search for technical documentation if repo-local docs are insufficient (though repo-local docs are preferred).
- Use it to capture screenshots/recordings for the `walkthrough.md` artifact.

### Command Execution
- Prefer `npm run dev` in the `frontend` or `server` directories for local development.
- Use `docker-compose up` for integration testing if applicable.
- Always check `command_status` for long-running processes like the dev server.

## Artifact Management

- **Task tracking**: Keep `task.md` updated as you progress.
- **Walkthroughs**: Ensure every PR-level change has a `walkthrough.md` with visual verification (screenshots/videos) if the UI was affected.

## Common Paths

- **Backend**: `server/app/`
- **Frontend**: `frontend/src/`
- **Mobile**: `mobile-app/wheelsense-mobile/`
- **Docs**: `docs/`
