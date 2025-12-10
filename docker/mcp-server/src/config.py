"""
WheelSense MCP Server - Configuration
"""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Database
    MONGO_URI: str = "mongodb://admin:wheelsense123@localhost:27017/wheelsense?authSource=admin"
    
    # MQTT
    MQTT_BROKER: str = "localhost"
    MQTT_PORT: int = 1883
    MQTT_USER: Optional[str] = None
    MQTT_PASS: Optional[str] = None
    
    # Local LLM
    OLLAMA_HOST: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.2"
    
    # Server
    SERVER_HOST: str = "0.0.0.0"
    SERVER_PORT: int = 8080
    
    model_config = {
        "env_file": ".env",
        "case_sensitive": True
    }


settings = Settings()

