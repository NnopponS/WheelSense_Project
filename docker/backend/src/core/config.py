"""
WheelSense Backend - Configuration
"""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Database
    SQLITE_DB_PATH: str = "data/wheelsense.db"
    
    # MQTT
    MQTT_BROKER: str = "localhost"
    MQTT_PORT: int = 1883
    MQTT_USER: Optional[str] = None
    MQTT_PASS: Optional[str] = None
    
    # AI Services
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-2.0-flash-exp"  # Gemini Flash model
    OLLAMA_HOST: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "qwen2.5:7b"  # Using qwen2.5:7b to match mcp_llm config
    
    # Application
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    
    # Emergency
    EMERGENCY_NOTIFICATION_URL: Optional[str] = None
    
    # RAG (Phase 4D)
    RAG_EMBEDDINGS_DIR: str = "rag/embeddings"  # Relative to backend root
    RAG_ENABLED: bool = True  # Feature flag to enable/disable RAG

    model_config = {
        "env_file": ".env",
        "case_sensitive": True
    }


settings = Settings()








