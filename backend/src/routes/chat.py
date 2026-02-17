"""
WheelSense v2.0 - AI Chat Routes
AI-powered chat using Ollama LLM with MCP tool calling
"""

import logging
import json
import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from ..core.config import settings
from ..core.database import db
from ..core.homeassistant import ha_client
from ..services.llm_client import LLMClient
from ..services.tool_registry import ToolRegistry, ToolDefinition
from ..services.tool_handlers import (
    handle_chat_message, handle_device_control,
    handle_add_routine, handle_get_routines, handle_delete_routine,
    handle_get_system_state, handle_ha_get_states, handle_send_alert
)
from ..services.context_builder import ContextBuilder
from ..mcp.server import MCPServer
from ..mcp.router import MCPRouter

logger = logging.getLogger(__name__)

router = APIRouter()

# --- Globals initialized on startup ---
llm_client: Optional[LLMClient] = None
tool_registry: Optional[ToolRegistry] = None
mcp_server: Optional[MCPServer] = None
mcp_router: Optional[MCPRouter] = None
context_builder: Optional[ContextBuilder] = None


class ChatRequest(BaseModel):
    message: str
    patient_id: Optional[str] = None
    role: Optional[str] = "user"  # "admin" or "user"
    session_id: Optional[str] = None
    context: Optional[Dict[str, Any]] = None


class ChatResponse(BaseModel):
    response: str
    actions: List[Dict[str, Any]] = []
    context: Optional[Dict[str, Any]] = None


def initialize_ai():
    """Initialize AI components. Called from main.py lifespan."""
    global llm_client, tool_registry, mcp_server, mcp_router, context_builder

    # 1) LLM Client
    llm_client = LLMClient(
        host=settings.OLLAMA_HOST,
        model=settings.OLLAMA_MODEL,
        timeout_seconds=settings.OLLAMA_REQUEST_TIMEOUT_SECONDS,
        temperature=settings.OLLAMA_TEMPERATURE,
        top_p=settings.OLLAMA_TOP_P,
        num_ctx=settings.OLLAMA_NUM_CTX,
        num_predict=settings.OLLAMA_NUM_PREDICT,
        keep_alive=settings.OLLAMA_KEEP_ALIVE,
        retry_attempts=settings.OLLAMA_RETRY_ATTEMPTS,
        retry_backoff_seconds=settings.OLLAMA_RETRY_BACKOFF_SECONDS,
    )

    # 2) Tool Registry
    tool_registry = ToolRegistry()

    # ── chat_message ──
    tool_registry.register_tool(
        ToolDefinition(
            name="chat_message",
            description="Send a text message to the user. Use for informational responses, greetings, and general conversation.",
            input_schema={
                "type": "object",
                "properties": {
                    "message": {
                        "type": "string",
                        "description": "The message to send to the user"
                    }
                },
                "required": ["message"]
            }
        ),
        handle_chat_message
    )

    # ── device_control ──
    tool_registry.register_tool(
        ToolDefinition(
            name="device_control",
            description="Control a smart home appliance (turn on/off). Use when the user asks to control lights, AC, fans, TV, etc. This controls both the database state and the physical device via Home Assistant.",
            input_schema={
                "type": "object",
                "properties": {
                    "appliance_name": {
                        "type": "string",
                        "description": "Name of the appliance (e.g., 'Light', 'AC', 'Fan', 'TV')"
                    },
                    "room_name": {
                        "type": "string",
                        "description": "Name of the room (e.g., 'Bedroom', 'Living Room', 'Kitchen')"
                    },
                    "action": {
                        "type": "string",
                        "enum": ["ON", "OFF"],
                        "description": "Action to perform: 'ON' or 'OFF'"
                    }
                },
                "required": ["appliance_name", "room_name", "action"]
            }
        ),
        handle_device_control
    )

    # ── add_routine ──
    tool_registry.register_tool(
        ToolDefinition(
            name="add_routine",
            description="Add a new scheduled activity/routine. Use when the user wants to add, create, or schedule a new activity.",
            input_schema={
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Name of the activity (e.g., 'Lunch', 'Exercise', 'Medicine')"
                    },
                    "time": {
                        "type": "string",
                        "description": "Time in HH:MM format (e.g., '12:00', '08:30')"
                    },
                    "room_name": {
                        "type": "string",
                        "description": "Optional room name (e.g., 'Kitchen', 'Bedroom')"
                    },
                    "actions": {
                        "type": "array",
                        "description": "Optional list of device actions to trigger",
                        "items": {
                            "type": "object",
                            "properties": {
                                "device": {"type": "string"},
                                "state": {"type": "string", "enum": ["on", "off"]}
                            }
                        }
                    },
                    "days": {
                        "type": "array",
                        "description": "Days of the week (e.g., ['Mon','Tue','Wed']). Default: all days.",
                        "items": {"type": "string"}
                    }
                },
                "required": ["title", "time"]
            }
        ),
        handle_add_routine
    )

    # ── get_routines ──
    tool_registry.register_tool(
        ToolDefinition(
            name="get_routines",
            description="Get the current daily schedule/routines. Use when the user asks about their schedule, routine list, or daily activities.",
            input_schema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),
        handle_get_routines
    )

    # ── delete_routine ──
    tool_registry.register_tool(
        ToolDefinition(
            name="delete_routine",
            description="Delete an existing routine by title. Use when the user wants to remove or cancel a scheduled activity.",
            input_schema={
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Title/name of the routine to delete"
                    },
                    "time": {
                        "type": "string",
                        "description": "Optional time to disambiguate if multiple routines have the same title"
                    }
                },
                "required": ["title"]
            }
        ),
        handle_delete_routine
    )

    # ── get_system_state ──
    tool_registry.register_tool(
        ToolDefinition(
            name="get_system_state",
            description="Get comprehensive system state including all wheelchairs, rooms, appliances, patients, nodes, and Home Assistant entities. Use when you need an overview of the entire system.",
            input_schema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),
        handle_get_system_state
    )

    # ── ha_get_states ──
    tool_registry.register_tool(
        ToolDefinition(
            name="ha_get_states",
            description="Get live Home Assistant entity states. Optionally filter by entity_id. Use to check the real state of physical devices.",
            input_schema={
                "type": "object",
                "properties": {
                    "entity_id": {
                        "type": "string",
                        "description": "Optional specific entity ID (e.g., 'light.bedroom_light'). If omitted, returns all relevant entities."
                    }
                },
                "required": []
            }
        ),
        handle_ha_get_states
    )

    # ── send_alert ──
    tool_registry.register_tool(
        ToolDefinition(
            name="send_alert",
            description="Send an alert or notification. Use for emergency situations, warnings, or informational alerts. Types: 'emergency' (critical danger), 'warning' (potential issue), 'info' (general notification).",
            input_schema={
                "type": "object",
                "properties": {
                    "alert_type": {
                        "type": "string",
                        "enum": ["emergency", "warning", "info"],
                        "description": "Severity level of the alert"
                    },
                    "message": {
                        "type": "string",
                        "description": "Alert message content"
                    },
                    "patient_id": {
                        "type": "string",
                        "description": "Optional patient ID to target the alert to a specific patient"
                    }
                },
                "required": ["alert_type", "message"]
            }
        ),
        handle_send_alert
    )

    # 3) MCP Server & Router
    mcp_server = MCPServer(tool_registry)
    mcp_router = MCPRouter(tool_registry, mcp_server)

    # 4) Context Builder
    context_builder = ContextBuilder()

    logger.info(f"AI components initialized: {len(tool_registry.get_tools())} tools registered")


def _trim_context(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n\n[Context truncated for performance]"


def _build_system_prompt(tool_definitions: list, system_context: str) -> str:
    """Build the system prompt with tool definitions and context."""
    tools_json = json.dumps(tool_definitions, indent=2)

    return f"""You are WheelSense AI Assistant, a smart indoor positioning and home control system for wheelchair users.
You help control appliances, manage routines, provide health-related assistance, and ensure safety.

IMPORTANT: You MUST respond using ONLY JSON tool calls. Do NOT respond with plain text.

Available Tools:
{tools_json}

RESPONSE FORMAT:
You must ALWAYS respond with a JSON array of tool calls. Examples:

For informational responses:
[{{"tool": "chat_message", "arguments": {{"message": "Hello! How can I help you?"}}}}]

For device control:
[{{"tool": "device_control", "arguments": {{"appliance_name": "Light", "room_name": "Bedroom", "action": "ON"}}}}, {{"tool": "chat_message", "arguments": {{"message": "I've turned on the bedroom light for you."}}}}]

For adding a routine:
[{{"tool": "add_routine", "arguments": {{"title": "Lunch", "time": "12:00", "room_name": "Kitchen"}}}}, {{"tool": "chat_message", "arguments": {{"message": "I've added Lunch at 12:00."}}}}]

For deleting a routine:
[{{"tool": "delete_routine", "arguments": {{"title": "Exercise"}}}}, {{"tool": "chat_message", "arguments": {{"message": "I've removed the Exercise routine."}}}}]

For checking system state:
[{{"tool": "get_system_state", "arguments": {{}}}}, {{"tool": "chat_message", "arguments": {{"message": "Here's the current system overview."}}}}]

For checking HA devices:
[{{"tool": "ha_get_states", "arguments": {{}}}}, {{"tool": "chat_message", "arguments": {{"message": "Here are the current device states."}}}}]

For emergency alerts:
[{{"tool": "send_alert", "arguments": {{"alert_type": "emergency", "message": "Patient may have fallen - wheelchair stationary for 30+ minutes"}}}}, {{"tool": "chat_message", "arguments": {{"message": "I've sent an emergency alert."}}}}]

RULES:
1. ALWAYS respond with a JSON array of tool calls, never plain text.
2. For general conversation, use the "chat_message" tool.
3. For device control, use "device_control" AND include a chat_message confirming the action.
4. For schedule management, use "add_routine", "get_routines", or "delete_routine" AND include a chat_message.
5. If you detect safety concerns, proactively use "send_alert".
6. Respond in the same language as the user's message.
7. Be helpful, concise, and proactive about safety.

{system_context}"""


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Process chat message using Ollama LLM with MCP tool calling."""

    if not llm_client:
        return ChatResponse(
            response="AI is not initialized. Please restart the backend.",
            actions=[]
        )

    correlation_id = str(uuid.uuid4())[:8]

    try:
        user_message = (request.message or "").strip()
        if not user_message:
            return ChatResponse(response="Please provide a message.", actions=[])

        if len(user_message) > settings.CHAT_MAX_USER_MESSAGE_CHARS:
            user_message = user_message[: settings.CHAT_MAX_USER_MESSAGE_CHARS]

        session_id = (request.session_id or "").strip()
        if session_id:
            existing_session = await db.fetch_one(
                "SELECT id FROM ai_chat_sessions WHERE id = $1",
                (session_id,),
            )
            if not existing_session:
                title = (user_message[:48] or "New Chat").strip()
                await db.execute(
                    """
                    INSERT INTO ai_chat_sessions (id, patient_id, title, role)
                    VALUES ($1, $2, $3, $4)
                    """,
                    (session_id, request.patient_id, title, request.role or "user"),
                )

            await db.execute(
                """
                INSERT INTO ai_chat_messages (session_id, role, content, actions)
                VALUES ($1, 'user', $2, $3::jsonb)
                """,
                (session_id, user_message, "[]"),
            )
            await db.execute(
                "UPDATE ai_chat_sessions SET updated_at = NOW() WHERE id = $1",
                (session_id,),
            )

        # 1) Build system context (with HA integration and role-based scoping)
        system_context = await context_builder.build_context(
            db,
            ha_client=ha_client,
            patient_id=request.patient_id,
            role=request.role or "user"
        )
        system_context = _trim_context(system_context, settings.LLM_MAX_CONTEXT_CHARS)

        # 2) Build system prompt with tools
        tool_defs = mcp_server.get_tool_definitions()
        system_prompt = _build_system_prompt(tool_defs, system_context)

        # 3) Build messages
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ]

        # 4) Call LLM and parse tool calls
        llm_result = await llm_client.process(messages, correlation_id=correlation_id)

        # 5) Handle the result
        response_text = ""
        action_results = []

        if llm_result.get("tools"):
            for tool_call in llm_result["tools"]:
                tool_name = tool_call.get("tool")
                arguments = tool_call.get("arguments", {})

                if tool_name == "chat_message":
                    msg = arguments.get("message", "")
                    if msg:
                        response_text += msg + " "
                else:
                    # Execute tool via MCP router, passing mcp_server for state tools
                    result = await mcp_router.execute(
                        tool_call,
                        correlation_id=correlation_id,
                        db=db,
                        ha_client=ha_client,
                        mcp_server=mcp_server
                    )
                    action_results.append(result)

                    if result.get("success") and result.get("message"):
                        response_text += result["message"] + " "
                    elif not result.get("success"):
                        error_msg = result.get("error", "Unknown error")
                        response_text += f"Sorry, I couldn't do that: {error_msg} "

        elif llm_result.get("tool") == "chat_message":
            response_text = llm_result.get("arguments", {}).get("message", "")

        elif llm_result.get("content"):
            response_text = llm_result["content"]

        else:
            response_text = "I'm sorry, I couldn't process that. Please try again."

        if llm_result.get("error"):
            logger.warning(f"[{correlation_id}] LLM error: {llm_result['error']}")

        if session_id:
            await db.execute(
                """
                INSERT INTO ai_chat_messages (session_id, role, content, actions)
                VALUES ($1, 'assistant', $2, $3::jsonb)
                """,
                (session_id, response_text.strip(), json.dumps(action_results)),
            )
            await db.execute(
                "UPDATE ai_chat_sessions SET updated_at = NOW() WHERE id = $1",
                (session_id,),
            )

        return ChatResponse(
            response=response_text.strip(),
            actions=action_results,
            context={
                "patient_id": request.patient_id,
                "correlation_id": correlation_id,
                "session_id": session_id or None,
            }
        )

    except Exception as e:
        logger.error(f"[{correlation_id}] Chat error: {e}", exc_info=True)
        return ChatResponse(
            response=f"An error occurred: {str(e)}",
            actions=[]
        )


@router.get("/status")
async def chat_status():
    """Check AI chat status."""
    status = {
        "ollama_configured": bool(settings.OLLAMA_HOST),
        "ollama_model": settings.OLLAMA_MODEL,
        "ha_connected": ha_client.connected,
        "ai_initialized": llm_client is not None,
        "tools_registered": len(tool_registry.get_tools()) if tool_registry else 0,
    }

    if llm_client:
        validation = await llm_client.validate_connection()
        status.update({
            "ollama_accessible": validation.get("ollama_accessible", False),
            "model_available": validation.get("model_available", False),
            "ollama_message": validation.get("message", "")
        })

    return status


@router.get("/tools")
async def list_tools():
    """List all registered MCP tools."""
    if not tool_registry:
        return {"tools": []}
    return {"tools": tool_registry.get_tools()}


# ─── Chat Session Persistence ──────────────────────────────────

@router.post("/sessions")
async def create_session(data: dict = {}):
    """Create a new chat session."""
    session_id = str(uuid.uuid4())
    patient_id = data.get("patient_id")
    title = data.get("title", "New Chat")
    role = data.get("role", "user")

    try:
        await db.execute(
            """INSERT INTO ai_chat_sessions (id, patient_id, title, role)
               VALUES ($1, $2, $3, $4)""",
            (session_id, patient_id, title, role)
        )
        return {"session_id": session_id, "title": title}
    except Exception as e:
        logger.error(f"Error creating session: {e}", exc_info=True)
        return {"error": str(e)}


@router.get("/sessions")
async def list_sessions(patient_id: Optional[str] = None):
    """List chat sessions, optionally filtered by patient."""
    try:
        if patient_id:
            sessions = await db.fetch_all(
                """SELECT id, patient_id, title, role, created_at, updated_at
                   FROM ai_chat_sessions WHERE patient_id = $1
                   ORDER BY updated_at DESC""",
                (patient_id,)
            )
        else:
            sessions = await db.fetch_all(
                """SELECT id, patient_id, title, role, created_at, updated_at
                   FROM ai_chat_sessions ORDER BY updated_at DESC"""
            )
        return {"sessions": sessions}
    except Exception as e:
        logger.error(f"Error listing sessions: {e}", exc_info=True)
        return {"sessions": [], "error": str(e)}


@router.get("/sessions/{session_id}/messages")
async def get_session_messages(session_id: str):
    """Get message history for a chat session."""
    try:
        messages = await db.fetch_all(
            """SELECT id, role, content, actions, created_at
               FROM ai_chat_messages WHERE session_id = $1
               ORDER BY created_at ASC""",
            (session_id,)
        )

        for msg in messages:
            actions = msg.get("actions", [])
            if isinstance(actions, str):
                try:
                    msg["actions"] = json.loads(actions)
                except:
                    pass

        return {"session_id": session_id, "messages": messages}
    except Exception as e:
        logger.error(f"Error getting messages: {e}", exc_info=True)
        return {"session_id": session_id, "messages": [], "error": str(e)}


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a chat session and its messages (cascade)."""
    try:
        await db.execute(
            "DELETE FROM ai_chat_sessions WHERE id = $1", (session_id,)
        )
        return {"success": True}
    except Exception as e:
        logger.error(f"Error deleting session: {e}", exc_info=True)
        return {"success": False, "error": str(e)}
