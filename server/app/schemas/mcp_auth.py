from __future__ import annotations

"""Pydantic schemas for MCP OAuth Authentication."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


# =============================================================================
# MCP Scope Constants
# =============================================================================

# All valid MCP scopes
MCP_SCOPE_PATIENTS_READ = "patients.read"
MCP_SCOPE_PATIENTS_WRITE = "patients.write"
MCP_SCOPE_ALERTS_READ = "alerts.read"
MCP_SCOPE_ALERTS_MANAGE = "alerts.manage"
MCP_SCOPE_DEVICES_READ = "devices.read"
MCP_SCOPE_DEVICES_MANAGE = "devices.manage"
MCP_SCOPE_DEVICES_COMMAND = "devices.command"
MCP_SCOPE_ROOMS_READ = "rooms.read"
MCP_SCOPE_ROOMS_MANAGE = "rooms.manage"
MCP_SCOPE_ROOM_CONTROLS_USE = "room_controls.use"
MCP_SCOPE_WORKFLOW_READ = "workflow.read"
MCP_SCOPE_WORKFLOW_WRITE = "workflow.write"
MCP_SCOPE_CAMERAS_CAPTURE = "cameras.capture"
MCP_SCOPE_AI_SETTINGS_READ = "ai_settings.read"
MCP_SCOPE_AI_SETTINGS_WRITE = "ai_settings.write"
MCP_SCOPE_ADMIN_AUDIT_READ = "admin.audit.read"
MCP_SCOPE_WORKSPACE_READ = "workspace.read"
MCP_SCOPE_MEDICATION_READ = "medication.read"
MCP_SCOPE_MEDICATION_WRITE = "medication.write"
MCP_SCOPE_VITALS_WRITE = "vitals.write"
MCP_SCOPE_CAREGIVERS_WRITE = "caregivers.write"

ALL_MCP_SCOPES: list[str] = [
    MCP_SCOPE_WORKSPACE_READ,
    MCP_SCOPE_PATIENTS_READ,
    MCP_SCOPE_PATIENTS_WRITE,
    MCP_SCOPE_ALERTS_READ,
    MCP_SCOPE_ALERTS_MANAGE,
    MCP_SCOPE_DEVICES_READ,
    MCP_SCOPE_DEVICES_MANAGE,
    MCP_SCOPE_DEVICES_COMMAND,
    MCP_SCOPE_ROOMS_READ,
    MCP_SCOPE_ROOMS_MANAGE,
    MCP_SCOPE_ROOM_CONTROLS_USE,
    MCP_SCOPE_WORKFLOW_READ,
    MCP_SCOPE_WORKFLOW_WRITE,
    MCP_SCOPE_CAMERAS_CAPTURE,
    MCP_SCOPE_AI_SETTINGS_READ,
    MCP_SCOPE_AI_SETTINGS_WRITE,
    MCP_SCOPE_ADMIN_AUDIT_READ,
    MCP_SCOPE_MEDICATION_READ,
    MCP_SCOPE_MEDICATION_WRITE,
    MCP_SCOPE_VITALS_WRITE,
    MCP_SCOPE_CAREGIVERS_WRITE,
]

# Role-to-scope mapping for MCP
ROLE_MCP_SCOPES: dict[str, set[str]] = {
    "admin": {
        MCP_SCOPE_WORKSPACE_READ,
        MCP_SCOPE_PATIENTS_READ,
        MCP_SCOPE_PATIENTS_WRITE,
        MCP_SCOPE_ALERTS_READ,
        MCP_SCOPE_ALERTS_MANAGE,
        MCP_SCOPE_DEVICES_READ,
        MCP_SCOPE_DEVICES_MANAGE,
        MCP_SCOPE_DEVICES_COMMAND,
        MCP_SCOPE_ROOMS_READ,
        MCP_SCOPE_ROOMS_MANAGE,
        MCP_SCOPE_ROOM_CONTROLS_USE,
        MCP_SCOPE_WORKFLOW_READ,
        MCP_SCOPE_WORKFLOW_WRITE,
        MCP_SCOPE_CAMERAS_CAPTURE,
        MCP_SCOPE_AI_SETTINGS_READ,
        MCP_SCOPE_AI_SETTINGS_WRITE,
        MCP_SCOPE_ADMIN_AUDIT_READ,
        MCP_SCOPE_MEDICATION_READ,
        MCP_SCOPE_MEDICATION_WRITE,
        MCP_SCOPE_VITALS_WRITE,
        MCP_SCOPE_CAREGIVERS_WRITE,
    },
    "head_nurse": {
        MCP_SCOPE_WORKSPACE_READ,
        MCP_SCOPE_PATIENTS_READ,
        MCP_SCOPE_PATIENTS_WRITE,
        MCP_SCOPE_ALERTS_READ,
        MCP_SCOPE_ALERTS_MANAGE,
        MCP_SCOPE_DEVICES_READ,
        MCP_SCOPE_DEVICES_MANAGE,
        MCP_SCOPE_DEVICES_COMMAND,
        MCP_SCOPE_ROOMS_READ,
        MCP_SCOPE_ROOMS_MANAGE,
        MCP_SCOPE_ROOM_CONTROLS_USE,
        MCP_SCOPE_WORKFLOW_READ,
        MCP_SCOPE_WORKFLOW_WRITE,
        MCP_SCOPE_CAMERAS_CAPTURE,
        MCP_SCOPE_ADMIN_AUDIT_READ,
        MCP_SCOPE_MEDICATION_READ,
        MCP_SCOPE_MEDICATION_WRITE,
        MCP_SCOPE_VITALS_WRITE,
        MCP_SCOPE_CAREGIVERS_WRITE,
    },
    "supervisor": {
        MCP_SCOPE_WORKSPACE_READ,
        MCP_SCOPE_PATIENTS_READ,
        MCP_SCOPE_ALERTS_READ,
        MCP_SCOPE_ALERTS_MANAGE,
        MCP_SCOPE_DEVICES_READ,
        MCP_SCOPE_DEVICES_COMMAND,
        MCP_SCOPE_ROOMS_READ,
        MCP_SCOPE_ROOM_CONTROLS_USE,
        MCP_SCOPE_WORKFLOW_READ,
        MCP_SCOPE_WORKFLOW_WRITE,
        MCP_SCOPE_CAMERAS_CAPTURE,
        MCP_SCOPE_ADMIN_AUDIT_READ,
        MCP_SCOPE_MEDICATION_READ,
        MCP_SCOPE_MEDICATION_WRITE,
    },
    "observer": {
        MCP_SCOPE_WORKSPACE_READ,
        MCP_SCOPE_PATIENTS_READ,
        MCP_SCOPE_ALERTS_READ,
        MCP_SCOPE_ALERTS_MANAGE,
        MCP_SCOPE_DEVICES_READ,
        MCP_SCOPE_ROOMS_READ,
        MCP_SCOPE_ROOM_CONTROLS_USE,
        MCP_SCOPE_WORKFLOW_READ,
        MCP_SCOPE_WORKFLOW_WRITE,
        MCP_SCOPE_ADMIN_AUDIT_READ,
        MCP_SCOPE_MEDICATION_READ,
        MCP_SCOPE_VITALS_WRITE,
    },
    "patient": {
        MCP_SCOPE_WORKSPACE_READ,
        MCP_SCOPE_PATIENTS_READ,
        MCP_SCOPE_ALERTS_READ,
        MCP_SCOPE_DEVICES_READ,
        MCP_SCOPE_ROOMS_READ,
        MCP_SCOPE_ROOM_CONTROLS_USE,
        MCP_SCOPE_WORKFLOW_READ,
        MCP_SCOPE_WORKFLOW_WRITE,
        MCP_SCOPE_MEDICATION_READ,
    },
}


def resolve_mcp_scopes_for_role(role: str, requested_scopes: list[str] | None = None) -> set[str]:
    """Resolve effective MCP scopes for a role, optionally narrowed by request.

    Args:
        role: The user's role
        requested_scopes: Optional list of scopes to narrow to

    Returns:
        Set of allowed MCP scopes
    """
    allowed = ROLE_MCP_SCOPES.get(role, set())
    if not requested_scopes:
        return allowed
    requested = {s for s in requested_scopes if s in ALL_MCP_SCOPES}
    return allowed.intersection(requested)


# =============================================================================
# Request Schemas
# =============================================================================

class MCPTokenCreate(BaseModel):
    """Request to create an MCP access token."""

    client_name: str = Field(default="MCP Client", max_length=128)
    requested_scopes: list[str] = Field(default_factory=list)
    # TTL in minutes, default 60, will be capped at 60 in endpoint
    ttl_minutes: int = Field(default=60, ge=1, le=120)


class MCPTokenRevoke(BaseModel):
    """Request to revoke an MCP token (for audit)."""

    reason: Optional[str] = Field(default=None, max_length=256)


# =============================================================================
# Response Schemas
# =============================================================================

class MCPTokenOut(BaseModel):
    """MCP token response without the actual token value (for listing)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    client_name: str
    client_origin: str
    scopes: list[str]
    created_at: datetime
    updated_at: datetime
    expires_at: datetime
    revoked_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None
    is_active: bool


class MCPTokenWithSecret(BaseModel):
    """MCP token response including the actual access token (only on creation)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    client_name: str
    client_origin: str
    scopes: list[str]
    expires_at: datetime
    expires_in: int  # seconds


class MCPTokenList(BaseModel):
    """List of MCP tokens for a user."""

    tokens: list[MCPTokenOut]
    total: int


# =============================================================================
# OAuth Protected Resource Metadata
# =============================================================================

class MCPProtectedResourceMetadata(BaseModel):
    """OAuth 2.0 Protected Resource Metadata for MCP endpoint.

    Defined in RFC 9728 (OAuth 2.0 Protected Resource Metadata).
    """

    resource: str
    authorization_servers: list[str]
    bearer_methods_supported: list[str] = ["header"]
    scopes_supported: list[str] = ALL_MCP_SCOPES
