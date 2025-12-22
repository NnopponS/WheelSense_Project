"""
WheelSense MCP Client
Client library for connecting to MCP Server
"""

import logging
from typing import Dict, List, Optional, Any
import httpx

logger = logging.getLogger(__name__)


class MCPClient:
    """Client for connecting to MCP Server."""
    
    def __init__(self, base_url: str = "http://localhost:8080"):
        """
        Initialize MCP Client.
        
        Args:
            base_url: Base URL of the MCP server
        """
        self.base_url = base_url.rstrip("/")
        self.timeout = 30.0
    
    async def initialize(self) -> Dict[str, Any]:
        """Initialize connection to MCP server."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/mcp",
                    json={
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "initialize",
                        "params": {}
                    },
                    timeout=self.timeout
                )
                response.raise_for_status()
                result = response.json()
                return result.get("result", {})
        except Exception as e:
            logger.error(f"Failed to initialize MCP client: {e}")
            raise
    
    async def list_tools(self) -> List[Dict[str, Any]]:
        """List available tools from MCP server."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/mcp",
                    json={
                        "jsonrpc": "2.0",
                        "id": 2,
                        "method": "tools/list",
                        "params": {}
                    },
                    timeout=self.timeout
                )
                response.raise_for_status()
                result = response.json()
                return result.get("result", {}).get("tools", [])
        except Exception as e:
            logger.error(f"Failed to list tools: {e}")
            return []
    
    async def call_tool(
        self,
        tool_name: str,
        arguments: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Call a tool on the MCP server."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/mcp",
                    json={
                        "jsonrpc": "2.0",
                        "id": 3,
                        "method": "tools/call",
                        "params": {
                            "name": tool_name,
                            "arguments": arguments
                        }
                    },
                    timeout=self.timeout
                )
                response.raise_for_status()
                result = response.json()
                return result.get("result", {})
        except Exception as e:
            logger.error(f"Failed to call tool {tool_name}: {e}")
            raise
    
    async def chat(
        self,
        messages: List[Dict[str, str]],
        tools: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Send chat request to MCP server."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/chat",
                    json={
                        "messages": messages,
                        "tools": tools
                    },
                    timeout=self.timeout
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Failed to send chat: {e}")
            raise
    
    async def health_check(self) -> bool:
        """Check if MCP server is healthy."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/health",
                    timeout=5.0
                )
                return response.status_code == 200
        except Exception as e:
            logger.warning(f"MCP server health check failed: {e}")
            return False

