"""
WebSocket test client for capturing real-time updates.
"""

import asyncio
import json
from typing import List, Dict, Any, Optional
from websockets.client import connect
from websockets.exceptions import ConnectionClosed


class WebSocketTestClient:
    """
    Test client for WebSocket connections that captures received messages.
    """
    
    def __init__(self, url: str):
        self.url = url
        self.messages: List[Dict[str, Any]] = []
        self.websocket = None
        self.connected = False
        self._receive_task: Optional[asyncio.Task] = None
    
    async def connect(self):
        """Connect to WebSocket endpoint."""
        try:
            self.websocket = await connect(self.url)
            self.connected = True
            # Start receiving messages
            self._receive_task = asyncio.create_task(self._receive_loop())
        except Exception as e:
            self.connected = False
            raise
    
    async def _receive_loop(self):
        """Continuously receive messages."""
        try:
            while self.connected:
                try:
                    message = await asyncio.wait_for(self.websocket.recv(), timeout=1.0)
                    data = json.loads(message)
                    self.messages.append({
                        "data": data,
                        "timestamp": asyncio.get_event_loop().time()
                    })
                except asyncio.TimeoutError:
                    continue
                except ConnectionClosed:
                    break
                except Exception as e:
                    print(f"Error receiving message: {e}")
                    break
        except Exception as e:
            print(f"Receive loop error: {e}")
    
    async def disconnect(self):
        """Disconnect from WebSocket."""
        self.connected = False
        if self._receive_task:
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass
        
        if self.websocket:
            await self.websocket.close()
    
    def get_messages_by_type(self, message_type: str) -> List[Dict[str, Any]]:
        """Get all messages of a specific type."""
        return [
            msg for msg in self.messages
            if msg.get("data", {}).get("type") == message_type
        ]
    
    def clear_messages(self):
        """Clear captured messages."""
        self.messages.clear()
    
    async def wait_for_message(self, message_type: str, timeout: float = 5.0) -> Optional[Dict[str, Any]]:
        """
        Wait for a message of specific type.
        
        Args:
            message_type: Type of message to wait for
            timeout: Maximum time to wait in seconds
            
        Returns:
            Message dict or None if timeout
        """
        start_time = asyncio.get_event_loop().time()
        
        while (asyncio.get_event_loop().time() - start_time) < timeout:
            # Check existing messages
            for msg in self.messages:
                if msg.get("data", {}).get("type") == message_type:
                    return msg
            
            # Wait a bit before checking again
            await asyncio.sleep(0.1)
        
        return None

