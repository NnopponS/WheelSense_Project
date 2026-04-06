"""Test configuration for WheelSense server.

Uses SQLite in-memory database so tests run without PostgreSQL or MQTT.
Each test gets its own transaction that is rolled back for full isolation.
"""

from __future__ import annotations

import os
import tempfile
from unittest.mock import AsyncMock, patch

# ── Must be set BEFORE any app import so Settings() reads them ───────────────
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["DATABASE_URL_SYNC"] = "sqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret-key"
os.environ["BOOTSTRAP_ADMIN_ENABLED"] = "false"
os.environ["PROFILE_IMAGE_STORAGE_DIR"] = tempfile.mkdtemp(prefix="ws_profile_img_")

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.api.dependencies import get_db
from app.core.security import create_access_token, get_password_hash
import app.models  # noqa: F401 — register all ORM models on Base.metadata
from app.models.base import Base
from app.models.core import Workspace
from app.models.users import User

# ── Shared in-memory engine (StaticPool keeps same connection across tests) ──
_engine = create_async_engine(
    "sqlite+aiosqlite:///:memory:",
    echo=False,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_SessionFactory = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)


# ── Create schema once per session ──────────────────────────────────────────
async def _create_sqlite_schema() -> None:
    """Create tables one-by-one for the SQLite in-memory test harness."""
    async with _engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            await conn.run_sync(
                lambda sync_conn, table=table: table.create(sync_conn, checkfirst=True)
            )


async def _drop_sqlite_schema() -> None:
    async with _engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            await conn.run_sync(
                lambda sync_conn, table=table: table.drop(sync_conn, checkfirst=True)
            )


@pytest_asyncio.fixture(scope="session", loop_scope="session", autouse=True)
async def _schema():
    await _create_sqlite_schema()
    yield
    await _drop_sqlite_schema()
    await _engine.dispose()


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


@pytest_asyncio.fixture()
async def admin_user(db_session: AsyncSession) -> User:
    ws = Workspace(name="test_admin_workspace", is_active=True)
    db_session.add(ws)
    await db_session.flush()

    user = User(
        username="admin",
        hashed_password=get_password_hash("adminpass"),
        role="admin",
        workspace_id=ws.id,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest_asyncio.fixture()
async def admin_token(admin_user: User) -> str:
    return create_access_token(subject=str(admin_user.id), role=admin_user.role)


@pytest_asyncio.fixture()
async def admin_token_headers(admin_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {admin_token}"}


@pytest_asyncio.fixture()
async def make_token_headers():
    def _make(user: User) -> dict[str, str]:
        token = create_access_token(subject=str(user.id), role=user.role)
        return {"Authorization": f"Bearer {token}"}

    return _make


# ── HTTP client fixture — lifespan bypassed, DB overridden ──────────────────
@pytest_asyncio.fixture()
async def client(db_session: AsyncSession, admin_token: str):
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
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": f"Bearer {admin_token}"},
        ) as ac:
            yield ac

        app.dependency_overrides.clear()
