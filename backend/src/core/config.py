"""
WheelSense v2.0 Configuration
Environment variables and settings
"""

from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    """Application settings loaded from environment"""
    
    # Database (PostgreSQL)
    DATABASE_URL: str = "postgresql://wheelsense:wheelsense@localhost:5432/wheelsense"
    
    # MQTT Configuration
    MQTT_BROKER: str = os.getenv("MQTT_BROKER", "localhost")
    MQTT_PORT: int = int(os.getenv("MQTT_PORT", "1883"))
    MQTT_TOPIC: str = os.getenv("MQTT_TOPIC", "WheelSense/data")
    MQTT_USER: Optional[str] = os.getenv("MQTT_USER")
    MQTT_PASSWORD: Optional[str] = os.getenv("MQTT_PASSWORD")
    
    # Home Assistant
    HA_URL: str = os.getenv("HA_URL", "http://localhost:8123")
    HA_TOKEN: Optional[str] = os.getenv("HA_TOKEN")
    
    # API Settings
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    
    # RSSI Fingerprinting Settings
    RSSI_THRESHOLD: int = -100  # Ignore nodes with RSSI below this
    NODE_TIMEOUT_SECONDS: int = 30  # Mark node as offline after this
    STALE_DATA_SECONDS: int = 30  # Mark wheelchair data as stale after this
    
    # Ollama AI (for AI Chat with MCP tool calling)
    OLLAMA_HOST: str = os.getenv("OLLAMA_HOST", "http://localhost:11434")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
