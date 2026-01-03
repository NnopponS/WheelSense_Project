"""
Mock MQTT client for testing.
"""

import json
from datetime import datetime
from typing import List, Dict, Any, Optional, Callable


class MockMQTTClient:
    """
    Mock MQTT client that captures published messages and simulates device responses.
    """
    
    def __init__(self):
        self.published_messages: List[Dict[str, Any]] = []
        self.subscribed_topics: List[str] = []
        self.is_connected = True
        self._on_message_callbacks: List[Callable] = []
        self._on_connect_callbacks: List[Callable] = []
    
    def publish(self, topic: str, payload: str) -> Any:
        """
        Capture published message.
        
        Args:
            topic: MQTT topic
            payload: Message payload (JSON string or dict)
            
        Returns:
            Mock result object with rc=0 (success)
        """
        try:
            payload_dict = json.loads(payload) if isinstance(payload, str) else payload
        except json.JSONDecodeError:
            payload_dict = payload
        
        self.published_messages.append({
            "topic": topic,
            "payload": payload_dict,
            "timestamp": datetime.now().isoformat()
        })
        
        # Return mock result object
        class MockResult:
            rc = 0  # Success
        
        return MockResult()
    
    def subscribe(self, topic: str):
        """Track subscribed topics."""
        if topic not in self.subscribed_topics:
            self.subscribed_topics.append(topic)
    
    def simulate_device_status(self, topic: str, payload: dict):
        """
        Simulate device publishing status.
        Calls registered on_message callbacks.
        
        Args:
            topic: MQTT topic
            payload: Status payload dict
        """
        for callback in self._on_message_callbacks:
            # Mock message object
            class MockMessage:
                topic = topic
                payload = json.dumps(payload).encode()
            
            try:
                callback(None, None, MockMessage())
            except Exception as e:
                print(f"Error in on_message callback: {e}")
    
    def register_on_message(self, callback: Callable):
        """Register on_message callback."""
        if callback not in self._on_message_callbacks:
            self._on_message_callbacks.append(callback)
    
    def register_on_connect(self, callback: Callable):
        """Register on_connect callback."""
        if callback not in self._on_connect_callbacks:
            self._on_connect_callbacks.append(callback)
    
    def clear_messages(self):
        """Clear captured messages."""
        self.published_messages.clear()
    
    def get_messages_for_topic(self, topic: str) -> List[Dict[str, Any]]:
        """Get all messages published to a specific topic."""
        return [msg for msg in self.published_messages if msg["topic"] == topic]

