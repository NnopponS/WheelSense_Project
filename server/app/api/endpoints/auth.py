from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

"""Authentication endpoints: Login and Token generation."""

import secrets
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.security import OAuth2PasswordRequestForm

from app.api.dependencies import get_db, get_current_active_user
from app.config import settings
from app.models.users import User
from app.schemas.users import MePatch, Token, UserOut
from app.services.auth import AuthService
from app.services.profile_image_storage import remove_hosted_profile_file_if_any

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

@router.patch("/me", response_model=UserOut)
async def patch_users_me(
    data: MePatch,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Update the authenticated user's own profile. `profile_image_url` must be an http(s) URL or a
    platform-hosted path `/api/public/profile-images/<hex>.jpg`. Data URLs are rejected.
    Omitted fields are left unchanged; explicit null clears the image and deletes a hosted file.
    """
    payload = data.model_dump(exclude_unset=True)
    if "profile_image_url" in payload:
        new_val = payload["profile_image_url"]
        old_val = (current_user.profile_image_url or "").strip()
        if new_val is None:
            remove_hosted_profile_file_if_any(old_val)
            current_user.profile_image_url = ""
        else:
            if new_val != old_val:
                remove_hosted_profile_file_if_any(old_val)
            current_user.profile_image_url = new_val
    if payload:
        session.add(current_user)
        await session.commit()
        await session.refresh(current_user)
    return current_user

_PROFILE_UPLOAD_MAX_BYTES = 600 * 1024

@router.post("/me/profile-image", response_model=UserOut)
async def upload_profile_image(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Store a JPEG avatar (e.g. after client-side crop/resize) and set `profile_image_url`."""
    data = await file.read()
    if len(data) > _PROFILE_UPLOAD_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Image too large")
    if len(data) < 3 or data[:3] != b"\xff\xd8\xff":
        raise HTTPException(status_code=400, detail="Please upload a JPEG image")

    token = f"{secrets.token_hex(16)}.jpg"
    dirpath = Path(settings.profile_image_storage_dir)
    dirpath.mkdir(parents=True, exist_ok=True)
    remove_hosted_profile_file_if_any(current_user.profile_image_url)
    out_path = dirpath / token
    out_path.write_bytes(data)

    relative = f"/api/public/profile-images/{token}"
    current_user.profile_image_url = relative
    session.add(current_user)
    await session.commit()
    await session.refresh(current_user)
    return current_user

