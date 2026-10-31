"""Inject a message and time EACH layer of the EaseAI pipeline separately.

Runs INSIDE the agent-runtime container:
    docker exec -e PYTHONPATH=/app wheelsense-agent-runtime \
        python /app/scripts/diagnose_pipeline_layers.py "<message>"
"""

from __future__ import annotations

import argparse
import asyncio
import time

from app.config import settings
from app.agent_runtime.service import (
    propose_turn,
    _clarification_reply_for_ambiguous_request,
    _try_deterministic_read_answer,
    _try_v2_llm_tools_strategy,
    _get_or_create_context,
    _seed_visible_patient_context_for_task_request,
)
from app.agent_runtime.intent import IntentClassifier
from app.agent_runtime.layers.layer1_intent_router import route, Correlation, ActorFacts
from app.agent_runtime.layers.layer2_context_engine import assemble
from app.schemas.chat import ChatMessagePart


async def _run(message: str) -> None:
    from app.core.security import create_access_token
    from app.db.session import AsyncSessionLocal
    from app.models.users import User
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(User).where(User.role == "admin", User.is_active.is_(True)).limit(1)
        )
        user = result.scalar_one()
    token = create_access_token(subject=str(user.id), role=user.role)

    print(f"Config: v2={settings.easeai_pipeline_v2} "
          f"routing={settings.agent_routing_mode} "
          f"lock={settings.easeai_deterministic_answer_lock_enabled}")
    print(f"Provider: {settings.ai_provider} model={settings.ai_default_model}")
    print(f"Message: {message!r}")
    print("=" * 70)

    context = _get_or_create_context(None)
    messages = [ChatMessagePart(role="user", content=message)]

    # ── Layer 0: context seed ──────────────────────────────────────────────
    t0 = time.perf_counter()
    await _seed_visible_patient_context_for_task_request(
        conversation_id=None, actor_access_token=token, message=message, context=context
    )
    print(f"[seed]            {time.perf_counter()-t0:.3f}s")

    # ── Lock #1: clarification ─────────────────────────────────────────────
    t0 = time.perf_counter()
    clar = _clarification_reply_for_ambiguous_request(message, context)
    print(f"[clarification]    {time.perf_counter()-t0:.3f}s  → {'LOCKED' if clar else 'pass'}")

    # ── Lock #2: deterministic read ────────────────────────────────────────
    t0 = time.perf_counter()
    det_read = await _try_deterministic_read_answer(
        actor_access_token=token, message=message, conversation_id=None,
        page_context=None, lock_enabled=settings.easeai_deterministic_answer_lock_enabled,
    )
    print(f"[det_read]         {time.perf_counter()-t0:.3f}s  → {'LOCKED' if det_read else 'pass'}")

    # ── Layer 1: intent router ─────────────────────────────────────────────
    t0 = time.perf_counter()
    from datetime import datetime, timezone
    import uuid
    corr = Correlation(id=str(uuid.uuid4()), started_at=datetime.now(timezone.utc))
    actor = ActorFacts(user_id=user.id, role=user.role, workspace_id=user.workspace_id)
    intent = route(corr, actor, message, context=context)
    intent_desc = getattr(intent, 'intent_key', None) or getattr(intent, 'decision', 'reject')
    print(f"[L1 route]         {time.perf_counter()-t0:.3f}s  → {intent_desc}")

    # ── Layer 2: context engine ────────────────────────────────────────────
    t0 = time.perf_counter()
    ctx_result = assemble(corr, actor, intent, system_state={})
    ctx_type = type(ctx_result).__name__
    print(f"[L2 assemble]      {time.perf_counter()-t0:.3f}s  → {ctx_type}")

    # ── LLM tool router (the AI pipeline primary) ──────────────────────────
    t0 = time.perf_counter()
    llm_routed = await _try_v2_llm_tools_strategy(
        actor_access_token=token, message=message, messages=messages, conversation_id=None,
    )
    llm_latency = time.perf_counter() - t0
    if llm_routed:
        g = llm_routed.grounding or {}
        print(f"[LLM router]       {llm_latency:.3f}s  → method={g.get('classification_method')} "
              f"strategy={g.get('strategy')}")
    else:
        print(f"[LLM router]       {llm_latency:.3f}s  → None (no route, will fallback)")

    # ── Full propose_turn (end-to-end) ─────────────────────────────────────
    t0 = time.perf_counter()
    result = await propose_turn(
        actor_access_token=token, message=message, messages=messages, conversation_id=None,
    )
    total = time.perf_counter() - t0
    g = result.grounding or {}
    print(f"\n[FULL propose]     {total:.3f}s")
    print(f"  mode={result.mode}")
    print(f"  method={g.get('classification_method')}")
    print(f"  strategy={g.get('strategy')}")
    print(f"  reply={result.assistant_reply[:200]}")
    attempts = g.get("provider_attempts") or []
    if attempts:
        print(f"  provider_attempts:")
        for a in attempts:
            if isinstance(a, dict):
                print(f"    provider={a.get('provider')} model={a.get('model')} "
                      f"status={a.get('status')} latency_ms={a.get('latency_ms')}")
    print(f"\n=== TOTAL: {total:.2f}s ===")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("message")
    args = parser.parse_args()
    asyncio.run(_run(args.message))


if __name__ == "__main__":
    main()
