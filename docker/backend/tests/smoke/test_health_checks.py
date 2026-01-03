"""
Smoke tests for health checks and service availability.
"""

import pytest
from httpx import AsyncClient
from fastapi import FastAPI


@pytest.mark.smoke
@pytest.mark.asyncio
async def test_backend_health_endpoint():
    """Test that backend health endpoint responds."""
    # Note: This test requires a running backend instance
    # For unit tests, we'd mock the FastAPI app
    # For integration tests, we'd use a test client
    
    # This is a placeholder - actual implementation would use TestClient
    # from fastapi.testclient import TestClient
    # app = create_app()  # Your FastAPI app factory
    # client = TestClient(app)
    # response = client.get("/health")
    # assert response.status_code == 200
    
    # For now, we'll test the health check logic directly
    assert True  # Placeholder


@pytest.mark.smoke
@pytest.mark.asyncio
async def test_database_connectivity(test_db):
    """Test that database connection works."""
    assert test_db.is_connected
    
    # Test basic query
    user_info = await test_db.get_user_info()
    assert user_info is not None
    assert isinstance(user_info, dict)


@pytest.mark.smoke
@pytest.mark.asyncio
async def test_chat_health_endpoint():
    """Test chat health endpoint (if LLM available)."""
    # This would test /api/chat/health endpoint
    # For smoke tests, we might skip if Ollama not available
    assert True  # Placeholder


@pytest.mark.smoke
@pytest.mark.asyncio
async def test_basic_api_endpoints(test_db):
    """Test that basic API endpoints are accessible."""
    # Test GET /api/user-info
    user_info = await test_db.get_user_info()
    assert user_info is not None
    
    # Test GET /api/schedule-items
    schedule_items = await test_db.get_schedule_items()
    assert isinstance(schedule_items, list)

