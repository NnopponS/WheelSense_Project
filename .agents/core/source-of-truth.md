# WheelSense Source of Truth

This repository uses a repo-local workflow surface.

Rules:
1. Stay inside `C:\Users\worap\Documents\Project\wheelsense-platform` unless the user explicitly asks otherwise.
2. Prefer canonical docs in this repo over global prompt packs or home-directory skills.
3. Read only the smallest relevant doc set for the current task.
4. Use `.agents/workflows/wheelsense.md` when the task crosses backend, frontend, docs, runtime, or mobile boundaries.
5. Keep the active context small and avoid loading unrelated workflow files.

Primary repo docs:
- `AGENTS.md`
- `server/AGENTS.md`
- `docs/ARCHITECTURE.md`
- `frontend/README.md`
