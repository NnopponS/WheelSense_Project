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
    
    # MQTT Topics
    MQTT_TOPIC_VIDEO: str = "WheelSenseMockup/video"
    MQTT_TOPIC_DETECTION: str = "WheelSenseMockup/detection"
    MQTT_TOPIC_CONTROL: str = "WheelSenseMockup/control"
    MQTT_TOPIC_STATUS: str = "WheelSenseMockup/status"
    
    # Device
    DEVICE_ID: str = "TSIM_001"
    
    # Detection
    DETECTION_CONFIDENCE_THRESHOLD: float = 0.5
    DETECTION_INTERVAL_SEC: float = 1.0
    
    model_config = {
        "env_file": ".env",
        "case_sensitive": True
    }


settings = Settings()
