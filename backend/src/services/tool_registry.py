"""
Tool Registry for MCP-style tool execution - WheelSense v2.0
Manages tool definitions and routes tool calls to handlers.
"""

import logging
import asyncio
import time
from typing import Dict, List, Callable, Any, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)

TOOL_EXECUTION_TIMEOUT = 5.0
MAX_TOOL_CALLS_PER_REQUEST = 5


@dataclass
class ToolDefinition:
    """Definition of a tool for LLM consumption."""
    name: str
    description: str
    input_schema: Dict[str, Any]


class ToolRegistry:
    """Registry for MCP-style tools."""

    def __init__(self):
        self._tools: Dict[str, ToolDefinition] = {}
        self._handlers: Dict[str, Callable] = {}
        logger.info("ToolRegistry initialized")

    def register_tool(self, tool_def: ToolDefinition, handler: Callable):
        """Register a tool with its async handler."""
        self._tools[tool_def.name] = tool_def
        self._handlers[tool_def.name] = handler
        logger.info(f"Registered tool: {tool_def.name}")

    def get_tools(self) -> List[Dict[str, Any]]:
        """Get list of all registered tools (for LLM system prompt)."""
        return [
            {
                "name": td.name,
                "description": td.description,
                "input_schema": td.input_schema
            }
            for td in self._tools.values()
        ]

    def get_tool(self, tool_name: str) -> Optional[ToolDefinition]:
        """Get tool definition by name."""
        return self._tools.get(tool_name)

    async def call_tool(self, tool_name: str, arguments: Dict[str, Any],
                        correlation_id: Optional[str] = None, **context) -> Dict[str, Any]:
        """Execute a tool call with timeout."""
        corr_id = correlation_id or "unknown"

        if tool_name not in self._tools:
            return {
                "success": False, "tool": tool_name,
                "message": "", "error": f"Unknown tool: '{tool_name}'"
            }

        if tool_name not in self._handlers:
            return {
                "success": False, "tool": tool_name,
                "message": "", "error": f"Handler not found for tool: '{tool_name}'"
            }

        handler = self._handlers[tool_name]

        try:
            start = time.time()
            try:
                result = await asyncio.wait_for(
                    handler(arguments, **context),
                    timeout=TOOL_EXECUTION_TIMEOUT
                )
            except asyncio.TimeoutError:
                logger.error(f"[{corr_id}] Tool '{tool_name}' timed out")
                return {
                    "success": False, "tool": tool_name,
                    "message": "", "error": f"Tool timed out after {TOOL_EXECUTION_TIMEOUT}s"
                }

            duration_ms = (time.time() - start) * 1000

            # Ensure required fields
            result.setdefault("success", True)
            result.setdefault("tool", tool_name)
            result.setdefault("message", "")

            logger.info(f"[{corr_id}] Tool '{tool_name}' executed in {duration_ms:.0f}ms")
            return result

        except Exception as e:
            logger.error(f"[{corr_id}] Error executing tool '{tool_name}': {e}", exc_info=True)
            return {
                "success": False, "tool": tool_name,
                "message": "", "error": f"Tool execution error: {str(e)}"
            }
