from __future__ import annotations

"""Chat action endpoints (propose -> confirm -> execute)."""

from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_active_user, get_current_user_workspace, get_db
from app.models.chat import ChatConversation, ChatMessage
from app.models.core import Workspace
from app.models.users import User
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
from app.services import ai_chat

router = APIRouter()


ACTION_HINTS: tuple[tuple[tuple[str, ...], str, str, str], ...] = (
    (("system health", "system status", "platform status"), "get_system_health", "Check system health", "Read current platform health and service readiness."),
    (("list rooms", "show rooms", "room list"), "list_rooms", "List rooms", "Read the current room catalogue and availability."),
    (("list devices", "show devices", "device list"), "list_devices", "List devices", "Read the current device inventory and realtime availability."),
    (("alerts", "active alerts", "show alerts"), "list_active_alerts", "Review active alerts", "Read active alerts that may require follow-up."),
    (("patients", "patient list", "show patients"), "list_patients", "List patients", "Read the visible patient roster for the current role."),
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _build_action_from_message(user: User, conversation_id: int | None, message: str) -> ChatActionProposeIn | None:
    lowered = message.lower()
    allowed = ai_chat.ROLE_MCP_TOOL_ALLOWLIST.get(user.role, set())
    for keywords, tool_name, title, summary in ACTION_HINTS:
        if tool_name not in allowed:
            continue
        if any(keyword in lowered for keyword in keywords):
            return ChatActionProposeIn(
                conversation_id=conversation_id,
                title=title,
                action_type="mcp_tool",
                tool_name=tool_name,
                tool_arguments={},
                summary=summary,
                proposed_changes={"intent": message},
            )
    return None


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
    return ChatActionProposalItem(
        action_id=row.id,
        title=row.title,
        description=description,
        risk_level="low",
        params=dict(row.tool_arguments or {}),
        payload=dict(row.proposed_changes or {}),
    )


def _build_execution_message(action, execution_result: dict) -> str:
    if action.action_type == "note":
        return action.summary or "Action recorded."
    tool_name = action.tool_name or "tool"
    if execution_result.get("message"):
        return str(execution_result["message"])
    return f"Executed `{tool_name}` successfully."


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
    return [ChatActionOut.model_validate(row) for row in rows]


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
    return ChatActionOut.model_validate(row)


@router.post("/actions/propose", response_model=ChatActionProposalResponse, status_code=201)
async def propose_action(
    body: ChatActionProposalRequest | ChatActionProposeIn,
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

    assistant_reply = await _collect_assistant_reply(
        db=db,
        user=user,
        workspace=workspace,
        messages=messages,
    )

    action_row = None
    action_payload = _build_action_from_message(user, body.conversation_id, body.message)
    if action_payload is not None:
        action_row = await ai_chat.propose_chat_action(
            db,
            ws_id=workspace.id,
            actor=user,
            payload=action_payload,
        )

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
        proposal_id=action_row.id if action_row is not None else None,
        assistant_reply=assistant_reply,
        reply=assistant_reply,
        summary=summary,
        actions=actions,
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
    return ChatActionOut.model_validate(row)


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
        action=ChatActionOut.model_validate(row),
        execution_result=execution_result,
        message=reply,
        reply=reply,
    )
