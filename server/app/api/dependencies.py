from typing import AsyncGenerator

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import get_session
from app.models.core import Workspace
from app.models.users import User
from app.schemas.users import TokenData
from app.services.auth import UserService


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async for session in get_session():
        yield session


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def get_current_user(
    db: AsyncSession = Depends(get_db), token: str = Depends(oauth2_scheme)
) -> User:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
            )

        token_data = TokenData(username=user_id, role=payload.get("role"))
        user_id_int = int(token_data.username)
    except (JWTError, ValidationError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await UserService.get_user(db, user_id=user_id_int)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


async def get_current_user_workspace(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Workspace:
    result = await db.execute(select(Workspace).where(Workspace.id == current_user.workspace_id))
    workspace = result.scalar_one_or_none()
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current user is not assigned to a valid workspace",
        )
    return workspace


async def get_current_workspace_id(
    workspace: Workspace = Depends(get_current_user_workspace),
) -> int:
    return workspace.id


class RequireRole:
    def __init__(self, allowed_roles: list[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, user: User = Depends(get_current_active_user)) -> User:
        if user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=403,
                detail="Operation not permitted"
            )
        return user


# --- Role groups (EaseAI RBAC) -------------------------------------------------
# Clinical staff (excludes patient end-users for list/bulk operations)
ROLE_CLINICAL_STAFF = ["admin", "head_nurse", "supervisor", "observer"]
# Who may create/update/delete patients and assignments
ROLE_PATIENT_MANAGERS = ["admin", "head_nurse"]
# Read-only facility/caregiver for supervisor
ROLE_SUPERVISOR_READ = ["admin", "head_nurse", "supervisor"]
# Vitals/timeline writes (caregiver notes)
ROLE_CARE_NOTE_WRITERS = ["admin", "head_nurse", "observer"]
# All roles that may read vitals/alerts when scoped to self (includes patient)
ROLE_ALL_AUTHENTICATED = [
    "admin",
    "head_nurse",
    "supervisor",
    "observer",
    "patient",
]


def assert_patient_record_access(user: User, patient_id: int) -> None:
    """Staff may access any patient in workspace; patients only their own row."""
    if user.role == "patient":
        if getattr(user, "patient_id", None) != patient_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot access another patient's records",
            )
    elif user.role not in ROLE_CLINICAL_STAFF:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation not permitted",
        )
