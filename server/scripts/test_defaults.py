import asyncio
from app.db.session import AsyncSessionLocal
from app.services.ai_chat import get_workspace_ai_defaults, get_workspace_copilot_token, has_copilot_connection, _copilot_marked_unavailable

async def _run():
    async with AsyncSessionLocal() as db:
        provider, model = await get_workspace_ai_defaults(db, 13)
        token = await get_workspace_copilot_token(db, 13)
    print(f"Workspace defaults: provider={provider} model={model}")
    print(f"Copilot token present: {bool(token)}")
    print(f"Has copilot connection: {has_copilot_connection(token)}")
    print(f"Copilot marked unavailable: {_copilot_marked_unavailable()}")

asyncio.run(_run())
