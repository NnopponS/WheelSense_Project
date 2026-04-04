"""Initialize the database with default data (e.g., admin user)."""

import logging
from sqlalchemy import select

from app.config import settings
from app.core.security import get_password_hash
from app.db.session import AsyncSessionLocal
from app.models.core import Workspace
from app.models.users import User

logger = logging.getLogger("wheelsense")


async def init_admin_user() -> None:
    """Create the initial admin workspace and user if configured."""
    if not settings.bootstrap_admin_enabled:
        logger.info("Bootstrap admin creation disabled via config")
        return

    if not settings.bootstrap_admin_password:
        logger.warning(
            "Skipping bootstrap admin creation because BOOTSTRAP_ADMIN_PASSWORD is not set"
        )
        return

    async with AsyncSessionLocal() as session:
        res = await session.execute(
            select(User).where(User.username == settings.bootstrap_admin_username)
        )
        user = res.scalars().first()

        if user:
            logger.info("Admin user already exists. Skipping initialization.")
            return

        res_ws = await session.execute(select(Workspace).order_by(Workspace.id).limit(1))
        ws = res_ws.scalars().first()

        if not ws:
            ws = Workspace(name="System Workspace", mode="simulation", is_active=True)
            session.add(ws)
            await session.flush()
            logger.info("Created default System Workspace for bootstrap admin.")

        admin_user = User(
            username=settings.bootstrap_admin_username,
            hashed_password=get_password_hash(settings.bootstrap_admin_password),
            role="admin",
            workspace_id=ws.id,
            is_active=True,
        )
        session.add(admin_user)
        await session.commit()
        logger.info("Created initial admin user '%s'.", settings.bootstrap_admin_username)
