"""
Camera Service - Configuration
"""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # MQTT
    MQTT_BROKER: str = "mosquitto"
    MQTT_PORT: int = 1883
    MQTT_USER: Optional[str] = None
    MQTT_PASS: Optional[str] = None
    
    # WebSocket Backend URL (FastAPI endpoint)
    # Backend functionality is now provided by mcp-server
    WEBSOCKET_BACKEND_URL: str = "ws://backend:8000/ws/camera-service"
    
    # MQTT Topics (legacy - not used anymore, only for registration)
    MQTT_TOPIC_VIDEO: str = "WheelSenseMockup/video"
    MQTT_TOPIC_DETECTION: str = "WheelSenseMockup/detection"
    MQTT_TOPIC_CONTROL: str = "WheelSenseMockup/control"
    MQTT_TOPIC_STATUS: str = "WheelSenseMockup/status"
    
    # Device
    DEVICE_ID: str = "TSIM_004"
    
    # Detection
    DETECTION_METHOD: str = "yolo"  # Only YOLO supported (GPU accelerated)
    DETECTION_CONFIDENCE_THRESHOLD: float = 0.4  # Lowered to allow frontend slider filtering
    DETECTION_INTERVAL_SEC: float = 0.1  # Allow up to 10 FPS detection
    
    # YOLO Model Path
    YOLO_MODEL_PATH: str = "/app/models/yolov8-model/best.pt"
    
    # Preview Mode (for debugging - shows OpenCV window with detection visualization)
    ENABLE_PREVIEW: bool = False  # Set to True to enable preview window
    PREVIEW_WINDOW_NAME: str = "WheelSense YOLO Detection"
    
    model_config = {
        "env_file": ".env",
        "case_sensitive": True
    }


settings = Settings()
