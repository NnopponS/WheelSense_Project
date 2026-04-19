# WheelSense Gemini Loader

This file is the repo-local loader for Gemini-family tools.

## Scope

- Apply these instructions only inside this repository.
- Do not rely on home-directory/global WheelSense skills when a repo-local file exists.

## Read Order

1. `.agents/core/source-of-truth.md`
2. Read only the smallest relevant canonical doc set for the current task.
3. Use `.agents/workflows/wheelsense.md` for cross-domain work.

## Notes

- Repo-local WheelSense skills live under `.agents/skills/`.
- Tool-native wrappers live under `.agent/`, `.windsurf/`, and other repo-local folders.
- Keep the active skill/context set small.
