from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from typing import Final

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.request_context import set_impersonated_by_user_id
from app.db.session import get_session
from app.models.caregivers import CareGiverPatientAccess
from app.models.core import Workspace
from app.models.patients import PatientDeviceAssignment
from app.models.users import User
from app.schemas.users import TokenData
from app.services.auth import AuthService, UserService


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async for session in get_session():
        yield session


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


async def get_current_user(
    db: AsyncSession = Depends(get_db), token: str = Depends(oauth2_scheme)
) -> User:
    user, _, _ = await resolve_current_user_from_token(db, token)
    return user


def _parse_token_scope_claim(raw_scope: object) -> list[str]:
    if raw_scope is None:
        return []
    if isinstance(raw_scope, str):
        return [part for part in raw_scope.split() if part]
    if isinstance(raw_scope, list):
        return [str(part) for part in raw_scope if str(part)]
    return []


async def resolve_current_user_from_token(
    db: AsyncSession,
    token: str,
) -> tuple[User, TokenData, dict]:
    set_impersonated_by_user_id(None)
    actor_admin_id: int | None = None
    session_id: str | None = None
    payload: dict
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
            )
        token_data = TokenData(
            username=user_id,
            role=payload.get("role"),
            session_id=payload.get("sid"),
            actor_admin_id=payload.get("actor_admin_id"),
            scopes=_parse_token_scope_claim(payload.get("scope")),
        )
        user_id_int = int(token_data.username)
        actor_admin_id = token_data.actor_admin_id
        session_id = token_data.session_id
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
    if session_id:
        auth_session = await AuthService.get_auth_session(db, session_id=session_id)
        now = datetime.now(timezone.utc)
        expires_at = _as_utc(auth_session.expires_at) if auth_session else None
        if (
            not auth_session
            or auth_session.user_id != user.id
            or auth_session.workspace_id != user.workspace_id
            or auth_session.revoked_at is not None
            or expires_at is None
            or expires_at <= now
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session is no longer active",
                headers={"WWW-Authenticate": "Bearer"},
            )
    set_impersonated_by_user_id(actor_admin_id)
    setattr(user, "_impersonated_by_user_id", actor_admin_id)
    setattr(user, "_session_id", session_id)
    setattr(user, "_access_token", token)
    setattr(user, "_token_scopes", resolve_effective_token_scopes(user.role, token_data.scopes))
    return user, token_data, payload


def resolve_effective_token_scopes(role: str, requested_scopes: list[str] | None = None) -> set[str]:
    allowed = set(ROLE_TOKEN_SCOPES.get(role, set()))
    requested = {scope for scope in (requested_scopes or []) if scope}
    if not requested:
        return allowed
    return allowed.intersection(requested)


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
# Facility/floor read access used by role-shared floorplan viewers.
ROLE_FACILITY_READ = [ROLE_ADMIN, ROLE_HEAD_NURSE, ROLE_SUPERVISOR, ROLE_OBSERVER]
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
        "facilities.read",
    },
    ROLE_PATIENT: {
        "self.read",
        "alerts.read",
        "messages.manage",
        "devices.read",
    },
}

ROLE_TOKEN_SCOPES: Final[dict[str, set[str]]] = {
    ROLE_ADMIN: {
        "workspace.read",
        "patients.read",
        "patients.write",
        "alerts.read",
        "alerts.manage",
        "devices.read",
        "devices.manage",
        "devices.command",
        "rooms.read",
        "rooms.manage",
        "room_controls.use",
        "workflow.read",
        "workflow.write",
        "cameras.capture",
        "ai_settings.read",
        "ai_settings.write",
        "admin.audit.read",
    },
    ROLE_HEAD_NURSE: {
        "workspace.read",
        "patients.read",
        "patients.write",
        "alerts.read",
        "alerts.manage",
        "devices.read",
        "devices.manage",
        "devices.command",
        "rooms.read",
        "workflow.read",
        "workflow.write",
        "cameras.capture",
    },
    ROLE_SUPERVISOR: {
        "workspace.read",
        "patients.read",
        "alerts.read",
        "alerts.manage",
        "devices.read",
        "rooms.read",
        "workflow.read",
        "workflow.write",
    },
    ROLE_OBSERVER: {
        "workspace.read",
        "patients.read",
        "alerts.read",
        "devices.read",
        "rooms.read",
        "workflow.read",
        "workflow.write",
    },
    ROLE_PATIENT: {
        "patients.read",
        "alerts.read",
        "devices.read",
        "rooms.read",
        "room_controls.use",
        "workflow.read",
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
    if user.role in {ROLE_ADMIN, ROLE_HEAD_NURSE}:
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


async def assert_patient_may_access_assigned_device_db(
    db: AsyncSession,
    ws_id: int,
    user: User,
    device_id: str,
) -> None:
    """Limit registry device reads for patient accounts to actively assigned hardware."""
    if user.role != ROLE_PATIENT:
        return
    patient_id = getattr(user, "patient_id", None)
    if patient_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Patient account is not linked to a care profile",
        )
    row = (
        await db.execute(
            select(PatientDeviceAssignment.id)
            .where(
                PatientDeviceAssignment.workspace_id == ws_id,
                PatientDeviceAssignment.patient_id == patient_id,
                PatientDeviceAssignment.device_id == device_id,
                PatientDeviceAssignment.is_active.is_(True),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Device is not assigned to your care profile",
        )
