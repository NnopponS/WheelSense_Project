from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

"""Authentication endpoints: Login and Token generation."""

import secrets
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.security import OAuth2PasswordRequestForm

from app.api.dependencies import (
    RequireRole,
    get_current_active_user,
    get_current_user_workspace,
    get_db,
)
from app.config import settings
from app.models.core import Workspace
from app.models.users import User
from app.schemas.users import (
    AuthMeOut,
    AuthMeProfileOut,
    AuthMeProfilePatch,
    ChangePasswordIn,
    ImpersonationStart,
    MePatch,
    Token,
    UserOut,
)
from app.services.auth import AuthService, UserService
from app.services.profile_image_storage import remove_hosted_profile_file_if_any

router = APIRouter(tags=["Authentication"])


def _build_auth_me_out(current_user: User, *, caregiver=None) -> AuthMeOut:
    data = AuthMeOut.model_validate(current_user)
    impersonated_by_user_id = getattr(current_user, "_impersonated_by_user_id", None)
    data.impersonation = impersonated_by_user_id is not None
    data.impersonated_by_user_id = impersonated_by_user_id
    data.email = getattr(caregiver, "email", None) or None
    data.phone = getattr(caregiver, "phone", None) or None
    return data

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

@router.get("/me", response_model=AuthMeOut)
async def read_users_me(
    current_user: User = Depends(get_current_active_user),
):
    """
    Get current user information based on the JWT token.
    """
    return _build_auth_me_out(current_user)

@router.get("/me/profile", response_model=AuthMeProfileOut)
async def read_users_me_profile(
    session: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(get_current_active_user),
):
    """
    Get current user information with linked caregiver/patient profile.
    """
    profile = await UserService.get_me_profile(session, ws.id, current_user)
    data = _build_auth_me_out(current_user, caregiver=profile["linked_caregiver"])
    return AuthMeProfileOut(
        user=data,
        linked_caregiver=profile["linked_caregiver"],
        linked_patient=profile["linked_patient"],
    )

@router.patch("/me/profile", response_model=AuthMeProfileOut)
async def patch_users_me_profile(
    data: AuthMeProfilePatch,
    session: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(get_current_active_user),
):
    """
    Update the authenticated user's own profile fields and linked person record fields.
    """
    updated = await UserService.update_me_profile(session, ws.id, current_user, data)
    me_data = _build_auth_me_out(updated["user"], caregiver=updated["linked_caregiver"])
    return AuthMeProfileOut(
        user=me_data,
        linked_caregiver=updated["linked_caregiver"],
        linked_patient=updated["linked_patient"],
    )

@router.post("/change-password")
async def change_password(
    data: ChangePasswordIn,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Change current authenticated user password.
    """
    await UserService.change_password(
        session,
        current_user,
        data.current_password,
        data.new_password,
    )
    return {"ok": True}

@router.post("/impersonate/start", response_model=Token)
async def start_impersonation(
    data: ImpersonationStart,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(RequireRole(["admin"])),
):
    """Issue a short-lived admin act-as token for a target workspace user."""
    return await AuthService.start_impersonation(
        session,
        actor_admin=current_user,
        target_user_id=data.target_user_id,
    )

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
