"""
MCP Server implementation.
Wraps ToolRegistry and provides state management interface.
"""

import logging
from typing import Dict, Optional, Any

logger = logging.getLogger(__name__)


class MCPServer:
    """
    MCP Server that provides tools for the LLM to interact with the system.
    
    This server wraps the ToolRegistry and provides state management interface.
    Tools are executed via the ToolRegistry, while state operations use StateManager.
    """
    
    def __init__(self, tool_registry, state_manager):
        """
        Initialize MCP server with tool registry and state manager.
        
        Args:
            tool_registry: ToolRegistry instance for tool execution
            state_manager: StateManager instance for state operations
        """
        self.tool_registry = tool_registry
        self.state_manager = state_manager
    
    async def get_current_state(self, custom_date: str = None, current_activity: dict = None) -> dict:
        """
        Get the current system state for the LLM.
        
        Args:
            custom_date: Optional custom date string in YYYY-MM-DD format (for custom clock)
            current_activity: Optional dict with current activity context: {"activity": str, "time": str, "location": str or None}
        
        Returns:
            dict with structure:
            {
                "current_location": str,
                "devices": {room: {device: bool}},
                "do_not_remind": list[str],
                "notification_preferences": list[str],
                "user_info": dict,
                "today_active_schedule": list,
                "current_activity": dict or None
            }
        """
        # Cleanup old one-time events periodically
        await self.state_manager.cleanup_old_one_time_events()
        
        state_summary = await self.state_manager.get_state_summary(custom_date=custom_date)
        state_summary["current_activity"] = current_activity  # Add current activity to state
        return state_summary
    
    async def detect_potential_issues(self) -> list:
        """
        Detect situations where something might be "off" in the house.
        
        This identifies devices that are ON in rooms other than where the user is located.
        These may be unintended and worth notifying the user about.
        
        Returns:
            List of dictionaries with format:
            [
                {
                    "room": str,
                    "device": str,
                    "state": bool,
                    "user_location": str
                },
                ...
            ]
        """
        return await self.state_manager.detect_potential_issues()

