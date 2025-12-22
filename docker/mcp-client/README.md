# MCP Client

This directory contains the MCP (Model Context Protocol) client library for connecting to the MCP Server.

## Components

- `mcp_client.py` - Client library for MCP protocol communication

## Usage

```python
from mcp_client import MCPClient

client = MCPClient(base_url="http://localhost:8080")

# Initialize connection
await client.initialize()

# List available tools
tools = await client.list_tools()

# Call a tool
result = await client.call_tool("control_appliance", {
    "room": "bedroom",
    "appliance": "light",
    "state": True
})

# Send chat message
response = await client.chat([
    {"role": "user", "content": "Turn on the bedroom light"}
])
```

