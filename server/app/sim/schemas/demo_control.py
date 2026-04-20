from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator


class DemoActorOut(BaseModel):
    actor_type: str
    actor_id: int
    display_name: str
    role: Optional[str] = None
    room_id: Optional[int] = None
    room_name: Optional[str] = None
    source: str = "manual"
    updated_at: Optional[datetime] = None


class DemoControlStateOut(BaseModel):
    workspace_id: int
    actors: list[DemoActorOut] = Field(default_factory=list)


class DemoActorMoveRequest(BaseModel):
    room_id: int = Field(ge=1)
    note: str = ""


class DemoWorkflowAdvanceRequest(BaseModel):
    action: str = Field(default="advance", min_length=1, max_length=32)
    target_mode: Optional[str] = None
    target_id: Optional[int | str] = None
    target_role: Optional[str] = None
    target_user_id: Optional[int] = None
    note: str = ""

    @model_validator(mode="after")
    def normalize_target(self):
        if self.target_mode is None:
            self.target_role = None
            self.target_user_id = None
            return self
        if self.target_mode == "role":
            role_value = self.target_role
            if role_value is None and isinstance(self.target_id, str):
                role_value = self.target_id
            if not role_value:
                raise ValueError("target_role or target_id is required when target_mode=role")
            self.target_role = role_value
            self.target_user_id = None
            return self
        if self.target_mode == "user":
            user_value = self.target_user_id
            if user_value is None and isinstance(self.target_id, int):
                user_value = self.target_id
            if user_value is None and isinstance(self.target_id, str) and self.target_id.isdigit():
                user_value = int(self.target_id)
            if user_value is None:
                raise ValueError("target_user_id or numeric target_id is required when target_mode=user")
            self.target_user_id = user_value
            self.target_role = None
            return self
        raise ValueError("target_mode must be 'role' or 'user'")


class DemoRoomCaptureResponse(BaseModel):
    status: str
    message: str
    room_id: int
    node_device_id: Optional[str] = None
    command_id: Optional[str] = None


class DemoScenarioResponse(BaseModel):
    scenario_id: str
    status: str
    message: str


class DemoWorkflowAdvanceResponse(BaseModel):
    item_type: str
    item_id: int
    status: str
    action: str
    message: str


class DemoScenarioStartRequest(BaseModel):
    interval_ms: int = Field(default=2000, ge=250, le=60000)


class DemoScenarioStopRequest(BaseModel):
    reason: str = ""


class DemoResetRequest(BaseModel):
    profile: str = "show-demo"


class DemoResetResponse(BaseModel):
    profile: str
    status: str
    message: str


class SimulatorResetResponse(BaseModel):
    """Response schema for simulator environment reset."""
    action: str
    workspace_id: int
    workspace_name: str
    cleared_counts: dict[str, int] | None = None
    message: str


class SimulatorStatusResponse(BaseModel):
    """Response schema for simulator environment status."""
    env_mode: str
    is_simulator: bool
    workspace_exists: bool
    workspace_id: int | None = None
    workspace_name: str | None = None
    statistics: dict[str, int] | None = None


SimulatorCommandName = Literal["pause", "resume", "set_config", "inject_abnormal_hr", "inject_fall"]


class SimulatorRuntimeConfigPatch(BaseModel):
    """Allowed runtime keys forwarded to the MQTT simulator worker."""

    vital_update_interval: int | None = Field(default=None, ge=5, le=600)
    alert_probability: float | None = Field(default=None, ge=0.0, le=1.0)
    enable_alerts: bool | None = None
    heart_rate_high: int | None = Field(default=None, ge=60, le=200)


class SimulatorCommandIn(BaseModel):
    """Admin command published to `WheelSense/sim/control` for the workspace MQTT simulator."""

    command: SimulatorCommandName
    patient_id: int | None = Field(default=None, ge=1)
    config: SimulatorRuntimeConfigPatch | None = None

    @model_validator(mode="after")
    def validate_set_config(self):
        if self.command == "set_config":
            if self.config is None:
                raise ValueError("config is required when command is set_config")
            if not self.config.model_dump(exclude_none=True):
                raise ValueError("config must include at least one field for set_config")
        return self


class SimulatorCommandOut(BaseModel):
    status: str = "ok"
    message: str
