"""Time each sub-step of the LLM tool router with Copilot as primary provider.

Measures:
1. Copilot JSON tool call (tool selection)
2. Cloud provider tool call via native tools= (if Copilot fails)
3. MCP tool execution
4. Grounded answer synthesis (Copilot vs cloud provider)

Runs INSIDE the agent-runtime container:
    docker exec -e PYTHONPATH=/app wheelsense-agent-runtime \
        python /app/scripts/diagnose_copilot_only.py "<message>"
"""

from __future__ import annotations

import argparse
import asyncio
import time
import json

from app.config import settings
from app.db.session import AsyncSessionLocal
from app.models.core import Workspace
from app.models.users import User
from app.services import ai_chat
from app.services.ai_chat import (
    CLOUD_PROVIDER_URLS,
    get_cloud_provider_options,
    resolve_effective_ai,
    collect_copilot_json_tool_calls,
    stream_copilot,
    get_workspace_copilot_token,
    _messages_to_openai,
)
from app.agent_runtime.llm_tool_router import (
    build_openai_tools_for_role,
    _router_system_prompt,
    complete_openai_compatible_tool_calls,
    ParsedToolCall,
)
from app.agent_runtime.service import _call_mcp_tool
from app.schemas.chat import ChatMessagePart
from sqlalchemy import select


async def _run(message: str) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(User).where(User.role == "admin", User.is_active.is_(True)).limit(1)
        )
        user = result.scalar_one()
        ws_result = await db.execute(
            select(Workspace).where(Workspace.id == user.workspace_id)
        )
        workspace = ws_result.scalar_one()

    print(f"Message: {message!r}")
    print(f"Workspace: {workspace.name} (id={workspace.id})")
    print(f"User: id={user.id} role={user.role}")
    print("=" * 70)

    # Check effective provider
    async with AsyncSessionLocal() as db:
        provider, model = await resolve_effective_ai(
            db, workspace_id=workspace.id, override_provider=None, override_model=None
        )
    print(f"Effective provider: {provider} model={model}")
    cloud_options = None
    if provider in CLOUD_PROVIDER_URLS:
        async with AsyncSessionLocal() as db:
            cloud_options = await get_cloud_provider_options(db, workspace.id, provider)
    print(f"Cloud options resolved: {'yes' if cloud_options else 'no'}")
    print("=" * 70)

    role = str(user.role or "")
    tools = build_openai_tools_for_role(role)
    print(f"Available tools for role={role}: {len(tools)}")
    for t in tools[:5]:
        print(f"  - {t['function']['name']}: {t['function']['description'][:60]}")
    if len(tools) > 5:
        print(f"  ... and {len(tools)-5} more")
    print("=" * 70)

    system = _router_system_prompt(role)

    # ── Step 1: Copilot JSON tool call ─────────────────────────────────────
    print("\n[1] Copilot JSON tool call (tool selection)...")
    t0 = time.perf_counter()
    async with AsyncSessionLocal() as db:
        try:
            copilot_calls = await collect_copilot_json_tool_calls(
                db=db, user=user, workspace=workspace,
                system_text=system, user_prompt=message,
            )
        except Exception as e:
            copilot_calls = []
            print(f"    ERROR: {e}")
    copilot_latency = time.perf_counter() - t0
    print(f"    latency: {copilot_latency:.2f}s")
    print(f"    calls: {len(copilot_calls)}")
    for c in copilot_calls:
        print(f"    → {c.name}({json.dumps(c.arguments)[:100]})")

    # ── Step 2: Cloud tool call (native tools= API, for comparison) ────────
    print(f"\n[2] Cloud tool call via {provider} (native tools= API)...")
    oai_messages = _messages_to_openai(
        [ChatMessagePart(role="user", content=message)], system
    )
    cloud_calls, cloud_text = [], ""
    if cloud_options:
        t0 = time.perf_counter()
        try:
            cloud_calls, cloud_text = await complete_openai_compatible_tool_calls(
                model=model,
                messages=oai_messages,
                tools=tools,
                **cloud_options,
            )
        except Exception as e:
            cloud_calls, cloud_text = [], str(e)
        cloud_latency = time.perf_counter() - t0
        print(f"    latency: {cloud_latency:.2f}s")
        print(f"    calls: {len(cloud_calls)}")
        for c in cloud_calls:
            print(f"    → {c.name}({json.dumps(c.arguments)[:100]})")
        if cloud_text:
            print(f"    text: {cloud_text[:150]}")
    else:
        print("    skipped: no OpenAI-compatible provider configured")

    # ── Step 3: MCP tool execution (if any calls) ──────────────────────────
    all_calls = copilot_calls or cloud_calls
    if all_calls:
        from app.core.security import create_access_token
        token = create_access_token(subject=str(user.id), role=user.role)
        print(f"\n[3] MCP tool execution ({len(all_calls)} tool(s))...")
        for call in all_calls:
            t0 = time.perf_counter()
            try:
                result = await _call_mcp_tool(token, call.name, call.arguments)
                mcp_latency = time.perf_counter() - t0
                result_str = json.dumps(result) if not isinstance(result, str) else result
                print(f"    {call.name}: {mcp_latency:.2f}s")
                print(f"    result: {result_str[:200]}")
            except Exception as e:
                print(f"    {call.name}: ERROR {e}")

        # ── Step 4: Grounded answer synthesis ──────────────────────────────
        print(f"\n[4] Grounded answer synthesis (Copilot)...")
        t0 = time.perf_counter()
        async with AsyncSessionLocal() as db:
            github_token = await get_workspace_copilot_token(db, workspace.id)
        prompt = (
            f"{system}\n\nUser asked: {message}\n\n"
            f"Tool result: {result_str[:500]}\n\n"
            "Summarize this for the user in 2-3 sentences."
        )
        parts = []
        try:
            async for chunk in stream_copilot(
                model=model or "gpt-4.1", prompt=prompt, github_token=github_token,
            ):
                parts.append(chunk)
                if sum(len(p) for p in parts) > 500:
                    break
        except Exception as e:
            parts = [f"ERROR: {e}"]
        copilot_synth_latency = time.perf_counter() - t0
        print(f"    latency: {copilot_synth_latency:.2f}s")
        print(f"    reply: {''.join(parts)[:200]}")

        if cloud_options:
            print(f"\n[4b] Grounded answer synthesis ({provider})...")
            t0 = time.perf_counter()
            from app.services.ai_chat import stream_openai_compatible
            synth_messages = _messages_to_openai(
                [ChatMessagePart(role="user", content=prompt)], system
            )
            parts = []
            try:
                async for chunk in stream_openai_compatible(model=model, oai_messages=synth_messages, **cloud_options):
                    parts.append(chunk)
                    if sum(len(p) for p in parts) > 500:
                        break
            except Exception as e:
                parts = [f"ERROR: {e}"]
            cloud_synth_latency = time.perf_counter() - t0
            print(f"    latency: {cloud_synth_latency:.2f}s")
            print(f"    reply: {''.join(parts)[:200]}")
    else:
        print("\n[3-4] Skipped (no tool calls)")

    # ── Summary ────────────────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("=== LATENCY SUMMARY ===")
    print(f"  Copilot tool selection:  {copilot_latency:.2f}s  ({len(copilot_calls)} calls)")
    if cloud_options:
        print(f"  Cloud tool selection:    {cloud_latency:.2f}s  ({len(cloud_calls)} calls)")
    if all_calls:
        print(f"  Copilot synthesis:       {copilot_synth_latency:.2f}s")
        total_copilot = copilot_latency + mcp_latency + copilot_synth_latency
        print(f"  ─────────────────────────────────")
        print(f"  TOTAL Copilot path:      {total_copilot:.2f}s")
        if cloud_options:
            print(f"  Cloud synthesis:         {cloud_synth_latency:.2f}s")
            total_cloud = cloud_latency + mcp_latency + cloud_synth_latency
            print(f"  TOTAL Cloud path:        {total_cloud:.2f}s")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("message")
    args = parser.parse_args()
    asyncio.run(_run(args.message))


if __name__ == "__main__":
    main()
