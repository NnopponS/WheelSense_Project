"""AI chat streaming - Ollama (OpenAI-compatible) and GitHub Copilot CLI SDK."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from types import SimpleNamespace

from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.chat import WorkspaceAISettings
from app.models.core import Workspace
from app.models.users import User
from app.schemas.chat import ChatMessagePart

logger = logging.getLogger("wheelsense.ai_chat")

COPILOT_ALLOWED_MODELS = {
    "gpt-4o": {
        "name": "GPT-4o",
        "supports_reasoning_effort": False,
        "supports_vision": True,
    },
    "gpt-4.1": {
        "name": "GPT-4.1",
        "supports_reasoning_effort": False,
        "supports_vision": True,
    },
}

# Role-specific system prompts (EaseAI)
ROLE_SYSTEM_PROMPTS: dict[str, str] = {
    "admin": (
        "You are EaseAI for WheelSense, assisting an IT administrator. "
        "Focus on system health, devices, MQTT, databases, and safe operational guidance. "
        "Never invent patient data; suggest using in-app tools when appropriate."
    ),
    "head_nurse": (
        "You are EaseAI for a head nurse. Prioritize ward operations, staffing context, "
        "alerts, and patient safety. Be concise and actionable."
    ),
    "supervisor": (
        "You are EaseAI for a medical supervisor. Emphasize clinical trends, vitals "
        "interpretation at a high level, and care coordination. Do not diagnose."
    ),
    "observer": (
        "You are EaseAI for floor staff. Focus on immediate tasks, alerts, and "
        "patient-facing actions in the assigned zone."
    ),
    "patient": (
        "You are EaseAI for a patient user. Use simple language, be reassuring, "
        "and encourage contacting staff for emergencies."
    ),
}

def _system_prompt_for_role(role: str) -> str:
    return ROLE_SYSTEM_PROMPTS.get(role, ROLE_SYSTEM_PROMPTS["observer"])

def _runtime_prompt_metadata(
    *,
    provider: str,
    configured_model: str,
    active_model: str | None = None,
) -> str:
    resolved_model = active_model or configured_model
    return (
        "\n\nRuntime metadata:\n"
        "- assistant name: EaseAI for WheelSense\n"
        f"- provider: {provider}\n"
        f"- configured model: {configured_model}\n"
        f"- active model: {resolved_model}\n"
        "- If the user asks which provider/model is running, answer from this metadata exactly.\n"
        "- Do not guess, switch providers in your answer, or claim a different model."
    )

async def get_workspace_ai_defaults(
    db: AsyncSession, workspace_id: int
) -> tuple[str, str]:
    """Return (provider, model) for workspace, falling back to global config."""
    res = await db.execute(
        select(WorkspaceAISettings).where(
            WorkspaceAISettings.workspace_id == workspace_id
        )
    )
    row = res.scalar_one_or_none()
    if row:
        return row.default_provider, row.default_model
    return settings.ai_provider, settings.ai_default_model

async def get_workspace_copilot_token(
    db: AsyncSession, workspace_id: int
) -> str | None:
    res = await db.execute(
        select(WorkspaceAISettings).where(
            WorkspaceAISettings.workspace_id == workspace_id
        )
    )
    row = res.scalar_one_or_none()
    if not row or not row.copilot_token_encrypted:
        return None

    from app.core.token_crypto import decrypt_secret

    return decrypt_secret(row.copilot_token_encrypted)

async def resolve_effective_ai(
    db: AsyncSession,
    user: User,
    workspace: Workspace,
    *,
    override_provider: str | None,
    override_model: str | None,
) -> tuple[str, str]:
    """Merge request overrides, user prefs, and workspace defaults."""
    ws_p, ws_m = await get_workspace_ai_defaults(db, workspace.id)
    provider = override_provider or user.ai_provider or ws_p
    model = override_model or user.ai_model or ws_m
    if provider not in ("ollama", "copilot"):
        provider = "ollama"
    return provider, model

def _messages_to_openai(
    messages: list[ChatMessagePart], system_text: str
) -> list[dict[str, str]]:
    out: list[dict[str, str]] = [{"role": "system", "content": system_text}]
    for m in messages:
        out.append({"role": m.role, "content": m.content})
    return out

def _messages_to_copilot_prompt(messages: list[ChatMessagePart]) -> str:
    """Copilot CLI session uses a single prompt per turn for our integration."""
    lines: list[str] = []
    for m in messages:
        lines.append(f"{m.role.upper()}: {m.content}")
    return "\n\n".join(lines)

def build_copilot_client_config(
    github_token: str | None,
) -> object | None:
    from copilot import ExternalServerConfig, SubprocessConfig

    url = settings.copilot_cli_url.strip()
    if github_token:
        return SubprocessConfig(github_token=github_token)
    if url and "copilot-cli" not in url:
        return ExternalServerConfig(url=url)
    return None

def _copilot_model_id(model: object) -> str | None:
    model_id = getattr(model, "id", None)
    return model_id if isinstance(model_id, str) else None

def allowed_copilot_models_from(models: list[object]) -> list[object]:
    return [
        model
        for model in models
        if _copilot_model_id(model) in COPILOT_ALLOWED_MODELS
    ]

def fallback_copilot_models() -> list[object]:
    return [
        SimpleNamespace(
            id=model_id,
            name=metadata["name"],
            capabilities=SimpleNamespace(
                reasoning_effort=metadata["supports_reasoning_effort"],
                vision=metadata["supports_vision"],
            ),
        )
        for model_id, metadata in COPILOT_ALLOWED_MODELS.items()
    ]

async def list_copilot_models(
    *,
    github_token: str | None = None,
) -> list[object]:
    from copilot import CopilotClient

    config = build_copilot_client_config(github_token)
    if config is None:
        raise RuntimeError(
            "GitHub Copilot is not connected for this workspace. Please authenticate first."
        )

    async with CopilotClient(config) as client:
        return await client.list_models()

async def stream_ollama(
    *,
    model: str,
    oai_messages: list[dict[str, str]],
) -> AsyncIterator[str]:
    client = AsyncOpenAI(
        base_url=settings.ollama_base_url,
        api_key="ollama",
    )
    try:
        stream = await client.chat.completions.create(
            model=model,
            messages=oai_messages,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta and delta.content:
                yield delta.content
    except Exception:
        logger.exception("ollama stream failed")
        yield "\n[AI service temporarily unavailable. Please try again.]\n"

async def stream_copilot(
    *,
    model: str,
    prompt: str,
    github_token: str | None = None,
) -> AsyncIterator[str]:
    try:
        from copilot import CopilotClient
        from copilot.generated.session_events import SessionEventType
        from copilot.session import PermissionHandler
    except ImportError:
        logger.exception("copilot sdk import failed")
        yield "\n[AI provider is not available right now.]\n"
        return

    config = build_copilot_client_config(github_token)
    if config is None:
        logger.error(
            "No github token available for Copilot subprocess, and external CLI is unavailable."
        )
        yield "\n[GitHub Copilot is not connected for this Workspace. Please go to AI Settings and authenticate to connect.]\n"
        return

    chunks: asyncio.Queue[str | None] = asyncio.Queue()
    error_holder: list[str] = []
    got_delta = False
    active_model = model or "default"

    def on_event(event: object) -> None:
        nonlocal got_delta
        try:
            et = getattr(event, "type", None)
            et_s = getattr(et, "value", et)
            data = getattr(event, "data", None)
            if (
                et == SessionEventType.ASSISTANT_MESSAGE_DELTA
                or et_s == "assistant.message_delta"
            ):
                dc = getattr(data, "delta_content", None) if data else None
                if dc:
                    got_delta = True
                    chunks.put_nowait(dc)
            elif et == SessionEventType.ASSISTANT_MESSAGE or et_s == "assistant.message":
                content = getattr(data, "content", None) if data else None
                if content and not got_delta:
                    chunks.put_nowait(content)
            elif et == SessionEventType.SESSION_IDLE or et_s == "session.idle":
                chunks.put_nowait(None)
            elif et == SessionEventType.SESSION_ERROR or et_s == "session.error":
                msg = getattr(data, "message", str(data)) if data else "session error"
                error_holder.append(str(msg))
                chunks.put_nowait(None)
        except Exception as ex:
            logger.exception("copilot event handler: %s", ex)
            error_holder.append(str(ex))
            chunks.put_nowait(None)

    try:
        async with CopilotClient(config) as client:
            available_models = fallback_copilot_models()
            available_model_ids = {m.id for m in available_models}
            if model and model not in available_model_ids:
                available = ", ".join(sorted(available_model_ids)) or "none"
                logger.warning(
                    "copilot model %s not available; available=%s",
                    model,
                    available,
                )
                yield (
                    f"\n[Requested Copilot model '{model}' is not available for this workspace. "
                    f"Available models: {available}]\n"
                )
                return

            session = await client.create_session(
                on_permission_request=PermissionHandler.approve_all,
                model=model,
                streaming=True,
            )
            try:
                current = await session.rpc.model.get_current()
                if current.model_id:
                    active_model = current.model_id
            except Exception:
                logger.exception("copilot get_current_model failed")

            if model and active_model != model:
                logger.warning(
                    "copilot session active model differs from requested model: requested=%s active=%s",
                    model,
                    active_model,
                )

            runtime_prompt = (
                f"{prompt}\n\n"
                "Runtime metadata (validated by the backend):\n"
                "- provider: copilot\n"
                f"- configured model: {model or 'default'}\n"
                f"- active model: {active_model}\n"
                "- If asked about your runtime or model, answer from this metadata exactly."
            )

            session.on(on_event)
            await session.send(runtime_prompt)
            while True:
                item = await chunks.get()
                if item is None:
                    break
                yield item
            if error_holder:
                yield "\n[AI request failed. Please retry shortly.]\n"
            await session.disconnect()
    except Exception:
        logger.exception("copilot stream failed")
        yield "\n[AI service temporarily unavailable. Please try again.]\n"

async def stream_chat_response(
    *,
    db: AsyncSession,
    user: User,
    workspace: Workspace,
    messages: list[ChatMessagePart],
    provider_override: str | None,
    model_override: str | None,
) -> AsyncIterator[str]:
    """Yield text chunks for the assistant reply."""
    provider, model = await resolve_effective_ai(
        db,
        user,
        workspace,
        override_provider=provider_override,
        override_model=model_override,
    )
    system_text = _system_prompt_for_role(user.role)

    if provider == "ollama":
        ollama_system_text = system_text + _runtime_prompt_metadata(
            provider=provider,
            configured_model=model,
        )
        oai_messages = _messages_to_openai(messages, ollama_system_text)
        async for part in stream_ollama(model=model, oai_messages=oai_messages):
            yield part
        return

    github_token = await get_workspace_copilot_token(db, workspace.id)
    prompt = system_text + _runtime_prompt_metadata(
        provider=provider,
        configured_model=model or "gpt-4.1",
    )
    prompt += "\n\nCONVERSATION:\n" + _messages_to_copilot_prompt(messages)
    async for part in stream_copilot(
        model=model or "gpt-4.1",
        prompt=prompt,
        github_token=github_token,
    ):
        yield part

