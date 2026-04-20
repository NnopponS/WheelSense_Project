from __future__ import annotations

"""Chat action endpoints (propose -> confirm -> execute)."""

from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_active_user, get_current_user_workspace, get_db
from app.models.chat import ChatConversation, ChatMessage
from app.models.core import Workspace
from app.models.users import User
from app.schemas.agent_runtime import ExecutionPlan
from app.schemas.chat import ChatMessagePart
from app.schemas.chat_actions import (
    ChatActionConfirmIn,
    ChatActionExecuteIn,
    ChatActionExecuteOut,
    ChatActionOut,
    ChatActionProposalItem,
    ChatActionProposalRequest,
    ChatActionProposalResponse,
    ChatActionProposeIn,
)
from app.services import agent_runtime_client, ai_chat

router = APIRouter()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def _collect_assistant_reply(
    *,
    db: AsyncSession,
    user: User,
    workspace: Workspace,
    messages: list[ChatMessagePart],
) -> str:
    parts: list[str] = []
    async for chunk in ai_chat.stream_chat_response(
        db=db,
        user=user,
        workspace=workspace,
        messages=messages,
        provider_override=None,
        model_override=None,
    ):
        parts.append(chunk)
    return "".join(parts).strip()


def _serialize_action_summary(row) -> ChatActionProposalItem:
    description = row.summary or f"Prepare `{row.tool_name}` for execution after confirmation."
    proposed_changes = dict(row.proposed_changes or {})
    plan_payload = proposed_changes.get("execution_plan")
    permission_basis = []
    if isinstance(plan_payload, dict):
        permission_basis = list(plan_payload.get("permission_basis") or [])
        if permission_basis:
            description = f"{description} Permissions: {', '.join(permission_basis)}."
    return ChatActionProposalItem(
        action_id=row.id,
        title=row.title,
        description=description,
        risk_level=(plan_payload or {}).get("risk_level", "low") if isinstance(plan_payload, dict) else "low",
        params=dict(row.tool_arguments or {}),
        payload=proposed_changes,
    )


def _chat_action_out(row) -> ChatActionOut:
    out = ChatActionOut.model_validate(row)
    plan_payload = dict(row.proposed_changes or {}).get("execution_plan")
    if isinstance(plan_payload, dict):
        out.execution_plan = ExecutionPlan.model_validate(plan_payload)
    return out


def _build_execution_message(action, execution_result: dict) -> str:
    if action.action_type == "note":
        return action.summary or "Action recorded."
    tool_name = action.tool_name or "tool"
    if execution_result.get("message"):
        return str(execution_result["message"])
    return f"Executed `{tool_name}` successfully."


def _should_include_ai_trace(value: str | None) -> bool:
    normalized = (value or "").strip().lower()
    return normalized in {"1", "true", "yes", "on"}


@router.get("/actions", response_model=list[ChatActionOut])
async def list_actions(
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_user),
    workspace: Workspace = Depends(get_current_user_workspace),
):
    rows = await ai_chat.list_chat_actions(
        db,
        ws_id=workspace.id,
        user=user,
        limit=limit,
    )
    return [_chat_action_out(row) for row in rows]


@router.get("/actions/{action_id}", response_model=ChatActionOut)
async def get_action(
    action_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_user),
    workspace: Workspace = Depends(get_current_user_workspace),
):
    row = await ai_chat.get_chat_action(db, ws_id=workspace.id, action_id=action_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Chat action not found")
    if user.role not in {"admin", "head_nurse"} and row.proposed_by_user_id != user.id:
        raise HTTPException(status_code=403, detail="Operation not permitted")
    return _chat_action_out(row)


@router.post("/actions/propose", response_model=ChatActionProposalResponse, status_code=201)
async def propose_action(
    body: ChatActionProposalRequest | ChatActionProposeIn,
    request: Request,
    ai_trace: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_user),
    workspace: Workspace = Depends(get_current_user_workspace),
):
    if isinstance(body, ChatActionProposeIn):
        row = await ai_chat.propose_chat_action(
            db,
            ws_id=workspace.id,
            actor=user,
            payload=body,
        )
        return ChatActionProposalResponse(
            proposal_id=row.id,
            assistant_reply=row.summary or row.title,
            reply=row.summary or row.title,
            summary=row.summary,
            actions=[_serialize_action_summary(row)],
        )

    conversation = None
    if body.conversation_id is not None:
        conversation = await db.get(ChatConversation, body.conversation_id)
        if conversation is None or conversation.workspace_id != workspace.id or conversation.user_id != user.id:
            raise HTTPException(status_code=404, detail="Conversation not found")

    messages = body.messages or [ChatMessagePart(role="user", content=body.message)]
    last_user = next((item for item in reversed(messages) if item.role == "user"), None)
    if conversation is not None and last_user is not None:
        db.add(
            ChatMessage(
                conversation_id=conversation.id,
                role="user",
                content=last_user.content,
            )
        )

    # Prefer token attached by auth dependency (always set after successful JWT validation).
    # Parsing Authorization alone can miss edge cases; MCP/agent-runtime must receive the real JWT.
    actor_access_token = (getattr(user, "_access_token", None) or "").strip()
    if not actor_access_token:
        auth_header = request.headers.get("authorization", "") or request.headers.get("Authorization", "")
        _, _, actor_access_token = auth_header.partition(" ")
        actor_access_token = actor_access_token.strip()
    if not actor_access_token:
        raise HTTPException(status_code=401, detail="Missing credentials for agent runtime")

    try:
        runtime = await agent_runtime_client.propose_turn(
            actor_access_token=actor_access_token,
            message=body.message,
            messages=messages,
            conversation_id=body.conversation_id,
            page_patient_id=body.page_patient_id,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail="Agent runtime is unavailable or returned an error. Check wheelsense-agent-runtime logs and AGENT_RUNTIME_URL.",
        ) from exc

    assistant_reply = runtime.assistant_reply

    action_row = None
    if runtime.action_payload is not None:
        try:
            payload = ChatActionProposeIn.model_validate(runtime.action_payload)
            action_row = await ai_chat.propose_chat_action(
                db,
                ws_id=workspace.id,
                actor=user,
                payload=payload,
            )
        except ValidationError as exc:
            raise HTTPException(
                status_code=502,
                detail="Agent runtime returned an invalid action payload.",
            ) from exc
        except HTTPException as exc:
            if exc.status_code in {403, 422}:
                raise HTTPException(
                    status_code=502,
                    detail=f"Agent runtime proposed an unsupported action: {exc.detail}",
                ) from exc
            raise

    if conversation is not None and assistant_reply:
        conversation.updated_at = _utcnow()
        db.add(conversation)
        db.add(
            ChatMessage(
                conversation_id=conversation.id,
                role="assistant",
                content=assistant_reply,
            )
        )
        await db.commit()

    actions = [_serialize_action_summary(action_row)] if action_row is not None else []
    summary = (
        action_row.summary
        if action_row is not None
        else "No system action is queued. The assistant reply is informational only."
    )
    return ChatActionProposalResponse(
        mode=runtime.mode,
        proposal_id=action_row.id if action_row is not None else None,
        assistant_reply=assistant_reply,
        reply=assistant_reply,
        summary=summary,
        actions=actions,
        execution_plan=runtime.plan,
        ai_trace=(
            list(runtime.grounding.get("ai_trace") or [])
            if _should_include_ai_trace(ai_trace)
            else None
        ),
    )


@router.post("/actions/{action_id}/confirm", response_model=ChatActionOut)
async def confirm_action(
    action_id: int,
    body: ChatActionConfirmIn = Body(default_factory=ChatActionConfirmIn),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_user),
    workspace: Workspace = Depends(get_current_user_workspace),
):
    row = await ai_chat.confirm_chat_action(
        db,
        ws_id=workspace.id,
        action_id=action_id,
        actor=user,
        approved=body.approved,
        note=body.note,
    )
    return _chat_action_out(row)


@router.post("/actions/{action_id}/execute", response_model=ChatActionExecuteOut)
async def execute_action(
    action_id: int,
    body: ChatActionExecuteIn = Body(default_factory=ChatActionExecuteIn),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_user),
    workspace: Workspace = Depends(get_current_user_workspace),
):
    row, execution_result = await ai_chat.execute_chat_action(
        db,
        ws_id=workspace.id,
        action_id=action_id,
        actor=user,
        force=body.force,
    )
    reply = _build_execution_message(row, execution_result)
    if row.conversation_id is not None:
        conversation = await db.get(ChatConversation, row.conversation_id)
        if (
            conversation is not None
            and conversation.workspace_id == workspace.id
            and conversation.user_id == user.id
        ):
            conversation.updated_at = _utcnow()
            db.add(conversation)
            db.add(
                ChatMessage(
                    conversation_id=conversation.id,
                    role="assistant",
                    content=reply,
                )
            )
            await db.commit()
    return ChatActionExecuteOut(
        action=_chat_action_out(row),
        execution_result=execution_result,
        message=reply,
        reply=reply,
    )
