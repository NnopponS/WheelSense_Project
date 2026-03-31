from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import AsyncGenerator

from app.db.session import get_session
from app.models.core import Workspace

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async for session in get_session():
        yield session

async def get_active_ws(db: AsyncSession = Depends(get_db)) -> Workspace:
    result = await db.execute(select(Workspace).where(Workspace.is_active.is_(True)))
    ws = result.scalar_one_or_none()
    if not ws:
        raise HTTPException(
            status_code=400, 
            detail="No active workspace configured. Create and activate one first."
        )
    return ws
