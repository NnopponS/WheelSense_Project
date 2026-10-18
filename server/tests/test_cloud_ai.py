"""Cloud provider settings and requests, without live API calls."""

import json
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock

import httpx
import pytest
from openai import AsyncOpenAI
from sqlalchemy import select

from app.core.token_crypto import decrypt_secret
from app.core.security import create_access_token
from app.agent_runtime import llm_tool_router
from app.models.chat import WorkspaceAISettings
from app.models.core import Workspace
from app.models.users import User
from app.schemas.chat import ChatMessagePart
from app.services import ai_chat


@pytest.mark.asyncio
@pytest.mark.parametrize("provider", ["openai", "openrouter"])
async def test_cloud_settings_encrypt_key_and_keep_it_on_model_change(
    client, db_session, admin_user, provider,
):
    payload = {
        "default_provider": provider,
        "default_model": "test-model",
        "api_key": "test-cloud-key",
    }
    response = await client.put("/api/settings/ai/global", json=payload)
    assert response.status_code == 200, response.text
    assert response.json()["provider"] == provider
    assert response.json()[f"{provider}_configured"] is True
    assert "test-cloud-key" not in response.text
    row = await db_session.get(WorkspaceAISettings, admin_user.workspace_id)
    encrypted = getattr(row, f"{provider}_api_key_encrypted")
    assert encrypted != "test-cloud-key"
    assert decrypt_secret(encrypted) == "test-cloud-key"

    del payload["api_key"]
    payload["default_model"] = "another-model"
    response = await client.put("/api/settings/ai/global", json=payload)
    assert response.status_code == 200
    assert response.json()["model"] == "another-model"
    assert getattr(row, f"{provider}_api_key_encrypted") == encrypted


@pytest.mark.asyncio
@pytest.mark.parametrize("provider", ["openai", "openrouter"])
async def test_cloud_settings_require_key(client, provider):
    response = await client.put("/api/settings/ai/global", json={
        "default_provider": provider, "default_model": "test-model",
    })
    assert response.status_code == 422
    assert "API key" in response.text


@pytest.mark.asyncio
async def test_only_admin_can_save_cloud_key(client, db_session, admin_user, make_token_headers):
    observer = User(username="observer-cloud", hashed_password="unused", role="observer",
                    workspace_id=admin_user.workspace_id, is_active=True)
    db_session.add(observer)
    await db_session.flush()
    response = await client.put("/api/settings/ai/global", headers=make_token_headers(observer), json={
        "default_provider": "openai", "default_model": "test-model", "api_key": "test-cloud-key",
    })
    assert response.status_code == 403
    assert (await db_session.execute(select(WorkspaceAISettings))).scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_key_is_not_available_in_another_workspace(client, db_session):
    await client.put("/api/settings/ai/global", json={
        "default_provider": "openai", "default_model": "test-model", "api_key": "test-cloud-key",
    })
    other = Workspace(name="other-cloud-workspace", is_active=True)
    db_session.add(other)
    await db_session.flush()
    with pytest.raises(ValueError, match="API key"):
        await ai_chat.get_cloud_provider_options(db_session, other.id, "openai")


@pytest.mark.asyncio
@pytest.mark.parametrize("provider,host,path", [
    ("openai", "api.openai.com", "/v1/chat/completions"),
    ("openrouter", "openrouter.ai", "/api/v1/chat/completions"),
])
async def test_cloud_chat_and_tools_use_selected_provider(
    client, db_session, admin_user, monkeypatch, provider, host, path,
):
    response = await client.put("/api/settings/ai/global", json={
        "default_provider": provider, "default_model": "test-model", "api_key": "test-cloud-key",
    })
    assert response.status_code == 200, response.text
    requests = []

    def handle(request):
        requests.append(request)
        body = json.loads(request.content)
        if body.get("stream"):
            chunk = {"id": "reply", "object": "chat.completion.chunk", "created": 0,
                     "model": "test-model", "choices": [{"index": 0, "delta": {"content": "Hello"}}]}
            return httpx.Response(200, headers={"content-type": "text/event-stream"},
                                  text=f"data: {json.dumps(chunk)}\n\ndata: [DONE]\n\n")
        return httpx.Response(200, json={
            "id": "reply", "object": "chat.completion", "created": 0, "model": "test-model",
            "choices": [{"index": 0, "finish_reason": "tool_calls", "message": {
                "role": "assistant", "content": None, "tool_calls": [{
                    "id": "call-1", "type": "function", "function": {
                        "name": "get_system_health", "arguments": "{}",
                    },
                }],
            }}],
        })

    monkeypatch.setattr(ai_chat, "AsyncOpenAI", lambda **kwargs: AsyncOpenAI(
        **kwargs, http_client=httpx.AsyncClient(transport=httpx.MockTransport(handle)),
    ))
    workspace = await db_session.get(Workspace, admin_user.workspace_id)
    reply = "".join([part async for part in ai_chat.stream_chat_response(
        db=db_session, user=admin_user, workspace=workspace,
        messages=[ChatMessagePart(role="user", content="Hi")],
        provider_override=None, model_override=None,
    )])
    assert reply == "Hello"
    @asynccontextmanager
    async def session():
        yield db_session

    monkeypatch.setattr(llm_tool_router, "AsyncSessionLocal", session)
    monkeypatch.setattr(ai_chat, "collect_grounded_multi_tool_answer", AsyncMock(return_value="System is healthy"))
    result = await llm_tool_router.propose_llm_tool_turn(
        actor_access_token=create_access_token(subject=str(admin_user.id), role=admin_user.role),
        message="health", messages=[], conversation_id=None,
        call_mcp_tool=AsyncMock(return_value={"status": "ok"}),
    )
    assert result.mode == "answer"
    assert result.assistant_reply == "System is healthy"
    assert result.grounding["tool_names"] == ["get_system_health"]
    assert len(requests) == 2
    for request in requests:
        assert request.url.host == host
        assert request.url.path == path
        assert request.headers["authorization"] == "Bearer test-cloud-key"
        assert json.loads(request.content)["model"] == "test-model"
    if provider == "openai":
        assert "max_tokens" not in json.loads(requests[0].content)


@pytest.mark.asyncio
async def test_invalid_key_is_not_echoed_and_saved_key_is_preserved(client, db_session, admin_user):
    workspace_id = admin_user.workspace_id
    payload = {"default_provider": "openai", "default_model": "test-model", "api_key": "original-key"}
    assert (await client.put("/api/settings/ai/global", json=payload)).status_code == 200
    payload["api_key"] = "invalid secret key"
    response = await client.put("/api/settings/ai/global", json=payload)
    assert response.status_code == 422
    assert "invalid secret key" not in response.text
    await db_session.rollback()
    row = await db_session.get(WorkspaceAISettings, workspace_id)
    assert decrypt_secret(row.openai_api_key_encrypted) == "original-key"
