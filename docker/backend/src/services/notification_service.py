"""
WheelSense Backend - Notification Service
Provides immediate WebSocket delivery for notifications while maintaining database persistence.
Similar to mcp_llm-wheelsense notification system approach.
"""

import logging
from typing import Callable, Dict, Any, List, Optional

logger = logging.getLogger(__name__)


class NotificationService:
    """
    Service that sends notifications via multiple channels:
    - Database persistence (for reliability and history)
    - WebSocket broadcasting (for immediate delivery)
    - Callback execution (for extensibility)
    """
    
    def __init__(self, db, mqtt_handler):
        """
        Initialize notification service.
        
        Args:
            db: Database instance
            mqtt_handler: MQTTHandler instance for WebSocket broadcasting
        """
        self.db = db
        self.mqtt_handler = mqtt_handler
        self._notification_callbacks: List[Callable[[str, Dict[str, Any]], None]] = []
    
    def add_notification_callback(self, callback: Callable[[str, Dict[str, Any]], None]) -> None:
        """
        Register a callback function to be called when a notification is sent.
        
        Args:
            callback: Function that takes (message: str, notification_data: dict) and handles the notification
        """
        self._notification_callbacks.append(callback)
        logger.debug(f"Added notification callback. Total callbacks: {len(self._notification_callbacks)}")
    
    async def send_notification(self, message: str, notification_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Send notification via multiple channels for reliability and immediate delivery.
        
        This method:
        1. Saves to database (for persistence and polling fallback)
        2. Broadcasts via WebSocket (for immediate delivery)
        3. Executes registered callbacks (for extensibility)
        
        Each channel fails independently - if one fails, others still work.
        
        Args:
            message: Notification message text
            notification_data: Additional notification data including:
                - devices: List of devices [{"room": str, "device": str}, ...]
                - type: Notification type (e.g., "house_check_notification")
                - Any other relevant data
        
        Returns:
            Dict with delivery status:
            {
                "database_saved": bool,
                "websocket_sent": bool,
                "callbacks_executed": int,
                "errors": List[str]
            }
        """
        result = {
            "database_saved": False,
            "websocket_sent": False,
            "callbacks_executed": 0,
            "errors": []
        }
        
        # Prepare notification content with emoji prefix
        notification_content = f"🔔 {message}"
        
        # 1. Save to database (for persistence and polling fallback)
        try:
            await self.db.save_chat_message({
                "role": "assistant",
                "content": notification_content,
                "is_notification": True,
                "notification_type": notification_data.get("type", "notification"),
                **{k: v for k, v in notification_data.items() if k != "type"}
            })
            result["database_saved"] = True
            logger.info(f"💬 Saved notification to database: {message}")
        except Exception as e:
            error_msg = f"Failed to save notification to database: {e}"
            result["errors"].append(error_msg)
            logger.error(f"❌ {error_msg}", exc_info=True)
        
        # 2. Broadcast via WebSocket (OPTIONAL - for immediate delivery, but not required)
        # Database has already been saved above, so WebSocket failure doesn't affect correctness
        try:
            if self.mqtt_handler:
                websocket_message = {
                    "type": "house_check_notification",
                    "message": message,
                    "content": notification_content,
                    "data": notification_data
                }
                await self.mqtt_handler._broadcast_ws(websocket_message)
                result["websocket_sent"] = True
                logger.debug(f"📡 Broadcast notification via WebSocket: {message}")
            else:
                logger.debug("MQTT handler not available, skipping WebSocket broadcast (optional)")
        except Exception as e:
            # WebSocket broadcast is optional - log but don't treat as error
            logger.debug(f"WebSocket broadcast failed (optional): {e}")
            # Don't add to errors list - WebSocket is optional
        
        # 3. Execute registered callbacks (for extensibility)
        for callback in self._notification_callbacks:
            try:
                callback(message, notification_data)
                result["callbacks_executed"] += 1
            except Exception as e:
                error_msg = f"Notification callback error: {e}"
                result["errors"].append(error_msg)
                logger.error(f"❌ {error_msg}", exc_info=True)
        
        if result["errors"]:
            logger.warning(f"Notification sent with {len(result['errors'])} error(s): {result['errors']}")
        else:
            logger.debug(f"Notification sent successfully via all channels")
        
        return result

