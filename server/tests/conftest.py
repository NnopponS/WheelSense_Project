"""Test configuration for WheelSense server.

Uses SQLite in-memory database so tests run without PostgreSQL or MQTT.
Each test gets its own transaction that is rolled back for full isolation.
"""

from __future__ import annotations

import os
from unittest.mock import AsyncMock, patch

# ── Must be set BEFORE any app import so Settings() reads them ───────────────
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["DATABASE_URL_SYNC"] = "sqlite:///:memory:"

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.api.dependencies import get_db
from app.models.base import Base

# ── Shared in-memory engine (StaticPool keeps same connection across tests) ──
_engine = create_async_engine(
    "sqlite+aiosqlite:///:memory:",
    echo=False,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_SessionFactory = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)


# ── Create schema once per session ──────────────────────────────────────────
@pytest_asyncio.fixture(scope="session", autouse=True)
async def _schema():
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


# ── Truncate all tables between tests for full isolation ─────────────────────
@pytest_asyncio.fixture(autouse=True)
async def _clean_tables():
    """Delete all rows before each test."""
    yield
    async with _SessionFactory() as session:
        for table in reversed(Base.metadata.sorted_tables):
            await session.execute(table.delete())
        await session.commit()


# ── DB session fixture ───────────────────────────────────────────────────────
@pytest_asyncio.fixture()
async def db_session():
    async with _SessionFactory() as session:
        yield session


# ── HTTP client fixture — lifespan bypassed, DB overridden ──────────────────
@pytest_asyncio.fixture()
async def client(db_session: AsyncSession):

    async def _override_db():
        yield db_session

    # Bypass init_db (Postgres) and mqtt_listener (broker)
    with (
        patch("app.db.session.init_db", new_callable=AsyncMock),
        patch("app.mqtt_handler.mqtt_listener", new_callable=AsyncMock),
    ):
        from app.main import app

        app.dependency_overrides[get_db] = _override_db

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            yield ac

        app.dependency_overrides.clear()
