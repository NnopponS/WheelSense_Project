from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

"""AI provider settings — per-user overrides and admin workspace defaults."""

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.api.dependencies import (
    RequireRole,
    get_current_active_user,
    get_current_user_workspace,
    get_db,
)
from app.config import settings
from app.core.token_crypto import encrypt_secret
from app.models.chat import WorkspaceAISettings
from app.models.core import Workspace
from app.models.users import User
from app.schemas.ai_settings import (
    AISettingsOut,
    AIWorkspaceSettingsUpdate,
    CopilotDeviceCodeOut,
    CopilotModelInfo,
    CopilotModelsOut,
    CopilotPollIn,
    CopilotPollOut,
    CopilotStatusOut,
    GlobalAISettingsUpdate,
    OllamaModelsOut,
    OllamaModelInfo,
    OllamaPullIn,
)
from app.services import ai_chat

logger = logging.getLogger("wheelsense.ai_settings")

router = APIRouter()


async def _build_ai_settings_out(db: AsyncSession, workspace_id: int) -> AISettingsOut:
    ws_p, ws_m = await ai_chat.get_workspace_ai_defaults(db, workspace_id)
    eff_p, eff_m = await ai_chat.resolve_effective_ai(
        db,
        workspace_id=workspace_id,
        override_provider=None,
        override_model=None,
    )
    return AISettingsOut(
        provider=eff_p,  # type: ignore[arg-type]
        model=eff_m,
        workspace_default_provider=ws_p,  # type: ignore[arg-type]
        workspace_default_model=ws_m,
    )


@router.get("", response_model=AISettingsOut)
async def get_ai_settings(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_active_user),
    workspace: Workspace = Depends(get_current_user_workspace),
):
    return await _build_ai_settings_out(db, workspace.id)

@router.put("", response_model=AISettingsOut)
async def update_workspace_ai_settings(
    body: AIWorkspaceSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(RequireRole(["admin"])),
    workspace: Workspace = Depends(get_current_user_workspace),
):
    row = await _get_or_create_ws_ai_row(db, workspace.id)
    row.default_provider = body.provider
    row.default_model = body.model
    db.add(row)
    await db.commit()
    return await _build_ai_settings_out(db, workspace.id)

@router.put("/global", response_model=AISettingsOut)
async def update_global_ai_settings(
    body: GlobalAISettingsUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(RequireRole(["admin"])),
    workspace: Workspace = Depends(get_current_user_workspace),
):
    row = await _get_or_create_ws_ai_row(db, workspace.id)
    row.default_provider = body.default_provider
    row.default_model = body.default_model
    db.add(row)
    await db.commit()
    return await _build_ai_settings_out(db, workspace.id)

async def _get_or_create_ws_ai_row(
    db: AsyncSession, workspace_id: int
) -> WorkspaceAISettings:
    res = await db.execute(
        select(WorkspaceAISettings).where(
            WorkspaceAISettings.workspace_id == workspace_id
        )
    )
    row = res.scalar_one_or_none()
    if row:
        return row
    row = WorkspaceAISettings(
        workspace_id=workspace_id,
        default_provider=settings.ai_provider,
        default_model=settings.ai_default_model,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row

@router.get("/copilot/status", response_model=CopilotStatusOut)
async def copilot_connection_status(
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(["admin"])),
):
    row = await db.execute(
        select(WorkspaceAISettings).where(
            WorkspaceAISettings.workspace_id == workspace.id
        )
    )
    ws = row.scalar_one_or_none()
    external_cli_configured = bool(
        settings.copilot_cli_url.strip()
        and "copilot-cli" not in settings.copilot_cli_url.strip()
    )
    connected = bool((ws and ws.copilot_token_encrypted) or external_cli_configured)
    return CopilotStatusOut(connected=connected)

@router.get("/copilot/models", response_model=CopilotModelsOut)
async def copilot_list_models(
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(get_current_active_user),
):
    github_token = await ai_chat.get_workspace_copilot_token(db, workspace.id)
    external_cli_configured = bool(
        settings.copilot_cli_url.strip()
        and "copilot-cli" not in settings.copilot_cli_url.strip()
    )
    connected = bool(github_token or external_cli_configured)
    if not connected:
        return CopilotModelsOut(
            models=[],
            connected=False,
            message="GitHub Copilot is not connected for this workspace",
        )
    models = ai_chat.fallback_copilot_models()

    return CopilotModelsOut(
        models=[
            CopilotModelInfo(
                id=m.id,
                name=m.name,
                supports_reasoning_effort=m.capabilities.reasoning_effort,
                supports_vision=m.capabilities.vision,
            )
            for m in models
        ],
        connected=True,
        message=None,
    )

@router.post("/copilot/device-code", response_model=CopilotDeviceCodeOut)
async def copilot_request_device_code(
    _: User = Depends(RequireRole(["admin"])),
):
    if not settings.github_oauth_client_id:
        raise HTTPException(
            status_code=503,
            detail="GITHUB_OAUTH_CLIENT_ID is not configured on the server",
        )
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            "https://github.com/login/device/code",
            headers={"Accept": "application/json"},
            data={
                "client_id": settings.github_oauth_client_id,
                "scope": "read:user",
            },
        )
    if r.status_code != 200:
        logger.warning("GitHub device code error: %s %s", r.status_code, r.text)
        raise HTTPException(502, "GitHub device flow request failed")
    data = r.json()
    return CopilotDeviceCodeOut(
        device_code=data["device_code"],
        user_code=data["user_code"],
        verification_uri=data.get("verification_uri", "https://github.com/login/device"),
        expires_in=int(data.get("expires_in", 900)),
        interval=int(data.get("interval", 5)),
    )

@router.post("/copilot/poll-token", response_model=CopilotPollOut)
async def copilot_poll_token(
    body: CopilotPollIn,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(["admin"])),
):
    if not settings.github_oauth_client_id:
        raise HTTPException(503, detail="GitHub OAuth not configured")
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": settings.github_oauth_client_id,
                "device_code": body.device_code,
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            },
        )
    if r.status_code != 200:
        raise HTTPException(502, "GitHub token poll failed")
    data = r.json()
    err = data.get("error")
    if err == "authorization_pending":
        return CopilotPollOut(status="pending", access_token=None)
    if err == "slow_down":
        return CopilotPollOut(status="slow_down", access_token=None)
    if err:
        raise HTTPException(400, detail=data.get("error_description", err))
    token = data.get("access_token")
    if not token or not isinstance(token, str):
        raise HTTPException(502, "Unexpected GitHub response")
    row = await _get_or_create_ws_ai_row(db, workspace.id)
    row.copilot_token_encrypted = encrypt_secret(token)
    db.add(row)
    await db.commit()
    return CopilotPollOut(
        status="success",
        access_token="***",
        token_type=data.get("token_type"),
        scope=data.get("scope"),
    )

@router.get("/ollama/models", response_model=OllamaModelsOut)
async def ollama_list_models(
    _: User = Depends(get_current_active_user),
):
    origin = settings.ollama_api_origin
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(f"{origin}/api/tags")
        r.raise_for_status()
        payload = r.json()
    except Exception as e:
        logger.warning("Ollama tags failed: %s", e)
        return OllamaModelsOut(
            models=[],
            reachable=False,
            origin=origin,
            message=f"Could not reach Ollama at {origin}",
        )
    models_raw = payload.get("models") or []
    models: list[OllamaModelInfo] = []
    for m in models_raw:
        name = m.get("name")
        if not name:
            continue
        models.append(
            OllamaModelInfo(
                name=name,
                size=m.get("size"),
                digest=m.get("digest"),
            )
        )
    return OllamaModelsOut(
        models=models,
        reachable=True,
        origin=origin,
        message=None,
    )

@router.post("/ollama/pull")
async def ollama_pull_model(
    body: OllamaPullIn,
    _: User = Depends(RequireRole(["admin"])),
):
    origin = settings.ollama_api_origin

    async def stream_pull():
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream(
                    "POST",
                    f"{origin}/api/pull",
                    json={"name": body.name},
                ) as resp:
                    resp.raise_for_status()
                    async for chunk in resp.aiter_bytes():
                        yield chunk
        except httpx.HTTPError as e:
            err = f'{{"error": "pull_failed", "detail": "{e!s}"}}\n'
            yield err.encode("utf-8")

    return StreamingResponse(stream_pull(), media_type="application/x-ndjson")

@router.delete("/ollama/models/{name:path}")
async def ollama_delete_model(
    name: str,
    _: User = Depends(RequireRole(["admin"])),
):
    origin = settings.ollama_api_origin
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.request(
                "DELETE",
                f"{origin}/api/delete",
                json={"model": name},
            )
        r.raise_for_status()
    except Exception as e:
        logger.warning("Ollama delete failed for %s: %s", name, e)
        raise HTTPException(502, f"Could not delete Ollama model '{name}'") from e

    return {"deleted": name}

# mypy: get_ai_settings is reused — fix circular import by duplicating minimal assemble
@router.get("/health")
async def ai_backend_health():
    """Lightweight probe for ops (no secrets)."""
    from app.config import settings

    return {
        "default_provider": settings.ai_provider,
        "ollama_configured": bool(settings.ollama_base_url),
        "copilot_configured": bool(settings.copilot_cli_url),
    }

