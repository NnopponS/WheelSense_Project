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
