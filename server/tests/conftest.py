"""Test configuration for WheelSense server.

Uses SQLite in-memory database so tests run without PostgreSQL or MQTT.
Each test gets its own transaction that is rolled back for full isolation.
"""

from __future__ import annotations

import os
import tempfile
from unittest.mock import AsyncMock, patch

import aiomqtt.client

# ── Must be set BEFORE any app import so Settings() reads them ───────────────
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["DATABASE_URL_SYNC"] = "sqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret-key"
os.environ["BOOTSTRAP_ADMIN_ENABLED"] = "false"
os.environ["PROFILE_IMAGE_STORAGE_DIR"] = tempfile.mkdtemp(prefix="ws_profile_img_")
os.environ["WHEELSENSE_ENABLE_MCP"] = "0"
# Keep pytest fast: skip sentence-transformers download/load unless a test enables it.
os.environ["INTENT_SEMANTIC_ENABLED"] = "false"
os.environ["INTENT_LLM_NORMALIZE_ENABLED"] = "false"
# Boot the app in simulator mode so sim-only routers (e.g. /api/demo/*) are
# mounted during tests. Individual tests can flip `settings.env_mode` at
# request time via monkeypatch; the inline `is_simulator_mode` guards inside
# endpoints still enforce per-request behavior.
os.environ["ENV_MODE"] = "simulator"

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
_engine = None
_SessionFactory = None


def _patch_aiomqtt_test_cleanup() -> None:
    """Avoid aiomqtt teardown noise when pytest closes the event loop first."""
    original_on_socket_close = aiomqtt.client.Client._on_socket_close

    def _safe_on_socket_close(self, client, userdata, sock):
        try:
            return original_on_socket_close(self, client, userdata, sock)
        except RuntimeError as exc:
            if "Event loop is closed" not in str(exc):
                raise

    aiomqtt.client.Client._on_socket_close = _safe_on_socket_close


_patch_aiomqtt_test_cleanup()


def _get_engine():
    global _engine
    if _engine is None:
        _engine = create_async_engine(
            "sqlite+aiosqlite:///:memory:",
            echo=False,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
    return _engine


def _get_session_factory():
    global _SessionFactory
    if _SessionFactory is None:
        _SessionFactory = async_sessionmaker(
            _get_engine(), class_=AsyncSession, expire_on_commit=False
        )
    return _SessionFactory


# ── Create schema once per session ──────────────────────────────────────────
async def _create_sqlite_schema() -> None:
    """Create tables one-by-one for the SQLite in-memory test harness."""
    async with _get_engine().begin() as conn:
        for table in Base.metadata.sorted_tables:
            await conn.run_sync(
                lambda sync_conn, table=table: table.create(sync_conn, checkfirst=True)
            )


async def _drop_sqlite_schema() -> None:
    async with _get_engine().begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            await conn.run_sync(
                lambda sync_conn, table=table: table.drop(sync_conn, checkfirst=True)
            )


@pytest_asyncio.fixture(scope="session", loop_scope="session", autouse=True)
async def _schema():
    await _create_sqlite_schema()
    yield
    await _drop_sqlite_schema()
    await _get_engine().dispose()


# ── Truncate all tables between tests for full isolation ─────────────────────
@pytest_asyncio.fixture(autouse=True)
async def _clean_tables():
    """Delete all rows before each test."""
    yield
    async with _get_session_factory()() as session:
        for table in reversed(Base.metadata.sorted_tables):
            await session.execute(table.delete())
        await session.commit()


# ── DB session fixture ───────────────────────────────────────────────────────
@pytest_asyncio.fixture()
async def db_session():
    async with _get_session_factory()() as session:
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


@pytest_asyncio.fixture()
async def runtime_test_workspace(db_session: AsyncSession) -> Workspace:
    """Workspace for agent-runtime integration tests (admin role user)."""
    ws = Workspace(name="runtime_test_workspace", is_active=True)
    db_session.add(ws)
    await db_session.flush()
    return ws


@pytest_asyncio.fixture()
async def runtime_test_user(db_session: AsyncSession, runtime_test_workspace: Workspace) -> User:
    """Admin user tied to `runtime_test_workspace` for propose_turn / MCP tests."""
    user = User(
        username="runtime_test_user",
        hashed_password=get_password_hash("testpass"),
        role="admin",
        workspace_id=runtime_test_workspace.id,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest_asyncio.fixture()
async def sim_workspace(db_session: AsyncSession) -> Workspace:
    """Create a simulator workspace for authentication tests."""
    ws = Workspace(name="Test Simulation", mode="simulation", is_active=True)
    db_session.add(ws)
    await db_session.flush()
    return ws


@pytest_asyncio.fixture()
async def sim_users(db_session: AsyncSession, sim_workspace: Workspace) -> dict[str, User]:
    """Create sim mode users with demo1234 password for authentication tests."""
    users = {}
    hashed = get_password_hash("demo1234")
    
    # Admin
    admin = User(
        username="admin",
        hashed_password=hashed,
        role="admin",
        workspace_id=sim_workspace.id,
        is_active=True,
    )
    db_session.add(admin)
    await db_session.flush()
    users["admin"] = admin
    
    # Staff
    staff_configs = [
        ("sarah.j", "head_nurse"),
        ("michael.s", "supervisor"),
        ("jennifer.l", "observer"),
        ("david.k", "observer"),
    ]
    
    for username, role in staff_configs:
        user = User(
            username=username,
            hashed_password=hashed,
            role=role,
            workspace_id=sim_workspace.id,
            is_active=True,
        )
        db_session.add(user)
        await db_session.flush()
        users[username] = user
    
    # Patient
    patient = User(
        username="emika.c",
        hashed_password=hashed,
        role="patient",
        workspace_id=sim_workspace.id,
        is_active=True,
    )
    db_session.add(patient)
    await db_session.flush()
    users["emika.c"] = patient
    
    return users


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
