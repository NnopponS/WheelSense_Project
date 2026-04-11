from __future__ import annotations

"""AI provider settings (workspace-global only)."""

from typing import Literal

from pydantic import BaseModel, Field


class AISettingsOut(BaseModel):
    provider: Literal["ollama", "copilot"]
    model: str
    workspace_default_provider: Literal["ollama", "copilot"]
    workspace_default_model: str


class AIWorkspaceSettingsUpdate(BaseModel):
    """Compatibility payload for admin update on /settings/ai."""

    provider: Literal["ollama", "copilot"]
    model: str = Field(..., max_length=128)


class GlobalAISettingsUpdate(BaseModel):
    """Admin-only workspace defaults (/settings/ai/global)."""

    default_provider: Literal["ollama", "copilot"]
    default_model: str = Field(..., max_length=128)

class CopilotDeviceCodeOut(BaseModel):
    device_code: str
    user_code: str
    verification_uri: str
    expires_in: int
    interval: int

class CopilotPollIn(BaseModel):
    device_code: str

class CopilotPollOut(BaseModel):
    status: Literal["pending", "success", "slow_down"]
    access_token: str | None = None
    token_type: str | None = None
    scope: str | None = None

class CopilotStatusOut(BaseModel):
    connected: bool

class CopilotModelInfo(BaseModel):
    id: str
    name: str
    supports_reasoning_effort: bool = False
    supports_vision: bool = False

class CopilotModelsOut(BaseModel):
    models: list[CopilotModelInfo]
    connected: bool = False
    message: str | None = None

class OllamaModelInfo(BaseModel):
    name: str
    size: int | None = None
    digest: str | None = None

class OllamaModelsOut(BaseModel):
    models: list[OllamaModelInfo]
    reachable: bool = False
    origin: str | None = None
    message: str | None = None

class OllamaPullIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
