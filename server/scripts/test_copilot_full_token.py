import asyncio, time, os
from app.db.session import AsyncSessionLocal
from app.models.core import Workspace
from app.models.users import User
from app.services.ai_chat import get_workspace_copilot_token
from sqlalchemy import select
from copilot import CopilotClient, SubprocessConfig

async def _run():
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.role=='admin', User.is_active.is_(True)).limit(1))).scalar_one()
        ws = (await db.execute(select(Workspace).where(Workspace.id==user.workspace_id))).scalar_one()
        token = await get_workspace_copilot_token(db, ws.id)

    print(f"Full token: {token}")
    print(f"Token length: {len(token)}")

    # Try with full token in env
    os.environ["COPILOT_GITHUB_TOKEN"] = token

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
    except Exception as e:
        print(f"ERROR in {time.perf_counter()-t0:.2f}s: {type(e).__name__}: {e}")

    # Also try via CLI directly
    print("\n--- CLI direct test ---")
    import subprocess
    t0 = time.perf_counter()
    result = subprocess.run(
        ["/usr/local/lib/python3.12/site-packages/copilot/bin/copilot", "-p", "say hello", "--allow-all"],
        env={**os.environ, "COPILOT_GITHUB_TOKEN": token},
        capture_output=True, text=True, timeout=30,
    )
    print(f"CLI in {time.perf_counter()-t0:.2f}s")
    print(f"stdout: {result.stdout[:300]}")
    print(f"stderr: {result.stderr[:300]}")
    print(f"returncode: {result.returncode}")

asyncio.run(_run())
