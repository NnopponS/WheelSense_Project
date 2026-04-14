from __future__ import annotations

"""Compatibility wrapper for the WheelSense MCP server package."""

from app.mcp.server import (
    create_remote_mcp_app,
    execute_workspace_tool,
    get_system_health,
    mcp,
)

__all__ = ["mcp", "create_remote_mcp_app", "execute_workspace_tool", "get_system_health"]
