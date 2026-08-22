"""Test streaming synthesis with the actual system prompt."""
import asyncio, time, json
from app.db.session import AsyncSessionLocal
from app.models.core import Workspace
from app.models.users import User
from app.services.ai_chat import (
    get_workspace_ai_defaults, _system_prompt_for_role, _runtime_prompt_metadata,
    _messages_to_openai, stream_ollama, stream_chat_response,
)
from app.schemas.chat import ChatMessagePart
from sqlalchemy import select

async def _run():
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.role=='admin', User.is_active.is_(True)).limit(1))).scalar_one()
        ws = (await db.execute(select(Workspace).where(Workspace.id==user.workspace_id))).scalar_one()
        provider, model = await get_workspace_ai_defaults(db, ws.id)

    print(f"Provider: {provider} Model: {model}")

    system_text = _system_prompt_for_role(user.role)
    messages = [ChatMessagePart(
        role="user",
        content=(
            "User request: show me active alerts\n\n"
            "Ground truth WheelSense tool results:\n\n"
            'Tool `list_active_alerts` JSON:\n[{"id": 4211, "alert_type": "fall", "severity": "critical", "status": "acknowledged", "patient_id": 70}]\n\n'
            "Answer in English. Use only the grounded tool results. Do not dump raw JSON."
        )
    )]

    # Test 1: Direct stream_ollama
    print("\n--- Test 1: Direct stream_ollama ---")
    ollama_system = system_text + _runtime_prompt_metadata(provider="ollama", configured_model=model)
    oai_messages = _messages_to_openai(messages, ollama_system)
    print(f"System prompt length: {len(ollama_system)} chars")
    print(f"Messages: {len(oai_messages)}")
    t0 = time.perf_counter()
    parts = []
    async for chunk in stream_ollama(model=model, oai_messages=oai_messages):
        parts.append(chunk)
    elapsed = time.perf_counter() - t0
    reply = "".join(parts)
    print(f"Latency: {elapsed:.2f}s")
    print(f"Reply: {reply[:200]}")

    # Test 2: stream_chat_response (the real path)
    print("\n--- Test 2: stream_chat_response ---")
    t0 = time.perf_counter()
    parts = []
    async with AsyncSessionLocal() as db:
        async for chunk in stream_chat_response(
            db=db, user=user, workspace=ws, messages=messages,
            provider_override=provider, model_override=model,
        ):
            parts.append(chunk)
    elapsed = time.perf_counter() - t0
    reply = "".join(parts)
    print(f"Latency: {elapsed:.2f}s")
    print(f"Reply: {reply[:200]}")

asyncio.run(_run())
