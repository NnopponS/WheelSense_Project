"""Test the full collect_chat_reply_best_effort path."""
import asyncio, time, json
from app.db.session import AsyncSessionLocal
from app.models.core import Workspace
from app.models.users import User
from app.services.ai_chat import collect_chat_reply_best_effort, _copilot_marked_unavailable
from app.schemas.chat import ChatMessagePart
from sqlalchemy import select

async def _run():
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.role=='admin', User.is_active.is_(True)).limit(1))).scalar_one()
        ws = (await db.execute(select(Workspace).where(Workspace.id==user.workspace_id))).scalar_one()

    print(f"Copilot marked unavailable: {_copilot_marked_unavailable()}")

    messages = [ChatMessagePart(
        role="user",
        content=(
            "User request: show me active alerts\n\n"
            "Ground truth WheelSense tool results:\n\n"
            'Tool `list_active_alerts` JSON:\n[{"id": 4211, "alert_type": "fall", "severity": "critical", "status": "acknowledged", "patient_id": 70}]\n\n'
            "Answer in English. Use only the grounded tool results. Do not dump raw JSON."
        )
    )]

    attempts = []
    t0 = time.perf_counter()
    async with AsyncSessionLocal() as db:
        reply = await collect_chat_reply_best_effort(
            db=db,
            user=user,
            workspace=ws,
            messages=messages,
            provider_attempts_out=attempts,
        )
    elapsed = time.perf_counter() - t0
    print(f"\nLatency: {elapsed:.2f}s")
    print(f"Reply: {reply[:300]}")
    print(f"Attempts: {json.dumps(attempts, indent=2, default=str)[:500]}")

asyncio.run(_run())
