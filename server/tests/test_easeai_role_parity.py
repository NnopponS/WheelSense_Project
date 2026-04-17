"""Contract tests: EaseAI allowlists, MCP registry, and JWT scope alignment."""

from __future__ import annotations

import ast
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import ROLE_TOKEN_SCOPES
from app.core.security import get_password_hash
from app.mcp.server import _WORKSPACE_TOOL_REGISTRY, execute_python_code
from app.models.patients import Patient
from app.models.users import User
from app.schemas.agent_runtime import AgentRuntimeExecuteResponse
from app.schemas.chat_actions import ChatActionProposeIn
from app.services import ai_chat
from app.mcp.context import McpActorContext, actor_scope

# Tools that delegate to helpers whose `_require_scope` is not in the async body.
_TOOL_SCOPE_OVERRIDES: dict[str, str] = {
    "list_visible_patients": "patients.read",
}


def _mcp_server_ast() -> ast.Module:
    path = Path(__file__).resolve().parents[1] / "app" / "mcp" / "server.py"
    return ast.parse(path.read_text(encoding="utf-8"))


def _first_require_scope_in_async_fn(fn: ast.AsyncFunctionDef) -> str | None:
    for stmt in fn.body:
        for node in ast.walk(stmt):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "_require_scope":
                if node.args and isinstance(node.args[0], ast.Constant):
                    val = node.args[0].value
                    if isinstance(val, str):
                        return val
    return None


def _tool_primary_scopes() -> dict[str, str]:
    tree = _mcp_server_ast()
    registry = set(_WORKSPACE_TOOL_REGISTRY.keys())
    out: dict[str, str] = {}
    for node in tree.body:
        if isinstance(node, ast.AsyncFunctionDef) and node.name in registry:
            scope = _first_require_scope_in_async_fn(node)
            if scope:
                out[node.name] = scope
    out.update(_TOOL_SCOPE_OVERRIDES)
    return out


@pytest.fixture(autouse=True)
def _clear_allowlist_cache() -> None:
    ai_chat.get_role_mcp_tool_allowlist.cache_clear()
    yield
    ai_chat.get_role_mcp_tool_allowlist.cache_clear()


def test_easeai_admin_allowlist_excludes_execute_python() -> None:
    allow = ai_chat.get_role_mcp_tool_allowlist()["admin"]
    assert "execute_python_code" not in allow


def test_allowlisted_tools_are_registered() -> None:
    allow = ai_chat.get_role_mcp_tool_allowlist()
    registry = set(_WORKSPACE_TOOL_REGISTRY.keys())
    for role, tools in allow.items():
        missing = sorted(tools - registry)
        assert not missing, f"Role {role}: allowlisted tools missing from registry: {missing}"


def test_allowlisted_tools_have_token_scopes() -> None:
    """Each allowlisted tool's primary _require_scope (when present) must be in ROLE_TOKEN_SCOPES."""
    allow = ai_chat.get_role_mcp_tool_allowlist()
    primary = _tool_primary_scopes()
    for role, tools in allow.items():
        token_scopes = ROLE_TOKEN_SCOPES.get(role, set())
        for tool in sorted(tools):
            need = primary.get(tool)
            if need is None:
                continue
            assert need in token_scopes, (
                f"Role {role}: tool `{tool}` requires MCP scope `{need}` "
                f"but ROLE_TOKEN_SCOPES[{role}] is missing it"
            )


@pytest.mark.asyncio
async def test_execute_python_mcp_disabled_by_default() -> None:
    ctx = McpActorContext(
        user_id=1,
        workspace_id=1,
        role="admin",
        patient_id=None,
        caregiver_id=None,
        scopes={"workspace.read"},
    )
    with actor_scope(ctx):
        with pytest.raises(PermissionError, match="execute_python_code is disabled"):
            await execute_python_code("print(1)")


@pytest.mark.asyncio
async def test_patient_send_message_chat_action_flow(
    db_session: AsyncSession,
    admin_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_execute_plan(*, actor_access_token: str, execution_plan):
        step = execution_plan.steps[0]
        return AgentRuntimeExecuteResponse(
            message="executed",
            execution_result={
                "steps": [{"tool": step.tool_name, "arguments": step.arguments, "ok": True}],
                "ok": True,
            },
        )

    monkeypatch.setattr("app.services.agent_runtime_client.execute_plan", fake_execute_plan)

    p = Patient(
        workspace_id=admin_user.workspace_id,
        first_name="Pat",
        last_name="One",
        is_active=True,
    )
    db_session.add(p)
    await db_session.flush()

    patient_user = User(
        username="parity_patient_msg",
        hashed_password=get_password_hash("pass"),
        role="patient",
        workspace_id=admin_user.workspace_id,
        is_active=True,
        patient_id=p.id,
    )
    db_session.add(patient_user)
    await db_session.commit()
    await db_session.refresh(patient_user)

    proposed = await ai_chat.propose_chat_action(
        db_session,
        ws_id=admin_user.workspace_id,
        actor=patient_user,
        payload=ChatActionProposeIn(
            title="Message staff",
            action_type="mcp_tool",
            tool_name="send_message",
            tool_arguments={
                "body": "Hello from parity test",
                "subject": "Test",
                "recipient_user_id": admin_user.id,
            },
            summary="Patient messages admin",
        ),
    )
    assert proposed.status == "proposed"

    confirmed = await ai_chat.confirm_chat_action(
        db_session,
        ws_id=admin_user.workspace_id,
        action_id=proposed.id,
        actor=patient_user,
        approved=True,
        note="ok",
    )
    assert confirmed.status == "confirmed"

    executed, result = await ai_chat.execute_chat_action(
        db_session,
        ws_id=admin_user.workspace_id,
        action_id=proposed.id,
        actor=patient_user,
    )
    assert executed.status == "executed"
    assert result.get("ok") is True
