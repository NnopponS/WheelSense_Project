import asyncio
from app.db.session import AsyncSessionLocal
from app.models.core import Workspace
from app.models.users import User
from app.services.ai_chat import get_workspace_copilot_token
from sqlalchemy import select

async def _run():
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.role=='admin', User.is_active.is_(True)).limit(1))).scalar_one()
        ws = (await db.execute(select(Workspace).where(Workspace.id==user.workspace_id))).scalar_one()
        token = await get_workspace_copilot_token(db, ws.id)
    print(f"token present: {bool(token)}")
    print(f"token length: {len(token) if token else 0}")
    if token:
        print(f"token prefix: {token[:10]}...")
        print(f"token suffix: ...{token[-10:]}")
        print(f"starts with gho_: {token.startswith('gho_')}")
        print(f"starts with ghu_: {token.startswith('ghu_')}")

asyncio.run(_run())
