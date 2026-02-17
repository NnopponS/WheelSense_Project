"""
WheelSense v2.0 Home Assistant Integration
Control appliances via Home Assistant REST API.
"""

from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

import httpx

from .config import settings


class HomeAssistantClient:
    """Home Assistant REST API client"""

    def __init__(self):
        self.base_url = settings.HA_URL
        self.token = settings.HA_TOKEN
        self._client: Optional[httpx.AsyncClient] = None
        self.connected = False
        self.last_error: str = ""
        self.last_status_code: Optional[int] = None
        self.last_checked_at: Optional[datetime] = None
        self.last_success_at: Optional[datetime] = None

    @property
    def headers(self) -> Dict[str, str]:
        """Get request headers."""
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    async def connect(self) -> bool:
        """Initialize HTTP client and test connection."""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=10.0)

        self.last_checked_at = datetime.now(timezone.utc)

        if not self.token:
            print("[HA] Token not configured")
            self.connected = False
            self.last_status_code = None
            self.last_error = "HA token is not configured"
            return False

        try:
            response = await self._client.get(f"{self.base_url}/api/", headers=self.headers)
            self.last_status_code = response.status_code
            if response.status_code == 200:
                print(f"[HA] Connected: {self.base_url}")
                self.connected = True
                self.last_success_at = datetime.now(timezone.utc)
                self.last_error = ""
                return True

            print(f"[HA] Connection failed: HTTP {response.status_code}")
            self.connected = False
            self.last_error = f"Home Assistant returned HTTP {response.status_code}"
            return False
        except Exception as exc:
            print(f"[HA] Connection error: {exc}")
            self.connected = False
            self.last_status_code = None
            self.last_error = str(exc)
            return False

    async def disconnect(self):
        """Close HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None
        self.connected = False

    async def get_states(self) -> List[Dict[str, Any]]:
        """Get all entity states."""
        if not self._client or not self.connected:
            return []

        try:
            self.last_checked_at = datetime.now(timezone.utc)
            response = await self._client.get(f"{self.base_url}/api/states", headers=self.headers)
            self.last_status_code = response.status_code
            if response.status_code == 200:
                self.last_success_at = datetime.now(timezone.utc)
                self.last_error = ""
                return response.json()
            self.last_error = f"Home Assistant returned HTTP {response.status_code}"
            return []
        except Exception as exc:
            print(f"[HA] Error getting states: {exc}")
            self.last_error = str(exc)
            return []

    async def get_state(self, entity_id: str) -> Optional[Dict[str, Any]]:
        """Get state of a specific entity."""
        if not self._client or not self.connected:
            return None

        try:
            self.last_checked_at = datetime.now(timezone.utc)
            response = await self._client.get(f"{self.base_url}/api/states/{entity_id}", headers=self.headers)
            self.last_status_code = response.status_code
            if response.status_code == 200:
                self.last_success_at = datetime.now(timezone.utc)
                self.last_error = ""
                return response.json()
            self.last_error = f"Home Assistant returned HTTP {response.status_code}"
            return None
        except Exception as exc:
            print(f"[HA] Error getting state for {entity_id}: {exc}")
            self.last_error = str(exc)
            return None

    async def call_service(self, domain: str, service: str, entity_id: str, data: Dict[str, Any] = None) -> bool:
        """Call a Home Assistant service."""
        if not self._client:
            self.last_error = "Home Assistant client not initialized"
            print("[HA] Client not initialized")
            return False

        service_data = {"entity_id": entity_id}
        if data:
            service_data.update(data)

        try:
            self.last_checked_at = datetime.now(timezone.utc)
            response = await self._client.post(
                f"{self.base_url}/api/services/{domain}/{service}",
                headers=self.headers,
                json=service_data,
            )
            self.last_status_code = response.status_code
            success = response.status_code in [200, 201]
            if success:
                self.last_success_at = datetime.now(timezone.utc)
                self.last_error = ""
                print(f"[HA] Service ok: {domain}.{service} -> {entity_id}")
            else:
                self.last_error = f"Service call failed: HTTP {response.status_code}"
                print(f"[HA] Service failed: HTTP {response.status_code}")
            return success
        except Exception as exc:
            print(f"[HA] Service error: {exc}")
            self.last_error = str(exc)
            return False

    async def turn_on(self, entity_id: str, **kwargs) -> bool:
        """Turn on an entity."""
        domain = entity_id.split(".")[0]
        return await self.call_service(domain, "turn_on", entity_id, kwargs)

    async def turn_off(self, entity_id: str) -> bool:
        """Turn off an entity."""
        domain = entity_id.split(".")[0]
        return await self.call_service(domain, "turn_off", entity_id)

    async def toggle(self, entity_id: str) -> bool:
        """Toggle an entity."""
        domain = entity_id.split(".")[0]
        return await self.call_service(domain, "toggle", entity_id)

    async def set_light_brightness(self, entity_id: str, brightness: int) -> bool:
        """Set light brightness (0-255)."""
        return await self.call_service("light", "turn_on", entity_id, {"brightness": brightness})

    async def set_climate_temperature(self, entity_id: str, temperature: float) -> bool:
        """Set climate temperature."""
        return await self.call_service("climate", "set_temperature", entity_id, {"temperature": temperature})

    async def set_fan_speed(self, entity_id: str, percentage: int) -> bool:
        """Set fan speed percentage."""
        return await self.call_service("fan", "set_percentage", entity_id, {"percentage": percentage})

    def diagnostics(self) -> Dict[str, Any]:
        """Return HA connectivity diagnostics for health/settings views."""
        return {
            "url": self.base_url,
            "token_configured": bool(self.token),
            "connected": self.connected,
            "last_status_code": self.last_status_code,
            "last_error": self.last_error,
            "last_checked_at": self.last_checked_at.isoformat() if self.last_checked_at else None,
            "last_success_at": self.last_success_at.isoformat() if self.last_success_at else None,
        }


# Global Home Assistant client
ha_client = HomeAssistantClient()
