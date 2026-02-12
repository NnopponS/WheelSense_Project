"""
WheelSense v2.0 Home Assistant Integration
Control appliances via Home Assistant REST API
"""

import httpx
from typing import Optional, Dict, Any, List

from .config import settings


class HomeAssistantClient:
    """Home Assistant REST API client"""
    
    def __init__(self):
        self.base_url = settings.HA_URL
        self.token = settings.HA_TOKEN
        self._client: Optional[httpx.AsyncClient] = None
        self.connected = False
    
    @property
    def headers(self) -> Dict[str, str]:
        """Get request headers"""
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers
    
    async def connect(self):
        """Initialize HTTP client and test connection"""
        self._client = httpx.AsyncClient(timeout=10.0)
        
        if not self.token:
            print("⚠️ Home Assistant token not configured")
            self.connected = False
            return False
        
        try:
            response = await self._client.get(
                f"{self.base_url}/api/",
                headers=self.headers
            )
            if response.status_code == 200:
                print(f"✅ Connected to Home Assistant: {self.base_url}")
                self.connected = True
                return True
            else:
                print(f"❌ Home Assistant connection failed: {response.status_code}")
                self.connected = False
                return False
        except Exception as e:
            print(f"❌ Home Assistant connection error: {e}")
            self.connected = False
            return False
    
    async def disconnect(self):
        """Close HTTP client"""
        if self._client:
            await self._client.aclose()
            self._client = None
            self.connected = False
    
    async def get_states(self) -> List[Dict[str, Any]]:
        """Get all entity states"""
        if not self._client or not self.connected:
            return []
        
        try:
            response = await self._client.get(
                f"{self.base_url}/api/states",
                headers=self.headers
            )
            if response.status_code == 200:
                return response.json()
            return []
        except Exception as e:
            print(f"❌ Error getting states: {e}")
            return []
    
    async def get_state(self, entity_id: str) -> Optional[Dict[str, Any]]:
        """Get state of a specific entity"""
        if not self._client or not self.connected:
            return None
        
        try:
            response = await self._client.get(
                f"{self.base_url}/api/states/{entity_id}",
                headers=self.headers
            )
            if response.status_code == 200:
                return response.json()
            return None
        except Exception as e:
            print(f"❌ Error getting state for {entity_id}: {e}")
            return None
    
    async def call_service(self, domain: str, service: str, entity_id: str, data: Dict[str, Any] = None) -> bool:
        """Call a Home Assistant service"""
        if not self._client:
            print("⚠️ Home Assistant client not initialized")
            return False
        
        service_data = {"entity_id": entity_id}
        if data:
            service_data.update(data)
        
        try:
            response = await self._client.post(
                f"{self.base_url}/api/services/{domain}/{service}",
                headers=self.headers,
                json=service_data
            )
            success = response.status_code in [200, 201]
            if success:
                print(f"✅ Service called: {domain}.{service} on {entity_id}")
            else:
                print(f"❌ Service call failed: {response.status_code} - {response.text}")
            return success
        except Exception as e:
            print(f"❌ Error calling service: {e}")
            return False
    
    async def turn_on(self, entity_id: str, **kwargs) -> bool:
        """Turn on an entity"""
        domain = entity_id.split(".")[0]
        return await self.call_service(domain, "turn_on", entity_id, kwargs)
    
    async def turn_off(self, entity_id: str) -> bool:
        """Turn off an entity"""
        domain = entity_id.split(".")[0]
        return await self.call_service(domain, "turn_off", entity_id)
    
    async def toggle(self, entity_id: str) -> bool:
        """Toggle an entity"""
        domain = entity_id.split(".")[0]
        return await self.call_service(domain, "toggle", entity_id)
    
    async def set_light_brightness(self, entity_id: str, brightness: int) -> bool:
        """Set light brightness (0-255)"""
        return await self.call_service("light", "turn_on", entity_id, {"brightness": brightness})
    
    async def set_climate_temperature(self, entity_id: str, temperature: float) -> bool:
        """Set climate temperature"""
        return await self.call_service("climate", "set_temperature", entity_id, {"temperature": temperature})
    
    async def set_fan_speed(self, entity_id: str, percentage: int) -> bool:
        """Set fan speed percentage"""
        return await self.call_service("fan", "set_percentage", entity_id, {"percentage": percentage})


# Global Home Assistant client
ha_client = HomeAssistantClient()
