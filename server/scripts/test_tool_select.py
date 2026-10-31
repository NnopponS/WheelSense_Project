"""Test just the LLM tool selection for a message."""
import asyncio, time, json
from app.db.session import AsyncSessionLocal
from app.models.core import Workspace
from app.models.users import User
from app.services.ai_chat import (
    CLOUD_PROVIDER_URLS, get_cloud_provider_options, resolve_effective_ai, _messages_to_openai,
)
from app.agent_runtime.llm_tool_router import (
    build_openai_tools_for_role, _router_system_prompt, complete_openai_compatible_tool_calls
)
from sqlalchemy import select

async def _run():
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.role=='admin', User.is_active.is_(True)).limit(1))).scalar_one()
        ws = (await db.execute(select(Workspace).where(Workspace.id==user.workspace_id))).scalar_one()
        provider, model = await resolve_effective_ai(db=db, workspace_id=ws.id, override_provider=None, override_model=None)

    message = sys.argv[1] if len(sys.argv) > 1 else "Who is Robert"
    role = user.role
    tools = build_openai_tools_for_role(role)
    system = _router_system_prompt(role)

    print(f"Message: {message!r}")
    print(f"Provider: {provider} model={model}")
    print(f"Tools: {len(tools)}")
    print("=" * 60)

    # Use the exact cloud-provider tool call path
    if provider not in CLOUD_PROVIDER_URLS:
        print(f"Provider {provider} is not OpenAI-compatible; nothing to test.")
        return
    from app.schemas.chat import ChatMessagePart
    oai_messages = _messages_to_openai([ChatMessagePart(role="user", content=message)], system)
    async with AsyncSessionLocal() as db:
        options = await get_cloud_provider_options(db, ws.id, provider)

    t0 = time.perf_counter()
    calls, text = await complete_openai_compatible_tool_calls(
        model=model,
        messages=oai_messages,
        tools=tools,
        **options,
    )
    elapsed = time.perf_counter() - t0
    print(f"Latency: {elapsed:.2f}s")
    print(f"Text: {text[:200]}")
    print(f"Calls ({len(calls)}):")
    for c in calls:
        print(f"  → {c.name}({json.dumps(c.arguments)[:120]})")

import sys
asyncio.run(_run())
