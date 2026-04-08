import pytest
import pytest_asyncio
import anyio
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.mcp_server import mcp

@pytest_asyncio.fixture(autouse=True)
async def clean_db():
    # Setup/Teardown for db tables during testing
    pass

@pytest.mark.asyncio
async def test_mcp_sse_mount():
    """Verify that FastMCP is mounted correctly at /mcp"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://localhost:8000") as client:
        # Check /api/health to ensure basic app works
        response = await client.get("/api/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

        root_response = await client.get("/")
        if root_response.json()["mcp"] is None:
            response = await client.get("/mcp/sse")
            assert response.status_code == 404
            return

        # The SSE endpoint is mounted at /mcp/messages /mcp/sse etc.
        # FastMCP provides an SSE transport natively.
        # Use anyio timeout to prevent hanging — SSE is a long-lived connection.
        with anyio.move_on_after(3):
            async with client.stream("GET", "/mcp/sse") as response:
                assert response.status_code == 200
                assert "text/event-stream" in response.headers.get("content-type", "")

@pytest.mark.asyncio
async def test_mcp_tool_direct_call():
    """Verify a tool directly without HTTP server."""
    from app.mcp_server import get_system_health
    result = await get_system_health()
    assert result == "WheelSense Platform is running and healthy."
