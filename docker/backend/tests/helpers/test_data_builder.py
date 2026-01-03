"""
Test data builder utilities.
"""

from typing import Dict, Any, Optional, List


class TestDataBuilder:
    """Helper class to build test data structures."""
    
    @staticmethod
    def create_user_info(
        name_english: str = "Test User",
        name_thai: str = "",
        condition: str = "",
        location: str = "bedroom"
    ) -> Dict[str, Any]:
        """Create user info dict."""
        return {
            "name_thai": name_thai,
            "name_english": name_english,
            "condition": condition,
            "current_location": location
        }
    
    @staticmethod
    def create_schedule_item(
        time: str,
        activity: str,
        location: Optional[str] = None,
        action: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Create schedule item dict."""
        item = {
            "time": time,
            "activity": activity
        }
        if location:
            item["location"] = location
        if action:
            item["action"] = action
        return item
    
    @staticmethod
    def create_appliance(
        room: str,
        appliance_type: str,
        name: str,
        state: bool = False,
        value: Optional[int] = None
    ) -> Dict[str, Any]:
        """Create appliance dict."""
        appliance = {
            "room": room,
            "type": appliance_type,
            "name": name,
            "state": 1 if state else 0,
            "isOn": 1 if state else 0
        }
        if value is not None:
            # Map value to appropriate field based on type
            if appliance_type == "light":
                appliance["brightness"] = value
            elif appliance_type == "AC":
                appliance["temperature"] = value
            elif appliance_type == "tv":
                appliance["volume"] = value
            elif appliance_type == "fan":
                appliance["speed"] = value
            else:
                appliance["value"] = value
        
        return appliance
    
    @staticmethod
    def create_device_action(
        room: str,
        device: str,
        state: bool
    ) -> Dict[str, Any]:
        """Create device action dict for schedule actions."""
        return {
            "room": room,
            "device": device,
            "state": state
        }
    
    @staticmethod
    def create_chat_message(role: str, content: str) -> Dict[str, Any]:
        """Create chat message dict."""
        return {
            "role": role,
            "content": content
        }
    
    @staticmethod
    def create_chat_request(messages: List[Dict[str, Any]], session_id: Optional[str] = None) -> Dict[str, Any]:
        """Create chat request dict."""
        return {
            "messages": messages,
            "session_id": session_id,
            "include_history": False
        }

