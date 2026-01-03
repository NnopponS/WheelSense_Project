# WheelSense Docker Services

## Structure

The `docker/` folder contains **ONLY 3 folders**:

1. **`mcp-server/`** - Main server (MCP Protocol + Backend REST API)
2. **`mcp-client/`** - MCP client library  
3. **`llm/`** - LLM service module

## Services

- **mcp-server** - Main server (ports 8000, 8080, 8765)
  - Handles MCP Protocol (port 8080)
  - Handles Backend REST API (port 8000)
  - Handles WebSocket for cameras (port 8765)
- **ollama** - LLM service (port 11434)
- **sqlite** - Database (stored in Docker volume)
- **mosquitto** - MQTT broker (ports 1883, 9001)
- **dashboard** - Frontend (port 3000)
- **camera-service** - Camera detection service
- **nginx** - Reverse proxy (ports 80, 443)

## Quick Start

```bash
docker-compose up -d
```

Access the dashboard at: http://localhost

## Documentation

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture information.
