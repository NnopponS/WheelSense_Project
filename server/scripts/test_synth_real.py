"""Test synthesis with real tool results from MCP."""
import asyncio, time, json
from app.db.session import AsyncSessionLocal
from app.models.core import Workspace
from app.models.users import User
from app.services.ai_chat import (
    get_workspace_ai_defaults, _system_prompt_for_role, _runtime_prompt_metadata,
    _messages_to_openai, stream_ollama, collect_chat_reply_best_effort,
)
from app.agent_runtime.service import _call_mcp_tool
from app.core.security import create_access_token
from app.schemas.chat import ChatMessagePart
from sqlalchemy import select

async def _run():
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.role=='admin', User.is_active.is_(True)).limit(1))).scalar_one()
        ws = (await db.execute(select(Workspace).where(Workspace.id==user.workspace_id))).scalar_one()
        provider, model = await get_workspace_ai_defaults(db, ws.id)

    token = create_access_token(subject=str(user.id), role=user.role)

    # Get real tool results
    t0 = time.perf_counter()
    result = await _call_mcp_tool(token, "list_active_alerts", {})
    mcp_latency = time.perf_counter() - t0
    result_str = json.dumps(result) if not isinstance(result, str) else result
    print(f"MCP latency: {mcp_latency:.2f}s")
    print(f"Result length: {len(result_str)} chars")
    print(f"Result preview: {result_str[:300]}")

    # Test synthesis with real data
    system_text = _system_prompt_for_role(user.role)
    messages = [ChatMessagePart(
        role="user",
        content=(
            f"User request: show me active alerts\n\n"
            f"Ground truth WheelSense tool results:\n\n"
            f"Tool `list_active_alerts` JSON:\n{result_str}\n\n"
            "Answer in English. Use only the grounded tool results. Do not dump raw JSON."
        )
    )]

    print(f"\nMessage length: {len(messages[0].content)} chars")

    print("\n--- Test: collect_chat_reply_best_effort ---")
    attempts = []
    t0 = time.perf_counter()
    async with AsyncSessionLocal() as db:
        reply = await collect_chat_reply_best_effort(
            db=db, user=user, workspace=ws, messages=messages,
            provider_attempts_out=attempts,
        )
    elapsed = time.perf_counter() - t0
    print(f"Latency: {elapsed:.2f}s")
    print(f"Reply: {reply[:300]}")
    print(f"Attempts: {json.dumps(attempts, indent=2, default=str)[:500]}")

asyncio.run(_run())
