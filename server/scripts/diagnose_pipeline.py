"""Inject a message directly into the EaseAI pipeline and time each layer.

Runs INSIDE the agent-runtime container. Prints per-layer timing and the
final grounding so we can see which layer ran and where latency lives.

Usage (from host):
    docker exec wheelsense-agent-runtime python /app/scripts/diagnose_pipeline.py "<message>"

Or with a specific conversation_id:
    docker exec wheelsense-agent-runtime python /app/scripts/diagnose_pipeline.py "<message>" --conversation-id 42
"""

from __future__ import annotations

import argparse
import asyncio
import json
import time
from typing import Any

# We import inside the container's app context.
from app.agent_runtime.service import propose_turn
from app.schemas.chat import ChatMessagePart


async def _run(message: str, conversation_id: int | None) -> None:
    # We need a valid actor token. The agent-runtime uses INTERNAL_SERVICE_SECRET
    # for inter-service calls, but propose_turn expects a user JWT-like token.
    # The simplest path: query the DB for an admin user and mint a token.
    import os

    from app.core.security import create_access_token
    from app.db.session import AsyncSessionLocal
    from app.models.core import Workspace
    from app.models.users import User
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(User).where(User.role == "admin", User.is_active.is_(True)).limit(1)
        )
        user = result.scalar_one_or_none()
        if user is None:
            print("ERROR: no active admin user found in DB")
            return
        token = create_access_token(subject=str(user.id), role=user.role)
        ws_result = await db.execute(
            select(Workspace).where(Workspace.id == user.workspace_id)
        )
        ws = ws_result.scalar_one_or_none()
        print(f"Actor: user_id={user.id} role={user.role} workspace_id={user.workspace_id}")
        print(f"Workspace: {ws.name if ws else '???'}")
        print(f"Message: {message!r}")
        print(f"Conversation: {conversation_id}")
        print("-" * 70)

    messages = [ChatMessagePart(role="user", content=message)]

    t0 = time.perf_counter()
    result = await propose_turn(
        actor_access_token=token,
        message=message,
        messages=messages,
        conversation_id=conversation_id,
    )
    elapsed = time.perf_counter() - t0

    print(f"\n=== RESULT ({elapsed:.2f}s) ===")
    print(f"mode: {result.mode}")
    print(f"reply: {result.assistant_reply[:300]}")
    g = result.grounding or {}
    print(f"\n--- grounding ---")
    # Print grounding in a stable order.
    priority = [
        "classification_method",
        "pipeline_version",
        "strategy",
        "confidence",
        "reason_code",
        "tool_name",
        "fallback_from",
        "provider_attempts",
    ]
    for key in priority:
        if key in g:
            val = g[key]
            if key == "provider_attempts" and isinstance(val, list):
                print(f"  {key}:")
                for i, attempt in enumerate(val):
                    if isinstance(attempt, dict):
                        print(f"    [{i}] provider={attempt.get('provider')} "
                              f"model={attempt.get('model')} "
                              f"status={attempt.get('status')} "
                              f"latency_ms={attempt.get('latency_ms')}")
                    else:
                        print(f"    [{i}] {attempt}")
            else:
                print(f"  {key}: {val}")
    # Print any remaining keys.
    for key, val in g.items():
        if key in priority or key in ("response_cards", "result"):
            continue
        sval = str(val)
        if len(sval) > 200:
            sval = sval[:200] + "..."
        print(f"  {key}: {sval}")

    cards = g.get("response_cards") or []
    if cards:
        print(f"\n--- response_cards ({len(cards)}) ---")
        for c in cards[:3]:
            print(f"  kind={c.get('kind')} label={c.get('label','')[:60]}")

    print(f"\n=== TOTAL LATENCY: {elapsed:.2f}s ===")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("message", help="Message to inject")
    parser.add_argument("--conversation-id", type=int, default=None)
    args = parser.parse_args()
    asyncio.run(_run(args.message, args.conversation_id))


if __name__ == "__main__":
    main()
