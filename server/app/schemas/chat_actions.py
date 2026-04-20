from __future__ import annotations

"""Schemas for chat action proposal/confirmation/execution flow."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.agent_runtime import ExecutionPlan
from app.schemas.chat import ChatMessagePart

ChatActionStatus = Literal["proposed", "confirmed", "executed", "rejected", "failed"]
ChatActionType = Literal["mcp_tool", "mcp_plan", "note"]


class ChatActionProposeIn(BaseModel):
    conversation_id: int | None = None
    title: str = Field(..., min_length=1, max_length=160)
    action_type: ChatActionType = "mcp_tool"
    tool_name: str | None = Field(default=None, max_length=96)
    tool_arguments: dict[str, Any] = Field(default_factory=dict)
    summary: str = ""
    proposed_changes: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_tool_requirements(self):
        if self.action_type == "mcp_tool" and not self.tool_name:
            raise ValueError("tool_name is required for mcp_tool actions")
        return self


class ChatActionConfirmIn(BaseModel):
    approved: bool = True
    note: str = ""


class ChatActionExecuteIn(BaseModel):
    force: bool = False


class ChatActionProposalRequest(BaseModel):
    conversation_id: int | None = None
    message: str = Field(..., min_length=1)
    messages: list[ChatMessagePart] = Field(default_factory=list)
    page_patient_id: int | None = Field(
        default=None,
        description="Optional patient id from the current UI page (e.g. admin patient detail) to seed agent-runtime context.",
    )


class ChatActionProposalItem(BaseModel):
    action_id: int
    title: str
    description: str = ""
    risk_level: Literal["low", "medium", "high"] = "low"
    params: dict[str, Any] = Field(default_factory=dict)
    payload: dict[str, Any] = Field(default_factory=dict)


class ChatActionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    workspace_id: int
    conversation_id: int | None
    proposed_by_user_id: int | None
    confirmed_by_user_id: int | None
    executed_by_user_id: int | None
    title: str
    action_type: str
    tool_name: str | None
    tool_arguments: dict[str, Any]
    summary: str
    proposed_changes: dict[str, Any]
    status: ChatActionStatus
    confirmation_note: str
    execution_result: dict[str, Any] | None
    error_message: str
    execution_plan: ExecutionPlan | None = None
    created_at: datetime
    updated_at: datetime
    confirmed_at: datetime | None
    executed_at: datetime | None


class ChatActionExecuteOut(BaseModel):
    action: ChatActionOut
    execution_result: dict[str, Any]
    message: str = ""
    reply: str = ""


class ChatActionProposalResponse(BaseModel):
    mode: Literal["answer", "plan"] = "answer"
    proposal_id: int | None = None
    assistant_reply: str = ""
    reply: str = ""
    summary: str = ""
    actions: list[ChatActionProposalItem] = Field(default_factory=list)
    execution_plan: ExecutionPlan | None = None
    ai_trace: list[dict[str, Any]] | None = None
