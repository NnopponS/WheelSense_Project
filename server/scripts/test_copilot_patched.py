import asyncio, time, os
from app.db.session import AsyncSessionLocal
from app.models.core import Workspace
from app.models.users import User
from app.services.ai_chat import get_workspace_copilot_token, _patch_copilot_model_billing_tolerance
from sqlalchemy import select

# Apply patch BEFORE any copilot calls
_patch_copilot_model_billing_tolerance()

from copilot import CopilotClient, SubprocessConfig

async def _run():
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.role=='admin', User.is_active.is_(True)).limit(1))).scalar_one()
        ws = (await db.execute(select(Workspace).where(Workspace.id==user.workspace_id))).scalar_one()
        token = await get_workspace_copilot_token(db, ws.id)

    print(f"Token: {token[:10]}...{token[-5:]} (len={len(token)})")

    config = SubprocessConfig(github_token=token)
    t0 = time.perf_counter()
    try:
        async with CopilotClient(config) as client:
            print(f"connected in {time.perf_counter()-t0:.2f}s")
            t1 = time.perf_counter()
            models = await client.list_models()
            print(f"list_models in {time.perf_counter()-t1:.2f}s: {len(models)} models")
            for m in models[:5]:
                mid = getattr(m, "id", "?")
                print(f"  {mid}")

            # Now try a simple prompt
            from copilot.session import PermissionHandler
            class AllowAll(PermissionHandler):
                async def handle_permission_request(self, *a, **kw): return True
            t2 = time.perf_counter()
            session = await client.create_session(working_dir="/tmp", permission_handler=AllowAll())
            print(f"session created in {time.perf_counter()-t2:.2f}s")
            t3 = time.perf_counter()
            response = await session.prompt("Say hello in one word.")
            print(f"prompt in {time.perf_counter()-t3:.2f}s")
            print(f"response: {response[:200] if response else 'empty'}")
            await session.disconnect()
    except Exception as e:
        import traceback
        print(f"ERROR in {time.perf_counter()-t0:.2f}s: {type(e).__name__}: {e}")
        traceback.print_exc()

asyncio.run(_run())
