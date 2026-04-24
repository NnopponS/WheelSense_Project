"""Tests for login API across all roles."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.core.security import get_password_hash
from app.models.core import Workspace
from app.models.users import User


class TestLoginAPI:
    """Test login endpoint with various user roles."""

    @pytest.mark.asyncio
    async def test_login_simulator_admin_success(self, client: AsyncClient, db_session):
        """Admin can login with demo1234 in simulator mode."""
        # Create sim workspace
        ws = Workspace(name="Sim Workspace", mode="simulation", is_active=True)
        db_session.add(ws)
        await db_session.flush()
        
        # Create admin with demo1234
        admin = User(
            username="sim_admin",
            hashed_password=get_password_hash("demo1234"),
            role="admin",
            workspace_id=ws.id,
            is_active=True,
        )
        db_session.add(admin)
        await db_session.flush()
        
        # Login with demo1234
        response = await client.post(
            "/api/auth/login",
            data={
                "username": "sim_admin",
                "password": "demo1234",
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    @pytest.mark.asyncio
    async def test_login_production_admin_success(self, client: AsyncClient, db_session):
        """Admin can login with wheelsense2026 in production mode."""
        # Create production workspace
        ws = Workspace(name="Production Workspace", mode="production", is_active=True)
        db_session.add(ws)
        await db_session.flush()
        
        # Create admin with production password
        admin = User(
            username="prod_admin",
            hashed_password=get_password_hash("wheelsense2026"),
            role="admin",
            workspace_id=ws.id,
            is_active=True,
        )
        db_session.add(admin)
        await db_session.flush()
        
        # Login with production password
        response = await client.post(
            "/api/auth/login",
            data={
                "username": "prod_admin",
                "password": "wheelsense2026",
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data

    @pytest.mark.asyncio
    async def test_login_head_nurse_success(self, client: AsyncClient, db_session):
        """Head nurse can login with demo1234."""
        ws = Workspace(name="Test Workspace", mode="simulation", is_active=True)
        db_session.add(ws)
        await db_session.flush()
        
        user = User(
            username="sarah.j",
            hashed_password=get_password_hash("demo1234"),
            role="head_nurse",
            workspace_id=ws.id,
            is_active=True,
        )
        db_session.add(user)
        await db_session.flush()
        
        response = await client.post(
            "/api/auth/login",
            data={
                "username": "sarah.j",
                "password": "demo1234",
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data

    @pytest.mark.asyncio
    async def test_login_supervisor_success(self, client: AsyncClient, db_session):
        """Supervisor can login with demo1234."""
        ws = Workspace(name="Test Workspace", mode="simulation", is_active=True)
        db_session.add(ws)
        await db_session.flush()
        
        user = User(
            username="michael.s",
            hashed_password=get_password_hash("demo1234"),
            role="supervisor",
            workspace_id=ws.id,
            is_active=True,
        )
        db_session.add(user)
        await db_session.flush()
        
        response = await client.post(
            "/api/auth/login",
            data={
                "username": "michael.s",
                "password": "demo1234",
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data

    @pytest.mark.asyncio
    async def test_login_observer_success(self, client: AsyncClient, db_session):
        """Observer can login with demo1234."""
        ws = Workspace(name="Test Workspace", mode="simulation", is_active=True)
        db_session.add(ws)
        await db_session.flush()
        
        user = User(
            username="jennifer.l",
            hashed_password=get_password_hash("demo1234"),
            role="observer",
            workspace_id=ws.id,
            is_active=True,
        )
        db_session.add(user)
        await db_session.flush()
        
        response = await client.post(
            "/api/auth/login",
            data={
                "username": "jennifer.l",
                "password": "demo1234",
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data

    @pytest.mark.asyncio
    async def test_login_patient_success(self, client: AsyncClient, db_session):
        """Patient can login with demo1234."""
        ws = Workspace(name="Test Workspace", mode="simulation", is_active=True)
        db_session.add(ws)
        await db_session.flush()
        
        user = User(
            username="emika.c",
            hashed_password=get_password_hash("demo1234"),
            role="patient",
            workspace_id=ws.id,
            is_active=True,
        )
        db_session.add(user)
        await db_session.flush()
        
        response = await client.post(
            "/api/auth/login",
            data={
                "username": "emika.c",
                "password": "demo1234",
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data

    @pytest.mark.asyncio
    async def test_login_wrong_password_fails(self, client: AsyncClient, db_session):
        """Login fails with wrong password."""
        ws = Workspace(name="Test Workspace", mode="simulation", is_active=True)
        db_session.add(ws)
        await db_session.flush()
        
        user = User(
            username="testuser",
            hashed_password=get_password_hash("demo1234"),
            role="observer",
            workspace_id=ws.id,
            is_active=True,
        )
        db_session.add(user)
        await db_session.flush()
        
        response = await client.post(
            "/api/auth/login",
            data={
                "username": "testuser",
                "password": "wrongpassword",
            }
        )
        
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_login_nonexistent_user_fails(self, client: AsyncClient):
        """Login fails for nonexistent user."""
        response = await client.post(
            "/api/auth/login",
            data={
                "username": "nonexistent",
                "password": "demo1234",
            }
        )
        
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_login_inactive_user_fails(self, client: AsyncClient, db_session):
        """Login fails for inactive user."""
        ws = Workspace(name="Test Workspace", mode="simulation", is_active=True)
        db_session.add(ws)
        await db_session.flush()
        
        user = User(
            username="inactive_user",
            hashed_password=get_password_hash("demo1234"),
            role="observer",
            workspace_id=ws.id,
            is_active=False,
        )
        db_session.add(user)
        await db_session.flush()
        
        response = await client.post(
            "/api/auth/login",
            data={
                "username": "inactive_user",
                "password": "demo1234",
            }
        )
        
        # Login should fail (400 or 401 are both acceptable)
        assert response.status_code in [400, 401]
