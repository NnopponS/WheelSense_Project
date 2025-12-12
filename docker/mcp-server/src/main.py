"""
WheelSense MCP Server - Main Application
Model Context Protocol server for Local LLM integration
"""

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import settings
from .llm_client import OllamaClient
from .tools import ToolRegistry
from .mqtt_client import MQTTClient

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global instances
llm_client: Optional[OllamaClient] = None
tool_registry: Optional[ToolRegistry] = None
mqtt_client: Optional[MQTTClient] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle management."""
    global llm_client, tool_registry, mqtt_client
    
    logger.info("🚀 Starting WheelSense MCP Server...")
    
    # Initialize MQTT client
    mqtt_client = MQTTClient(
        broker=settings.MQTT_BROKER,
        port=settings.MQTT_PORT
    )
    await mqtt_client.connect()
    logger.info("✅ MQTT connected")
    
    # Initialize LLM client
    llm_client = OllamaClient(
        host=settings.OLLAMA_HOST,
        model=settings.OLLAMA_MODEL
    )
    logger.info("✅ LLM client initialized")
    
    # Initialize tool registry
    tool_registry = ToolRegistry(mqtt_client)
    logger.info("✅ Tool registry initialized")
    
    yield
    
    # Cleanup
    logger.info("🛑 Shutting down...")
    if mqtt_client:
        await mqtt_client.disconnect()


app = FastAPI(
    title="WheelSense MCP Server",
    description="Model Context Protocol server for smart home control",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== MCP Protocol Models ====================

class MCPRequest(BaseModel):
    """MCP request format."""
    jsonrpc: str = "2.0"
    method: str
    params: Optional[Dict[str, Any]] = None
    id: Optional[int] = None


class MCPResponse(BaseModel):
    """MCP response format."""
    jsonrpc: str = "2.0"
    result: Optional[Any] = None
    error: Optional[Dict[str, Any]] = None
    id: Optional[int] = None


class ChatMessage(BaseModel):
    """Chat message format."""
    role: str  # "user", "assistant", "system"
    content: str


class ChatRequest(BaseModel):
    """Chat request format."""
    messages: List[ChatMessage]
    tools: Optional[List[str]] = None
    stream: bool = False


# ==================== Health Check ====================

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    llm_available = False
    
    if llm_client:
        llm_available = await llm_client.check_health()
    
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "services": {
            "llm": llm_available,
            "mqtt": mqtt_client.is_connected if mqtt_client else False
        }
    }


# ==================== MCP Protocol Endpoints ====================

@app.post("/mcp")
async def handle_mcp_request(request: MCPRequest) -> MCPResponse:
    """Handle MCP protocol requests."""
    method = request.method
    params = request.params or {}
    
    try:
        if method == "initialize":
            result = await handle_initialize(params)
        elif method == "tools/list":
            result = await handle_list_tools()
        elif method == "tools/call":
            result = await handle_call_tool(params)
        elif method == "prompts/list":
            result = await handle_list_prompts()
        elif method == "prompts/get":
            result = await handle_get_prompt(params)
        else:
            return MCPResponse(
                id=request.id,
                error={"code": -32601, "message": f"Method not found: {method}"}
            )
        
        return MCPResponse(id=request.id, result=result)
        
    except Exception as e:
        logger.error(f"MCP request error: {e}")
        return MCPResponse(
            id=request.id,
            error={"code": -32603, "message": str(e)}
        )


async def handle_initialize(params: Dict) -> Dict:
    """Handle MCP initialize request."""
    return {
        "protocolVersion": "1.0",
        "capabilities": {
            "tools": True,
            "prompts": True,
            "resources": False
        },
        "serverInfo": {
            "name": "wheelsense-mcp",
            "version": "1.0.0"
        }
    }


async def handle_list_tools() -> Dict:
    """Handle tools/list request."""
    tools = tool_registry.get_tools() if tool_registry else []
    return {"tools": tools}


async def handle_call_tool(params: Dict) -> Dict:
    """Handle tools/call request."""
    tool_name = params.get("name")
    tool_args = params.get("arguments", {})
    
    if not tool_registry:
        raise Exception("Tool registry not initialized")
    
    result = await tool_registry.call_tool(tool_name, tool_args)
    return {"content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False)}]}


async def handle_list_prompts() -> Dict:
    """Handle prompts/list request."""
    prompts = [
        {
            "name": "smart_home_assistant",
            "description": "ผู้ช่วยควบคุมบ้านอัจฉริยะสำหรับผู้ใช้รถเข็น",
            "arguments": []
        },
        {
            "name": "emergency_response",
            "description": "ระบบตอบสนองเหตุฉุกเฉิน",
            "arguments": [
                {"name": "event_type", "description": "ประเภทเหตุฉุกเฉิน", "required": True}
            ]
        }
    ]
    return {"prompts": prompts}


async def handle_get_prompt(params: Dict) -> Dict:
    """Handle prompts/get request."""
    prompt_name = params.get("name")
    args = params.get("arguments", {})
    
    prompts = {
        "smart_home_assistant": """คุณเป็นผู้ช่วยบ้านอัจฉริยะสำหรับผู้ใช้รถเข็น
คุณสามารถ:
- ควบคุมเครื่องใช้ไฟฟ้าในแต่ละห้อง (ไฟ, แอร์, พัดลม, ทีวี)
- ตรวจสอบตำแหน่งปัจจุบันของผู้ใช้
- แจ้งเตือนเหตุฉุกเฉิน
- ให้คำแนะนำเกี่ยวกับการใช้งานบ้านอัจฉริยะ

ห้องที่มีในบ้าน: ห้องนอน, ห้องน้ำ, ห้องครัว, ห้องนั่งเล่น

ตอบเป็นภาษาไทย กระชับ ชัดเจน""",
        
        "emergency_response": f"""เหตุฉุกเฉินประเภท: {args.get('event_type', 'ไม่ระบุ')}
กรุณาดำเนินการ:
1. แจ้งเตือนผู้ดูแล
2. เปิดไฟทุกห้อง
3. ปิดเครื่องใช้ไฟฟ้าที่อาจเป็นอันตราย
4. รอการยืนยันจากผู้ดูแล"""
    }
    
    content = prompts.get(prompt_name, "Prompt not found")
    return {
        "messages": [
            {"role": "system", "content": content}
        ]
    }


# ==================== Chat Endpoint ====================

@app.post("/chat")
async def chat(request: ChatRequest):
    """Handle chat requests with optional tool calling."""
    if not llm_client:
        raise HTTPException(status_code=503, detail="LLM not available")
    
    # Get available tools if requested
    available_tools = []
    if request.tools and tool_registry:
        all_tools = tool_registry.get_tools()
        available_tools = [t for t in all_tools if t["name"] in request.tools]
    
    # Build system message with tools info
    system_message = """คุณเป็นผู้ช่วยบ้านอัจฉริยะ WheelSense สำหรับผู้ใช้รถเข็น
ตอบเป็นภาษาไทย กระชับ ชัดเจน

"""
    
    if available_tools:
        system_message += "เครื่องมือที่สามารถใช้ได้:\n"
        for tool in available_tools:
            system_message += f"- {tool['name']}: {tool['description']}\n"
    
    # Convert messages
    messages = [{"role": "system", "content": system_message}]
    for msg in request.messages:
        messages.append({"role": msg.role, "content": msg.content})
    
    # Get LLM response
    try:
        response = await llm_client.chat(messages)
    except Exception as e:
        logger.error(f"LLM chat failed: {e}")
        # Return user-friendly error message
        raise HTTPException(
            status_code=503,
            detail=f"ไม่สามารถเชื่อมต่อกับระบบ AI ได้: {str(e)}"
        )
    
    # Check if response contains tool calls
    # (Simple pattern matching for demo - production would use structured output)
    tool_results = []
    if available_tools and ("เปิด" in response or "ปิด" in response):
        # Parse simple commands
        tool_results = await process_simple_commands(response)
    
    return {
        "response": response,
        "tool_results": tool_results,
        "timestamp": datetime.now().isoformat()
    }


async def process_simple_commands(text: str) -> List[Dict]:
    """Process simple Thai commands to tool calls."""
    results = []
    
    # Simple pattern matching for demo
    rooms_map = {
        "ห้องนอน": "bedroom",
        "ห้องน้ำ": "bathroom",
        "ห้องครัว": "kitchen",
        "ห้องนั่งเล่น": "livingroom"
    }
    
    appliances_map = {
        "ไฟ": "light",
        "หลอดไฟ": "light",
        "แอร์": "aircon",
        "พัดลม": "fan",
        "ทีวี": "tv"
    }
    
    for room_th, room_en in rooms_map.items():
        for appliance_th, appliance_en in appliances_map.items():
            if room_th in text and appliance_th in text:
                state = "เปิด" in text
                
                if tool_registry:
                    result = await tool_registry.call_tool(
                        "control_appliance",
                        {
                            "room": room_en,
                            "appliance": appliance_en,
                            "state": state
                        }
                    )
                    results.append(result)
    
    return results


# ==================== Direct Control Endpoints ====================

@app.post("/control/{room}/{appliance}")
async def control_appliance(room: str, appliance: str, state: bool):
    """Direct appliance control endpoint."""
    if not tool_registry:
        raise HTTPException(status_code=503, detail="Tool registry not available")
    
    result = await tool_registry.call_tool(
        "control_appliance",
        {"room": room, "appliance": appliance, "state": state}
    )
    
    return result


@app.get("/status")
async def get_all_status():
    """Get status of all rooms."""
    if not mqtt_client:
        raise HTTPException(status_code=503, detail="MQTT not available")
    
    return mqtt_client.get_all_room_status()


@app.get("/location")
async def get_user_location():
    """Get current user location."""
    if not mqtt_client:
        raise HTTPException(status_code=503, detail="MQTT not available")
    
    return mqtt_client.get_user_location()


# ==================== Main ====================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)

