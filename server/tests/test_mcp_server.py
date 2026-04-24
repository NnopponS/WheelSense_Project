import anyio
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.security import create_access_token
from app.main import app
from app.models.users import User


@pytest_asyncio.fixture(autouse=True)
async def clean_db():
    # Setup/Teardown for db tables during testing
    pass


@pytest.mark.asyncio
async def test_mcp_requires_auth():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://localhost:8000") as client:
        root_response = await client.get("/")
        if root_response.json()["mcp"] is None:
            response = await client.get("/mcp/sse")
            assert response.status_code == 404
            return

        response = await client.get("/mcp/sse")
        assert response.status_code == 401
        assert "resource_metadata" in response.headers.get("www-authenticate", "")


@pytest.mark.asyncio
async def test_mcp_sse_mount_authenticated(admin_user: User):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://localhost:8000") as client:
        response = await client.get("/api/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

        root_response = await client.get("/")
        if root_response.json()["mcp"] is None:
            response = await client.get("/mcp/sse")
            assert response.status_code == 404
            return

        token = create_access_token(subject=str(admin_user.id), role=admin_user.role)
        with anyio.move_on_after(3):
            async with client.stream(
                "GET",
                "/mcp/sse",
                headers={"Authorization": f"Bearer {token}"},
            ) as response:
                assert response.status_code == 200
                assert "text/event-stream" in response.headers.get("content-type", "")


@pytest.mark.asyncio
async def test_mcp_tool_direct_call():
    from app.mcp_server import get_system_health

    result = await get_system_health()
    assert result["status"] == "ok"


def test_mcp_workspace_tool_registry_keys_unique():
    from app.mcp.server import _WORKSPACE_TOOL_REGISTRY

    keys = list(_WORKSPACE_TOOL_REGISTRY.keys())
    assert len(keys) == len(set(keys))


def test_mcp_admin_allowlist_matches_registry():
    from app.mcp.server import _WORKSPACE_TOOL_REGISTRY
    from app.services.ai_chat import get_role_mcp_tool_allowlist, _PATIENT_EXCLUSIVE_TOOLS

    admin_tools = get_role_mcp_tool_allowlist()["admin"]
    registry_tools = set(_WORKSPACE_TOOL_REGISTRY.keys())
    # Admin gets all tools except execute_python_code and patient-exclusive tools
    expected_admin_tools = registry_tools - {"execute_python_code"} - _PATIENT_EXCLUSIVE_TOOLS
    assert admin_tools == expected_admin_tools
    # Verify execute_python_code is not in admin allowlist
    assert "execute_python_code" not in admin_tools
    # Verify patient-exclusive tools are not in admin allowlist
    for tool in _PATIENT_EXCLUSIVE_TOOLS:
        assert tool not in admin_tools


def test_mcp_streamable_http_lifespan_target_is_inner_starlette_not_auth_middleware():
    """Regression: FastAPI lifespan uses inner.router; McpAuthMiddleware has no router."""
    from app.mcp.auth import McpAuthMiddleware
    from app.mcp import server as mcp_server

    mcp_server._mcp_streamable_http_inner_app = None
    mcp_server.create_remote_mcp_app()
    inner = mcp_server._mcp_streamable_http_inner_app
    assert inner is not None
    assert not isinstance(inner, McpAuthMiddleware)
    assert hasattr(inner, "router")


@pytest.mark.asyncio
async def test_mcp_streamable_http_tool_call_via_agent_runtime(admin_user: User):
    """Regression: StreamableHTTPSessionManager task group + MCP client stack."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://localhost:8000") as client:
        root_response = await client.get("/")
        if root_response.json().get("mcp") is None:
            pytest.skip("MCP mount disabled")

    from app.agent_runtime import service as agent_runtime_service

    token = create_access_token(subject=str(admin_user.id), role=admin_user.role)
    result = await agent_runtime_service._call_mcp_tool(token, "get_system_health", {})
    assert isinstance(result, dict)
    assert result.get("status") == "ok"
