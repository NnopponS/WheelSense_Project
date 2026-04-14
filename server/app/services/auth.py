from __future__ import annotations

from datetime import datetime, timedelta, timezone
import secrets
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

"""Service layer for authentication and user management."""

from fastapi import HTTPException, status

from sqlalchemy import and_, func, or_
from sqlalchemy.future import select

from app.config import settings
from app.core.security import get_password_hash, verify_password, create_access_token
from app.models.caregivers import CareGiver
from app.models.patients import Patient
from app.models.users import AuthSession, User
from app.schemas.users import AuthMeProfilePatch, AuthSessionOut, UserCreate, Token
from app.services.profile_image_storage import remove_hosted_profile_file_if_any

class UserService:
    """Business logic for User management."""

    @staticmethod
    async def get_user_by_username(session: AsyncSession, username: str) -> User | None:
        """Find a user by username across all workspaces."""
        stmt = select(User).where(User.username == username)
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def get_user(session: AsyncSession, user_id: int) -> User | None:
        """Find a user by ID."""
        stmt = select(User).where(User.id == user_id)
        result = await session.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def create_user(
        session: AsyncSession, ws_id: int, user_in: UserCreate
    ) -> User:
        """Create a new user in a specific workspace."""
        # Check if username exists
        existing = await UserService.get_user_by_username(session, user_in.username)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already registered",
            )

        if user_in.patient_id is not None:
            await UserService._validate_patient_in_workspace(session, ws_id, user_in.patient_id)
            await UserService._auto_reassign_patient_link(
                session,
                ws_id,
                user_in.patient_id,
                keep_user_id=None,
            )
        if user_in.caregiver_id is not None:
            await UserService._validate_caregiver_in_workspace(
                session,
                ws_id,
                user_in.caregiver_id,
            )

        hashed_password = get_password_hash(user_in.password)
        db_user = User(
            workspace_id=ws_id,
            username=user_in.username,
            hashed_password=hashed_password,
            role=user_in.role,
            is_active=user_in.is_active,
            caregiver_id=user_in.caregiver_id,
            patient_id=user_in.patient_id,
            profile_image_url=user_in.profile_image_url or "",
        )
        session.add(db_user)
        await session.commit()
        await session.refresh(db_user)
        return db_user

    @staticmethod
    async def _validate_patient_in_workspace(
        session: AsyncSession,
        ws_id: int,
        patient_id: int,
    ) -> None:
        stmt = select(Patient.id).where(
            Patient.id == patient_id,
            Patient.workspace_id == ws_id,
        )
        exists = (await session.execute(stmt)).scalar_one_or_none()
        if exists is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Patient not found in current workspace",
            )

    @staticmethod
    async def _validate_caregiver_in_workspace(
        session: AsyncSession,
        ws_id: int,
        caregiver_id: int,
    ) -> None:
        stmt = select(CareGiver.id).where(
            CareGiver.id == caregiver_id,
            CareGiver.workspace_id == ws_id,
        )
        exists = (await session.execute(stmt)).scalar_one_or_none()
        if exists is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Caregiver not found in current workspace",
            )

    @staticmethod
    async def _auto_reassign_patient_link(
        session: AsyncSession,
        ws_id: int,
        patient_id: int,
        keep_user_id: int | None,
    ) -> None:
        stmt = select(User).where(
            User.workspace_id == ws_id,
            User.patient_id == patient_id,
        )
        rows = list((await session.execute(stmt)).scalars().all())
        for row in rows:
            if keep_user_id is not None and row.id == keep_user_id:
                continue
            row.patient_id = None
            session.add(row)

    @staticmethod
    async def get_users_by_workspace(session: AsyncSession, ws_id: int) -> list[User]:
        """Get all users for a workspace."""
        stmt = select(User).where(User.workspace_id == ws_id)
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def search_users(
        session: AsyncSession,
        ws_id: int,
        *,
        q: str | None = None,
        roles: list[str] | None = None,
        role: str | None = None,
        kind: str | None = None,
        limit: int = 20,
    ) -> list[dict]:
        """Search workspace users for assign-to-person controls."""
        stmt = (
            select(User, CareGiver, Patient)
            .outerjoin(
                CareGiver,
                and_(
                    CareGiver.id == User.caregiver_id,
                    CareGiver.workspace_id == ws_id,
                ),
            )
            .outerjoin(
                Patient,
                and_(
                    Patient.id == User.patient_id,
                    Patient.workspace_id == ws_id,
                ),
            )
            .where(User.workspace_id == ws_id, User.is_active.is_(True))
        )
        if role:
            stmt = stmt.where(User.role == role)
        if roles:
            stmt = stmt.where(User.role.in_(roles))
        if kind == "staff":
            stmt = stmt.where(or_(User.role != "patient", User.caregiver_id.isnot(None)))
        elif kind == "patient":
            stmt = stmt.where(or_(User.role == "patient", User.patient_id.isnot(None)))
        needle = (q or "").strip()
        if needle:
            like = f"%{needle}%"
            conditions = [
                User.username.ilike(like),
                CareGiver.first_name.ilike(like),
                CareGiver.last_name.ilike(like),
                CareGiver.employee_code.ilike(like),
                Patient.first_name.ilike(like),
                Patient.last_name.ilike(like),
                Patient.nickname.ilike(like),
                func.trim(func.coalesce(CareGiver.first_name, "") + " " + func.coalesce(CareGiver.last_name, "")).ilike(like),
                func.trim(func.coalesce(Patient.first_name, "") + " " + func.coalesce(Patient.last_name, "")).ilike(like),
            ]
            if needle.isdigit():
                numeric_id = int(needle)
                conditions.extend([User.id == numeric_id, Patient.id == numeric_id])
            stmt = stmt.where(or_(*conditions))
        stmt = stmt.order_by(User.username.asc()).limit(limit)
        rows = list((await session.execute(stmt)).all())
        results = []
        for user, caregiver, patient in rows:
            caregiver_name = ""
            if caregiver:
                caregiver_name = f"{caregiver.first_name} {caregiver.last_name}".strip()
            patient_name = ""
            if patient:
                patient_name = f"{patient.first_name} {patient.last_name}".strip()
            linked_name = caregiver_name or patient_name or None
            if patient is not None or user.role == "patient":
                row_kind = "patient"
            elif caregiver is not None or user.role in {"admin", "head_nurse", "supervisor", "observer"}:
                row_kind = "staff"
            else:
                row_kind = "unlinked"
            display_name = (
                linked_name
                or user.username
            )
            results.append(
                {
                    "id": user.id,
                    "username": user.username,
                    "role": user.role,
                    "is_active": user.is_active,
                    "caregiver_id": user.caregiver_id,
                    "patient_id": user.patient_id,
                    "kind": row_kind,
                    "linked_name": linked_name,
                    "employee_code": caregiver.employee_code if caregiver else None,
                    "display_name": display_name,
                }
            )
        return results

    @staticmethod
    async def get_me_profile(
        session: AsyncSession,
        ws_id: int,
        user: User,
    ) -> dict[str, Any]:
        caregiver = None
        patient = None
        if user.caregiver_id is not None:
            caregiver = (
                await session.execute(
                    select(CareGiver).where(
                        CareGiver.workspace_id == ws_id,
                        CareGiver.id == user.caregiver_id,
                    )
                )
            ).scalar_one_or_none()
        if user.patient_id is not None:
            patient = (
                await session.execute(
                    select(Patient).where(
                        Patient.workspace_id == ws_id,
                        Patient.id == user.patient_id,
                    )
                )
            ).scalar_one_or_none()
        return {
            "user": user,
            "linked_caregiver": caregiver,
            "linked_patient": patient,
        }

    @staticmethod
    async def update_me_profile(
        session: AsyncSession,
        ws_id: int,
        user: User,
        payload: AuthMeProfilePatch,
    ) -> dict[str, Any]:
        data = payload.model_dump(exclude_unset=True)
        user_patch = dict(data.get("user") or {})
        username = data.get("username", user_patch.get("username"))
        if username is not None and username != user.username:
            existing = await UserService.get_user_by_username(session, username)
            if existing and existing.id != user.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Username already registered",
                )
            user.username = username

        profile_image_url = data.get("profile_image_url", user_patch.get("profile_image_url"))
        if profile_image_url is not None or "profile_image_url" in data or "profile_image_url" in user_patch:
            old_val = (user.profile_image_url or "").strip()
            new_val = profile_image_url
            if new_val is None:
                remove_hosted_profile_file_if_any(old_val)
                user.profile_image_url = ""
            else:
                new_s = new_val.strip()
                if new_s != old_val:
                    remove_hosted_profile_file_if_any(old_val)
                user.profile_image_url = new_s
            session.add(user)

        caregiver_patch = dict(data.get("caregiver") or data.get("linked_caregiver") or {})
        if "email" in user_patch and "email" not in caregiver_patch:
            caregiver_patch["email"] = user_patch.get("email")
        if "phone" in user_patch and "phone" not in caregiver_patch:
            caregiver_patch["phone"] = user_patch.get("phone")
        if caregiver_patch:
            if user.caregiver_id is None:
                raise HTTPException(status_code=400, detail="Current account is not linked to a staff profile")
            caregiver = (
                await session.execute(
                    select(CareGiver).where(
                        CareGiver.workspace_id == ws_id,
                        CareGiver.id == user.caregiver_id,
                    )
                )
            ).scalar_one_or_none()
            if not caregiver:
                raise HTTPException(status_code=404, detail="Linked staff profile not found")
            for field, value in caregiver_patch.items():
                setattr(caregiver, field, value)
            session.add(caregiver)

        patient_patch = data.get("patient") or data.get("linked_patient")
        if patient_patch:
            if user.patient_id is None:
                raise HTTPException(status_code=400, detail="Current account is not linked to a patient profile")
            patient = (
                await session.execute(
                    select(Patient).where(
                        Patient.workspace_id == ws_id,
                        Patient.id == user.patient_id,
                    )
                )
            ).scalar_one_or_none()
            if not patient:
                raise HTTPException(status_code=404, detail="Linked patient profile not found")
            for field, value in patient_patch.items():
                setattr(patient, field, value)
            session.add(patient)

        await session.commit()
        return await UserService.get_me_profile(session, ws_id, user)

    @staticmethod
    async def change_password(
        session: AsyncSession,
        user: User,
        current_password: str,
        new_password: str,
    ) -> None:
        if not verify_password(current_password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect",
            )
        if current_password == new_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New password must differ from current password",
            )
        user.hashed_password = get_password_hash(new_password)
        session.add(user)
        await session.commit()

    @staticmethod
    async def update_user(
        session: AsyncSession, user_id: int, ws_id: int, user_in: dict
    ) -> User:
        """Update an existing user in the workspace."""
        user = await UserService.get_user(session, user_id)
        if not user or user.workspace_id != ws_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )

        # Prevent taking someone else's username
        if "username" in user_in and user_in["username"] != user.username:
            existing = await UserService.get_user_by_username(session, user_in["username"])
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Username already registered"
                )

        if "password" in user_in and user_in["password"]:
            user_in["hashed_password"] = get_password_hash(user_in.pop("password"))
        elif "password" in user_in:
            user_in.pop("password")

        if "patient_id" in user_in and user_in["patient_id"] is not None:
            patient_id = int(user_in["patient_id"])
            await UserService._validate_patient_in_workspace(session, ws_id, patient_id)
            await UserService._auto_reassign_patient_link(
                session,
                ws_id,
                patient_id,
                keep_user_id=user.id,
            )
        if "caregiver_id" in user_in and user_in["caregiver_id"] is not None:
            caregiver_id = int(user_in["caregiver_id"])
            await UserService._validate_caregiver_in_workspace(
                session,
                ws_id,
                caregiver_id,
            )

        if "profile_image_url" in user_in:
            old_val = (user.profile_image_url or "").strip()
            new_val = user_in["profile_image_url"]
            if new_val is None:
                remove_hosted_profile_file_if_any(old_val)
                user_in["profile_image_url"] = ""
            else:
                new_s = new_val.strip()
                if new_s != old_val:
                    remove_hosted_profile_file_if_any(old_val)
                user_in["profile_image_url"] = new_s

        for field, value in user_in.items():
            setattr(user, field, value)

        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user

    @staticmethod
    async def soft_delete_user(
        session: AsyncSession,
        user_id: int,
        ws_id: int,
        actor_user_id: int,
    ) -> None:
        """Deactivate a user and clear identity links while preserving the audit row."""
        if user_id == actor_user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete the current user",
            )
        user = await UserService.get_user(session, user_id)
        if not user or user.workspace_id != ws_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )
        old_profile_image_url = (user.profile_image_url or "").strip()
        user.is_active = False
        user.caregiver_id = None
        user.patient_id = None
        if old_profile_image_url:
            remove_hosted_profile_file_if_any(old_profile_image_url)
            user.profile_image_url = ""
        session.add(user)
        await session.commit()

class AuthService:
    """Business logic for Authentication."""

    @staticmethod
    def _expires_at(expires_delta: timedelta | None = None) -> datetime:
        ttl = expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
        return datetime.now(timezone.utc) + ttl

    @staticmethod
    async def _create_auth_session(
        session: AsyncSession,
        *,
        user: User,
        expires_at: datetime,
        user_agent: str | None = None,
        ip_address: str | None = None,
        impersonated_by_user_id: int | None = None,
    ) -> AuthSession:
        db_session = AuthSession(
            id=secrets.token_urlsafe(24),
            workspace_id=user.workspace_id,
            user_id=user.id,
            impersonated_by_user_id=impersonated_by_user_id,
            user_agent=(user_agent or "")[:512],
            ip_address=(ip_address or "")[:64],
            expires_at=expires_at,
        )
        session.add(db_session)
        await session.commit()
        await session.refresh(db_session)
        return db_session

    @staticmethod
    async def create_auth_session(
        session: AsyncSession,
        *,
        user_id: int,
        workspace_id: int,
        expires_minutes: int,
        user_agent: str | None = None,
        ip_address: str | None = None,
        impersonated_by_user_id: int | None = None,
    ) -> str:
        user = await UserService.get_user(session, user_id=user_id)
        if not user or user.workspace_id != workspace_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )
        auth_session = await AuthService._create_auth_session(
            session,
            user=user,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=expires_minutes),
            user_agent=user_agent,
            ip_address=ip_address,
            impersonated_by_user_id=impersonated_by_user_id,
        )
        return auth_session.id

    @staticmethod
    async def get_auth_session(
        session: AsyncSession,
        *,
        session_id: str,
    ) -> AuthSession | None:
        row = await session.get(AuthSession, session_id)
        return row

    @staticmethod
    async def list_auth_sessions(
        session: AsyncSession,
        *,
        ws_id: int,
        user_id: int,
        current_session_id: str | None,
    ) -> list[AuthSessionOut]:
        rows = list(
            (
                await session.execute(
                    select(AuthSession)
                    .where(
                        AuthSession.workspace_id == ws_id,
                        AuthSession.user_id == user_id,
                        AuthSession.revoked_at.is_(None),
                    )
                    .order_by(AuthSession.created_at.desc())
                )
            ).scalars().all()
        )
        return [
            AuthSessionOut.model_validate(row).model_copy(
                update={"current": current_session_id == row.id}
            )
            for row in rows
        ]

    @staticmethod
    async def revoke_auth_session(
        session: AsyncSession,
        *,
        ws_id: int,
        user_id: int,
        session_id: str,
    ) -> AuthSession:
        row = await AuthService.get_auth_session(session, session_id=session_id)
        if not row or row.workspace_id != ws_id or row.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found",
            )
        if row.revoked_at is None:
            row.revoked_at = datetime.now(timezone.utc)
            session.add(row)
            await session.commit()
            await session.refresh(row)
        return row

    @staticmethod
    async def authenticate_user(
        session: AsyncSession, username: str, password: str
    ) -> User | None:
        """Verify username and password."""
        user = await UserService.get_user_by_username(session, username)
        if not user:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        return user

    @staticmethod
    async def login_for_access_token(
        session: AsyncSession,
        username: str,
        password: str,
        *,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> Token:
        """Authenticate and generate JWT."""
        user = await AuthService.authenticate_user(session, username, password)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user"
            )

        expires_at = AuthService._expires_at()
        auth_session = await AuthService._create_auth_session(
            session,
            user=user,
            expires_at=expires_at,
            user_agent=user_agent,
            ip_address=ip_address,
        )
        access_token = create_access_token(
            subject=user.id,
            role=user.role,
            extra_claims={"sid": auth_session.id},
        )
        return Token(
            access_token=access_token,
            token_type="bearer",
            session_id=auth_session.id,
        )

    @staticmethod
    async def start_impersonation(
        session: AsyncSession,
        *,
        actor_admin: User,
        target_user_id: int,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> Token:
        """Create a short-lived token that acts as another workspace user."""
        if actor_admin.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can act as another user",
            )
        target = await UserService.get_user(session, target_user_id)
        if not target or target.workspace_id != actor_admin.workspace_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Target user not found",
            )
        if not target.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot act as an inactive user",
            )
        if target.id == actor_admin.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot act as the current admin user",
            )

        expires_at = AuthService._expires_at(timedelta(minutes=60))
        auth_session = await AuthService._create_auth_session(
            session,
            user=target,
            expires_at=expires_at,
            user_agent=user_agent,
            ip_address=ip_address,
            impersonated_by_user_id=actor_admin.id,
        )
        access_token = create_access_token(
            subject=target.id,
            role=target.role,
            expires_delta=timedelta(minutes=60),
            extra_claims={
                "sid": auth_session.id,
                "impersonation": True,
                "actor_admin_id": actor_admin.id,
                "impersonated_user_id": target.id,
            },
        )
        return Token(
            access_token=access_token,
            token_type="bearer",
            session_id=auth_session.id,
            impersonation=True,
            actor_admin_id=actor_admin.id,
            impersonated_user_id=target.id,
        )
