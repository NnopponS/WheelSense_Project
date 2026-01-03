"""
Context Builder for assembling minimal read-only context for LLM.
Phase 4A: Basic context only (user info, device states, schedule summary).
Phase 4C: Extended with conversation summary and chat history.
"""

import logging
from typing import Dict, List, Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class ContextBuilder:
    """
    Builds minimal context for LLM from database.
    Phase 4A: Read-only context, no tool execution hints.
    """
    
    # Token budget limits (approximate)
    MAX_USER_INFO_TOKENS = 50
    MAX_DEVICE_STATES_TOKENS = 100
    MAX_SCHEDULE_TOKENS = 150
    MAX_TOTAL_TOKENS = 300
    
    # Phase 4F: Hard character limits for context sections
    MAX_SYSTEM_PROMPT_CHARS = 2000
    MAX_CONVERSATION_SUMMARY_CHARS = 500
    MAX_SYSTEM_CONTEXT_CHARS = 1000
    MAX_CHAT_HISTORY_CHARS = 2500  # 5 messages × 500 chars
    MAX_RAG_CONTEXT_CHARS = 1500  # 3 chunks × 500 chars
    MAX_NOTIFICATION_CONTEXT_CHARS = 500
    
    def __init__(self):
        """Initialize context builder (stateless)."""
        pass
    
    async def build_context(self, db) -> str:
        """
        Assemble and format minimal context from database.
        
        Args:
            db: Database instance
            
        Returns:
            Formatted context string
        """
        try:
            user_summary = await self._get_user_summary(db)
            device_summary = await self._get_device_summary(db)
            schedule_summary = await self._get_schedule_summary(db)
            
            context = f"""=== USER INFORMATION ===
{user_summary}

=== DEVICE STATES ===
{device_summary}

=== UPCOMING SCHEDULE ===
{schedule_summary}"""
            
            return context
        except Exception as e:
            logger.error(f"Error building context: {e}")
            # Return minimal context on error
            return "=== USER INFORMATION ===\nInformation temporarily unavailable\n\n=== DEVICE STATES ===\nInformation temporarily unavailable\n\n=== UPCOMING SCHEDULE ===\nInformation temporarily unavailable"
    
    async def _get_user_summary(self, db) -> str:
        """
        Get user information summary.
        
        Args:
            db: Database instance
            
        Returns:
            Formatted user info string
        """
        try:
            user_info = await db.get_user_info()
            if not user_info:
                return "Name: Not set\nCurrent Location: Unknown\nHealth Condition: Not recorded"
            
            # Handle nested name structure from get_user_info()
            name_obj = user_info.get("name", {})
            if isinstance(name_obj, dict):
                name = name_obj.get("english", "") or name_obj.get("thai", "") or "Not set"
            else:
                # Fallback for direct name fields
                name = user_info.get("name_english", "") or user_info.get("name_thai", "") or "Not set"
            
            location = user_info.get("current_location", "Unknown")
            condition = user_info.get("condition", "")
            
            # Truncate condition to first 200 chars to stay within token budget
            if condition and len(condition) > 200:
                condition = condition[:200] + "..."
            
            return f"Name: {name}\nCurrent Location: {location}\nHealth Condition: {condition if condition else 'Not recorded'}"
        except Exception as e:
            logger.error(f"Error getting user summary: {e}")
            return "Name: Error loading\nCurrent Location: Error loading\nHealth Condition: Error loading"
    
    async def _get_device_summary(self, db) -> str:
        """
        Get device states summary.
        
        Args:
            db: Database instance
            
        Returns:
            Formatted device states string
        """
        try:
            all_states_dict = await db.get_all_device_states()
            if not all_states_dict:
                return "No device states available"
            
            # get_all_device_states returns Dict[str, Dict[str, bool]]
            # Convert to list format for processing
            all_states = []
            for room, devices in all_states_dict.items():
                for device, state in devices.items():
                    all_states.append({
                        "room": room,
                        "device": device,
                        "state": 1 if state else 0
                    })
            
            if not all_states:
                return "No device states available"
            
            # Group by room
            room_devices: Dict[str, List[Dict[str, Any]]] = {}
            for state in all_states:
                room = state.get("room", "Unknown")
                if room not in room_devices:
                    room_devices[room] = []
                room_devices[room].append(state)
            
            # Format by room
            lines = []
            # Standard room order for consistent output
            room_order = ["Bedroom", "Living Room", "Kitchen", "Bathroom"]
            
            # Add rooms in order, then any others
            for room in room_order:
                if room in room_devices:
                    device_list = self._format_room_devices(room_devices[room])
                    if device_list:
                        lines.append(f"{room}: {device_list}")
                    del room_devices[room]
            
            # Add any remaining rooms
            for room, devices in room_devices.items():
                device_list = self._format_room_devices(devices)
                if device_list:
                    lines.append(f"{room}: {device_list}")
            
            if not lines:
                return "No devices found"
            
            return "\n".join(lines)
        except Exception as e:
            logger.error(f"Error getting device summary: {e}")
            return "Error loading device states"
    
    def _format_room_devices(self, devices: List[Dict[str, Any]]) -> str:
        """
        Format device list for a room.
        
        Args:
            devices: List of device state dicts
            
        Returns:
            Formatted string like "Light=ON, AC=OFF, TV=ON"
        """
        device_parts = []
        for device in devices:
            device_name = device.get("device", "")
            state = device.get("state", 0)
            state_str = "ON" if state else "OFF"
            device_parts.append(f"{device_name}={state_str}")
        
        return ", ".join(device_parts)
    
    async def _get_schedule_summary(self, db) -> str:
        """
        Get upcoming schedule items summary (next 5 items).
        
        Args:
            db: Database instance
            
        Returns:
            Formatted schedule string
        """
        try:
            # Get all schedule items - returns List[Dict[str, Any]]
            schedule_items = await db.get_schedule_items()
            
            if not schedule_items:
                return "No schedule items"
            
            # Sort by time
            sorted_items = sorted(schedule_items, key=lambda x: x.get("time", "99:99"))
            
            # Get next 5 items (or all if less than 5)
            next_items = sorted_items[:5]
            
            if not next_items:
                return "No upcoming activities"
            
            lines = []
            for item in next_items:
                time_str = item.get("time", "??:??")
                activity = item.get("activity", "Unknown activity")
                location = item.get("location", "")
                
                if location:
                    lines.append(f"{time_str} - {activity} ({location})")
                else:
                    lines.append(f"{time_str} - {activity}")
            
            return "\n".join(lines)
        except Exception as e:
            logger.error(f"Error getting schedule summary: {e}")
            return "Error loading schedule"
    
    async def build_full_context(
        self,
        db,
        include_summary: bool = True,
        include_history: bool = True,
        session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Build full context including conversation summary and chat history.
        Phase 4C: Extended context assembly.
        
        Args:
            db: Database instance
            include_summary: Whether to include conversation summary
            include_history: Whether to include chat history
            
        Returns:
            Dict with:
            - system_context: System state (user, devices, schedule)
            - conversation_summary: Optional summary text and key events
            - chat_history: Optional list of recent messages (last 5)
        """
        try:
            # Build system context (always included)
            system_context = await self.build_context(db)
            
            # Load conversation summary (if requested)
            conversation_summary = None
            if include_summary:
                try:
                    summary_data = await db.get_conversation_summary()
                    if summary_data and summary_data.get("summary_text"):
                        conversation_summary = summary_data
                except Exception as e:
                    logger.warning(f"Failed to load conversation summary: {e}")
                    conversation_summary = None
            
            # Load chat history (if requested)
            chat_history = []
            if include_history:
                try:
                    history_messages = await db.get_recent_chat_history(limit=5, session_id=session_id)
                    # Filter out notifications and preference updates for LLM context
                    chat_history = [
                        msg for msg in history_messages
                        if not msg.get("is_notification", False)
                        and not msg.get("is_preference_update", False)
                    ]
                except Exception as e:
                    logger.warning(f"Failed to load chat history: {e}")
                    chat_history = []
            
            return {
                "system_context": system_context,
                "conversation_summary": conversation_summary,
                "chat_history": chat_history
            }
        except Exception as e:
            logger.error(f"Error building full context: {e}")
            # Return minimal context on error
            return {
                "system_context": "Error loading context",
                "conversation_summary": None,
                "chat_history": []
            }
    
    def enforce_context_limits(
        self,
        system_prompt: str,
        system_context: str,
        conversation_summary: Optional[Dict[str, Any]],
        chat_history: List[Dict[str, Any]],
        rag_context: Optional[str] = None,
        notification_context: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Enforce hard character limits on context sections before sending to LLM.
        Phase 4F: Prevents unbounded context growth.
        
        Args:
            system_prompt: System prompt string
            system_context: System context string
            conversation_summary: Optional conversation summary dict
            chat_history: List of chat history messages
            rag_context: Optional RAG context string
            notification_context: Optional notification context string
            
        Returns:
            Dict with truncated sections and truncation warnings:
            {
                "system_prompt": str (truncated if needed),
                "system_context": str (truncated if needed),
                "conversation_summary": Optional[Dict] (truncated if needed),
                "chat_history": List[Dict] (truncated if needed),
                "rag_context": Optional[str] (truncated if needed),
                "notification_context": Optional[str] (truncated if needed),
                "warnings": List[str] (truncation warnings)
            }
        """
        warnings = []
        
        # Truncate system prompt
        if len(system_prompt) > self.MAX_SYSTEM_PROMPT_CHARS:
            warnings.append(f"System prompt truncated from {len(system_prompt)} to {self.MAX_SYSTEM_PROMPT_CHARS} chars")
            system_prompt = system_prompt[:self.MAX_SYSTEM_PROMPT_CHARS] + "..."
        
        # Truncate system context
        if len(system_context) > self.MAX_SYSTEM_CONTEXT_CHARS:
            warnings.append(f"System context truncated from {len(system_context)} to {self.MAX_SYSTEM_CONTEXT_CHARS} chars")
            system_context = system_context[:self.MAX_SYSTEM_CONTEXT_CHARS] + "..."
        
        # Truncate conversation summary
        if conversation_summary and conversation_summary.get("summary_text"):
            summary_text = conversation_summary.get("summary_text", "")
            if len(summary_text) > self.MAX_CONVERSATION_SUMMARY_CHARS:
                warnings.append(f"Conversation summary truncated from {len(summary_text)} to {self.MAX_CONVERSATION_SUMMARY_CHARS} chars")
                conversation_summary = conversation_summary.copy()
                conversation_summary["summary_text"] = summary_text[:self.MAX_CONVERSATION_SUMMARY_CHARS] + "..."
        
        # Truncate chat history
        total_history_chars = sum(len(str(msg.get("content", ""))) for msg in chat_history)
        if total_history_chars > self.MAX_CHAT_HISTORY_CHARS:
            warnings.append(f"Chat history truncated from {total_history_chars} to {self.MAX_CHAT_HISTORY_CHARS} chars")
            # Truncate from oldest messages first
            truncated_history = []
            remaining_chars = self.MAX_CHAT_HISTORY_CHARS
            for msg in reversed(chat_history):
                msg_content = str(msg.get("content", ""))
                if len(msg_content) <= remaining_chars:
                    truncated_history.insert(0, msg)
                    remaining_chars -= len(msg_content)
                else:
                    # Truncate this message
                    truncated_msg = msg.copy()
                    truncated_msg["content"] = msg_content[:remaining_chars] + "..."
                    truncated_history.insert(0, truncated_msg)
                    break
            chat_history = truncated_history
        
        # Truncate RAG context
        if rag_context and len(rag_context) > self.MAX_RAG_CONTEXT_CHARS:
            warnings.append(f"RAG context truncated from {len(rag_context)} to {self.MAX_RAG_CONTEXT_CHARS} chars")
            rag_context = rag_context[:self.MAX_RAG_CONTEXT_CHARS] + "..."
        
        # Truncate notification context
        if notification_context and len(notification_context) > self.MAX_NOTIFICATION_CONTEXT_CHARS:
            warnings.append(f"Notification context truncated from {len(notification_context)} to {self.MAX_NOTIFICATION_CONTEXT_CHARS} chars")
            notification_context = notification_context[:self.MAX_NOTIFICATION_CONTEXT_CHARS] + "..."
        
        # Log warnings if any truncation occurred
        if warnings:
            logger.warning(f"Context truncation occurred: {len(warnings)} section(s) truncated", extra={
                "warnings": warnings
            })
        
        return {
            "system_prompt": system_prompt,
            "system_context": system_context,
            "conversation_summary": conversation_summary,
            "chat_history": chat_history,
            "rag_context": rag_context,
            "notification_context": notification_context,
            "warnings": warnings
        }
    
    def format_conversation_summary(self, summary: Optional[Dict[str, Any]]) -> str:
        """
        Format conversation summary for inclusion in system prompt.
        
        Args:
            summary: Conversation summary dict from database
            
        Returns:
            Formatted summary string, or empty string if no summary
        """
        if not summary or not summary.get("summary_text"):
            return ""
        
        summary_text = summary.get("summary_text", "")
        key_events = summary.get("key_events", [])
        
        # Build summary section
        summary_section = f"=== PREVIOUS CONVERSATION SUMMARY ===\n{summary_text}"
        
        # Add recent key events (last 5)
        if key_events:
            events_text = "\n".join([
                f"- {event.get('type', 'event')}: {event.get('summary', '')[:80]}"
                for event in key_events[-5:]
            ])
            summary_section += f"\n\nRecent Key Events:\n{events_text}"
        
        return summary_section
    
    def format_rag_context(self, rag_context: Optional[Dict[str, Any]]) -> str:
        """
        Format RAG context for injection into system prompt.
        Phase 4D: Formats retrieved health knowledge chunks.
        
        Args:
            rag_context: RAG context dict with "found" and "chunks" keys
            
        Returns:
            Formatted RAG context string, or empty string if no context
        """
        if not rag_context:
            return ""
        
        found = rag_context.get("found", False)
        chunks = rag_context.get("chunks", [])
        
        if not found or not chunks:
            return """=== HEALTH KNOWLEDGE CONTEXT (from RAG system) ===
No specific health knowledge was found for this query. Rely on your general knowledge,
but be cautious about providing health advice. Always recommend consulting healthcare professionals for medical concerns."""
        
        # Format chunks for LLM context (limit to top 3 chunks, truncate long chunks to 500 chars)
        chunk_texts = []
        max_chunks = 3  # Limit chunk count for performance
        max_chunk_length = 500  # Truncate long chunks
        
        for i, chunk in enumerate(chunks[:max_chunks], 1):
            chunk_text = chunk.get("text", "")
            score = chunk.get("score", 0.0)
            
            # Truncate if too long
            if len(chunk_text) > max_chunk_length:
                chunk_text = chunk_text[:max_chunk_length] + "..."
            
            chunk_texts.append(f"--- Knowledge Chunk {i} (Relevance Score: {score:.3f}) ---\n{chunk_text}")
        
        chunks_section = "\n\n".join(chunk_texts)
        
        return f"""=== HEALTH KNOWLEDGE CONTEXT (from RAG system) ===
The following health knowledge was retrieved for your reference.
CRITICAL: If this knowledge mentions wheelchair users or seated exercises, the user uses a wheelchair - use this knowledge directly.

{chunks_section}

IMPORTANT:
- Use this knowledge to provide accurate, safe health information based on the user's specific conditions (check USER INFORMATION section).
- If the knowledge mentions "wheelchair", "seated exercises", or "wheelchair users", incorporate these specific recommendations into your answer.
- Do NOT make medical diagnoses or provide treatment advice beyond general information.
- Always recommend consulting a healthcare professional for medical concerns.
- Prioritize user safety and match recommendations to ALL aspects of the user's condition."""

