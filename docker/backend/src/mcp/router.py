"""
MCP Execution Router - dispatches LLM tool calls to tool registry.
"""

import logging
from typing import Dict, List, Optional, Any

logger = logging.getLogger(__name__)


class MCPRouter:
    """
    Routes LLM tool calls to the appropriate tool handlers via ToolRegistry.
    
    Accepts LLM response format:
    {
        "tool": "tool_name",
        "arguments": {...}
    }
    or array of tool calls:
    [
        {"tool": "tool_name", "arguments": {...}},
        ...
    ]
    """
    
    def __init__(self, tool_registry, mcp_server):
        """
        Initialize router with tool registry and MCP server.
        
        Args:
            tool_registry: ToolRegistry instance to route calls to
            mcp_server: MCPServer instance for state operations
        """
        self.tool_registry = tool_registry
        self.mcp_server = mcp_server
    
    async def execute(self, llm_response: Dict[str, Any], user_message: str = None, correlation_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Execute a tool call from LLM response.
        
        Args:
            llm_response: Dict with format:
                {
                    "tool": str,  # Tool name
                    "arguments": dict  # Tool arguments
                }
                or array of tool calls:
                [
                    {"tool": str, "arguments": dict},
                    ...
                ]
            user_message: Optional user message for context (used by schedule_modifier)
            correlation_id: Optional correlation ID for request tracing
        
        Returns:
            dict: Tool execution result from tool registry
        """
        # Handle array of tool calls
        if isinstance(llm_response, list):
            if len(llm_response) == 0:
                return {
                    "success": False,
                    "error": "Empty tool calls array",
                    "tool": None
                }
            
            # Execute multiple tool calls sequentially
            results = []
            for tool_call in llm_response:
                result = await self.execute(tool_call, user_message, correlation_id)
                results.append(result)
            
            # Return combined result
            all_success = all(r.get("success", False) for r in results)
            return {
                "success": all_success,
                "tools": results,
                "tool": None,  # Multiple tools
                "error": None if all_success else "Some tool calls failed"
            }
        
        # Validate input format
        if not isinstance(llm_response, dict):
            logger.warning(f"[{correlation_id or 'unknown'}] Invalid LLM response format (not a dictionary)")
            return {
                "success": False,
                "error": "LLM response must be a dictionary",
                "tool": None
            }
        
        tool_name = llm_response.get("tool")
        arguments = llm_response.get("arguments", {})
        
        if not tool_name:
            logger.warning(f"[{correlation_id or 'unknown'}] Missing 'tool' field in LLM response")
            return {
                "success": False,
                "error": "Missing 'tool' field in LLM response",
                "tool": None
            }
        
        if not isinstance(arguments, dict):
            logger.warning(f"[{correlation_id or 'unknown'}] Invalid arguments format (not a dictionary) for tool: {tool_name}")
            return {
                "success": False,
                "error": "Arguments must be a dictionary",
                "tool": tool_name
            }
        
        # Check if tool is registered
        tool_def = self.tool_registry.get_tool(tool_name)
        if not tool_def:
            logger.warning(f"[{correlation_id or 'unknown'}] Unknown tool: '{tool_name}'. Available tools: {list(self.tool_registry.get_tools())}")
            return {
                "success": False,
                "error": f"Unknown tool: '{tool_name}'. Available tools: {[t['name'] for t in self.tool_registry.get_tools()]}",
                "tool": tool_name
            }
        
        try:
            logger.debug(f"[{correlation_id or 'unknown'}] Routing tool '{tool_name}' with arguments: {arguments}")
            
            # Execute tool via tool registry
            result = await self.tool_registry.call_tool(tool_name, arguments, correlation_id=correlation_id)
            
            logger.debug(f"[{correlation_id or 'unknown'}] Tool '{tool_name}' result: success={result.get('success')}")
            
            return result
            
        except Exception as e:
            logger.error(f"[{correlation_id or 'unknown'}] Tool execution error: {e}", exc_info=True)
            return {
                "success": False,
                "error": f"Tool execution error: {str(e)}",
                "tool": tool_name
            }
    
    async def execute_multiple(self, tool_calls: List[Dict[str, Any]], user_message: str = None, correlation_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Execute multiple tool calls in sequence.
        
        Args:
            tool_calls: List of tool call dicts: [{"tool": str, "arguments": dict}, ...]
            user_message: Optional user message for context
            correlation_id: Optional correlation ID for request tracing
        
        Returns:
            dict with combined results:
            {
                "success": bool,  # True if all succeeded
                "tools": list,    # List of individual tool results
                "tool": None,     # None for multiple tools
                "error": str or None
            }
        """
        if not tool_calls:
            return {
                "success": False,
                "error": "Empty tool calls list",
                "tool": None,
                "tools": []
            }
        
        results = []
        for tool_call in tool_calls:
            result = await self.execute(tool_call, user_message, correlation_id)
            results.append(result)
        
        # Check if all succeeded
        all_success = all(r.get("success", False) for r in results)
        
        return {
            "success": all_success,
            "tools": results,
            "tool": None,  # Multiple tools
            "error": None if all_success else "Some tool calls failed"
        }

