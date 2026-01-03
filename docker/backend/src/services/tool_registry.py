"""
Tool Registry for MCP-style tool execution.
Manages tool definitions and routes tool calls to handlers.
"""

import logging
import asyncio
import time
from typing import Dict, List, Callable, Any, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Phase 4F: Tool execution timeout limits
TOOL_EXECUTION_TIMEOUT = 5.0  # 5 seconds per tool
MAX_TOOL_CALLS_PER_REQUEST = 5  # Maximum tool calls per request
MAX_TOTAL_TOOL_TIME = 15.0  # 15 seconds cumulative limit


@dataclass
class ToolDefinition:
    """Definition of a tool for LLM consumption."""
    name: str
    description: str
    input_schema: Dict[str, Any]  # JSON Schema for arguments
    output_schema: Dict[str, Any]  # JSON Schema for result (optional, for documentation)


class ToolRegistry:
    """
    Registry for MCP-style tools.
    Manages tool definitions and routes tool calls to handlers.
    """
    
    def __init__(self, db, mqtt_handler):
        """
        Initialize tool registry.
        
        Args:
            db: Database instance
            mqtt_handler: MQTT handler instance
        """
        self.db = db
        self.mqtt_handler = mqtt_handler
        self._tools: Dict[str, ToolDefinition] = {}
        self._handlers: Dict[str, Callable] = {}
        
        logger.info("ToolRegistry initialized")
    
    def register_tool(self, tool_def: ToolDefinition, handler: Callable):
        """
        Register a tool with its handler.
        
        Args:
            tool_def: Tool definition
            handler: Async handler function that takes (db, mqtt_handler, arguments) and returns Dict
        """
        self._tools[tool_def.name] = tool_def
        self._handlers[tool_def.name] = handler
        logger.info(f"Registered tool: {tool_def.name}")
    
    def get_tools(self) -> List[Dict[str, Any]]:
        """
        Get list of all registered tools (for LLM system prompt).
        
        Returns:
            List of tool definitions in format suitable for LLM
        """
        tools = []
        for tool_name, tool_def in self._tools.items():
            tools.append({
                "name": tool_def.name,
                "description": tool_def.description,
                "input_schema": tool_def.input_schema
            })
        return tools
    
    def get_tool(self, tool_name: str) -> Optional[ToolDefinition]:
        """
        Get tool definition by name.
        
        Args:
            tool_name: Name of the tool
            
        Returns:
            ToolDefinition or None if not found
        """
        return self._tools.get(tool_name)
    
    async def call_tool(self, tool_name: str, arguments: Dict[str, Any], correlation_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Execute a tool call.
        
        Args:
            tool_name: Name of the tool to execute
            arguments: Tool arguments
            correlation_id: Optional correlation ID for request tracing (Phase 4F)
            
        Returns:
            Tool execution result with structure:
            {
                "success": bool,
                "tool": str,
                "message": str,
                "error": str (if success=False),
                ... (tool-specific fields)
            }
        """
        corr_id = correlation_id or "unknown"
        
        if tool_name not in self._tools:
            logger.warning(f"[{corr_id}] Unknown tool: {tool_name}", extra={
                "correlation_id": corr_id,
                "tool_name": tool_name,
                "available_tools": list(self._tools.keys())
            })
            return {
                "success": False,
                "tool": tool_name,
                "message": "",
                "error": f"Unknown tool: '{tool_name}'. Available tools: {list(self._tools.keys())}"
            }
        
        if tool_name not in self._handlers:
            logger.error(f"[{corr_id}] Tool '{tool_name}' registered but no handler found", extra={
                "correlation_id": corr_id,
                "tool_name": tool_name
            })
            return {
                "success": False,
                "tool": tool_name,
                "message": "",
                "error": f"Handler not found for tool: '{tool_name}'"
            }
        
        handler = self._handlers[tool_name]
        
        try:
            # Phase 4F: Add timeout to tool execution
            tool_start_time = time.time()
            try:
                result = await asyncio.wait_for(
                    handler(self.db, self.mqtt_handler, arguments),
                    timeout=TOOL_EXECUTION_TIMEOUT
                )
            except asyncio.TimeoutError:
                tool_duration = (time.time() - tool_start_time) * 1000
                logger.error(f"[{corr_id}] Tool '{tool_name}' execution timed out", extra={
                    "correlation_id": corr_id,
                    "tool": tool_name,
                    "timeout_seconds": TOOL_EXECUTION_TIMEOUT,
                    "duration_ms": round(tool_duration, 2)
                })
                return {
                    "success": False,
                    "tool": tool_name,
                    "message": "",
                    "error": f"Tool execution timed out after {TOOL_EXECUTION_TIMEOUT} seconds"
                }
            
            tool_duration = (time.time() - tool_start_time) * 1000
            
            # Ensure result has required fields
            if "success" not in result:
                result["success"] = True
            if "tool" not in result:
                result["tool"] = tool_name
            if "message" not in result:
                result["message"] = ""
            
            logger.info(f"[{corr_id}] Tool '{tool_name}' executed", extra={
                "correlation_id": corr_id,
                "tool": tool_name,
                "success": result.get("success"),
                "duration_ms": round(tool_duration, 2)
            })
            return result
            
        except Exception as e:
            tool_duration = (time.time() - tool_start_time) * 1000 if 'tool_start_time' in locals() else 0
            logger.error(f"[{corr_id}] Error executing tool '{tool_name}'", extra={
                "correlation_id": corr_id,
                "tool": tool_name,
                "error": str(e),
                "duration_ms": round(tool_duration, 2)
            }, exc_info=True)
            return {
                "success": False,
                "tool": tool_name,
                "message": "",
                "error": f"Tool execution error: {str(e)}"
            }

