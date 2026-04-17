from __future__ import annotations

"""WheelSense Server — Configuration."""

import os
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_SECRET_KEY = "your-super-secret-key-that-should-be-replaced-in-prod"


def _default_agent_runtime_mcp_tool_transport() -> Literal["direct", "http", "asgi"]:
    """Under pytest, default to in-process ASGI MCP calls; otherwise use Streamable HTTP."""
    return "asgi" if os.environ.get("PYTEST_VERSION") else "http"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    database_url: str = "postgresql+asyncpg://wheelsense:wheelsense_dev@localhost:5432/wheelsense"
    database_url_sync: str = "postgresql://wheelsense:wheelsense_dev@localhost:5432/wheelsense"

    # MQTT
    mqtt_broker: str = "localhost"
    mqtt_port: int = 1883
    mqtt_user: str = ""
    mqtt_password: str = ""
    mqtt_tls: bool = False
    # When true, first WheelSense/data telemetry for an unknown device_id creates a registry row.
    # Workspace: MQTT_AUTO_REGISTER_WORKSPACE_ID if set, else the sole workspace when only one exists.
    mqtt_auto_register_devices: bool = True
    mqtt_auto_register_workspace_id: int | None = None
    # When true, BLE nodes seen in WheelSense/data rssi[] (WSN_* + MAC) get a registry row in the same workspace as the wheelchair.
    mqtt_auto_register_ble_nodes: bool = True
    # When true, camera /registration JSON with ble_mac matching a BLE_* stub renames that row to the camera device_id (CAM_*).
    mqtt_merge_ble_camera_by_mac: bool = True
    # Consecutive identical room predictions required before logging room_enter/room_exit (reduces RSSI/KNN flicker).
    room_timeline_stability_samples: int = 3

    # App
    app_name: str = "WheelSense Server"
    debug: bool = False

    # Environment mode: simulator | production
    # - simulator: Pre-populated with demo data, includes reset capability
    # - production: Clean database for real-world deployment
    env_mode: str = "production"

    # Auth (JWT)
    secret_key: str = DEFAULT_SECRET_KEY
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7

    # Bootstrap admin (local/dev only)
    bootstrap_admin_enabled: bool = True
    bootstrap_admin_username: str = "admin"
    bootstrap_admin_password: str = ""
    # When true and BOOTSTRAP_ADMIN_PASSWORD is set, re-hash password on startup if admin user exists.
    # Docker Compose enables this so login matches compose env after DB volume reuse.
    bootstrap_admin_sync_password: bool = False
    # Name of the demo workspace created by scripts/seed_demo.py (must match that script).
    bootstrap_demo_workspace_name: str = "WheelSense Demo Workspace"
    # When true and that workspace exists, point bootstrap admin at it so /admin sees seeded data.
    bootstrap_admin_attach_demo_workspace: bool = False

    # HomeAssistant
    ha_base_url: str = "http://localhost:8123"
    ha_access_token: str = ""

    # AI chat (Ollama + GitHub Copilot CLI)
    ai_provider: str = "ollama"  # ollama | copilot
    ai_default_model: str = "gemma4:e4b"
    ollama_base_url: str = "http://127.0.0.1:11434/v1"
    copilot_cli_url: str = ""  # e.g. copilot-cli:4321 or http://localhost:4321
    server_base_url: str = "http://127.0.0.1:8000"
    # Public web URL for mobile WebView (e.g. Cloudflare quick tunnel). Published to MQTT config when set.
    portal_base_url: str = ""
    agent_runtime_url: str = "http://127.0.0.1:8010"
    internal_service_secret: str = ""
    mcp_allowed_origins: str = ""
    mcp_require_origin: bool = False
    # How agent-runtime executes MCP tools: direct DB/service path, HTTP Streamable MCP, or ASGI in-process.
    agent_runtime_mcp_tool_transport: Literal["direct", "http", "asgi"] = Field(
        default_factory=_default_agent_runtime_mcp_tool_transport,
    )
    # Full URL to Streamable HTTP MCP endpoint (e.g. http://127.0.0.1:8000/mcp/mcp). Empty uses server_base_url.
    mcp_streamable_http_url: str = ""
    # Dangerous: runs arbitrary Python with server env (incl. DB URL). Off by default; EaseAI never exposes this tool.
    mcp_allow_execute_python: bool = False

    # Agent runtime — multilingual intent (embeddings + optional LLM bridge)
    intent_semantic_enabled: bool = True
    intent_embedding_model: str = "paraphrase-multilingual-MiniLM-L12-v2"
    intent_semantic_immediate_threshold: float = 0.72
    intent_llm_normalize_enabled: bool = True
    intent_llm_normalize_timeout_seconds: float = 12.0
    # Skip intent + MCP for obvious greetings/thanks; go straight to the chat model.
    intent_ai_conversation_fastpath_enabled: bool = True
    # Agent propose_turn routing: intent (classifier) | llm_tools (workspace-primary AI picks MCP tools).
    agent_routing_mode: Literal["intent", "llm_tools"] = "intent"
    # When set, Ollama tool-calling leg uses this model name (OpenAI-compatible /v1); defaults to ai_default_model.
    agent_llm_router_model: str = ""
    # GitHub OAuth App (Device Flow) — used for Copilot CLI token acquisition
    github_oauth_client_id: str = ""
    floorplan_storage_dir: str = "./storage/floorplans"
    profile_image_storage_dir: str = "./storage/profile_images"

    @property
    def ollama_api_origin(self) -> str:
        """Base URL for Ollama HTTP API (/api/tags, /api/pull), without /v1 suffix."""
        u = self.ollama_base_url.rstrip("/")
        if u.endswith("/v1"):
            return u[:-3]
        return u

    @property
    def normalized_mcp_allowed_origins(self) -> list[str]:
        return [
            origin.strip().rstrip("/")
            for origin in self.mcp_allowed_origins.split(",")
            if origin.strip()
        ]

    @property
    def resolved_mcp_streamable_http_url(self) -> str:
        explicit = (self.mcp_streamable_http_url or "").strip()
        if explicit:
            return explicit.rstrip("/")
        return f"{self.server_base_url.rstrip('/')}/mcp/mcp"

    # Data Retention (Phase 6)
    retention_enabled: bool = True
    retention_imu_days: int = 7
    retention_rssi_days: int = 7
    retention_predictions_days: int = 30
    retention_interval_hours: int = 6

    @field_validator("debug", mode="before")
    @classmethod
    def normalize_debug(cls, value: object) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"1", "true", "yes", "on", "debug", "development"}:
                return True
            if normalized in {"0", "false", "no", "off", "release", "prod", "production"}:
                return False
        return bool(value)

    @property
    def has_secure_secret_key(self) -> bool:
        return bool(self.secret_key and self.secret_key != DEFAULT_SECRET_KEY)

    @property
    def is_simulator_mode(self) -> bool:
        return self.env_mode.lower() == "simulator"

    @field_validator("env_mode", mode="before")
    @classmethod
    def normalize_env_mode(cls, value: object) -> str:
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"sim", "simulator", "dev", "development", "demo"}:
                return "simulator"
            if normalized in {"prod", "production", "live", "real"}:
                return "production"
        return "production"

settings = Settings()
