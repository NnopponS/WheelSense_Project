from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

"""Authentication endpoints: Login and Token generation."""

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer, OAuth2PasswordRequestForm

from app.api.dependencies import (
    RequireRole,
    get_current_active_user,
    get_current_user_workspace,
    get_db,
    resolve_current_user_from_token,
)
from app.models.core import Workspace
from app.models.users import User
from app.schemas.users import (
    AuthHydrateOut,
    AuthMeOut,
    AuthMeProfileOut,
    AuthMeProfilePatch,
    AuthSessionOut,
    ChangePasswordIn,
    ImpersonationStart,
    MePatch,
    Token,
    UserOut,
)
from app.services.auth import AuthService, UserService
from app.services.profile_image_storage import remove_hosted_profile_file_if_any, store_hosted_profile_jpeg_bytes

router = APIRouter(tags=["Authentication"])

_optional_http_bearer = HTTPBearer(auto_error=False)


def _build_auth_me_out(current_user: User, *, caregiver=None) -> AuthMeOut:
    data = AuthMeOut.model_validate(current_user)
    impersonated_by_user_id = getattr(current_user, "_impersonated_by_user_id", None)
    data.impersonation = impersonated_by_user_id is not None
    data.impersonated_by_user_id = impersonated_by_user_id
    data.email = getattr(caregiver, "email", None) or None
    data.phone = getattr(caregiver, "phone", None) or None
    return data


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for", "").strip()
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    if request.client and request.client.host:
        return request.client.host[:64]
    return None

@router.post("/login", response_model=Token)
async def login_for_access_token(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: AsyncSession = Depends(get_db),
):
    """
    OAuth2 compatible token login, getting an access token for future requests.
    """
    return await AuthService.login_for_access_token(
        session,
        form_data.username,
        form_data.password,
        user_agent=request.headers.get("user-agent"),
        ip_address=_client_ip(request),
    )


@router.get("/session", response_model=AuthHydrateOut)
async def read_auth_session(
    db: AsyncSession = Depends(get_db),
    credentials: HTTPAuthorizationCredentials | None = Depends(_optional_http_bearer),
):
    """
    Return 200 for both guests and signed-in users so browsers do not log a spurious 401 on startup.
    The Next proxy still forwards Authorization from the HttpOnly cookie when present.
    """
    if credentials is None or not (credentials.scheme or "").lower() == "bearer":
        return AuthHydrateOut(authenticated=False)
    token = (credentials.credentials or "").strip()
    if not token:
        return AuthHydrateOut(authenticated=False)
    try:
        user, _, _ = await resolve_current_user_from_token(db, token)
    except HTTPException:
        return AuthHydrateOut(authenticated=False)
    if not user.is_active:
        return AuthHydrateOut(authenticated=False)
    return AuthHydrateOut(authenticated=True, user=_build_auth_me_out(user))


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


@router.get("/sessions", response_model=list[AuthSessionOut])
async def list_auth_sessions(
    session: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(get_current_active_user),
):
    return await AuthService.list_auth_sessions(
        session,
        ws_id=ws.id,
        user_id=current_user.id,
        current_session_id=getattr(current_user, "_session_id", None),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout_current_session(
    session: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(get_current_active_user),
):
    session_id = getattr(current_user, "_session_id", None)
    if session_id:
        await AuthService.revoke_auth_session(
            session,
            ws_id=ws.id,
            user_id=current_user.id,
            session_id=session_id,
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_auth_session(
    session_id: str,
    session: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(get_current_active_user),
):
    await AuthService.revoke_auth_session(
        session,
        ws_id=ws.id,
        user_id=current_user.id,
        session_id=session_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.post("/impersonate/start", response_model=Token)
async def start_impersonation(
    data: ImpersonationStart,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(RequireRole(["admin"])),
    request: Request = None,
):
    """Issue a short-lived admin act-as token for a target workspace user."""
    return await AuthService.start_impersonation(
        session,
        actor_admin=current_user,
        target_user_id=data.target_user_id,
        user_agent=request.headers.get("user-agent"),
        ip_address=_client_ip(request),
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

@router.post("/me/profile-image", response_model=UserOut)
async def upload_profile_image(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Store a JPEG avatar (e.g. after client-side crop/resize) and set `profile_image_url`."""
    data = await file.read()
    try:
        relative = store_hosted_profile_jpeg_bytes(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    remove_hosted_profile_file_if_any(current_user.profile_image_url)
    current_user.profile_image_url = relative
    session.add(current_user)
    await session.commit()
    await session.refresh(current_user)
    return current_user
