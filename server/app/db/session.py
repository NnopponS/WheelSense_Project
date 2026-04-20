from __future__ import annotations

from typing import Any, AsyncGenerator

from app.config import settings

# Production PostgreSQL engine (pool_size not compatible with SQLite)
# Use resolved database URLs with environment-aware defaults
_is_sqlite = "sqlite" in settings.resolved_database_url
_engine_kwargs: dict[str, Any] = {"echo": settings.debug}
if not _is_sqlite:
    _engine_kwargs.update({"pool_size": 5, "max_overflow": 10})

_async_engine: Any | None = None
_session_factory: Any | None = None
_sync_engine: Any | None = None


def get_async_engine() -> Any:
    global _async_engine
    if _async_engine is None:
        from sqlalchemy.ext.asyncio import create_async_engine

        _async_engine = create_async_engine(settings.resolved_database_url, **_engine_kwargs)
    return _async_engine


def get_session_factory() -> Any:
    global _session_factory
    if _session_factory is None:
        from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

        _session_factory = async_sessionmaker(
            get_async_engine(), class_=AsyncSession, expire_on_commit=False
        )
    return _session_factory


def get_sync_engine() -> Any:
    global _sync_engine
    if _sync_engine is None:
        from sqlalchemy import create_engine

        _sync_engine = create_engine(settings.resolved_database_url_sync, echo=False)
    return _sync_engine


def AsyncSessionLocal() -> Any:
    """Proxy for backward-compatible session acquisition."""
    return get_session_factory()()


async def get_session() -> AsyncGenerator[Any, None]:
    """FastAPI dependency session generator."""
    async with get_session_factory()() as session:
        yield session


async def init_db() -> None:
    """Verify database connectivity on startup. Tables are managed by Alembic."""
    from sqlalchemy import text

    async with get_async_engine().begin() as conn:
        await conn.execute(text("SELECT 1"))
