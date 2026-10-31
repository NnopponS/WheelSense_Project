from __future__ import annotations

"""MCP OAuth endpoints for external MCP client authentication.

These endpoints allow external MCP clients to obtain scope-narrowed,
short-lived access tokens specifically for MCP operations.
"""

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_current_active_user,
    get_current_user_workspace,
    get_db,
)
from app.config import settings
from app.core.security import create_access_token
from app.models.core import Workspace
from app.models.mcp_tokens import MCPToken
from app.models.users import AuthSession, User
from app.schemas.mcp_auth import (
    MCPTokenCreate,
    MCPTokenList,
    MCPTokenOut,
    MCPTokenRevoke,
    MCPTokenWithSecret,
    resolve_mcp_scopes_for_role,
    ALL_MCP_SCOPES,
)
from app.services.auth import AuthService

router = APIRouter(tags=["MCP Authentication"])

# Token TTL configuration
MCP_TOKEN_TTL_MINUTES = 60
MCP_TOKEN_MAX_TTL_MINUTES = 60


def _client_origin(request: Request) -> str:
    """Extract client origin from request."""
    origin = request.headers.get("origin", "").strip()
    if origin:
        return origin[:512]
    # Fallback to referer or client host
    referer = request.headers.get("referer", "").strip()
    if referer:
        return referer[:512]
    if request.client and request.client.host:
        return f"host:{request.client.host}"[:512]
    return "unknown"


def _validate_requested_scopes(
    role: str,
    requested: list[str],
) -> set[str]:
    """Validate and resolve requested scopes against role permissions.

    Args:
        role: User's role
        requested: List of scopes requested by client

    Returns:
        Set of validated scopes

    Raises:
        HTTPException: If any requested scope is invalid
    """
    # Check for invalid scopes
    invalid = [s for s in requested if s not in ALL_MCP_SCOPES]
    if invalid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid scopes requested: {invalid}. Valid scopes: {ALL_MCP_SCOPES}",
        )

    # Resolve effective scopes
    effective = resolve_mcp_scopes_for_role(role, requested)
    if not effective:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{role}' has no MCP access or requested scopes exceed permissions",
        )

    return effective


@router.post("/token", response_model=MCPTokenWithSecret, status_code=status.HTTP_201_CREATED)
async def create_mcp_token(
    data: MCPTokenCreate,
    request: Request,
    session: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(get_current_active_user),
):
    """Create a new MCP access token for external MCP clients.

    Issues a short-lived (1 hour), scope-narrowed token specifically
    for MCP operations. The token is linked to the current auth
    session for cascade revocation.

    The actual token string is only returned once on creation.
    Store it securely - it cannot be retrieved later.
    """
    # Get current auth session from user attribute set during auth
    auth_session_id = getattr(current_user, "_session_id", None)
    if not auth_session_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="MCP tokens require a tracked session. Please re-authenticate.",
        )

    # Verify the auth session exists and is active
    auth_session = await AuthService.get_auth_session(session, session_id=auth_session_id)
    if not auth_session or auth_session.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session is no longer active",
        )

    # Validate and resolve requested scopes
    effective_scopes = _validate_requested_scopes(
        current_user.role,
        data.requested_scopes,
    )

    # Cap TTL at max
    ttl_minutes = min(data.ttl_minutes, MCP_TOKEN_MAX_TTL_MINUTES)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)

    # Create MCP token record
    token_id = secrets.token_urlsafe(24)
    mcp_token = MCPToken(
        id=token_id,
        workspace_id=ws.id,
        user_id=current_user.id,
        auth_session_id=auth_session_id,
        client_name=data.client_name[:128],
        client_origin=_client_origin(request),
        expires_at=expires_at,
    )
    mcp_token.set_scopes_list(sorted(effective_scopes))

    session.add(mcp_token)
    await session.commit()
    await session.refresh(mcp_token)

    # Generate JWT with MCP-specific claims
    # Include the mcp_token_id for validation
    access_token = create_access_token(
        subject=current_user.id,
        role=current_user.role,
        expires_delta=timedelta(minutes=ttl_minutes),
        extra_claims={
            "sid": auth_session_id,
            "mcp_tid": mcp_token.id,  # MCP token ID for revocation tracking
            "scope": " ".join(sorted(effective_scopes)),
            "mcp": True,  # Flag indicating this is an MCP token
        },
    )

    expires_in = int((expires_at - datetime.now(timezone.utc)).total_seconds())

    return MCPTokenWithSecret(
        id=mcp_token.id,
        access_token=access_token,
        token_type="bearer",
        client_name=mcp_token.client_name,
        client_origin=mcp_token.client_origin,
        scopes=mcp_token.get_scopes_list(),
        expires_at=expires_at,
        expires_in=expires_in,
    )


@router.get("/tokens", response_model=MCPTokenList)
async def list_mcp_tokens(
    include_revoked: bool = False,
    session: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(get_current_active_user),
):
    """List MCP tokens for the current user.

    Returns all active (non-expired, non-revoked) tokens by default.
    Set include_revoked=true to see revoked/expired tokens.
    """
    query = select(MCPToken).where(
        MCPToken.workspace_id == ws.id,
        MCPToken.user_id == current_user.id,
    )

    if not include_revoked:
        now = datetime.now(timezone.utc)
        query = query.where(
            MCPToken.revoked_at.is_(None),
            MCPToken.expires_at > now,
        )

    query = query.order_by(MCPToken.created_at.desc())
    result = await session.execute(query)
    rows = list(result.scalars().all())

    tokens = []
    for row in rows:
        tokens.append(
            MCPTokenOut(
                id=row.id,
                client_name=row.client_name,
                client_origin=row.client_origin,
                scopes=row.get_scopes_list(),
                created_at=row.created_at,
                updated_at=row.updated_at,
                expires_at=row.expires_at,
                revoked_at=row.revoked_at,
                last_used_at=row.last_used_at,
                is_active=row.is_active,
            )
        )

    return MCPTokenList(tokens=tokens, total=len(tokens))


@router.delete("/token/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_mcp_token(
    token_id: str,
    data: MCPTokenRevoke | None = None,
    session: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(get_current_active_user),
):
    """Revoke an MCP token.

    Users can only revoke their own tokens. Admin can revoke any token
    in their workspace by setting the X-Admin-Override header.
    """
    # Look up the token
    mcp_token = await session.get(MCPToken, token_id)
    if not mcp_token or mcp_token.workspace_id != ws.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Token not found",
        )

    # Permission check - can only revoke own tokens unless admin
    if mcp_token.user_id != current_user.id:
        if current_user.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Can only revoke your own tokens",
            )
        # Admin can revoke any token in workspace

    # Idempotent - already revoked is fine
    if mcp_token.revoked_at is None:
        mcp_token.revoked_at = datetime.now(timezone.utc)
        session.add(mcp_token)
        await session.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/token/{token_id}", response_model=MCPTokenOut)
async def get_mcp_token(
    token_id: str,
    session: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(get_current_active_user),
):
    """Get details of a specific MCP token.

    Users can only view their own tokens. Admin can view any token
    in their workspace.
    """
    mcp_token = await session.get(MCPToken, token_id)
    if not mcp_token or mcp_token.workspace_id != ws.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Token not found",
        )

    # Permission check
    if mcp_token.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Can only view your own tokens",
        )

    return MCPTokenOut(
        id=mcp_token.id,
        client_name=mcp_token.client_name,
        client_origin=mcp_token.client_origin,
        scopes=mcp_token.get_scopes_list(),
        created_at=mcp_token.created_at,
        updated_at=mcp_token.updated_at,
        expires_at=mcp_token.expires_at,
        revoked_at=mcp_token.revoked_at,
        last_used_at=mcp_token.last_used_at,
        is_active=mcp_token.is_active,
    )


@router.post("/tokens/revoke-all", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_all_mcp_tokens(
    session: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(get_current_active_user),
):
    """Revoke all active MCP tokens for the current user.

    Useful when rotating credentials or responding to a security concern.
    """
    now = datetime.now(timezone.utc)

    # Find all active tokens for this user
    query = select(MCPToken).where(
        MCPToken.workspace_id == ws.id,
        MCPToken.user_id == current_user.id,
        MCPToken.revoked_at.is_(None),
        MCPToken.expires_at > now,
    )
    result = await session.execute(query)
    tokens = list(result.scalars().all())

    # Revoke them all
    for token in tokens:
        token.revoked_at = now
        session.add(token)

    if tokens:
        await session.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)
