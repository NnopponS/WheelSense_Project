"""Service layer for authentication and user management."""

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.security import get_password_hash, verify_password, create_access_token
from app.models.users import User
from app.schemas.users import UserCreate, Token


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

        hashed_password = get_password_hash(user_in.password)
        db_user = User(
            workspace_id=ws_id,
            username=user_in.username,
            hashed_password=hashed_password,
            role=user_in.role,
            is_active=user_in.is_active,
            caregiver_id=user_in.caregiver_id,
            patient_id=user_in.patient_id,
        )
        session.add(db_user)
        await session.commit()
        await session.refresh(db_user)
        return db_user
        
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
