from __future__ import annotations

import httpx

from app.config import settings
from app.schemas.agent_runtime import (
    AgentRuntimeExecuteRequest,
    AgentRuntimeExecuteResponse,
    AgentRuntimeProposeRequest,
    AgentRuntimeProposeResponse,
)
from app.schemas.agent_runtime import ExecutionPlan
from app.schemas.chat import ChatMessagePart


def _internal_headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if settings.internal_service_secret:
        headers["X-WheelSense-Internal-Secret"] = settings.internal_service_secret
    return headers


async def propose_turn(
    *,
    actor_access_token: str,
    message: str,
    messages: list[ChatMessagePart],
    conversation_id: int | None,
    page_patient_id: int | None = None,
) -> AgentRuntimeProposeResponse:
    payload = AgentRuntimeProposeRequest(
        actor_access_token=actor_access_token,
        message=message,
        messages=messages,
        conversation_id=conversation_id,
        page_patient_id=page_patient_id,
    )
    async with httpx.AsyncClient(timeout=90.0) as client:
        response = await client.post(
            f"{settings.agent_runtime_url.rstrip('/')}/internal/agent/propose",
            headers=_internal_headers(),
            json=payload.model_dump(mode="json"),
        )
    response.raise_for_status()
    return AgentRuntimeProposeResponse.model_validate(response.json())


async def execute_plan(
    *,
    actor_access_token: str,
    execution_plan: ExecutionPlan,
) -> AgentRuntimeExecuteResponse:
    payload = AgentRuntimeExecuteRequest(
        actor_access_token=actor_access_token,
        execution_plan=execution_plan,
    )
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{settings.agent_runtime_url.rstrip('/')}/internal/agent/execute",
            headers=_internal_headers(),
            json=payload.model_dump(mode="json"),
        )
    response.raise_for_status()
    return AgentRuntimeExecuteResponse.model_validate(response.json())
