"""
Chat API - LLM chat endpoint for Phase 4A.
Handles user messages, assembles context, calls LLM, and returns responses.
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
from datetime import datetime
import logging
import json
import uuid
import time

from ..dependencies import get_db
from ..services.llm_client import LLMClient
from ..services.context_builder import ContextBuilder
from ..services.summarization_service import SummarizationService
from ..services.message_summarizer import summarize_long_message, should_summarize_message
from ..services.health_query_detector import should_call_rag
from ..services.rag_retriever import get_rag_retriever
from ..core.config import settings
import asyncio

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Chat"])


class ChatMessage(BaseModel):
    role: str  # "user", "assistant", or "system"
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    session_id: Optional[str] = None  # Optional, for future multi-user support
    include_history: Optional[bool] = False  # Optional, default false for Phase 4A


class ChatResponse(BaseModel):
    response: str
    timestamp: str
    model: Optional[str] = None
    tokens_used: Optional[int] = None


def _build_system_prompt(tool_registry) -> str:
    """
    Build system prompt with tool definitions.
    
    Args:
        tool_registry: ToolRegistry instance
        
    Returns:
        System prompt string
    """
    base_prompt = """You are WheelSense, a helpful smart home assistant for wheelchair users.

You can:
- Answer questions about the user's current location and device states
- Provide information about upcoming schedule items
- Control devices (turn ON/OFF)
- Modify schedules (add, delete, change activities)
- Offer general assistance and conversation

OUTPUT FORMAT (CRITICAL):
- ALWAYS respond with valid JSON array: [{"tool": "...", "arguments": {...}}]
- CRITICAL: Output RAW JSON directly - NOT a string containing JSON
- NEVER wrap your response in quotes - the JSON must be directly parseable
- WRONG (string-wrapped): '["{"tool": "chat_message", "arguments": {"message": "Hello"}}"]'
- CORRECT (raw JSON): [{"tool": "chat_message", "arguments": {"message": "Hello"}}]
- NEVER output plain text, explanations, or raw JSON tool calls
- CRITICAL: For ANY device control action, you MUST call e_device_control tool. NEVER use chat_message to claim you turned something on/off without actually calling the tool.

TOOLS:"""
    
    if tool_registry:
        tools = tool_registry.get_tools()
        for tool in tools:
            base_prompt += f"\n\n{tool['name']}: {tool['description']}\n"
            base_prompt += f"Arguments: {json.dumps(tool['input_schema'], indent=2)}"
    
    base_prompt += """

EXAMPLES:
- "What devices are ON?" → [{"tool": "chat_message", "arguments": {"message": "[from state]"}}]
- "Turn on light" (Current Location: Bedroom) → [{"tool": "e_device_control", "arguments": {"room": "Bedroom", "device": "Light", "action": "ON"}}]
- "Add breakfast at 08:00" → [{"tool": "schedule_modifier", "arguments": {"modify_type": "add", "time": "08:00", "activity": "Breakfast"}}]

CRITICAL FORMAT REMINDER:
- Your response must be directly parseable as JSON - no quotes around it!"""
    
    return base_prompt


def _format_tool_response(tool_results: List[Dict[str, Any]]) -> str:
    """
    Format tool execution results into a user-friendly message.
    
    Args:
        tool_results: List of tool execution results
        
    Returns:
        Formatted message string
    """
    if not tool_results:
        return "I processed your request."
    
    messages = []
    errors = []
    
    for result in tool_results:
        if result.get("success"):
            message = result.get("message", "")
            if message:
                messages.append(message)
        else:
            error = result.get("error", "Unknown error")
            errors.append(error)
    
    # Combine messages
    if messages and not errors:
        return " ".join(messages)
    elif messages and errors:
        return f"{' '.join(messages)} However, I encountered some errors: {', '.join(errors)}"
    elif errors:
        return f"I encountered errors: {', '.join(errors)}"
    else:
        return "I processed your request."


def _build_notification_context(recent_notification: Dict[str, Any]) -> Optional[str]:
    """
    Build enhanced notification context for LLM when user is responding to a notification.
    
    Based on mcp_llm-wheelsense implementation with detailed instructions for handling
    notification responses, including support for multiple devices.
    
    Args:
        recent_notification: Dict with notification info:
            {
                "devices": [{"room": str, "device": str}, ...],  # List of devices
                "message": str,  # Notification message
                "type": str  # Optional: "house_check" or "schedule_notification"
            }
    
    Returns:
        Formatted notification context string for LLM, or None if invalid
    """
    if not recent_notification:
        return None
    
    notification_message = recent_notification.get('message', '')
    devices_list = recent_notification.get('devices', [])
    
    # Handle both list format and single device format (backward compatibility)
    if not devices_list:
        # Try old format with single room/device
        room = recent_notification.get('room')
        device = recent_notification.get('device')
        if room and device:
            devices_list = [{"room": room, "device": device}]
    
    if not devices_list:
        # No device information available
        return None
    
    # Build device list description and Python dict format for tool calls
    if len(devices_list) == 1:
        # Single device
        device_info = f"{devices_list[0]['room']} {devices_list[0]['device']}"
        devices_description = f"Device: {device_info}"
        devices_list_str = f"[{{'room': '{devices_list[0]['room']}', 'device': '{devices_list[0]['device']}'}}]"
    else:
        # Multiple devices
        device_names = [f"{d['room']} {d['device']}" for d in devices_list]
        devices_description = f"Devices: {', '.join(device_names)}"
        devices_list_str = "[" + ", ".join([f"{{'room': '{d['room']}', 'device': '{d['device']}'}}" for d in devices_list]) + "]"
    
    # Build enhanced notification context with detailed LLM instructions
    notification_context = f"""

IMPORTANT CONTEXT - USER RESPONDING TO NOTIFICATION (HIGHEST PRIORITY):
The user just received a notification about: {devices_description}
Notification message was: "{notification_message}"

CRITICAL PRIORITY RULES:
- This notification context OVERRIDES any older chat history patterns
- User can control these devices even though they're in different rooms (this is one of the 2 allowed ways to control other rooms)
- If user says "yes", "yeah", "sure", "okay", "turn them off" → IMMEDIATELY call e_device_control for ONLY the devices mentioned in this notification
- You MUST call e_device_control for EACH device in the list: {devices_list_str}
- DO NOT repeat actions from older chat history - ONLY respond to this notification
- If user says "no", "keep it on", "leave it on" → Use chat_message to acknowledge (preference will be set)
- DO NOT ask for clarification - if user says "yes", take action immediately for ALL devices in this notification
- Example: If notification mentions Bedroom Light, make 1 e_device_control call: [{{"tool": "e_device_control", "arguments": {{"room": "Bedroom", "device": "Light", "action": "OFF"}}}}]
"""
    
    return notification_context


async def process_notification_preference(
    user_message: str,
    recent_notification: Optional[Dict[str, Any]],
    db
) -> Dict[str, Any]:
    """
    Process user message to detect "leave it on" intent and update notification preferences.
    
    Based on mcp_llm-wheelsense implementation. Detects keywords indicating user wants
    to keep devices on and updates notification preferences accordingly.
    
    Args:
        user_message: User's response message
        recent_notification: Optional dict with recent notification info:
            {
                "devices": [{"room": str, "device": str}, ...],
                "message": str
            }
        db: Database instance
    
    Returns:
        dict with format:
        {
            "preference_updated": bool,
            "devices_updated": List[Dict[str, str]],  # List of {room, device} that were updated
            "message": str  # Acknowledgment message if updated
        }
    """
    if not user_message or not recent_notification:
        return {
            "preference_updated": False,
            "devices_updated": [],
            "message": ""
        }
    
    message_lower = user_message.lower().strip()
    
    # Keywords that indicate "leave it on" / "don't notify"
    leave_it_on_keywords = [
        "leave it on",
        "leave it",
        "that's fine",
        "thats fine",
        "it's fine",
        "its fine",
        "that's okay",
        "thats okay",
        "it's okay",
        "its okay",
        "don't worry",
        "dont worry",
        "no problem",
        "it's intentional",
        "its intentional",
        "keep it on",
        "keep on"
    ]
    
    # Check if message contains any "leave it on" keywords
    contains_leave_it_on = any(keyword in message_lower for keyword in leave_it_on_keywords)
    
    if not contains_leave_it_on:
        return {
            "preference_updated": False,
            "devices_updated": [],
            "message": ""
        }
    
    # Get devices from notification
    devices_list = recent_notification.get("devices", [])
    
    # Handle backward compatibility with single device format
    if not devices_list:
        room = recent_notification.get("room")
        device = recent_notification.get("device")
        if room and device:
            devices_list = [{"room": room, "device": device}]
    
    if not devices_list:
        return {
            "preference_updated": False,
            "devices_updated": [],
            "message": "I understand you want to leave something on, but I need more context about which device."
        }
    
    # Update preferences for all devices in the notification
    updated_devices = []
    for device_info in devices_list:
        room = device_info.get("room")
        device = device_info.get("device")
        
        if room and device:
            try:
                success = await db.set_notification_preference(room, device, do_not_notify=True)
                if success:
                    updated_devices.append({"room": room, "device": device})
                    logger.info(f"Updated notification preference: {room} {device} - do_not_notify=True")
            except Exception as e:
                logger.error(f"Failed to update notification preference for {room} {device}: {e}")
    
    if updated_devices:
        # Build acknowledgment message
        if len(updated_devices) == 1:
            device_desc = f"{updated_devices[0]['room']} {updated_devices[0]['device']}"
            message = f"Got it! I won't notify you about {device_desc} anymore."
        else:
            device_names = [f"{d['room']} {d['device']}" for d in updated_devices]
            devices_list_str = ", ".join(device_names[:-1]) + f", and {device_names[-1]}"
            message = f"Got it! I won't notify you about {devices_list_str} anymore."
        
        return {
            "preference_updated": True,
            "devices_updated": updated_devices,
            "message": message
        }
    
    return {
        "preference_updated": False,
        "devices_updated": [],
        "message": ""
    }


@router.post("/chat")
async def chat(request: ChatRequest, app_request: Request):
    """
    Handle chat requests with LLM and tool execution.
    Phase 4B: Supports tool execution.
    """
    db = get_db(app_request)
    
    # Get LLM client from app state
    llm_client: Optional[LLMClient] = getattr(app_request.app.state, 'llm_client', None)
    if not llm_client:
        raise HTTPException(
            status_code=503,
            detail="LLM service not available. Please ensure Ollama is running and configured."
        )
    
    # Get tool registry from app state
    tool_registry = getattr(app_request.app.state, 'tool_registry', None)
    
    # Validate request
    if not request.messages:
        raise HTTPException(status_code=400, detail="Messages list cannot be empty")
    
    # Extract user message (last message with role='user')
    user_message = None
    for msg in reversed(request.messages):
        if msg.role == "user":
            user_message = msg.content
            break
    
    if not user_message:
        raise HTTPException(status_code=400, detail="No user message found in messages")
    
    # Phase 4F: Generate correlation ID for request tracing
    correlation_id = f"chat_{uuid.uuid4().hex[:12]}"
    request_start_time = time.time()
    
    # Phase 4F: Increment metrics
    metrics = getattr(app_request.app.state, 'metrics', {})
    metrics["chat_requests_total"] = metrics.get("chat_requests_total", 0) + 1
    
    try:
        logger.info(f"[{correlation_id}] Chat request received", extra={
            "correlation_id": correlation_id,
            "message_length": len(user_message),
            "message_count": len(request.messages)
        })
        
        # Step 1: Save user message to chat history
        try:
            await db.save_chat_message({
                "role": "user",
                "content": user_message
            })
        except Exception as e:
            logger.warning(f"Failed to save user message to chat history: {e}")
            # Continue even if save fails
        
        # Step 2: Check summarization triggers (Phase 4C)
        turn_count = await db.get_turn_count()
        message_count = await db.get_chat_history_count()
        existing_summary = await db.get_conversation_summary()
        last_summarized_turn = existing_summary.get("last_summarized_turn", 0) if existing_summary else 0
        
        # Initialize summarization service if LLM client available
        summarization_service = None
        if llm_client:
            summarization_service = SummarizationService(llm_client, db)
        
        # Check if summarization should be triggered
        should_summarize_result = None
        if summarization_service:
            should_summarize_result = await summarization_service.should_summarize(
                message_count=message_count,
                turn_count=turn_count,
                last_summarized_turn=last_summarized_turn
            )
        
        # Perform summarization if triggered (synchronous for Phase 4C)
        if should_summarize_result and should_summarize_result.get("should_summarize"):
            try:
                logger.info(f"Triggering summarization: {should_summarize_result.get('trigger_type')}")
                
                # Get all messages
                all_messages = await db.get_recent_chat_history(limit=message_count)
                
                # Determine which messages to summarize
                messages_to_keep = should_summarize_result.get("messages_to_keep", 5)
                if len(all_messages) > messages_to_keep:
                    messages_to_summarize = all_messages[:-messages_to_keep]
                    
                    # Generate summary
                    new_summary = await summarization_service.summarize_conversation(
                        messages_to_summarize=messages_to_summarize,
                        existing_summary=existing_summary
                    )
                    
                    # Merge summaries
                    merged_summary = await summarization_service.merge_summaries(
                        existing_summary=existing_summary,
                        new_summary=new_summary,
                        current_turn=turn_count
                    )
                    
                    # Save to database
                    await db.save_conversation_summary(merged_summary)
                    logger.info("Conversation summary updated")
                    
                    # Update existing_summary for context assembly
                    existing_summary = merged_summary
                    
                    # Trim chat history if count-based trigger
                    if should_summarize_result.get("trigger_type") == "count":
                        # Keep only last N messages
                        # Note: We don't delete old messages in Phase 4C, just summarize them
                        # Actual deletion can be done in a future phase if needed
                        pass
                
            except Exception as e:
                logger.error(f"Summarization failed: {e}", exc_info=True)
                # Continue even if summarization fails
        
        # Step 3: Check for recent notification context (Phase 4E)
        recent_notification = getattr(app_request.app.state, 'recent_notification', None)
        
        # Step 4: Check if RAG should be called (Phase 4D)
        rag_context = None
        if settings.RAG_ENABLED:
            try:
                # Get user condition from database
                user_info = await db.get_user_info()
                user_condition = user_info.get("condition", "")
                
                # Get current activity (if available from schedule)
                # For Phase 4D, we'll use None - can be enhanced in future
                current_activity = None
                
                # Check if RAG should be called
                if should_call_rag(
                    user_message=user_message,
                    user_condition=user_condition,
                    chat_history=await db.get_recent_chat_history(limit=5),
                    current_activity=current_activity
                ):
                    logger.info("Health query detected, triggering RAG retrieval")
                    
                    # Start async RAG retrieval (non-blocking)
                    try:
                        rag_retriever = await get_rag_retriever(
                            embeddings_dir=None  # Use default from config
                        )
                        
                        if rag_retriever:
                            # Start retrieval task (non-blocking)
                            rag_task = asyncio.create_task(
                                rag_retriever.retrieve(
                                    query=user_message,
                                    user_condition=user_condition,
                                    top_k=3,
                                    threshold=0.5
                                )
                            )
                            
                            # Wait for RAG with 2 second timeout
                            try:
                                rag_result = await asyncio.wait_for(rag_task, timeout=2.0)
                                if rag_result.get("found"):
                                    rag_context = {
                                        "found": True,
                                        "chunks": rag_result.get("chunks", [])
                                    }
                                    logger.info(f"RAG completed: found {len(rag_result.get('chunks', []))} relevant chunk(s)")
                                else:
                                    rag_context = {"found": False}
                                    logger.info("RAG completed: no relevant results found")
                            except asyncio.TimeoutError:
                                logger.warning("RAG retrieval timed out after 2 seconds, proceeding without RAG context")
                                rag_context = None
                            except Exception as e:
                                logger.error(f"RAG retrieval error: {e}", exc_info=True)
                                rag_context = None
                        else:
                            logger.warning("RAG retriever not available, proceeding without RAG")
                            rag_context = None
                    except Exception as e:
                        logger.error(f"RAG initialization error: {e}", exc_info=True)
                        rag_context = None
                else:
                    logger.debug("Not a health query, skipping RAG")
            except Exception as e:
                logger.error(f"Error checking RAG: {e}", exc_info=True)
                rag_context = None
        
        # Step 5: Assemble full context (Phase 4C)
        context_builder = ContextBuilder()
        full_context = await context_builder.build_full_context(
            db,
            include_summary=True,
            include_history=True
        )
        
        system_context = full_context.get("system_context", "")
        conversation_summary = full_context.get("conversation_summary")
        chat_history = full_context.get("chat_history", [])
        
        # Step 6: Build system prompt with tool definitions
        system_prompt = _build_system_prompt(tool_registry)
        
        # Add conversation summary to system prompt if available
        if conversation_summary:
            summary_section = context_builder.format_conversation_summary(conversation_summary)
            if summary_section:
                system_prompt = f"{system_prompt}\n\n{summary_section}"
        
        # Add RAG context to system prompt if available (Phase 4D)
        rag_context_str = None
        if rag_context:
            rag_context_str = context_builder.format_rag_context(rag_context)
            if rag_context_str:
                system_prompt = f"{system_prompt}\n\n{rag_context_str}"

        # Phase 4E: Add notification context if user is responding to notification
        notification_context_str = None
        if recent_notification:
            notification_context_str = _build_notification_context(recent_notification)
            if notification_context_str:
                system_prompt = f"{system_prompt}\n\n{notification_context_str}"

        # Phase 4F: Enforce context size limits before LLM request
        enforced_context = context_builder.enforce_context_limits(
            system_prompt=system_prompt,
            system_context=system_context,
            conversation_summary=conversation_summary,
            chat_history=chat_history,
            rag_context=rag_context_str,
            notification_context=notification_context_str
        )
        
        # Use enforced (truncated) values
        system_prompt = enforced_context["system_prompt"]
        system_context = enforced_context["system_context"]
        conversation_summary = enforced_context["conversation_summary"]
        chat_history = enforced_context["chat_history"]
        
        if enforced_context["warnings"]:
            logger.warning(f"[{correlation_id}] Context truncation occurred", extra={
                "correlation_id": correlation_id,
                "warnings": enforced_context["warnings"]
            })
        
        # Step 7: Build LLM messages
        messages = [
            {
                "role": "system",
                "content": system_prompt
            }
        ]
        
        # Add system context
        messages.append({
            "role": "user",
            "content": f"=== CURRENT SYSTEM STATE ===\n{system_context}"
        })
        
        # Add chat history (last 5 messages, chronological order)
        for msg in chat_history:
            role = msg.get("role")
            content = msg.get("content", "")
            if role in ["user", "assistant"] and content:
                messages.append({
                    "role": role,
                    "content": content
                })
        
        # Add current user message
        messages.append({
            "role": "user",
            "content": user_message
        })
        
        # Phase 4F: Log context size before LLM request
        total_context_size = sum(len(str(msg.get("content", ""))) for msg in messages)
        system_prompt_size = len(system_prompt)
        system_context_size = len(system_context)
        chat_history_size = sum(len(str(msg.get("content", ""))) for msg in chat_history)
        rag_context_size = len(rag_context_str) if rag_context_str else 0
        
        logger.info(f"[{correlation_id}] LLM request prepared", extra={
            "correlation_id": correlation_id,
            "model": llm_client.model,
            "message_count": len(messages),
            "context_size_chars": total_context_size,
            "context_breakdown": {
                "system_prompt": system_prompt_size,
                "system_context": system_context_size,
                "chat_history": chat_history_size,
                "rag_context": rag_context_size
            }
        })
        
        # Step 7: Call LLM with process() method (includes tool call parsing)
        llm_start_time = time.time()
        tool_results = []
        final_response = ""
        
        try:
            llm_response = await llm_client.process(messages, stream=False, correlation_id=correlation_id)
            llm_duration = (time.time() - llm_start_time) * 1000
            logger.info(f"[{correlation_id}] LLM request completed", extra={
                "correlation_id": correlation_id,
                "duration_ms": round(llm_duration, 2),
                "has_tools": llm_response.get("tools") is not None,
                "has_content": llm_response.get("content") is not None
            })
        except Exception as e:
            llm_duration = (time.time() - llm_start_time) * 1000
            logger.error(f"[{correlation_id}] LLM process failed", extra={
                "correlation_id": correlation_id,
                "duration_ms": round(llm_duration, 2),
                "error": str(e)
            }, exc_info=True)
            # Return friendly error message
            error_response = "I'm having trouble connecting to the AI service. Please try again in a moment."
            
            # Save error response to chat history
            try:
                await db.save_chat_message({
                    "role": "assistant",
                    "content": error_response
                })
            except Exception as save_error:
                logger.warning(f"Failed to save error response to chat history: {save_error}")
            
            raise HTTPException(
                status_code=503,
                detail=f"Unable to connect to AI system: {str(e)}"
            )
        
        # Step 8: Handle structured LLM response (tools/content/error)
        if llm_response.get("error"):
            # LLM client encountered an error (already formatted as chat_message)
            error_content = llm_response.get("error", "An error occurred.")
            # Check if it's a structured error with a message
            if llm_response.get("tool") == "chat_message":
                error_message = llm_response.get("arguments", {}).get("message", error_content)
                final_response = error_message
            else:
                final_response = "I encountered an error processing your request. Please try again."
        elif llm_response.get("tools"):
            # Multiple tool calls detected - execute all of them
            if not tool_registry:
                logger.warning(f"[{correlation_id}] Tool calls detected but tool_registry is None")
                final_response = "I encountered an issue processing that request. Tool registry is not available."
            else:
                tool_calls = llm_response["tools"]
                
                # Phase 4F: Limit maximum tool calls per request (prevent infinite loops)
                max_tool_calls = 5
                if len(tool_calls) > max_tool_calls:
                    logger.warning(f"[{correlation_id}] Too many tool calls ({len(tool_calls)}), limiting to {max_tool_calls}", extra={
                        "correlation_id": correlation_id,
                        "tool_calls_count": len(tool_calls),
                        "max_allowed": max_tool_calls
                    })
                    tool_calls = tool_calls[:max_tool_calls]
                
                # Execute tools
                logger.info(f"[{correlation_id}] Executing {len(tool_calls)} tool call(s)", extra={
                    "correlation_id": correlation_id,
                    "tool_count": len(tool_calls)
                })
                
                tool_start_time = time.time()
                for idx, tool_call in enumerate(tool_calls):
                    tool_name = tool_call.get("tool")
                    tool_args = tool_call.get("arguments", {})
                    
                    tool_exec_start = time.time()
                    logger.info(f"[{correlation_id}] Executing tool {idx+1}/{len(tool_calls)}: {tool_name}", extra={
                        "correlation_id": correlation_id,
                        "tool_name": tool_name,
                        "tool_index": idx + 1,
                        "total_tools": len(tool_calls)
                    })
                    
                    result = await tool_registry.call_tool(tool_name, tool_args, correlation_id=correlation_id)
                    tool_exec_duration = (time.time() - tool_exec_start) * 1000
                    
                    # Phase 4F: Update metrics
                    metrics["tool_executions_total"] = metrics.get("tool_executions_total", 0) + 1
                    if not result.get("success"):
                        metrics["tool_errors_total"] = metrics.get("tool_errors_total", 0) + 1
                    
                    tool_results.append(result)
                    logger.info(f"[{correlation_id}] Tool execution completed", extra={
                        "correlation_id": correlation_id,
                        "tool": tool_name,
                        "success": result.get("success"),
                        "duration_ms": round(tool_exec_duration, 2),
                        "error": result.get("error")
                    })
                
                total_tool_duration = (time.time() - tool_start_time) * 1000
                logger.info(f"[{correlation_id}] All tool executions completed", extra={
                    "correlation_id": correlation_id,
                    "total_tools": len(tool_calls),
                    "total_duration_ms": round(total_tool_duration, 2),
                    "successful": sum(1 for r in tool_results if r.get("success")),
                    "failed": sum(1 for r in tool_results if not r.get("success"))
                })
                
                # Format response from tool results
                final_response = _format_tool_response(tool_results)
        elif llm_response.get("tool"):
            # Single tool call detected (backward compatibility)
            if not tool_registry:
                logger.warning(f"[{correlation_id}] Tool call detected but tool_registry is None")
                final_response = "I encountered an issue processing that request. Tool registry is not available."
            else:
                tool_name = llm_response["tool"]
                tool_args = llm_response.get("arguments", {})
                
                logger.info(f"[{correlation_id}] Executing single tool call: {tool_name}", extra={
                    "correlation_id": correlation_id,
                    "tool_name": tool_name
                })
                
                tool_start_time = time.time()
                result = await tool_registry.call_tool(tool_name, tool_args, correlation_id=correlation_id)
                tool_duration = (time.time() - tool_start_time) * 1000
                
                metrics["tool_executions_total"] = metrics.get("tool_executions_total", 0) + 1
                if not result.get("success"):
                    metrics["tool_errors_total"] = metrics.get("tool_errors_total", 0) + 1
                
                tool_results = [result]
                logger.info(f"[{correlation_id}] Tool execution completed", extra={
                    "correlation_id": correlation_id,
                    "tool": tool_name,
                    "success": result.get("success"),
                    "duration_ms": round(tool_duration, 2)
                })
                
                # Format response from tool result
                final_response = _format_tool_response(tool_results)
        elif llm_response.get("content"):
            # Regular chat response (no tool call)
            content = llm_response["content"]
            
            # SAFETY CHECK: Never display raw JSON tool calls to users
            content_lower = content.lower().strip()
            if (('"tool"' in content_lower or "'tool'" in content_lower) and 
                ('"arguments"' in content_lower or "'arguments'" in content_lower) and
                ('{' in content or '[' in content)):
                # This looks like a JSON tool call - don't show it to the user
                logger.warning(f"[{correlation_id}] Attempted to display JSON tool call as content: {content[:200]}")
                final_response = "I encountered an issue processing that request. Could you please try again?"
            else:
                final_response = content
        else:
            # Fallback - should not happen with proper process() implementation
            logger.warning(f"[{correlation_id}] LLM response missing expected fields: {llm_response.keys()}")
            final_response = "I'm not sure how to help with that. Please try again."
        
        # Step 9: Process notification preference if user is responding to notification
        preference_result = None
        if recent_notification:
            try:
                preference_result = await process_notification_preference(
                    user_message=user_message,
                    recent_notification=recent_notification,
                    db=db
                )
                
                if preference_result.get("preference_updated"):
                    logger.info(f"[{correlation_id}] Notification preference updated for {len(preference_result.get('devices_updated', []))} device(s)")
                    # If preference was updated, append acknowledgment to final response
                    pref_message = preference_result.get("message", "")
                    if pref_message:
                        # Add preference acknowledgment to response
                        if final_response:
                            final_response = f"{final_response} {pref_message}"
                        else:
                            final_response = pref_message
            except Exception as e:
                logger.error(f"[{correlation_id}] Error processing notification preference: {e}", exc_info=True)
                # Continue even if preference processing fails
            
            # Clear recent_notification from app.state after processing
            try:
                if hasattr(app_request.app.state, 'recent_notification'):
                    app_request.app.state.recent_notification = None
                    logger.debug(f"[{correlation_id}] Cleared recent_notification from app.state")
            except Exception as e:
                logger.warning(f"[{correlation_id}] Failed to clear recent_notification: {e}")
        
        # Step 10: Save assistant response to chat history (with long message handling)
        try:
            # Check if message needs summarization
            message_to_save = {
                "role": "assistant",
                "content": final_response,
                "tool_result": tool_results if tool_results else None
            }
            
            # Mark as preference update if one occurred
            if preference_result and preference_result.get("preference_updated"):
                message_to_save["is_preference_update"] = True
            
            # Summarize long messages
            if should_summarize_message(final_response):
                summarized_content = summarize_long_message(final_response)
                message_to_save["content"] = summarized_content
                message_to_save["content_full"] = final_response
            
            await db.save_chat_message(message_to_save)
        except Exception as e:
            logger.warning(f"Failed to save assistant response to chat history: {e}")
            # Continue even if save fails
        
        # Phase 4F: Log total request duration
        total_duration = (time.time() - request_start_time) * 1000
        logger.info(f"[{correlation_id}] Chat request completed", extra={
            "correlation_id": correlation_id,
            "total_duration_ms": round(total_duration, 2),
            "response_length": len(final_response)
        })
        
        # Step 11: Return response
        return ChatResponse(
            response=final_response,
            timestamp=datetime.now().isoformat(),
            model=llm_client.model
        )
        
    except HTTPException:
        raise
    except Exception as e:
        total_duration = (time.time() - request_start_time) * 1000 if 'request_start_time' in locals() else 0
        logger.error(f"[{correlation_id}] Unexpected error in chat endpoint", extra={
            "correlation_id": correlation_id,
            "duration_ms": round(total_duration, 2),
            "error": str(e)
        }, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred. Please try again."
        )


@router.get("/chat/health")
async def chat_health(app_request: Request):
    """
    Health check for chat service.
    Checks Ollama connection and model availability.
    """
    llm_client: Optional[LLMClient] = getattr(app_request.app.state, 'llm_client', None)
    if not llm_client:
        return {
            "status": "unavailable",
            "message": "LLM client not initialized",
            "ollama_accessible": False,
            "model_available": False
        }
    
    try:
        validation = await llm_client.validate_connection()
        return {
            "status": "available" if validation["valid"] else "unavailable",
            "message": validation["message"],
            "ollama_accessible": validation["ollama_accessible"],
            "model_available": validation["model_available"],
            "host": llm_client.host,
            "model": llm_client.model
        }
    except Exception as e:
        logger.error(f"Error checking chat health: {e}")
        return {
            "status": "error",
            "message": f"Error checking health: {str(e)}",
            "ollama_accessible": False,
            "model_available": False
        }


class ClearContextRequest(BaseModel):
    session_id: str


@router.post("/chat/clear-context")
async def clear_chat_context(request_body: ClearContextRequest, app_request: Request):
    """
    Clear chat history for a specific session.
    Used when user clicks "New Chat" button.
    """
    db = get_db(app_request)
    
    try:
        deleted_count = await db.clear_chat_history_for_session(request_body.session_id)
        
        return {
            "status": "success",
            "session_id": request_body.session_id,
            "deleted_messages": deleted_count
        }
    except Exception as e:
        logger.error(f"Failed to clear chat context: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to clear chat context: {str(e)}"
        )

