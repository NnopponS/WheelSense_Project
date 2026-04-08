from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Final

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import get_session
from app.models.caregivers import CareGiverPatientAccess
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
    except (JWTError, ValidationError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

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
                detail="Operation not permitted",
            )
        return user

# --- Role groups (EaseAI RBAC) -------------------------------------------------
# Canonical roles
ROLE_ADMIN: Final[str] = "admin"
ROLE_HEAD_NURSE: Final[str] = "head_nurse"
ROLE_SUPERVISOR: Final[str] = "supervisor"
ROLE_OBSERVER: Final[str] = "observer"
ROLE_PATIENT: Final[str] = "patient"

# Clinical staff (excludes patient end-users for list/bulk operations)
ROLE_CLINICAL_STAFF = [ROLE_ADMIN, ROLE_HEAD_NURSE, ROLE_SUPERVISOR, ROLE_OBSERVER]
# Who may create/update/delete patients and assignments
ROLE_PATIENT_MANAGERS = [ROLE_ADMIN, ROLE_HEAD_NURSE]
# Who may create/update credentials and account links
ROLE_USER_MANAGERS = [ROLE_ADMIN, ROLE_HEAD_NURSE]
# Read-only facility/caregiver for supervisor
ROLE_SUPERVISOR_READ = [ROLE_ADMIN, ROLE_HEAD_NURSE, ROLE_SUPERVISOR]
# Vitals/timeline writes (caregiver notes)
ROLE_CARE_NOTE_WRITERS = [ROLE_ADMIN, ROLE_HEAD_NURSE, ROLE_OBSERVER]
# All roles that may read vitals/alerts when scoped to self (includes patient)
ROLE_ALL_AUTHENTICATED = [
    ROLE_ADMIN,
    ROLE_HEAD_NURSE,
    ROLE_SUPERVISOR,
    ROLE_OBSERVER,
    ROLE_PATIENT,
]

# Capability map used by endpoints and frontend mirror docs.
ROLE_CAPABILITIES: Final[dict[str, set[str]]] = {
    ROLE_ADMIN: {
        "users.manage",
        "patients.manage",
        "caregivers.manage",
        "caregivers.schedule.manage",
        "devices.manage",
        "facilities.manage",
        "alerts.manage",
        "audit.read",
        "reports.manage",
        "messages.manage",
    },
    ROLE_HEAD_NURSE: {
        "users.manage",
        "patients.manage",
        "caregivers.manage",
        "caregivers.schedule.manage",
        "devices.manage",
        "facilities.read",
        "alerts.manage",
        "reports.manage",
        "messages.manage",
    },
    ROLE_SUPERVISOR: {
        "patients.read",
        "caregivers.read",
        "devices.read",
        "alerts.manage",
        "reports.read",
        "messages.manage",
        "facilities.read",
    },
    ROLE_OBSERVER: {
        "patients.read",
        "devices.read",
        "alerts.read",
        "notes.write",
        "messages.manage",
    },
    ROLE_PATIENT: {
        "self.read",
        "alerts.read",
        "messages.manage",
    },
}

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


async def get_visible_patient_ids(
    db: AsyncSession,
    ws_id: int,
    user: User,
) -> set[int] | None:
    """Return None for admin-wide access, otherwise the explicit visible patient ids."""
    if user.role == ROLE_ADMIN:
        return None
    if user.role == ROLE_PATIENT:
        patient_id = getattr(user, "patient_id", None)
        return {int(patient_id)} if patient_id is not None else set()
    caregiver_id = getattr(user, "caregiver_id", None)
    if caregiver_id is None:
        return set()
    rows = (
        await db.execute(
            select(CareGiverPatientAccess.patient_id).where(
                CareGiverPatientAccess.workspace_id == ws_id,
                CareGiverPatientAccess.caregiver_id == caregiver_id,
                CareGiverPatientAccess.is_active.is_(True),
            )
        )
    ).scalars().all()
    return {int(patient_id) for patient_id in rows}


async def assert_patient_record_access_db(
    db: AsyncSession,
    ws_id: int,
    user: User,
    patient_id: int,
) -> None:
    visible_patient_ids = await get_visible_patient_ids(db, ws_id, user)
    if visible_patient_ids is None:
        return
    if patient_id not in visible_patient_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access this patient's records",
        )
