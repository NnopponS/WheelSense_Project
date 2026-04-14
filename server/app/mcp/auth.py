from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import datetime, timezone

from fastapi.responses import JSONResponse
from jose import JWTError, jwt
from starlette.requests import Request

from app.api.dependencies import resolve_current_user_from_token, resolve_effective_token_scopes
from app.config import settings
from app.db.session import AsyncSessionLocal
from app.mcp.context import McpActorContext, actor_scope


class McpAuthMiddleware:
    def __init__(
        self,
        app,
        *,
        allowed_origins: list[str],
        require_origin: bool,
        resource_metadata_url: str,
    ):
        self.app = app
        self.allowed_origins = {origin.rstrip("/") for origin in allowed_origins if origin}
        self.require_origin = require_origin
        self.resource_metadata_url = resource_metadata_url

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive=receive)
        origin = request.headers.get("origin", "").rstrip("/")
        if self.allowed_origins and origin and origin not in self.allowed_origins:
            response = JSONResponse(
                {"detail": "Origin is not allowed for MCP access"},
                status_code=403,
            )
            await response(scope, receive, send)
            return
        if self.require_origin and self.allowed_origins and not origin:
            response = JSONResponse(
                {"detail": "Origin header is required for MCP access"},
                status_code=403,
            )
            await response(scope, receive, send)
            return

        auth_header = request.headers.get("authorization", "")
        scheme, _, token = auth_header.partition(" ")
        if scheme.lower() != "bearer" or not token:
            response = JSONResponse(
                {"detail": "Authentication is required for MCP access"},
                status_code=401,
                headers={
                    "WWW-Authenticate": (
                        f'Bearer realm="wheelsense-mcp", '
                        f'resource_metadata="{self.resource_metadata_url}"'
                    )
                },
            )
            await response(scope, receive, send)
            return

        async with AsyncSessionLocal() as db:
            try:
                user, token_data, payload = await resolve_current_user_from_token(db, token)
            except Exception:
                response = JSONResponse(
                    {"detail": "Could not validate credentials"},
                    status_code=401,
                    headers={
                        "WWW-Authenticate": (
                            f'Bearer realm="wheelsense-mcp", '
                            f'resource_metadata="{self.resource_metadata_url}"'
                        )
                    },
                )
                await response(scope, receive, send)
                return

            # Check if this is an MCP-specific token
            is_mcp_token = payload.get("mcp", False)

            # For MCP tokens, check if the MCP token is revoked
            if is_mcp_token:
                mcp_token_id = payload.get("mcp_tid")
                if mcp_token_id:
                    from app.models.mcp_tokens import MCPToken

                    mcp_token_record = await db.get(MCPToken, mcp_token_id)
                    if (
                        not mcp_token_record
                        or mcp_token_record.revoked_at is not None
                        or mcp_token_record.expires_at <= datetime.now(timezone.utc)
                    ):
                        response = JSONResponse(
                            {"detail": "MCP token has been revoked or expired"},
                            status_code=401,
                            headers={
                                "WWW-Authenticate": (
                                    f'Bearer realm="wheelsense-mcp", '
                                    f'resource_metadata="{self.resource_metadata_url}"'
                                )
                            },
                        )
                        await response(scope, receive, send)
                        return

                    token_scopes = set(mcp_token_record.scopes or [])

                    # Update last_used_at (best effort, don't block on failure)
                    try:
                        mcp_token_record.last_used_at = datetime.now(timezone.utc)
                        db.add(mcp_token_record)
                        await db.commit()
                    except Exception:
                        await db.rollback()
                else:
                    token_scopes = set()
            else:
                token_scopes = set()

        # Resolve scopes: use persisted MCP token scopes when present, otherwise use session scopes
        if is_mcp_token:
            effective_scopes = resolve_effective_token_scopes(user.role, list(token_scopes))
        else:
            effective_scopes = resolve_effective_token_scopes(user.role, token_data.scopes)

        context = McpActorContext(
            user_id=user.id,
            workspace_id=user.workspace_id,
            role=user.role,
            patient_id=getattr(user, "patient_id", None),
            caregiver_id=getattr(user, "caregiver_id", None),
            scopes=effective_scopes,
        )
        with actor_scope(context):
            await self.app(scope, receive, send)


def wrap_mcp_app(
    app,
    *,
    allowed_origins: list[str],
    require_origin: bool,
    resource_metadata_url: str,
):
    return McpAuthMiddleware(
        app,
        allowed_origins=allowed_origins,
        require_origin=require_origin,
        resource_metadata_url=resource_metadata_url,
    )


def _parse_scope_claim(raw_scope: object) -> list[str]:
    """Parse scope claim from JWT payload.

    Handles both space-separated string and list formats.
    """
    if raw_scope is None:
        return []
    if isinstance(raw_scope, str):
        return [part for part in raw_scope.split() if part]
    if isinstance(raw_scope, list):
        return [str(part) for part in raw_scope if str(part)]
    return []


async def validate_mcp_scope(scope: str, token: str) -> bool:
    """Validate that a token has the required MCP scope.

    Args:
        scope: Required scope (e.g., "patients.read")
        token: JWT access token

    Returns:
        True if token has the scope, False otherwise
    """
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        token_scopes = _parse_scope_claim(payload.get("scope"))
        return scope in token_scopes
    except (JWTError, Exception):
        return False
