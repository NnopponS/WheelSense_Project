"""Focused checks for common cases and errors."""
import asyncio, time, json, sys
from app.db.session import AsyncSessionLocal
from app.models.core import Workspace
from app.models.users import User
from app.agent_runtime.service import propose_turn
from app.core.security import create_access_token
from sqlalchemy import select

CASES = [
    ("Who is Robert?", "identity"),
    ("Where is Robert?", "location"),
    ("Robert timeline", "timeline"),
    ("Robert vitals", "vitals"),
    ("Show active alerts", "alerts"),
    ("Any fall alerts?", "alerts"),
    ("List devices", "devices"),
    ("Show all patients", "patients"),
    ("List staff", "staff"),
    ("Show my tasks", "tasks"),
    ("Messages", "messages"),
    ("Medication list", "medication"),
    ("Hello", "chitchat"),
]


async def _run():
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.role=="admin", User.is_active.is_(True)).limit(1))).scalar_one()
        ws = (await db.execute(select(Workspace).where(Workspace.id==user.workspace_id))).scalar_one()
    token = create_access_token(subject=str(user.id), role=user.role)

    for message, tag in CASES:
        print(f"\n[{tag}] {message!r}")
        t0 = time.perf_counter()
        try:
            resp = await asyncio.wait_for(
                propose_turn(actor_access_token=token, message=message, messages=[], conversation_id=None),
                timeout=90.0,
            )
            elapsed = time.perf_counter() - t0
            method = resp.grounding.get("classification_method") if resp.grounding else "none"
            tools = resp.grounding.get("tool_names", []) if resp.grounding else []
            reply = (resp.assistant_reply or "")[:150]
            print(f"  ✅ {elapsed:.1f}s mode={resp.mode} method={method} tools={tools}")
            print(f"     reply: {reply}")
        except Exception as e:
            elapsed = time.perf_counter() - t0
            print(f"  ❌ {elapsed:.1f}s {type(e).__name__}: {str(e)[:150]}")


asyncio.run(_run())
