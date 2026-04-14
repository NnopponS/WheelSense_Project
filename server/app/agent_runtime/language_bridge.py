"""Optional LLM bridge: paraphrase non-English user text for intent classification only."""

from __future__ import annotations

import asyncio
import logging
import re

from openai import AsyncOpenAI
from sqlalchemy import select

from app.api.dependencies import resolve_current_user_from_token
from app.config import settings
from app.db.session import AsyncSessionLocal
from app.models.core import Workspace
from app.services.ai_chat import (
    get_workspace_copilot_token,
    resolve_effective_ai,
    stream_copilot,
)

logger = logging.getLogger("wheelsense.agent_runtime.language_bridge")

_NORMALIZER_SYSTEM = (
    "You translate or paraphrase the user's message into a single short English sentence "
    "suitable for a hospital IoT assistant intent classifier. "
    "Preserve all numbers and IDs exactly as written. "
    "Do not add tools, JSON, or explanations — output English text only, one line."
)


def _strip_noise(text: str) -> str:
    text = (text or "").strip()
    text = re.sub(r"^[\"'`]+|[\"'`]+$", "", text)
    return text.strip()[:800]


async def normalize_message_for_intent(*, actor_access_token: str, raw_message: str) -> str | None:
    """Return an English paraphrase for routing, or None if disabled / failed.

    Never used for MCP execution — only fed back into the intent classifier.
    """
    if not settings.intent_llm_normalize_enabled:
        return None
    if not actor_access_token or not (raw_message or "").strip():
        return None

    timeout = max(2.0, float(settings.intent_llm_normalize_timeout_seconds))

    try:
        async with asyncio.timeout(timeout):
            return await _normalize_message_for_intent_inner(
                actor_access_token=actor_access_token,
                raw_message=raw_message,
            )
    except TimeoutError:
        logger.warning("Intent LLM normalizer timed out after %.1fs", timeout)
        return None
    except Exception:
        logger.exception("Intent LLM normalizer failed")
        return None


async def _normalize_message_for_intent_inner(*, actor_access_token: str, raw_message: str) -> str | None:
    async with AsyncSessionLocal() as db:
        user, _, _ = await resolve_current_user_from_token(db, actor_access_token)
        workspace = (
            await db.execute(select(Workspace).where(Workspace.id == user.workspace_id))
        ).scalar_one()
        provider, model = await resolve_effective_ai(
            db,
            workspace_id=workspace.id,
            override_provider=None,
            override_model=None,
        )
        github_token = (
            await get_workspace_copilot_token(db, user.workspace_id) if provider == "copilot" else None
        )

    oai_messages = [
        {"role": "system", "content": _NORMALIZER_SYSTEM},
        {"role": "user", "content": raw_message.strip()},
    ]

    if provider == "ollama":
        client = AsyncOpenAI(
            base_url=settings.ollama_base_url,
            api_key="ollama",
        )
        try:
            resp = await client.chat.completions.create(
                model=model,
                messages=oai_messages,
                stream=False,
                max_tokens=120,
                temperature=0.0,
            )
            choice = resp.choices[0].message
            content = getattr(choice, "content", None) or ""
        except Exception:
            logger.exception("Ollama intent normalizer request failed")
            return None
        out = _strip_noise(str(content))
        return out or None

    if provider == "copilot":
        prompt = _NORMALIZER_SYSTEM + "\n\nUSER:\n" + raw_message.strip()
        parts: list[str] = []
        try:
            async for chunk in stream_copilot(
                model=model or "gpt-4.1",
                prompt=prompt,
                github_token=github_token,
            ):
                parts.append(chunk)
                if len(parts) > 80:
                    break
        except Exception:
            logger.exception("Copilot intent normalizer stream failed")
            return None
        out = _strip_noise("".join(parts))
        return out or None

    return None
