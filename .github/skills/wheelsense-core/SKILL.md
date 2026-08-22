---
name: wheelsense-core

auto_execution_mode: 0
description: Low-token WheelSense entry workflow for Windsurf in this repository
---

This workflow is the repo-local entrypoint for Windsurf in `wheelsense-platform`.

Rules:
1. Read `.agents/core/source-of-truth.md` first.
2. Then read only the smallest relevant canonical doc set for the task.
3. Use `.agents/workflows/wheelsense.md` for cross-domain work.
4. Do not preload all project docs.
5. Prefer repo-local docs over global prompt packs or home-directory skills.
6. Use `using-agent-skills` to select the narrowest local skill from `.windsurf/skills/`.

Canonical docs:
- `server/AGENTS.md`
- `.agents/workflows/wheelsense.md`
- `docs/ARCHITECTURE.md`
- `frontend/README.md`
- `mobile-app/BUILD_GUIDE.md` (Flutter gateway app)
- `firmware/WheelSense_E84/docs/` (PSoC 6 E84 firmware: protocol, memory, provenance)
- `firmware/TELEMETRY_CONTRACT.md` (MQTT telemetry contract)
- `.project/progress.md` (phase status and audit ledger)
