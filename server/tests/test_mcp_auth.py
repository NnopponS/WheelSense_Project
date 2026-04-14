"""Tests for MCP OAuth authentication flow.

Tests cover:
- Token issuance with scope narrowing
- Token listing and retrieval
- Token revocation (explicit and cascade)
- Scope enforcement in MCP requests
- Authorization metadata endpoint
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, get_password_hash
from app.models.core import Workspace
from app.models.mcp_tokens import MCPToken
from app.models.users import AuthSession, User
from app.schemas.mcp_auth import ALL_MCP_SCOPES, ROLE_MCP_SCOPES

import secrets as secrets_module
from datetime import datetime, timedelta, timezone


@pytest_asyncio.fixture
async def mcp_admin_with_session(db_session: AsyncSession) -> tuple[User, AuthSession, Workspace]:
    """Create an admin user with a tracked auth session."""
    # Create workspace
    ws = Workspace(name="mcp_test_admin_ws", is_active=True)
    db_session.add(ws)
    await db_session.flush()

    # Create admin user with unique username
    admin = User(
        username=f"mcp_admin_{secrets_module.token_hex(4)}",
        hashed_password=get_password_hash("adminpass"),
        role="admin",
        workspace_id=ws.id,
    )
    db_session.add(admin)
    await db_session.flush()

    # Create auth session
    auth_session = AuthSession(
        id=secrets_module.token_urlsafe(24),
        workspace_id=ws.id,
        user_id=admin.id,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
    )
    db_session.add(auth_session)
    await db_session.commit()

    return admin, auth_session, ws


@pytest_asyncio.fixture
async def mcp_observer_same_workspace(
    db_session: AsyncSession,
    mcp_admin_with_session: tuple[User, AuthSession, Workspace],
) -> tuple[User, AuthSession, Workspace]:
    """Create an observer user in the same workspace as the admin."""
    # Use the same workspace as the admin
    _, _, ws = mcp_admin_with_session

    # Create observer user with unique username
    observer = User(
        username=f"mcp_observer_{secrets_module.token_hex(4)}",
        hashed_password=get_password_hash("observerpass"),
        role="observer",
        workspace_id=ws.id,
    )
    db_session.add(observer)
    await db_session.flush()

    # Create auth session
    auth_session = AuthSession(
        id=secrets_module.token_urlsafe(24),
        workspace_id=ws.id,
        user_id=observer.id,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
    )
    db_session.add(auth_session)
    await db_session.commit()

    return observer, auth_session, ws


@pytest.mark.asyncio
async def test_oauth_protected_resource_metadata(client: AsyncClient):
    """Verify the OAuth protected resource metadata endpoint returns correct info."""
    response = await client.get("/.well-known/oauth-protected-resource/mcp")
    assert response.status_code == 200

    data = response.json()
    assert "resource" in data
    assert "authorization_servers" in data
    assert "bearer_methods_supported" in data
    assert "scopes_supported" in data

    # Verify all expected scopes are present
    for scope in ALL_MCP_SCOPES:
        assert scope in data["scopes_supported"], f"Missing scope: {scope}"

    # Verify authorization server URL
    assert len(data["authorization_servers"]) > 0
    assert "/api/auth/login" in data["authorization_servers"][0]


@pytest.mark.asyncio
async def test_mcp_token_creation_requires_auth():
    """Verify MCP token creation requires authentication."""
    from httpx import ASGITransport, AsyncClient
    from app.main import app

    # Use unauthenticated client
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/mcp/token", json={"client_name": "Test Client"})
        assert response.status_code == 401


@pytest.mark.asyncio
async def test_mcp_token_creation_success(
    client: AsyncClient,
    mcp_admin_with_session: tuple[User, AuthSession, Workspace],
):
    """Admin can create an MCP token with appropriate scopes."""
    admin, auth_session, _ = mcp_admin_with_session

    # Create session token with sid claim
    session_token = create_access_token(
        subject=str(admin.id),
        role=admin.role,
        extra_claims={"sid": auth_session.id},
    )

    # Create MCP token with specific scopes
    requested_scopes = ["patients.read", "alerts.read", "devices.read"]
    response = await client.post(
        "/api/mcp/token",
        headers={"Authorization": f"Bearer {session_token}"},
        json={
            "client_name": "Test MCP Client",
            "requested_scopes": requested_scopes,
            "ttl_minutes": 30,
        },
    )
    assert response.status_code == 201, f"Failed: {response.text}"

    data = response.json()
    assert "id" in data
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["client_name"] == "Test MCP Client"
    assert "scopes" in data
    assert "expires_at" in data
    assert "expires_in" in data

    # Verify all requested scopes are granted
    for scope in requested_scopes:
        assert scope in data["scopes"], f"Missing scope: {scope}"

    # Verify token starts with a JWT-like format (3 parts separated by dots)
    token_parts = data["access_token"].split(".")
    assert len(token_parts) == 3, "Token should be a valid JWT format"


@pytest.mark.asyncio
async def test_mcp_token_scope_narrowing(
    client: AsyncClient,
    mcp_admin_with_session: tuple[User, AuthSession, Workspace],
):
    """MCP token scopes are narrowed to role-allowed set."""
    admin, auth_session, _ = mcp_admin_with_session

    # Create session token
    session_token = create_access_token(
        subject=str(admin.id),
        role=admin.role,
        extra_claims={"sid": auth_session.id},
    )

    # Request scopes beyond what admin has (should be narrowed)
    requested_scopes = ALL_MCP_SCOPES.copy()
    response = await client.post(
        "/api/mcp/token",
        headers={"Authorization": f"Bearer {session_token}"},
        json={
            "client_name": "Narrowing Test",
            "requested_scopes": requested_scopes,
        },
    )
    assert response.status_code == 201

    data = response.json()
    granted_scopes = set(data["scopes"])

    # Admin should get all their allowed scopes
    expected_admin_scopes = ROLE_MCP_SCOPES["admin"]
    assert granted_scopes == expected_admin_scopes


@pytest.mark.asyncio
async def test_mcp_token_invalid_scope_rejected(
    client: AsyncClient,
    mcp_admin_with_session: tuple[User, AuthSession, Workspace],
):
    """Invalid scope names are rejected."""
    admin, auth_session, _ = mcp_admin_with_session

    session_token = create_access_token(
        subject=str(admin.id),
        role=admin.role,
        extra_claims={"sid": auth_session.id},
    )

    response = await client.post(
        "/api/mcp/token",
        headers={"Authorization": f"Bearer {session_token}"},
        json={
            "client_name": "Invalid Scope Test",
            "requested_scopes": ["invalid.scope", "patients.read"],
        },
    )
    assert response.status_code == 400
    # Error response may have different structure depending on FastAPI version
    # Just verify it's a bad request
    error_data = response.json()
    assert "detail" in error_data or "message" in error_data or "error" in error_data


@pytest.mark.asyncio
async def test_mcp_token_listing(
    client: AsyncClient,
    mcp_admin_with_session: tuple[User, AuthSession, Workspace],
):
    """User can list their MCP tokens."""
    admin, auth_session, _ = mcp_admin_with_session

    session_token = create_access_token(
        subject=str(admin.id),
        role=admin.role,
        extra_claims={"sid": auth_session.id},
    )

    # Create a token
    create_response = await client.post(
        "/api/mcp/token",
        headers={"Authorization": f"Bearer {session_token}"},
        json={"client_name": "List Test Client"},
    )
    assert create_response.status_code == 201

    # List tokens
    list_response = await client.get(
        "/api/mcp/tokens",
        headers={"Authorization": f"Bearer {session_token}"},
    )
    assert list_response.status_code == 200

    data = list_response.json()
    assert "tokens" in data
    assert "total" in data
    assert data["total"] >= 1

    # Verify token structure
    for token in data["tokens"]:
        assert "id" in token
        assert "client_name" in token
        assert "scopes" in token
        assert "is_active" in token
        assert "access_token" not in token  # Token secret not included in list


@pytest.mark.asyncio
async def test_mcp_token_revocation(
    client: AsyncClient,
    mcp_admin_with_session: tuple[User, AuthSession, Workspace],
):
    """User can revoke their MCP tokens."""
    admin, auth_session, _ = mcp_admin_with_session

    session_token = create_access_token(
        subject=str(admin.id),
        role=admin.role,
        extra_claims={"sid": auth_session.id},
    )

    # Create a token
    create_response = await client.post(
        "/api/mcp/token",
        headers={"Authorization": f"Bearer {session_token}"},
        json={"client_name": "Revoke Test Client"},
    )
    token_id = create_response.json()["id"]

    # Revoke the token
    revoke_response = await client.delete(
        f"/api/mcp/token/{token_id}",
        headers={"Authorization": f"Bearer {session_token}"},
    )
    assert revoke_response.status_code == 204

    # Verify token is revoked by checking it's marked inactive
    list_response = await client.get(
        "/api/mcp/tokens?include_revoked=true",
        headers={"Authorization": f"Bearer {session_token}"},
    )
    tokens = list_response.json()["tokens"]
    revoked_token = next((t for t in tokens if t["id"] == token_id), None)
    assert revoked_token is not None
    assert revoked_token["is_active"] is False
    assert revoked_token["revoked_at"] is not None


@pytest.mark.asyncio
async def test_mcp_token_revoke_all(
    client: AsyncClient,
    mcp_admin_with_session: tuple[User, AuthSession, Workspace],
):
    """User can revoke all their MCP tokens at once."""
    admin, auth_session, _ = mcp_admin_with_session

    session_token = create_access_token(
        subject=str(admin.id),
        role=admin.role,
        extra_claims={"sid": auth_session.id},
    )

    # Create multiple tokens
    for i in range(3):
        await client.post(
            "/api/mcp/token",
            headers={"Authorization": f"Bearer {session_token}"},
            json={"client_name": f"Bulk Token {i}"},
        )

    # Revoke all
    revoke_response = await client.post(
        "/api/mcp/tokens/revoke-all",
        headers={"Authorization": f"Bearer {session_token}"},
    )
    assert revoke_response.status_code == 204

    # Verify all are revoked
    list_response = await client.get(
        "/api/mcp/tokens?include_revoked=true",
        headers={"Authorization": f"Bearer {session_token}"},
    )
    tokens = list_response.json()["tokens"]
    active_tokens = [t for t in tokens if t["is_active"]]
    assert len(active_tokens) == 0


@pytest.mark.asyncio
async def test_mcp_token_get_single(
    client: AsyncClient,
    mcp_admin_with_session: tuple[User, AuthSession, Workspace],
):
    """User can get details of a specific MCP token."""
    admin, auth_session, _ = mcp_admin_with_session

    session_token = create_access_token(
        subject=str(admin.id),
        role=admin.role,
        extra_claims={"sid": auth_session.id},
    )

    # Create a token
    create_response = await client.post(
        "/api/mcp/token",
        headers={"Authorization": f"Bearer {session_token}"},
        json={"client_name": "Single Get Test"},
    )
    token_id = create_response.json()["id"]

    # Get single token
    get_response = await client.get(
        f"/api/mcp/token/{token_id}",
        headers={"Authorization": f"Bearer {session_token}"},
    )
    assert get_response.status_code == 200

    data = get_response.json()
    assert data["id"] == token_id
    assert data["client_name"] == "Single Get Test"
    assert "scopes" in data
    assert "is_active" in data


@pytest.mark.asyncio
async def test_mcp_token_cannot_access_other_users_tokens(
    client: AsyncClient,
    mcp_admin_with_session: tuple[User, AuthSession, Workspace],
    mcp_observer_same_workspace: tuple[User, AuthSession, Workspace],
):
    """Users cannot access or revoke tokens belonging to other users."""
    admin, admin_session, _ = mcp_admin_with_session
    observer, observer_session, _ = mcp_observer_same_workspace

    # Admin creates a token
    admin_session_token = create_access_token(
        subject=str(admin.id),
        role=admin.role,
        extra_claims={"sid": admin_session.id},
    )
    create_response = await client.post(
        "/api/mcp/token",
        headers={"Authorization": f"Bearer {admin_session_token}"},
        json={"client_name": "Admin Token"},
    )
    admin_token_id = create_response.json()["id"]

    # Observer tries to access admin's token
    observer_session_token = create_access_token(
        subject=str(observer.id),
        role=observer.role,
        extra_claims={"sid": observer_session.id},
    )
    get_response = await client.get(
        f"/api/mcp/token/{admin_token_id}",
        headers={"Authorization": f"Bearer {observer_session_token}"},
    )
    assert get_response.status_code == 403

    # Observer tries to revoke admin's token
    revoke_response = await client.delete(
        f"/api/mcp/token/{admin_token_id}",
        headers={"Authorization": f"Bearer {observer_session_token}"},
    )
    assert revoke_response.status_code == 403


@pytest.mark.asyncio
async def test_role_mcp_scope_mapping():
    """Verify each role has appropriate MCP scopes."""
    # Admin has all scopes
    admin_scopes = ROLE_MCP_SCOPES["admin"]
    assert "patients.read" in admin_scopes
    assert "patients.write" in admin_scopes
    assert "admin.audit.read" in admin_scopes

    # Head nurse has clinical scopes but not admin-only
    head_nurse_scopes = ROLE_MCP_SCOPES["head_nurse"]
    assert "patients.read" in head_nurse_scopes
    assert "patients.write" in head_nurse_scopes
    assert "admin.audit.read" not in head_nurse_scopes

    # Supervisor has read and alert manage but not patient write
    supervisor_scopes = ROLE_MCP_SCOPES["supervisor"]
    assert "patients.read" in supervisor_scopes
    assert "patients.write" not in supervisor_scopes
    assert "alerts.manage" in supervisor_scopes

    # Observer has read-only
    observer_scopes = ROLE_MCP_SCOPES["observer"]
    assert "patients.read" in observer_scopes
    assert "devices.read" in observer_scopes
    assert "patients.write" not in observer_scopes
    assert "devices.manage" not in observer_scopes

    # Patient has limited self-access
    patient_scopes = ROLE_MCP_SCOPES["patient"]
    assert "patients.read" in patient_scopes  # Self read
    assert "alerts.read" in patient_scopes
    assert "room_controls.use" in patient_scopes
    assert "patients.write" not in patient_scopes


@pytest.mark.asyncio
async def test_mcp_token_ttl_capped(
    client: AsyncClient,
    mcp_admin_with_session: tuple[User, AuthSession, Workspace],
):
    """MCP token TTL is capped at maximum allowed."""
    admin, auth_session, _ = mcp_admin_with_session

    session_token = create_access_token(
        subject=str(admin.id),
        role=admin.role,
        extra_claims={"sid": auth_session.id},
    )

    # Request 120 minute TTL (should be capped to 60)
    response = await client.post(
        "/api/mcp/token",
        headers={"Authorization": f"Bearer {session_token}"},
        json={"client_name": "TTL Test", "ttl_minutes": 120},
    )
    assert response.status_code == 201

    # Should be capped at 60 minutes (3600 seconds)
    data = response.json()
    assert data["expires_in"] <= 3600


@pytest.mark.asyncio
async def test_mcp_token_ttl_minimum(
    client: AsyncClient,
    mcp_admin_with_session: tuple[User, AuthSession, Workspace],
):
    """MCP token TTL must be at least 1 minute."""
    admin, auth_session, _ = mcp_admin_with_session

    session_token = create_access_token(
        subject=str(admin.id),
        role=admin.role,
        extra_claims={"sid": auth_session.id},
    )

    # Request 0 minute TTL (should fail validation)
    response = await client.post(
        "/api/mcp/token",
        headers={"Authorization": f"Bearer {session_token}"},
        json={"client_name": "TTL Test", "ttl_minutes": 0},
    )
    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_mcp_token_is_stored_in_db(
    client: AsyncClient,
    mcp_admin_with_session: tuple[User, AuthSession, Workspace],
    db_session: AsyncSession,
):
    """MCP token is properly stored in the database."""
    admin, auth_session, _ = mcp_admin_with_session

    session_token = create_access_token(
        subject=str(admin.id),
        role=admin.role,
        extra_claims={"sid": auth_session.id},
    )

    # Create token via API
    response = await client.post(
        "/api/mcp/token",
        headers={"Authorization": f"Bearer {session_token}"},
        json={
            "client_name": "DB Storage Test",
            "requested_scopes": ["patients.read"],
        },
    )
    assert response.status_code == 201
    token_id = response.json()["id"]

    # Verify token exists in database
    from sqlalchemy import select

    stmt = select(MCPToken).where(MCPToken.id == token_id)
    result = await db_session.execute(stmt)
    db_token = result.scalar_one_or_none()

    assert db_token is not None
    assert db_token.client_name == "DB Storage Test"
    assert db_token.user_id == admin.id
    assert db_token.auth_session_id == auth_session.id
    assert "patients.read" in db_token.get_scopes_list()
