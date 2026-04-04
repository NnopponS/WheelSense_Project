"""Authentication endpoints: Login and Token generation."""

from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_db, get_current_active_user
from app.models.users import User
from app.schemas.users import Token, UserOut
from app.services.auth import AuthService

router = APIRouter(tags=["Authentication"])


@router.post("/login", response_model=Token)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: AsyncSession = Depends(get_db),
):
    """
    OAuth2 compatible token login, getting an access token for future requests.
    """
    return await AuthService.login_for_access_token(
        session, form_data.username, form_data.password
    )


@router.get("/me", response_model=UserOut)
async def read_users_me(
    current_user: User = Depends(get_current_active_user),
):
    """
    Get current user information based on the JWT token.
    """
    return current_user
