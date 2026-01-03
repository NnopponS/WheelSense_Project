"""
Summarization Service for conversation memory management.
Phase 4C: Handles conversation summarization and key events extraction.
"""

import logging
import json
from typing import Dict, List, Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

# Summarization thresholds
MAX_CHAT_HISTORY = 50  # Maximum messages to keep in chat_history
TURN_BASED_THRESHOLD = 10  # Summarize every N turns
TOKEN_ESTIMATE_PER_MESSAGE = 80  # Estimated tokens per message
TOKEN_THRESHOLD = 2000  # Token threshold for turn-based summarization


class SummarizationService:
    """
    Service for managing conversation summarization.
    """
    
    def __init__(self, llm_client, db):
        """
        Initialize summarization service.
        
        Args:
            llm_client: LLMClient instance for summary generation
            db: Database instance
        """
        self.llm_client = llm_client
        self.db = db
        logger.info("SummarizationService initialized")
    
    async def should_summarize(
        self,
        message_count: int,
        turn_count: int,
        last_summarized_turn: int
    ) -> Dict[str, Any]:
        """
        Check if summarization should be triggered.
        
        Args:
            message_count: Total number of messages in chat_history
            turn_count: Current turn count
            last_summarized_turn: Last turn when summarization occurred
            
        Returns:
            Dict with:
            - should_summarize: bool
            - trigger_type: str ("count" or "turn" or None)
            - messages_to_keep: int (how many recent messages to keep)
        """
        # Trigger 1: Message count threshold
        if message_count > MAX_CHAT_HISTORY:
            return {
                "should_summarize": True,
                "trigger_type": "count",
                "messages_to_keep": MAX_CHAT_HISTORY
            }
        
        # Trigger 2: Turn-based summarization
        turns_since_summary = turn_count - last_summarized_turn
        if turns_since_summary >= TURN_BASED_THRESHOLD:
            # Estimate tokens
            estimated_tokens = message_count * TOKEN_ESTIMATE_PER_MESSAGE
            if estimated_tokens > TOKEN_THRESHOLD and message_count > 5:
                return {
                    "should_summarize": True,
                    "trigger_type": "turn",
                    "messages_to_keep": 5
                }
        
        return {
            "should_summarize": False,
            "trigger_type": None,
            "messages_to_keep": message_count
        }
    
    def extract_key_events(self, messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Extract key events from messages (device controls, schedule changes, preferences).
        
        Args:
            messages: List of message dicts from chat_history
            
        Returns:
            List of key event dicts: [{"type": str, "summary": str}, ...]
        """
        key_events = []
        
        for msg in messages:
            # Try to extract from tool_result first (most reliable)
            tool_result = msg.get("tool_result")
            if tool_result:
                event = self._extract_event_from_tool_result(tool_result, msg)
                if event:
                    key_events.append(event)
                    continue
            
            # Fallback: Extract from message content
            content = msg.get("content", "").lower()
            if not content:
                continue
            
            # Device control events
            if "turned" in content or "turned on" in content or "turned off" in content:
                key_events.append({
                    "type": "device_control",
                    "summary": msg.get("content", "")[:100]
                })
            # Schedule changes
            elif any(word in content for word in ["schedule", "appointment", "meeting", "added", "changed", "deleted"]):
                key_events.append({
                    "type": "schedule_change",
                    "summary": msg.get("content", "")[:100]
                })
            # Preferences
            elif "preference" in content or "keep it on" in content:
                key_events.append({
                    "type": "preference_set",
                    "summary": msg.get("content", "")[:100]
                })
        
        return key_events
    
    def _extract_event_from_tool_result(
        self,
        tool_result: Any,
        message: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Extract key event from tool result.
        
        Args:
            tool_result: Tool result (may be dict, list, or JSON string)
            message: Full message dict
            
        Returns:
            Key event dict or None
        """
        try:
            # Handle JSON string
            if isinstance(tool_result, str):
                tool_result = json.loads(tool_result)
            
            # Handle list of tool results
            if isinstance(tool_result, list):
                if tool_result:
                    tool_result = tool_result[0]  # Take first result
            
            # Handle dict
            if isinstance(tool_result, dict):
                tool_name = tool_result.get("tool", "")
                
                if tool_name == "e_device_control":
                    room = tool_result.get("room", "")
                    device = tool_result.get("device", "")
                    action = tool_result.get("action", "")
                    return {
                        "type": "device_control",
                        "summary": f"Turned {action.lower()} {room} {device}"[:100]
                    }
                
                elif tool_name == "schedule_modifier":
                    modify_type = tool_result.get("modify_type", "")
                    time = tool_result.get("time", "")
                    activity = tool_result.get("activity", "")
                    return {
                        "type": "schedule_change",
                        "summary": f"{modify_type} schedule: {activity} at {time}"[:100]
                    }
                
                elif tool_name == "chat_message":
                    # Check if it's a preference-related message
                    message_content = message.get("content", "").lower()
                    if "preference" in message_content or "keep it on" in message_content:
                        return {
                            "type": "preference_set",
                            "summary": message.get("content", "")[:100]
                        }
        
        except (json.JSONDecodeError, TypeError, AttributeError) as e:
            logger.debug(f"Failed to extract event from tool_result: {e}")
        
        return None
    
    async def summarize_conversation(
        self,
        messages_to_summarize: List[Dict[str, Any]],
        existing_summary: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Summarize a list of conversation messages.
        
        Args:
            messages_to_summarize: Messages to summarize (older messages)
            existing_summary: Existing summary to merge with
            
        Returns:
            Updated summary dict:
            {
                "summary_text": str,
                "key_events": List[Dict],
                "last_summarized_turn": int
            }
        """
        if not messages_to_summarize:
            return existing_summary or {
                "last_summarized_turn": 0,
                "summary_text": "",
                "key_events": []
            }
        
        # Extract key events
        key_events = self.extract_key_events(messages_to_summarize)
        
        # Filter out notifications and preference updates for summarization
        conversation_messages = [
            msg for msg in messages_to_summarize
            if not msg.get("is_notification", False)
            and not msg.get("is_preference_update", False)
        ]
        
        if not conversation_messages:
            # No meaningful content to summarize
            return existing_summary or {
                "last_summarized_turn": 0,
                "summary_text": "",
                "key_events": key_events
            }
        
        # Format messages for summarization
        conversation_text = ""
        for msg in conversation_messages:
            role = msg.get("role", "unknown")
            content = msg.get("content", "")
            if content:
                conversation_text += f"{role.upper()}: {content}\n"
        
        # Truncate to 2000 chars for LLM input
        conversation_text = conversation_text[:2000]
        
        if not conversation_text.strip():
            return existing_summary or {
                "last_summarized_turn": 0,
                "summary_text": "",
                "key_events": key_events
            }
        
        # Generate summary using LLM
        summary_prompt = f"""Summarize this conversation focusing on:
- User preferences and important decisions
- Device control patterns
- Schedule changes
- Key information the user shared

Conversation:
{conversation_text}

Provide a concise summary (max 200 words):"""
        
        try:
            # Phase 4F: Add timeout for summarization (20 seconds)
            import asyncio
            try:
                summary_response = await asyncio.wait_for(
                    self.llm_client.chat(
                        [
                            {"role": "user", "content": summary_prompt}
                        ],
                        stream=False
                    ),
                    timeout=20.0  # 20 second timeout for summarization
                )
                summary_text = summary_response.strip() if isinstance(summary_response, str) else ""
            except asyncio.TimeoutError:
                logger.warning("LLM summarization timed out after 20 seconds, using fallback summary")
                # Fallback: create simple summary from key events
                summary_text = f"Previous conversation included: {len(key_events)} key events (device controls, schedule changes, preferences)."
        except Exception as e:
            logger.error(f"LLM summarization failed: {e}")
            # Fallback: create simple summary from key events
            summary_text = f"Previous conversation included: {len(key_events)} key events (device controls, schedule changes, preferences)."
        
        # Merge with existing summary
        if existing_summary and existing_summary.get("summary_text"):
            combined_summary = f"{existing_summary['summary_text']}\n\n{summary_text}"
            combined_events = existing_summary.get("key_events", []) + key_events
        else:
            combined_summary = summary_text
            combined_events = key_events
        
        # Limit summary size and events
        combined_summary = combined_summary[:500]  # Hard limit
        combined_events = combined_events[-20:]  # Keep last 20 events
        
        return {
            "last_summarized_turn": existing_summary.get("last_summarized_turn", 0) if existing_summary else 0,
            "summary_text": combined_summary,
            "key_events": combined_events
        }
    
    async def merge_summaries(
        self,
        existing_summary: Optional[Dict[str, Any]],
        new_summary: Dict[str, Any],
        current_turn: int
    ) -> Dict[str, Any]:
        """
        Merge new summary with existing summary.
        
        Args:
            existing_summary: Existing summary from database
            new_summary: Newly generated summary
            current_turn: Current turn count
            
        Returns:
            Merged summary dict
        """
        if not existing_summary:
            return {
                "last_summarized_turn": current_turn,
                "summary_text": new_summary.get("summary_text", "")[:500],
                "key_events": new_summary.get("key_events", [])[-20:]
            }
        
        # Combine summary texts
        existing_text = existing_summary.get("summary_text", "")
        new_text = new_summary.get("summary_text", "")
        combined_text = f"{existing_text}\n\n{new_text}" if existing_text else new_text
        
        # Combine key events
        existing_events = existing_summary.get("key_events", [])
        new_events = new_summary.get("key_events", [])
        combined_events = existing_events + new_events
        
        return {
            "last_summarized_turn": current_turn,
            "summary_text": combined_text[:500],  # Hard limit
            "key_events": combined_events[-20:]  # Keep last 20
        }

