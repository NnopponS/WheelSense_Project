"""Clean result check with output to file."""
import asyncio, time, json, sys, traceback
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

    lines = [f"Workspace: {ws.name}", "=" * 80]
    for message, tag in CASES:
        t0 = time.perf_counter()
        try:
            resp = await asyncio.wait_for(
                propose_turn(actor_access_token=token, message=message, messages=[], conversation_id=None),
                timeout=90.0,
            )
            elapsed = time.perf_counter() - t0
            method = resp.grounding.get("classification_method") if resp.grounding else "none"
            tools = resp.grounding.get("tool_names", []) if resp.grounding else []
            reply = (resp.assistant_reply or "")[:180].replace("\n", " ")
            lines.append(f"\n[{tag}] {message!r}")
            lines.append(f"  OK {elapsed:.1f}s mode={resp.mode} method={method}")
            lines.append(f"  tools={tools}")
            lines.append(f"  reply: {reply}")
        except Exception as e:
            elapsed = time.perf_counter() - t0
            lines.append(f"\n[{tag}] {message!r}")
            lines.append(f"  FAIL {elapsed:.1f}s {type(e).__name__}: {str(e)[:200]}")

    with open("/tmp/tool_check_results.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("Results written to /tmp/tool_check_results.txt")


asyncio.run(_run())
