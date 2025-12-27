"""
WheelSense Backend - Configuration
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
    
    # AI Services
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-2.0-flash-exp"  # Gemini Flash model
    OLLAMA_HOST: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "deepseek-r1:latest"
    
    # Application
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    
    # Emergency
    EMERGENCY_NOTIFICATION_URL: Optional[str] = None

    model_config = {
        "env_file": ".env",
        "case_sensitive": True
    }


settings = Settings()








