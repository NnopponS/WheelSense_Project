# ADR 0015 — Five-Layer EaseAI Intelligence Pipeline

Status: Proposed (2026-04-20)
Supersedes: supplements ADR 0014 (agent runtime routing modes)
Owners: `server/app/agent_runtime/*`, `server/app/services/ai_chat.py`, `server/app/mcp/*`

## Context

Current EaseAI runtime has two routing modes (`intent`, `llm_tools`) inside one orchestrator (`server/app/agent_runtime/service.py`). This couples intent classification, context retrieval, LLM call, safety checks, and tool execution into ad-hoc branches. It lacks:

- A deterministic first stage to reject out-of-policy requests without any LLM call.
- A dedicated context-assembly stage that validates required facts before synthesis.
- An async behavioral-state pipeline that can update user profiles from history without blocking live responses.
- A structural separation between schema-grounded synthesis and safety-checked tool execution.
- A first-class observability surface that records per-layer events for auditing and debugging.

The user-provided architecture diagram (Intent Router → Context Requirement Engine → (async) Behavioral State → Constrained LLM Synthesis → Safety Check & Tool Execution, all emitting to an Observability Layer) captures the target.

## Decision

Adopt the five-layer pipeline as the canonical EaseAI runtime. Keep existing `intent` and `llm_tools` routers as adapters inside Layer 4. Run Layer 3 in an async worker — it MUST NOT block or trigger tools.

### Layer Map

| Layer | Module | Blocking? | Responsibility |
|-------|--------|-----------|----------------|
| L1 — Deterministic Intent Router | `agent_runtime/layers/layer1_intent_router.py` | yes | Classify intent + taxonomy check + confidence score; reject unsafe/out-of-scope deterministically (no LLM). |
| L2 — Context Requirement Engine | `agent_runtime/layers/layer2_context_engine.py` | yes | Assemble minimal structured context from contracts + live system state; produce a **Validated Context Package** consumed by L4. Fails if required facts missing. |
| L3 — Behavioral State Engine | `agent_runtime/layers/layer3_behavioral_state.py` + Celery/asyncio worker | **no** (async) | Analyze historical data + user profile; persist **Versioned Behavioral State**. Statistically grounded; separated from real-time flow; does not trigger tools. |
| L4 — Constrained LLM Synthesis | `agent_runtime/layers/layer4_constrained_synthesis.py` | yes | Schema-compliant tool instructions + grounded response. Uses ONLY the validated context from L2 plus (optional) snapshot of L3 state. Existing `llm_tool_router` + `intent` handlers become strategies here. |
| L5 — Safety Check & Tool Execution | `agent_runtime/layers/layer5_safety_execution.py` | yes | Validate proposed plan against policy; on invalid → safe-failure path. On valid → atomic tool execution + state update. Mutating plans still go through propose/confirm/execute (chat_actions). |
| Observability (cross-cutting) | `agent_runtime/layers/observability.py` + new `pipeline_events` table | both | Record events from every layer; enable auditing/debugging; link intent → execution flow via correlation id. |

### Data Contracts (new)

- `ValidatedContextPackage` — pydantic model returned by L2: `{ correlation_id, actor, intent, required_facts: dict, system_state_snapshot: dict, policy_tags: list[str] }`.
- `BehavioralStateSnapshot` — row in new `behavioral_states` table keyed by `(workspace_id, user_id, version)` with JSON `profile`, `last_updated`, `inputs_hash`.
- `PipelineEvent` — row in new `pipeline_events` table: `correlation_id`, `layer`, `phase`, `payload_json`, `latency_ms`, `outcome`, `error`.

### Control Flow

```
request
  → L1.route(actor, message) → IntentDecision | Reject
  → L2.assemble(decision) → ValidatedContextPackage | MissingFacts
  → L4.synthesize(package, L3_snapshot_optional) → PlanOrAnswer
  → L5.guard_and_execute(plan) → ExecutionResult | SafeFailure
  → response

async (non-blocking): L3.update(workspace_id, user_id) every N events
```

All layers emit `PipelineEvent` with shared `correlation_id` (UUID v7). Frontend may expose trace with `?ai_trace=1` query param on propose calls.

### Role/Scope Enforcement

- L1 rejects when intent taxonomy disallows the role.
- L4 uses **existing** `ROLE_MCP_TOOL_ALLOWLIST` (`server/app/services/ai_chat.py`) as the only tool-catalog source.
- L5 re-checks scope at execution time (defense in depth) via `_require_scope` in `server/app/mcp/server.py`.

### i18n

- L4 replies in the locale requested in actor facts (`locale: "th" | "en"`).
- Error messages/safe-failure strings live in a new dict `agent_runtime/layers/messages.py` with `en` + `th` parity; frontend does not translate backend error text — backend returns both keys `{ locale, text }`.

## Consequences

Positive:
- Clear boundaries, testable per layer.
- Deterministic reject path reduces LLM calls and cost.
- Auditable per-event trail, no retrofit when auditors ask.
- Behavioral state decoupled → no feedback loops into live tool execution.

Negative / Risk:
- Latency: 4 sequential layers. Mitigation: L1 and L2 are pure-Python and cached; L3 async; L4 cost-routed.
- Larger code surface. Mitigation: strategies in L4 wrap existing routers; no rewrite.
- New tables (`behavioral_states`, `pipeline_events`). Mitigation: Alembic migration; TTL-prune in retention scheduler.

## Alternatives Considered

- Keep single-orchestrator with more branches. Rejected: already brittle.
- LangGraph-style explicit graph. Rejected: extra dep + lock-in; our flow is strictly linear with one async side path.

## Verification

- Unit tests per layer in `server/tests/agent_runtime/layers/`.
- Contract test: `test_pipeline_rejects_without_context` — L2 missing facts must short-circuit before L4.
- Observability test: `test_pipeline_events_recorded_for_all_layers`.
- Regression: existing `server/tests/test_chat_actions*.py` must pass unchanged (chat_actions 3-stage preserved).

## Docs To Update

- `server/AGENTS.md` §"AI Chat Integration (Frontend)" → add layer diagram reference.
- `docs/ARCHITECTURE.md` §"Intelligence" → link this ADR.
- `frontend/README.md` §"AI Chat Integration" → mention `?ai_trace=1`.
