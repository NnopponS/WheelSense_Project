"""Layer 2 — Context Requirement Engine (ADR 0015).

Responsibility:
  - Accept an `IntentDecision` from Layer 1.
  - Assemble the minimal structured context needed by Layer 4 to synthesize
    a safe, grounded response.
  - Return `ValidatedContextPackage` on success.
  - Return `MissingFacts` when a required field (e.g. patient_id for patient-
    scoped tools) cannot be resolved from the `ActorFacts`.
  - Emit `PipelineEvent` (layer=2) at entry and exit.
  - MUST NOT call the LLM, execute MCP tools, or touch the database.
    It reads only the in-memory `ActorFacts` + the caller-supplied
    `system_state` snapshot (assembled by the orchestrator from already-loaded
    query results, never re-fetched here).

Design note: the full context engine in a later slice will query the DB for
workspace policies, room layout, etc. This scaffolding delivers the contract
and the patient-scoped guard that L2 is most critically responsible for.
"""

from __future__ import annotations

import time
from typing import Any

from app.agent_runtime.layers import messages as layer_messages
from app.agent_runtime.layers.contracts import (
    ActorFacts,
    Correlation,
    IntentDecision,
    MissingFacts,
    PipelineEvent,
    ValidatedContextPackage,
)
from app.agent_runtime.layers.observability import PipelineEventEmitter

# Tools that unconditionally require a non-None patient_id in ActorFacts.
# When the intent's matched_tool is in this set and actor.patient_id is None,
# Layer 2 returns MissingFacts instead of a ValidatedContextPackage.
_PATIENT_SCOPED_TOOLS: frozenset[str] = frozenset(
    {
        "get_patient_details",
        "get_patient_vitals",
        "get_patient_timeline",
        "list_patient_caregivers",
        "list_patient_devices",
        "list_patient_contacts",
    }
)

# Tools that are read-only; this drives the "read_only" policy tag.
# Derived from TOOL_INTENT_METADATA in intent.py — duplicated here to keep
# Layer 2 free of cyclic imports.  When the set drifts, a unit test will
# catch it early.
_READ_ONLY_TOOLS: frozenset[str] = frozenset(
    {
        "get_current_user_context",
        "get_system_health",
        "list_workspaces",
        "list_visible_patients",
        "get_patient_details",
        "list_devices",
        "list_active_alerts",
        "list_rooms",
        "list_workflow_tasks",
        "list_workflow_schedules",
        "list_facilities",
        "get_ai_runtime_summary",
        "get_patient_vitals",
        "get_patient_timeline",
        "list_patient_caregivers",
        "get_message_recipients",
        "get_workspace_analytics",
        "get_facility_details",
        "get_floorplan_layout",
        "list_prescriptions",
        "list_pharmacy_orders",
        "list_service_requests",
        "list_support_tickets",
        "list_messages",
        "list_calendar_events",
        "list_patient_devices",
        "list_patient_contacts",
    }
)


def _emit(emitter: PipelineEventEmitter | None, event: PipelineEvent) -> None:
    if emitter is not None:
        emitter.emit(event)


def assemble(
    correlation: Correlation,
    actor: ActorFacts,
    intent: IntentDecision,
    *,
    system_state: dict[str, Any],
    emitter: PipelineEventEmitter | None = None,
) -> ValidatedContextPackage | MissingFacts:
    """Assemble a ValidatedContextPackage or return MissingFacts.

    Parameters
    ----------
    correlation:
        Shared correlation object, provides the correlation_id.
    actor:
        Resolved facts about the requesting user (role, ids, locale).
    intent:
        IntentDecision from Layer 1 (accept path only — caller must not pass
        a RejectDecision).
    system_state:
        Snapshot dict assembled by the orchestrator before calling this layer;
        passes through unchanged into `system_state_snapshot`.
    emitter:
        Optional observability emitter.  Tests may pass None to exercise the
        no-emitter code path.
    """
    started_ns = time.monotonic_ns()

    _emit(
        emitter,
        PipelineEvent(
            correlation_id=correlation.id,
            layer=2,
            phase="entry",
            outcome="pending",
            payload={
                "role": actor.role,
                "intent_key": intent.intent_key,
                "matched_tool": intent.matched_tool,
            },
        ),
    )

    # ── Patient-scope guard ───────────────────────────────────────────────────
    matched_tool = intent.matched_tool or ""
    if matched_tool in _PATIENT_SCOPED_TOOLS and actor.patient_id is None:
        reason = "missing_patient_context"
        en, th = layer_messages.pair(reason)
        missing = MissingFacts(
            reason_code=reason,
            fields=["patient_id"],
            message_en=en,
            message_th=th,
        )
        elapsed_ms = max(0, (time.monotonic_ns() - started_ns) // 1_000_000)
        _emit(
            emitter,
            PipelineEvent(
                correlation_id=correlation.id,
                layer=2,
                phase="exit",
                outcome="reject",
                latency_ms=int(elapsed_ms),
                payload={"reason_code": reason, "missing_fields": ["patient_id"]},
            ),
        )
        return missing

    # ── Assemble required facts ───────────────────────────────────────────────
    required_facts: dict[str, Any] = {"workspace_id": actor.workspace_id}
    if actor.patient_id is not None:
        required_facts["patient_id"] = actor.patient_id

    # ── Policy tags ───────────────────────────────────────────────────────────
    policy_tags: list[str] = []
    if matched_tool in _READ_ONLY_TOOLS:
        policy_tags.append("read_only")
    if actor.patient_id is not None:
        policy_tags.append("patient_scoped")

    # ── Build package ─────────────────────────────────────────────────────────
    package = ValidatedContextPackage(
        correlation_id=correlation.id,
        actor=actor,
        intent=intent,
        required_facts=required_facts,
        system_state_snapshot=system_state,
        policy_tags=policy_tags,
    )

    elapsed_ms = max(0, (time.monotonic_ns() - started_ns) // 1_000_000)
    _emit(
        emitter,
        PipelineEvent(
            correlation_id=correlation.id,
            layer=2,
            phase="exit",
            outcome="accept",
            latency_ms=int(elapsed_ms),
            payload={
                "policy_tags": policy_tags,
                "required_facts_keys": list(required_facts.keys()),
            },
        ),
    )
    return package


__all__ = ["assemble"]
