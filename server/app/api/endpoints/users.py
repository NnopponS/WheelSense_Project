from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

"""User endpoints: Management and CRUD for system users."""

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import (
    RequireRole,
    ROLE_SUPERVISOR_READ,
    ROLE_USER_MANAGERS,
    get_current_user_workspace,
    get_db,
)
from app.models.core import Workspace
from app.models.users import User
from app.schemas.users import UserCreate, UserOut, UserSearchOut, UserUpdate
from app.services.auth import UserService

router = APIRouter(tags=["Users"])

@router.post("", response_model=UserOut)
async def create_user(
    data: UserCreate,
    session: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_USER_MANAGERS)),
):
    """
    Create a new user. Only Admins can perform this action.
    """
    return await UserService.create_user(session, ws.id, data)

@router.get("", response_model=list[UserOut])
async def read_users(
    session: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_SUPERVISOR_READ)),
):
    """
    Retrieve users. Admins and Supervisors can view users.
    """
    return await UserService.get_users_by_workspace(session, ws.id)

@router.get("/search", response_model=list[UserSearchOut])
async def search_users(
    q: str | None = None,
    roles: str | None = None,
    limit: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_SUPERVISOR_READ)),
):
    """
    Search active workspace users for role/person assignment controls.
    """
    role_filters = [role.strip() for role in (roles or "").split(",") if role.strip()]
    return await UserService.search_users(
        session,
        ws.id,
        q=q,
        roles=role_filters or None,
        limit=limit,
    )

@router.put("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    data: UserUpdate,
    session: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_USER_MANAGERS)),
):
    """
    Update a user. Only Admins can perform this action.
    """
    update_data = data.model_dump(exclude_unset=True)
    return await UserService.update_user(session, user_id, ws.id, update_data)

@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: int,
    session: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_USER_MANAGERS)),
):
    """
    Soft-delete a user by deactivating it and clearing caregiver/patient links.
    """
    await UserService.soft_delete_user(session, user_id, ws.id, current_user.id)
