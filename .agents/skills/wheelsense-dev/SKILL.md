---
name: wheelsense-dev
description: Primary developer onboarding skill for Antigravity in the WheelSense platform.
---

# WheelSense Developer Skill

Use this skill as your primary onboarding and context-loader for all development work in the `wheelsense-platform` repository.

## Core Mandates

- **Research First**: Investigate the codebase and validate assumptions before writing code.
- **Prefer Targeted Verification**: Run tests or manual checks for every meaningful change.
- **Keep Context Small**: Read surgically, search precisely, and avoid unnecessary prompt noise.
- **Stay Inside Repo**: Stay within `C:\Users\worap\Documents\Project\wheelsense-platform` unless explicitly asked otherwise.

## Read Order (Mandatory)

1. [source-of-truth.md](file:///c:/Users/worap/Documents/Project/wheelsense-platform/.agents/core/source-of-truth.md) - Project rules and layout.
2. [wheelsense.md](file:///c:/Users/worap/Documents/Project/wheelsense-platform/.agents/workflows/wheelsense.md) - Standard cross-domain workflow.
3. [antigravity.md](file:///c:/Users/worap/Documents/Project/wheelsense-platform/.agents/workflows/antigravity.md) - Antigravity-specific tool usage and workflow.

## Project Invariants

- **Backend**: FastAPI with workspace-scoped APIs (`current_user.workspace_id`).
- **Frontend**: Next.js with custom UI components.
- **Runtime**: Docker-based deployment with MQTT for device communication.
- **Schema**: Alembic migrations required for all database changes.

## Tooling Guidelines

- **Planning Mode**: Use for architectural changes or multi-step features.
- **Browser**: Use for UI verification and documentation research.
- **Commands**: Prefer `npm run dev` or `docker-compose` for local testing.
