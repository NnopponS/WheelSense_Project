"""WheelSense Server — Configuration."""

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


DEFAULT_SECRET_KEY = "your-super-secret-key-that-should-be-replaced-in-prod"


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

    # App
    app_name: str = "WheelSense Server"
    debug: bool = False

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


settings = Settings()
