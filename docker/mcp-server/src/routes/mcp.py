"""
MCP Protocol APIs - MCP protocol and chat endpoints
"""

from datetime import datetime
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
import logging

from ..dependencies import get_llm_client, get_tool_registry

logger = logging.getLogger(__name__)

router = APIRouter(tags=["MCP"])


class MCPRequest(BaseModel):
    jsonrpc: str = "2.0"
    id: int
    method: str
    params: Optional[Dict[str, Any]] = None


class MCPResponse(BaseModel):
    jsonrpc: str = "2.0"
    id: int
    result: Optional[Dict[str, Any]] = None
    error: Optional[Dict[str, Any]] = None


class ChatRequest(BaseModel):
    messages: List[Dict[str, str]]
    tools: Optional[List[str]] = None


@router.post("/mcp")
async def handle_mcp_request(request_body: MCPRequest, request: Request) -> MCPResponse:
    """Handle MCP protocol requests."""
    tool_registry = get_tool_registry(request)
    
    if not tool_registry:
        return MCPResponse(
            id=request_body.id,
            error={"code": -32603, "message": "Tool registry not initialized"}
        )
    
    method = request_body.method
    params = request_body.params or {}
    
    try:
        if method == "initialize":
            result = {
                "protocolVersion": "2024-11-05",
                "serverInfo": {
                    "name": "wheelsense-mcp-server",
                    "version": "1.0.0"
                },
                "capabilities": {
                    "tools": {}
                }
            }
        elif method == "tools/list":
            tools = tool_registry.get_tools()
            result = {"tools": tools}
        elif method == "tools/call":
            tool_name = params.get("name")
            arguments = params.get("arguments", {})
            result = await tool_registry.call_tool(tool_name, arguments)
        else:
            return MCPResponse(
                id=request_body.id,
                error={"code": -32601, "message": f"Method not found: {method}"}
            )
        
        return MCPResponse(id=request_body.id, result=result)
        
    except Exception as e:
        logger.error(f"MCP request error: {e}")
        return MCPResponse(
            id=request_body.id,
            error={"code": -32603, "message": str(e)}
        )


@router.post("/chat")
async def chat(request_body: ChatRequest, request: Request):
    """Handle chat requests with optional tool calling."""
    llm_client = get_llm_client(request)
    tool_registry = get_tool_registry(request)
    
    if not llm_client:
        raise HTTPException(status_code=503, detail="LLM not available")
    
    # Get available tools if requested
    available_tools = []
    if request_body.tools and tool_registry:
        all_tools = tool_registry.get_tools()
        available_tools = [t for t in all_tools if t["name"] in request_body.tools]
    
    # Build system message with tools info
    system_message = """You are WheelSense smart home assistant for wheelchair users.
Respond in English, concise and clear.

"""
    
    if available_tools:
        system_message += "Available tools:\n"
        for tool in available_tools:
            system_message += f"- {tool['name']}: {tool['description']}\n"
    
    # Convert messages
    messages = [{"role": "system", "content": system_message}]
    for msg in request_body.messages:
        messages.append({"role": msg["role"], "content": msg["content"]})
    
    # Get LLM response
    try:
        response = await llm_client.chat(messages)
    except Exception as e:
        logger.error(f"LLM chat failed: {e}")
        raise HTTPException(
            status_code=503,
            detail=f"Unable to connect to AI system: {str(e)}"
        )
    
    # Check if response contains tool calls (simple pattern matching)
    tool_results = []
    if available_tools and ("turn on" in response.lower() or "turn off" in response.lower()):
        text_lower = response.lower()
        rooms_map = {
            "bedroom": "bedroom",
            "bathroom": "bathroom",
            "kitchen": "kitchen",
            "living room": "livingroom",
            "livingroom": "livingroom"
        }
        appliances_map = {
            "light": "light",
            "lights": "light",
            "ac": "AC",
            "air conditioner": "AC",
            "fan": "fan",
            "tv": "tv",
            "television": "tv"
        }
        
        for room_name, room_en in rooms_map.items():
            for appliance_name, appliance_en in appliances_map.items():
                if room_name in text_lower and appliance_name in text_lower:
                    state = "turn on" in text_lower or "on" in text_lower
                    if tool_registry:
                        try:
                            result = await tool_registry.call_tool(
                                "control_appliance",
                                {"room": room_en, "appliance": appliance_en, "state": state}
                            )
                            tool_results.append(result)
                        except Exception as e:
                            logger.error(f"Tool call failed: {e}")
    
    return {
        "response": response,
        "tool_results": tool_results,
        "timestamp": datetime.now().isoformat()
    }
