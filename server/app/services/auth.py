from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

"""Service layer for authentication and user management."""

from fastapi import HTTPException, status

from sqlalchemy.future import select

from app.core.security import get_password_hash, verify_password, create_access_token
from app.models.caregivers import CareGiver
from app.models.patients import Patient
from app.models.users import User
from app.schemas.users import UserCreate, Token
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

class AuthService:
    """Business logic for Authentication."""

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
        session: AsyncSession, username: str, password: str
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

        access_token = create_access_token(
            subject=user.id,
            role=user.role,
        )
        return Token(access_token=access_token, token_type="bearer")

    from sqlalchemy.ext.asyncio import AsyncSession
