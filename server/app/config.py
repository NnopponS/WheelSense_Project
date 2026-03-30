"""WheelSense Server — Configuration."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    database_url: str = "postgresql+asyncpg://wheelsense:wheelsense_dev@localhost:5432/wheelsense"
    database_url_sync: str = "postgresql://wheelsense:wheelsense_dev@localhost:5432/wheelsense"

    # MQTT
    mqtt_broker: str = "localhost"
    mqtt_port: int = 1883
    mqtt_user: str = ""
    mqtt_password: str = ""

    # App
    app_name: str = "WheelSense Server"
    debug: bool = False


settings = Settings()
