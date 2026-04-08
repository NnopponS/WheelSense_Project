from __future__ import annotations

import httpx
import logging
from typing import Dict, Any, Optional

from app.config import settings

logger = logging.getLogger(__name__)

class HomeAssistantService:
    def __init__(self):
        self.base_url = settings.ha_base_url.rstrip("/")
        self.token = settings.ha_access_token
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    async def get_state(self, entity_id: str) -> Optional[Dict[str, Any]]:
        """Fetch the current state of an entity from HomeAssistant."""
        if not self.token:
            logger.warning("HomeAssistant integration is incomplete (no access token).")
            return None

        url = f"{self.base_url}/api/states/{entity_id}"
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(url, headers=self.headers, timeout=5.0)
                if response.status_code == 200:
                    return response.json()
                elif response.status_code == 404:
                    logger.warning(f"Entity not found in HA: {entity_id}")
                    return None
                else:
                    logger.error(f"Failed to fetch state for {entity_id}: {response.text}")
                    return None
        except httpx.RequestError as exc:
            logger.error(f"Error communicating with HA while requesting {exc.request.url!r}.")
            return None

    async def call_service(self, action: str, entity_id: str, service_data: Dict[str, Any] = None) -> bool:
        """
        Call a HomeAssistant service.
        action format usually like: 'light.turn_on' or 'switch.toggle'.
        However, if the action is just 'turn_on', we can infer the domain from the entity_id (e.g. 'light').
        """
        if not self.token:
            logger.warning("HomeAssistant integration is incomplete (no access token).")
            return False

        if "." in action:
            domain, service = action.split(".", 1)
        else:
            domain = entity_id.split(".")[0]
            service = action

        url = f"{self.base_url}/api/services/{domain}/{service}"
        payload = {"entity_id": entity_id}
        if service_data:
            payload.update(service_data)

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=self.headers, json=payload, timeout=5.0)
                if response.status_code == 200:
                    return True
                else:
                    logger.error(f"Failed to call service {action} on {entity_id}: {response.text}")
                    return False
        except httpx.RequestError as exc:
            logger.error(f"Error communicating with HA while requesting {exc.request.url!r}.")
            return False

ha_service = HomeAssistantService()
