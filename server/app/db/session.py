from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import create_engine

from app.config import settings

# Production PostgreSQL engine (pool_size not compatible with SQLite)
_is_sqlite = "sqlite" in settings.database_url
_engine_kwargs: dict = {"echo": settings.debug}
if not _is_sqlite:
    _engine_kwargs.update({"pool_size": 5, "max_overflow": 10})

async_engine = create_async_engine(settings.database_url, **_engine_kwargs)
AsyncSessionLocal = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

# Sync engine — used only by Alembic migrations
sync_engine = create_engine(settings.database_url_sync, echo=False)


async def get_session():
    """Async session generator — use as FastAPI dependency via get_db()."""
    async with AsyncSessionLocal() as session:
        yield session


async def init_db() -> None:
    """Verify database connectivity on startup. Tables are managed by Alembic."""
    async with async_engine.begin() as conn:
        from sqlalchemy import text
        await conn.execute(text("SELECT 1"))
