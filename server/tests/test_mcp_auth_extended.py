"""MCP authentication tests (extended).

Tests for MCP authentication middleware including:
- Unauthenticated requests
- Token validation
- Origin checking
- Session validation
- Scope validation
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import AsyncIterator
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import resolve_effective_token_scopes
from app.core.security import create_access_token, get_password_hash
from app.mcp.auth import McpAuthMiddleware, wrap_mcp_app
from app.mcp.context import McpActorContext, actor_scope, require_actor_context, _actor_context
from app.models.core import Workspace
from app.models.users import User
from app.services.auth import AuthService


@pytest_asyncio.fixture()
async def mcp_test_workspace(db_session: AsyncSession) -> Workspace:
    """Create a workspace for MCP testing."""
    ws = Workspace(name="mcp_test_workspace", is_active=True)
    db_session.add(ws)
    await db_session.flush()
    return ws


@pytest_asyncio.fixture()
async def mcp_test_user(db_session: AsyncSession, mcp_test_workspace: Workspace) -> User:
    """Create a test user for MCP testing."""
    user = User(
        username="mcp_test_user",
        hashed_password=get_password_hash("testpass"),
        role="admin",
        workspace_id=mcp_test_workspace.id,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest_asyncio.fixture()
async def mcp_observer_user(db_session: AsyncSession, mcp_test_workspace: Workspace) -> User:
    """Create an observer user for MCP testing."""
    user = User(
        username="mcp_observer",
        hashed_password=get_password_hash("testpass"),
        role="observer",
        workspace_id=mcp_test_workspace.id,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest_asyncio.fixture()
async def mcp_patient_user(db_session: AsyncSession, mcp_test_workspace: Workspace) -> User:
    """Create a patient user for MCP testing."""
    from app.models.patients import Patient

    patient = Patient(
        workspace_id=mcp_test_workspace.id,
        first_name="Test",
        last_name="Patient",
        is_active=True,
    )
    db_session.add(patient)
    await db_session.flush()

    user = User(
        username="mcp_patient",
        hashed_password=get_password_hash("testpass"),
        role="patient",
        workspace_id=mcp_test_workspace.id,
        is_active=True,
        patient_id=patient.id,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest_asyncio.fixture()
def valid_token(mcp_test_user: User) -> str:
    """Create a valid access token."""
    return create_access_token(subject=str(mcp_test_user.id), role=mcp_test_user.role)


@pytest_asyncio.fixture()
async def mcp_client(db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[AsyncClient]:
    class _PatchedSessionContext:
        async def __aenter__(self) -> AsyncSession:
            return db_session

        async def __aexit__(self, exc_type, exc, tb) -> bool:
            return False

    def _patched_session_local():
        return _PatchedSessionContext()

    monkeypatch.setattr("app.mcp.auth.AsyncSessionLocal", _patched_session_local)

    protected_app = FastAPI()

    @protected_app.get("/sse")
    async def mcp_sse_probe():
        return {"ok": True}

    app = FastAPI()

    @app.get("/.well-known/oauth-protected-resource/mcp")
    async def mcp_oauth_protected_resource():
        return {
            "resource": "http://test/mcp",
            "authorization_servers": ["http://test/api/auth/login"],
            "bearer_methods_supported": ["header"],
            "scopes_supported": [],
        }

    app.mount(
        "/mcp",
        wrap_mcp_app(
            protected_app,
            allowed_origins=[],
            require_origin=False,
            resource_metadata_url="/.well-known/oauth-protected-resource/mcp",
        ),
    )

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac


@pytest.mark.asyncio
async def test_unauthenticated_mcp_request_returns_401(
    mcp_client: AsyncClient,
):
    """Test that MCP endpoints require authentication and return 401 without token."""
    response = await mcp_client.get("/mcp/sse")
    assert response.status_code == 401
    assert "Authentication is required" in response.json().get("detail", "")
    assert "resource_metadata" in response.headers.get("www-authenticate", "")


@pytest.mark.asyncio
async def test_authenticated_mcp_request_succeeds(
    mcp_client: AsyncClient,
    valid_token: str,
):
    """Test that authenticated MCP requests succeed."""
    response = await mcp_client.get(
        "/mcp/sse",
        headers={"Authorization": f"Bearer {valid_token}"},
    )
    assert response.status_code not in [401, 403]


@pytest.mark.asyncio
async def test_wrong_origin_returns_403(
    mcp_client: AsyncClient,
    valid_token: str,
    monkeypatch: pytest.MonkeyPatch,
):
    """Test that requests from unauthorized origins return 403."""
    mcp_client._transport.app.router.routes[-1].app.allowed_origins = {"https://trusted.example.com"}  # type: ignore[attr-defined]
    mcp_client._transport.app.router.routes[-1].app.require_origin = True  # type: ignore[attr-defined]

    response = await mcp_client.get(
        "/mcp/sse",
        headers={
            "Authorization": f"Bearer {valid_token}",
            "Origin": "https://malicious.example.com",
        },
    )
    assert response.status_code == 403
    assert "Origin is not allowed" in response.json().get("detail", "")


@pytest.mark.asyncio
async def test_allowed_origin_succeeds(
    mcp_client: AsyncClient,
    valid_token: str,
):
    """Test that requests from allowed origins succeed."""
    mcp_client._transport.app.router.routes[-1].app.allowed_origins = {"https://trusted.example.com"}  # type: ignore[attr-defined]
    mcp_client._transport.app.router.routes[-1].app.require_origin = True  # type: ignore[attr-defined]

    response = await mcp_client.get(
        "/mcp/sse",
        headers={
            "Authorization": f"Bearer {valid_token}",
            "Origin": "https://trusted.example.com",
        },
    )
    # Should not be 403
    assert response.status_code != 403


@pytest.mark.asyncio
async def test_expired_token_returns_401(
    mcp_client: AsyncClient,
    mcp_test_user: User,
):
    """Test that expired tokens return 401."""
    # Create an expired token
    expired_token = create_access_token(
        subject=str(mcp_test_user.id),
        role=mcp_test_user.role,
        expires_delta=timedelta(minutes=-1),  # Already expired
    )

    response = await mcp_client.get(
        "/mcp/sse",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert response.status_code == 401
    assert "Could not validate credentials" in response.json().get("detail", "")


@pytest.mark.asyncio
async def test_revoked_session_returns_401(
    mcp_client: AsyncClient,
    db_session: AsyncSession,
    mcp_test_user: User,
):
    """Test that revoked sessions return 401."""
    # Create auth session
    session_id = await AuthService.create_auth_session(
        db_session,
        user_id=mcp_test_user.id,
        workspace_id=mcp_test_user.workspace_id,
        expires_minutes=60,
    )
    await db_session.commit()

    # Create token with session
    token = create_access_token(
        subject=str(mcp_test_user.id),
        role=mcp_test_user.role,
        extra_claims={"sid": session_id},
    )

    # Revoke the session
    await AuthService.revoke_auth_session(
        db_session,
        ws_id=mcp_test_user.workspace_id,
        user_id=mcp_test_user.id,
        session_id=session_id,
    )
    await db_session.commit()

    response = await mcp_client.get(
        "/mcp/sse",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 401
    assert "Could not validate credentials" in response.json().get("detail", "")


@pytest.mark.asyncio
async def test_protected_resource_metadata_endpoint(
    mcp_client: AsyncClient,
):
    """Test that the protected resource metadata endpoint is accessible."""
    response = await mcp_client.get("/.well-known/oauth-protected-resource/mcp")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_bearer_token_extraction(
    mcp_client: AsyncClient,
    mcp_test_user: User,
):
    """Test that Bearer tokens are properly extracted from Authorization header."""
    valid_token = create_access_token(subject=str(mcp_test_user.id), role=mcp_test_user.role)

    response = await mcp_client.get(
        "/mcp/sse",
        headers={"Authorization": f"bearer {valid_token}"},
    )
    assert response.status_code != 401

    response = await mcp_client.get(
        "/mcp/sse",
        headers={"Authorization": valid_token},  # No "Bearer " prefix
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_scope_validation():
    """Test that scope validation works correctly."""
    # Test admin scopes
    admin_scopes = resolve_effective_token_scopes("admin", [])
    assert "patients.read" in admin_scopes
    assert "patients.write" in admin_scopes
    assert "alerts.manage" in admin_scopes

    # Test observer scopes (limited)
    observer_scopes = resolve_effective_token_scopes("observer", [])
    assert "patients.read" in observer_scopes
    assert "patients.write" not in observer_scopes
    assert "alerts.read" in observer_scopes
    assert "alerts.manage" in observer_scopes
    assert "admin.audit.read" in observer_scopes

    # Test patient scopes
    patient_scopes = resolve_effective_token_scopes("patient", [])
    assert "patients.read" in patient_scopes
    assert "patients.write" not in patient_scopes
    assert "room_controls.use" in patient_scopes

    # Test scope narrowing - requested scopes are intersected with allowed
    narrowed = resolve_effective_token_scopes("observer", ["patients.read", "patients.write", "admin.audit.read"])
    assert "patients.read" in narrowed
    assert "patients.write" not in narrowed  # Not allowed for observer
    assert "admin.audit.read" in narrowed


@pytest.mark.asyncio
async def test_actor_context_manager():
    """Test the actor context manager properly sets and resets context."""
    # Initially no context
    assert _actor_context.get() is None

    # Set context using the context manager
    context = McpActorContext(
        user_id=1,
        workspace_id=2,
        role="admin",
        patient_id=None,
        caregiver_id=None,
        scopes={"patients.read", "alerts.read"},
    )

    with actor_scope(context):
        # Inside context, should be accessible
        retrieved = require_actor_context()
        assert retrieved.user_id == 1
        assert retrieved.workspace_id == 2
        assert retrieved.role == "admin"
        assert retrieved.scopes == {"patients.read", "alerts.read"}

    # After context, should be reset
    assert _actor_context.get() is None


@pytest.mark.asyncio
async def test_require_actor_context_raises_when_no_context():
    """Test that require_actor_context raises when no context is set."""
    # Ensure no context
    _actor_context.set(None)

    with pytest.raises(RuntimeError) as exc:
        require_actor_context()
    assert "Authenticated MCP actor context is required" in str(exc.value)


@pytest.mark.asyncio
async def test_mcp_auth_middleware_wrapping():
    """Test that the MCP auth middleware properly wraps the app."""
    # Create a dummy app
    async def dummy_app(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"OK"})

    # Wrap it
    wrapped = wrap_mcp_app(
        dummy_app,
        allowed_origins=["https://trusted.example.com"],
        require_origin=True,
        resource_metadata_url="/.well-known/oauth-protected-resource/mcp",
    )

    # Verify it's a middleware instance
    assert isinstance(wrapped, McpAuthMiddleware)
    assert wrapped.allowed_origins == {"https://trusted.example.com"}
    assert wrapped.require_origin is True


@pytest.mark.asyncio
async def test_mcp_auth_middleware_non_http_requests_pass_through():
    """Test that non-HTTP requests pass through the middleware."""
    # Create a dummy app that records being called
    app_called = False

    async def dummy_app(scope, receive, send):
        nonlocal app_called
        app_called = True
        await send({"type": "websocket.accept"})

    # Wrap it
    wrapped = wrap_mcp_app(
        dummy_app,
        allowed_origins=[],
        require_origin=False,
        resource_metadata_url="/.well-known/oauth-protected-resource/mcp",
    )

    # Simulate websocket request
    scope = {"type": "websocket"}

    async def receive():
        return {"type": "websocket.connect"}

    async def send(message):
        pass

    await wrapped(scope, receive, send)
    assert app_called
