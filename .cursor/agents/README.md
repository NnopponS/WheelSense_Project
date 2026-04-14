# WheelSense Cursor Agents

This folder contains Cursor-specific orchestration prompts for the current
WheelSense repo layout. These files help split work safely across disjoint
lanes; they are not the canonical architecture documentation.

## Read Order

1. runtime code under `server/`, `frontend/`, and `firmware/`
2. `server/AGENTS.md`
3. `.agents/workflows/wheelsense.md`
4. `.cursor/agents/*`

## AI Chat Architecture

WheelSense includes an AI chat system (EaseAI) with MCP integration:

**3-Stage Action Flow:**
1. **Propose** - User sends message, agent runtime analyzes intent
2. **Confirm** - User reviews and approves the proposed action/plan
3. **Execute** - MCP tools called server-side, results returned

**Key Components:**
- `server/app/mcp/server.py` - MCP tools exposing workspace operations
- `server/app/agent_runtime/service.py` - Intent recognition, execution planning
- `server/app/api/endpoints/chat_actions.py` - API endpoints for 3-stage flow
- `frontend/components/ai/AIChatPopup.tsx` - Frontend chat UI

**Rules and Skills:**
- `.cursor/rules/wheelsense-mcp.mdc` - MCP system rules
- `.cursor/skills/wheelsense-mcp-tools/` - Tool development
- `.cursor/skills/wheelsense-agent-runtime/` - Planning and execution
- `.cursor/skills/wheelsense-chat-actions/` - Chat action flow

## Current Prompt Pack

Core orchestration files:

- `orchestrator.md` - coordinator prompt for wave planning and merge order
- `parallel-matrix.md` - safe parallel ownership map
- `HANDOFF.md` - short session log for active coordination only

Backend lanes:

- `ws-backend-auth-rbac.md`
- `ws-backend-ingestion.md`
- `ws-backend-rest-domain.md`
- `ws-backend-clinical-facility.md`

Frontend lanes:

- `ws-frontend-shared.md`
- `ws-frontend-admin.md`
- `ws-frontend-head-nurse.md`
- `ws-frontend-supervisor.md`
- `ws-frontend-observer.md`
- `ws-frontend-patient.md`

Docs and verification:

- `ws-docs-sync.md`
- `ws-quality-gate.md`

AI / MCP lanes:

- `ws-mcp-tools.md` - MCP server and tool development
- `ws-agent-runtime.md` - Agent planning and execution
- `ws-chat-actions.md` - Chat action 3-stage flow

Focused helper lanes:

- `wheelsense-admin-i18n.md`
- `wheelsense-patient-device-link-ui.md`
- `wheelsense-frontend-verify.md`

## Migration Note

This folder is mid-migration in the worktree:

- the older tracked prompt files have been removed from the working tree
- the `ws-*` and `wheelsense-*` prompt files are the intended active layout

Treat this folder as tool-specific orchestration only. Runtime truth still
lives in code and the canonical docs above.

## Usage Rules

- Use one concurrent session per disjoint ownership lane
- Serialize hotspot files such as shared routers, top-level layouts, and
  backend/frontend contract mirrors
- Keep `HANDOFF.md` short and operational; do not use it as long-term memory
- When behavior changes, update canonical docs outside this folder in the same
  workstream
