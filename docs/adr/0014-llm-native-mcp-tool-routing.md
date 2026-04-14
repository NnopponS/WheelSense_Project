# ADR 0014: LLM-native MCP tool routing (feature-flagged)

## Status

Accepted

## Date

2026-04-13

## Context

The agent runtime historically routed user chat toward MCP tools using a hand-maintained intent layer (`IntentClassifier`, regex, embeddings, optional LLM normalization). That pipeline is brittle for compound Thai/English requests and duplicates mental models already expressed in MCP tool definitions.

We need a path where the model selects tools from the **same** workspace tool registry the MCP server exposes, while preserving:

- Workspace scope and role checks at MCP execution time
- No client-supplied `workspace_id`
- **Read** tools: may run during `propose` when they are the only selected tools, then answers are grounded on tool JSON
- **Write** tools: always return `mode=plan` and the existing chat-actions **Confirm → Execute** flow

## Decision

1. Introduce `AGENT_ROUTING_MODE` (`intent` | `llm_tools`) in server settings, default `intent`.
2. When `llm_tools` is enabled, `propose_turn` first calls `app/agent_runtime/llm_tool_router.py`, which:
   - Builds OpenAI `tools` JSON from `_WORKSPACE_TOOL_REGISTRY` signatures and filters by `ROLE_MCP_TOOL_ALLOWLIST` (aligned with MCP-enforceable scopes).
   - Calls Ollama via `chat.completions.create(..., tools=[...])` on `OLLAMA_BASE_URL`.
   - If Ollama returns no `tool_calls`, optionally parses a strict JSON `{ "tool_calls": [...] }` blob from the workspace **primary** chat provider (Copilot or Ollama stream) as a secondary spike.
   - Validates tool names and drops disallowed tools before any MCP call.
3. If the LLM router cannot handle the turn (errors, empty selection after validation), **fall back** to the existing intent pipeline unchanged.
4. Keep `INTENT_AI_CONVERSATION_FASTPATH_ENABLED` ahead of both branches for obvious chit-chat.

## Consequences

- **Pros:** Better coverage for ambiguous or multilingual routing; fewer bespoke intent examples to maintain for new MCP tools.
- **Cons:** Extra latency and token cost on `propose` when `llm_tools` is on; requires a reachable Ollama instance for the native tool path.
- **Ops:** Document that the router uses `OLLAMA_BASE_URL` even when chat defaults to Copilot, unless operators rely on JSON fallback only.

## Related

- `server/app/agent_runtime/service.py` — branch + fallback
- `server/app/services/ai_chat.py` — Ollama tool completion, multi-tool grounding, expanded allowlist
- `server/docs/ENV.md` — `AGENT_ROUTING_MODE`, `AGENT_LLM_ROUTER_MODEL`
