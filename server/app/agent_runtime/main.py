from __future__ import annotations

from fastapi import FastAPI, Header, HTTPException

from app.config import settings
from app.schemas.agent_runtime import (
    AgentRuntimeExecuteRequest,
    AgentRuntimeExecuteResponse,
    AgentRuntimeProposeRequest,
    AgentRuntimeProposeResponse,
)
from app.agent_runtime.service import execute_plan, propose_turn

app = FastAPI(title="WheelSense Agent Runtime", version="1.0.0")


def _require_internal_secret(header_value: str | None) -> None:
    expected = settings.internal_service_secret.strip()
    if not expected:
        return
    if header_value != expected:
        raise HTTPException(status_code=401, detail="Invalid internal service secret")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/internal/agent/propose", response_model=AgentRuntimeProposeResponse)
async def internal_agent_propose(
    body: AgentRuntimeProposeRequest,
    x_wheelsense_internal_secret: str | None = Header(default=None),
):
    _require_internal_secret(x_wheelsense_internal_secret)
    return await propose_turn(
        actor_access_token=body.actor_access_token,
        message=body.message,
        messages=body.messages,
        conversation_id=body.conversation_id,
        page_patient_id=body.page_patient_id,
    )


@app.post("/internal/agent/execute", response_model=AgentRuntimeExecuteResponse)
async def internal_agent_execute(
    body: AgentRuntimeExecuteRequest,
    x_wheelsense_internal_secret: str | None = Header(default=None),
):
    _require_internal_secret(x_wheelsense_internal_secret)
    return await execute_plan(
        actor_access_token=body.actor_access_token,
        execution_plan=body.execution_plan,
    )
