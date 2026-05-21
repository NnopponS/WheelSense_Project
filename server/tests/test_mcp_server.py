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


def test_mcp_tool_catalog_covers_workspace_registry():
    from app.mcp.server import _WORKSPACE_TOOL_REGISTRY
    from app.mcp.tool_catalog import (
        EASEAI_FORBIDDEN_TOOLS,
        MUTATION_TOOL_NAMES,
        PATIENT_EXCLUSIVE_TOOLS,
        get_tool_policy,
        is_tool_read_only,
        validate_catalog_coverage,
    )

    validate_catalog_coverage(_WORKSPACE_TOOL_REGISTRY)

    assert get_tool_policy("execute_python_code").easeai_forbidden is True
    assert get_tool_policy("execute_python_code").risk == "critical"
    assert "execute_python_code" in EASEAI_FORBIDDEN_TOOLS

    sos_policy = get_tool_policy("sos_create_alert")
    assert sos_policy.patient_exclusive is True
    assert sos_policy.required_scope == "alerts.read"
    assert "sos_create_alert" in PATIENT_EXCLUSIVE_TOOLS

    health_policy = get_tool_policy("get_patient_health_analysis")
    assert health_policy.required_scope == "patients.read"
    assert health_policy.effect == "read"
    assert health_policy.requires_confirmation is False
    assert is_tool_read_only("get_patient_health_analysis")

    device_policy = get_tool_policy("get_device_details")
    assert device_policy.required_scope == "devices.read"
    assert device_policy.effect == "read"
    assert device_policy.requires_confirmation is False
    assert is_tool_read_only("get_device_details")

    assert "create_alert" in MUTATION_TOOL_NAMES
    assert "execute_python_code" in MUTATION_TOOL_NAMES
    assert "sos_create_alert" in MUTATION_TOOL_NAMES
    for tool_name in MUTATION_TOOL_NAMES:
        assert not is_tool_read_only(tool_name)


def test_mcp_admin_allowlist_matches_registry():
    from app.mcp.server import _WORKSPACE_TOOL_REGISTRY
    from app.mcp.tool_catalog import EASEAI_FORBIDDEN_TOOLS, PATIENT_EXCLUSIVE_TOOLS
    from app.services.ai_chat import get_role_mcp_tool_allowlist

    admin_tools = get_role_mcp_tool_allowlist()["admin"]
    registry_tools = set(_WORKSPACE_TOOL_REGISTRY.keys())
    assert "execute_python_code" in registry_tools
    assert "sos_create_alert" in registry_tools
    assert "get_device_details" in registry_tools
    assert "get_device_details" in admin_tools
    assert "execute_python_code" not in admin_tools
    assert "sos_create_alert" not in admin_tools
    assert admin_tools == registry_tools - EASEAI_FORBIDDEN_TOOLS - PATIENT_EXCLUSIVE_TOOLS


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
