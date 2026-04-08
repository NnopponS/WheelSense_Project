from __future__ import annotations

"""AI provider settings (workspace + user)."""

from typing import Literal

from pydantic import BaseModel, Field

class AISettingsOut(BaseModel):
    """Effective settings for the current user (merged workspace + overrides)."""

    provider: Literal["ollama", "copilot"]
    model: str
    workspace_default_provider: Literal["ollama", "copilot"]
    workspace_default_model: str
    user_provider_override: Literal["ollama", "copilot"] | None = None
    user_model_override: str | None = None

class AIUserSettingsUpdate(BaseModel):
    provider: Literal["ollama", "copilot"] | None = None
    model: str | None = Field(None, max_length=128)

class GlobalAISettingsUpdate(BaseModel):
    """Admin-only workspace defaults."""

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
