# WheelSense Agent Loader

This file is the repo-local loader for Codex and the shared baseline for other agents.

## Scope

- Apply these instructions only inside this repository.
- Do not install or assume global skills, prompts, or memory packs.

## Read Order

1. `.agents/core/source-of-truth.md`
2. Read only the smallest relevant canonical doc set for the current task.
3. Use `.agents/workflows/wheelsense.md` when the task crosses backend, frontend, docs, or runtime boundaries.

## Notes

- Project workflows live under `.agents/`.
- Repo-local WheelSense skills live under `.agents/skills/`.
- Cursor-native skills live under `.cursor/skills/`.
- Keep the active skill/context set small.
- Do not duplicate architecture notes that already live in canonical docs.
- For WheelSense-specific skills, prefer repo-local files in this repository over home-directory/global skill catalogs.
