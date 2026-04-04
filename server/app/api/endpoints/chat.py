"""AI chat — streaming and conversation CRUD."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_active_user, get_current_user_workspace, get_db
from app.models.chat import ChatConversation, ChatMessage
from app.models.core import Workspace
from app.models.users import User
from app.schemas.chat import (
    ChatConversationCreate,
    ChatConversationOut,
    ChatMessageOut,
    ChatStreamRequest,
)
from app.services import ai_chat

router = APIRouter()


@router.post("/stream")
async def chat_stream(
    body: ChatStreamRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_user),
    workspace: Workspace = Depends(get_current_user_workspace),
):
    """Stream assistant text (plain UTF-8 chunks; use with AI SDK `streamProtocol: 'text'`)."""

    if body.conversation_id is not None:
        conv = await db.get(ChatConversation, body.conversation_id)
        if not conv or conv.user_id != user.id or conv.workspace_id != workspace.id:
            raise HTTPException(404, "Conversation not found")
        last_user = next(
            (m for m in reversed(body.messages) if m.role == "user"),
            None,
        )
        if last_user:
            db.add(
                ChatMessage(
                    conversation_id=conv.id,
                    role="user",
                    content=last_user.content,
                )
            )
            await db.commit()

    async def gen():
        buf: list[str] = []
        async for chunk in ai_chat.stream_chat_response(
            db=db,
            user=user,
            workspace=workspace,
            messages=body.messages,
            provider_override=body.provider,
            model_override=body.model,
        ):
            buf.append(chunk)
            yield chunk
        if body.conversation_id is not None:
            text = "".join(buf)
            conv2 = await db.get(ChatConversation, body.conversation_id)
            if (
                conv2
                and conv2.user_id == user.id
                and conv2.workspace_id == workspace.id
            ):
                db.add(
                    ChatMessage(
                        conversation_id=conv2.id,
                        role="assistant",
                        content=text,
                    )
                )
                await db.commit()

    return StreamingResponse(gen(), media_type="text/plain; charset=utf-8")


@router.get("/conversations", response_model=list[ChatConversationOut])
async def list_conversations(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_user),
    workspace: Workspace = Depends(get_current_user_workspace),
):
    res = await db.execute(
        select(ChatConversation)
        .where(
            ChatConversation.user_id == user.id,
            ChatConversation.workspace_id == workspace.id,
        )
        .order_by(ChatConversation.updated_at.desc())
    )
    return list(res.scalars().all())


@router.post("/conversations", response_model=ChatConversationOut)
async def create_conversation(
    body: ChatConversationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_user),
    workspace: Workspace = Depends(get_current_user_workspace),
):
    conv = ChatConversation(
        workspace_id=workspace.id,
        user_id=user.id,
        title=body.title,
    )
    db.add(conv)
    await db.commit()
    await db.refresh(conv)
    return conv


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=list[ChatMessageOut],
)
async def list_messages(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_user),
    workspace: Workspace = Depends(get_current_user_workspace),
):
    conv = await db.get(ChatConversation, conversation_id)
    if not conv or conv.user_id != user.id or conv.workspace_id != workspace.id:
        raise HTTPException(404, "Conversation not found")
    res = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conversation_id)
        .order_by(ChatMessage.created_at.asc())
    )
    return list(res.scalars().all())
