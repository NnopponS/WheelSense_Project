from __future__ import annotations

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    wheelsense_api_base_url: str = "http://wheelsense-platform-server:8000"
    wheelsense_internal_secret: str = "wheelsense-internal-dev-secret"
    wheelsense_workspace_name: str = "WheelSense Demo Workspace"
    wheelsense_workspace_id: int | None = None

    patient_name: str = "Robert"
    source: str = "real_yolo_camera_service"
    device_id: str = "TSIM_004"

    yolo_model_path: str = "/app/models/yolov8-model/best.pt"
    yolo_confidence_threshold: float = 0.5
    yolo_device: str = "cpu"
    yolo_fall_cooldown_seconds: float = 30.0

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

    @field_validator("wheelsense_workspace_id", mode="before")
    @classmethod
    def empty_workspace_id_is_none(cls, value: object) -> object:
        if value == "":
            return None
        return value


settings = Settings()
