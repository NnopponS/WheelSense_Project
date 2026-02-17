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
    MQTT_BROKER: str = os.getenv("MQTT_BROKER", "broker.emqx.io")
    MQTT_PORT: int = int(os.getenv("MQTT_PORT", "1883"))
    MQTT_TOPIC: str = os.getenv("MQTT_TOPIC", "WheelSense/data")
    MQTT_USER: Optional[str] = os.getenv("MQTT_USER", "")
    MQTT_PASSWORD: Optional[str] = os.getenv("MQTT_PASSWORD", "")
    
    # Home Assistant
    HA_URL: str = os.getenv("HA_URL", "http://localhost:8123")
    HA_TOKEN: Optional[str] = os.getenv("HA_TOKEN")
    
    # API Settings
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    DEVICE_BACKEND_URL: str = os.getenv("DEVICE_BACKEND_URL", "").strip()
    DEVICE_SERVER_IP: str = os.getenv("DEVICE_SERVER_IP", "").strip()
    
    # RSSI Fingerprinting Settings
    RSSI_THRESHOLD: int = -100  # Ignore nodes with RSSI below this
    NODE_TIMEOUT_SECONDS: int = 30  # Mark node as offline after this
    STALE_DATA_SECONDS: int = 30  # Mark wheelchair data as stale after this
    WHEELCHAIR_OFFLINE_SECONDS: int = int(os.getenv("WHEELCHAIR_OFFLINE_SECONDS", "60"))
    CAMERA_OFFLINE_SECONDS: int = int(os.getenv("CAMERA_OFFLINE_SECONDS", "30"))

    # History sampling + retention
    HISTORY_SAMPLE_INTERVAL_SECONDS: int = int(os.getenv("HISTORY_SAMPLE_INTERVAL_SECONDS", "5"))
    HISTORY_RETENTION_DAYS: int = int(os.getenv("HISTORY_RETENTION_DAYS", "7"))
    HISTORY_RETENTION_AUTO_ENABLED: bool = os.getenv("HISTORY_RETENTION_AUTO_ENABLED", "false").lower() == "true"
    HISTORY_RETENTION_AUTO_INTERVAL_MINUTES: int = int(os.getenv("HISTORY_RETENTION_AUTO_INTERVAL_MINUTES", "360"))
    
    # Ollama AI (for AI Chat with MCP tool calling)
    OLLAMA_HOST: str = os.getenv("OLLAMA_HOST", "http://localhost:11434")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")
    OLLAMA_REQUEST_TIMEOUT_SECONDS: float = float(os.getenv("OLLAMA_REQUEST_TIMEOUT_SECONDS", "120"))
    OLLAMA_TEMPERATURE: float = float(os.getenv("OLLAMA_TEMPERATURE", "0.3"))
    OLLAMA_TOP_P: float = float(os.getenv("OLLAMA_TOP_P", "0.9"))
    OLLAMA_NUM_CTX: int = int(os.getenv("OLLAMA_NUM_CTX", "2048"))
    OLLAMA_NUM_PREDICT: int = int(os.getenv("OLLAMA_NUM_PREDICT", "256"))
    OLLAMA_KEEP_ALIVE: str = os.getenv("OLLAMA_KEEP_ALIVE", "30m")
    OLLAMA_RETRY_ATTEMPTS: int = int(os.getenv("OLLAMA_RETRY_ATTEMPTS", "2"))
    OLLAMA_RETRY_BACKOFF_SECONDS: float = float(os.getenv("OLLAMA_RETRY_BACKOFF_SECONDS", "1.5"))

    # Chat / prompt safety limits
    CHAT_MAX_USER_MESSAGE_CHARS: int = int(os.getenv("CHAT_MAX_USER_MESSAGE_CHARS", "2000"))
    LLM_MAX_CONTEXT_CHARS: int = int(os.getenv("LLM_MAX_CONTEXT_CHARS", "12000"))
    LLM_WARMUP_ON_STARTUP: bool = os.getenv("LLM_WARMUP_ON_STARTUP", "true").lower() == "true"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
