from __future__ import annotations

"""Compatibility wrapper for the WheelSense MCP server package."""

from app.mcp.server import (
    create_remote_mcp_app,
    execute_workspace_tool,
    get_system_health,
    mcp,
    mcp_streamable_http_session_lifespan,
)

__all__ = [
    "mcp",
    "create_remote_mcp_app",
    "execute_workspace_tool",
    "get_system_health",
    "mcp_streamable_http_session_lifespan",
]
