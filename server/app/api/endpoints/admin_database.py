from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import ROLE_ADMIN, RequireRole, get_db
from app.core.security import verify_password
from app.models.users import User
from app.schemas.admin_database import ClearDatabaseBody, ClearDatabaseResult
from app.services.database_clear import clear_application_data

router = APIRouter()


@router.post("/clear", response_model=ClearDatabaseResult)
async def clear_entire_database(
    body: ClearDatabaseBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(RequireRole([ROLE_ADMIN])),
) -> ClearDatabaseResult:
    """Wipe all workspaces and domain data; keep the authenticated admin and a fresh workspace.

    Requires the admin's current password. Blocked while JWT impersonation is active.
    """
    if getattr(current_user, "_impersonated_by_user_id", None):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Database clear is not allowed during impersonation",
        )

    if not verify_password(body.password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid password",
        )

    try:
        summary = await clear_application_data(
            db,
            preserve_user_id=current_user.id,
            reset_preserved_password_to=None,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    new_ws_id = summary.get("new_workspace_id")
    if not isinstance(new_ws_id, int):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Clear finished but workspace id missing",
        )

    username = str(summary.get("preserved_username") or current_user.username)
    return ClearDatabaseResult(
        message="All application data was removed. You are on a new empty workspace; sign in again if your session errors.",
        preserved_user_id=current_user.id,
        new_workspace_id=new_ws_id,
        preserved_username=username,
    )
