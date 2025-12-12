"""
WheelSense MCP Server - LLM Client
Ollama client for local LLM integration
"""

import logging
from typing import Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)


class OllamaClient:
    """Client for Ollama local LLM."""
    
    def __init__(self, host: str, model: str):
        self.host = host.rstrip("/")
        self.model = model
        self.timeout = 120.0  # 2 minutes timeout for generation
    
    async def check_health(self) -> bool:
        """Check if Ollama is available."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{self.host}/api/tags", timeout=5.0)
                return response.status_code == 200
        except Exception as e:
            logger.warning(f"Ollama health check failed: {e}")
            return False
    
    async def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 1024
    ) -> str:
        """Send chat request to Ollama."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.host}/api/chat",
                    json={
                        "model": self.model,
                        "messages": messages,
                        "stream": False,
                        "options": {
                            "temperature": temperature,
                            "num_predict": max_tokens
                        }
                    },
                    timeout=self.timeout
                )
                
                if response.status_code == 200:
                    result = response.json()
                    content = result.get("message", {}).get("content", "")
                    if not content:
                        raise Exception("Ollama returned empty response")
                    return content
                else:
                    error_text = response.text if hasattr(response, 'text') else ""
                    logger.error(f"Ollama chat error: {response.status_code} - {error_text}")
                    raise Exception(f"Ollama service returned error {response.status_code}. Please check if Ollama is running.")
                    
        except httpx.TimeoutException:
            logger.error("Ollama request timed out")
            raise Exception("Ollama request timed out. The AI service is taking too long to respond.")
        except httpx.ConnectError:
            logger.error("Cannot connect to Ollama service")
            raise Exception("Cannot connect to Ollama service. Please ensure Ollama is running and accessible.")
        except Exception as e:
            logger.error(f"Ollama chat failed: {e}")
            # Re-raise if it's already our custom exception, otherwise wrap it
            if "Ollama" in str(e) or "timed out" in str(e).lower():
                raise
            raise Exception(f"Failed to communicate with Ollama: {str(e)}")
    
    async def generate(
        self,
        prompt: str,
        system: Optional[str] = None,
        temperature: float = 0.7
    ) -> str:
        """Generate text from prompt."""
        try:
            async with httpx.AsyncClient() as client:
                payload = {
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": temperature
                    }
                }
                
                if system:
                    payload["system"] = system
                
                response = await client.post(
                    f"{self.host}/api/generate",
                    json=payload,
                    timeout=self.timeout
                )
                
                if response.status_code == 200:
                    result = response.json()
                    return result.get("response", "")
                else:
                    logger.error(f"Ollama generate error: {response.status_code}")
                    return ""
                    
        except Exception as e:
            logger.error(f"Ollama generate failed: {e}")
            return ""
    
    async def list_models(self) -> List[str]:
        """List available models."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{self.host}/api/tags", timeout=5.0)
                
                if response.status_code == 200:
                    result = response.json()
                    models = result.get("models", [])
                    return [m.get("name") for m in models]
                    
        except Exception as e:
            logger.error(f"Failed to list models: {e}")
        
        return []

