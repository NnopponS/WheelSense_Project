---
name: wheelsense-architecture

auto_execution_mode: 0
description: Repo-local wrapper for the canonical WheelSense architecture skill
---

Use this repo-local workflow for WheelSense architecture work in Windsurf.

## Current platform topology

- **Backend**: FastAPI server (`server/`) with MQTT, PostgreSQL/JSONB history, RBAC
- **Frontend web**: Next.js 16 + React 19 + shadcn/ui (`frontend/`)
- **Mobile app**: Flutter gateway (`mobile-app/wheelsense-gateway-flutter/`) — Dart, BLE, MQTT
- **Firmware**: PSoC 6 E84 (`firmware/WheelSense_E84/`) — CM33 NS + CM55 dual-core, shared IPC transport, host_sim CMake test lane
- **Legacy firmware**: M5StickCPlus2 BLE gateway, Node_Tsimcam (`firmware/`)
- **Phase state**: see `.project/progress.md` — Phase 1 (E84 base/shared/IPC) in progress, Phase 2 (Head Nurse → Supervisor role consolidation) approved, Phase 7 (E84 MQTT contract) in progress

Read and follow:
1. `.agents/core/source-of-truth.md`
2. `.agents/workflows/wheelsense.md`
3. `docs/ARCHITECTURE.md` and `docs/adr/*` for existing decisions
4. `planning-and-task-breakdown`
5. `documentation-and-adrs` for new ADRs
6. `doubt-driven-development` for high-risk or irreversible architecture changes

Ignore similarly named global WheelSense skills when working in this repository.
