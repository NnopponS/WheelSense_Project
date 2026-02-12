"""
MCP Execution Router - WheelSense v2.0
Dispatches LLM tool calls to tool registry handlers.
"""

import logging
from typing import Dict, List, Optional, Any

logger = logging.getLogger(__name__)


class MCPRouter:
    """
    Routes LLM tool calls to the appropriate tool handlers via ToolRegistry.

    Accepts LLM response format:
    {"tool": "tool_name", "arguments": {...}}
    or array: [{"tool": "...", "arguments": {...}}, ...]
    """

    def __init__(self, tool_registry, mcp_server):
        self.tool_registry = tool_registry
        self.mcp_server = mcp_server

    async def execute(self, llm_response: Any, correlation_id: Optional[str] = None,
                      **context) -> Dict[str, Any]:
        """Execute tool call(s) from LLM response."""

        # Handle array of tool calls
        if isinstance(llm_response, list):
            if not llm_response:
                return {"success": False, "error": "Empty tool calls array", "tool": None}

            results = []
            for tool_call in llm_response:
                result = await self.execute(tool_call, correlation_id, **context)
                results.append(result)

            all_success = all(r.get("success", False) for r in results)
            return {
                "success": all_success,
                "tools": results,
                "tool": None,
                "error": None if all_success else "Some tool calls failed"
            }

        # Validate single tool call
        if not isinstance(llm_response, dict):
            return {"success": False, "error": "LLM response must be a dictionary", "tool": None}

        tool_name = llm_response.get("tool")
        arguments = llm_response.get("arguments", {})

        if not tool_name:
            return {"success": False, "error": "Missing 'tool' field", "tool": None}

        if not isinstance(arguments, dict):
            return {"success": False, "error": "Arguments must be a dictionary", "tool": tool_name}

        # Check if tool is registered
        tool_def = self.tool_registry.get_tool(tool_name)
        if not tool_def:
            available = [t["name"] for t in self.tool_registry.get_tools()]
            return {
                "success": False,
                "error": f"Unknown tool: '{tool_name}'. Available: {available}",
                "tool": tool_name
            }

        try:
            logger.debug(f"[{correlation_id or 'unknown'}] Routing '{tool_name}' with args: {arguments}")
            result = await self.tool_registry.call_tool(
                tool_name, arguments, correlation_id=correlation_id, **context
            )
            return result

        except Exception as e:
            logger.error(f"Tool execution error: {e}", exc_info=True)
            return {
                "success": False,
                "error": f"Tool execution error: {str(e)}",
                "tool": tool_name
            }

    async def execute_multiple(self, tool_calls: List[Dict[str, Any]],
                                correlation_id: Optional[str] = None,
                                **context) -> Dict[str, Any]:
        """Execute multiple tool calls in sequence."""
        if not tool_calls:
            return {"success": False, "error": "Empty tool calls list", "tool": None, "tools": []}

        results = []
        for tool_call in tool_calls:
            result = await self.execute(tool_call, correlation_id, **context)
            results.append(result)

        all_success = all(r.get("success", False) for r in results)
        return {
            "success": all_success,
            "tools": results,
            "tool": None,
            "error": None if all_success else "Some tool calls failed"
        }
