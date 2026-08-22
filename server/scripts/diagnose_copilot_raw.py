"""See what Copilot actually returns for tool selection prompt."""
import asyncio, time
from app.db.session import AsyncSessionLocal
from app.models.core import Workspace
from app.models.users import User
from app.services.ai_chat import (
    resolve_effective_ai, get_workspace_copilot_token, stream_copilot,
    _messages_to_copilot_prompt, parse_tool_calls_json_blob,
)
from app.agent_runtime.llm_tool_router import build_openai_tools_for_role, _router_system_prompt
from app.schemas.chat import ChatMessagePart
from sqlalchemy import select

async def _run():
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.role=="admin", User.is_active.is_(True)).limit(1))).scalar_one()
        ws = (await db.execute(select(Workspace).where(Workspace.id==user.workspace_id))).scalar_one()
        provider, model = await resolve_effective_ai(db, workspace_id=ws.id, override_provider=None, override_model=None)
        github_token = await get_workspace_copilot_token(db, ws.id)

    role = "admin"
    tools = build_openai_tools_for_role(role)
    system = _router_system_prompt(role)
    message = "show me active alerts"

    # Build the exact prompt that collect_copilot_json_tool_calls sends
    routing_tail = (
        f"{message}\n\n"
        "Respond with ONLY a single JSON object, no markdown, in this exact shape:\n"
        '{"tool_calls":[{"name":"<mcp_tool_name>","arguments":{}}]}\n'
        "Use an empty tool_calls array if no tool applies."
    )
    messages = [ChatMessagePart(role="user", content=routing_tail)]
    oai_system = (
        system
        + "\n\nYou are a routing engine. Output valid JSON only. "
        "Never call tools yourself; only list intended tool names and arguments."
    )
    prompt = oai_system + "\n\nCONVERSATION:\n" + _messages_to_copilot_prompt(messages)

    print(f"Provider: {provider} model={model}")
    print(f"Prompt length: {len(prompt)} chars")
    print(f"Tool count: {len(tools)}")
    print("=" * 70)

    t0 = time.perf_counter()
    parts = []
    async for chunk in stream_copilot(model=model or "gpt-4.1", prompt=prompt, github_token=github_token):
        parts.append(chunk)
    elapsed = time.perf_counter() - t0
    raw = "".join(parts)

    print(f"Copilot latency: {elapsed:.2f}s")
    print(f"Raw response ({len(raw)} chars):")
    print("-" * 70)
    print(raw[:1000])
    print("-" * 70)

    parsed = parse_tool_calls_json_blob(raw)
    print(f"Parsed tool calls: {len(parsed)}")
    for c in parsed:
        print(f"  → {c.name}({c.arguments})")

asyncio.run(_run())
