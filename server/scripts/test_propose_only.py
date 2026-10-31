"""Test only propose_turn (no separate router call)."""
import asyncio, time, os, sys
from app.db.session import AsyncSessionLocal
from app.models.core import Workspace
from app.models.users import User
from app.agent_runtime.service import propose_turn
from app.core.security import create_access_token
from sqlalchemy import select

async def _run():
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.role=='admin', User.is_active.is_(True)).limit(1))).scalar_one()
        ws = (await db.execute(select(Workspace).where(Workspace.id==user.workspace_id))).scalar_one()

    token = create_access_token(subject=str(user.id), role=user.role)
    message = sys.argv[1] if len(sys.argv) > 1 else "show me active alerts"

    print(f"Message: {message!r}")
    print(f"Workspace: {ws.name} (id={ws.id})")
    print("=" * 60)

    t0 = time.perf_counter()
    response = await propose_turn(
        actor_access_token=token,
        message=message,
        messages=[],
        conversation_id=None,
    )
    elapsed = time.perf_counter() - t0
    print(f"\n=== TOTAL: {elapsed:.2f}s ===")
    print(f"mode: {response.mode}")
    print(f"method: {response.grounding.get('classification_method') if response.grounding else 'none'}")
    print(f"reply: {(response.assistant_reply or '')[:300]}")
    if response.grounding:
        print(f"grounding: {list(response.grounding.keys())}")

asyncio.run(_run())
