# WheelSense Docker Architecture

## Overview

The `docker/` folder contains **ONLY 3 folders**:

1. **`mcp-server/`** - Main server (MCP Protocol + Backend REST API)
2. **`mcp-client/`** - MCP client library
3. **`llm/`** - LLM service module

## Component Details

### 1. MCP Server (`mcp-server/`) - Main Server

The main server that handles:
- **MCP Protocol** - Model Context Protocol endpoints
- **Backend REST API** - All REST API endpoints (rooms, patients, appliances, etc.)
- **Tool Registry** - Smart home control tools
- **Database Operations** - MongoDB integration
- **MQTT Communication** - Device control via MQTT
- **WebSocket** - Camera streaming and real-time updates
- **LLM Integration** - Uses LLM service for AI interactions
- **AI Service** - Gemini AI for behavior analysis
- **Emergency Service** - Emergency handling
- **Translation Service** - EN->TH translation

**Key Files:**
- `src/main.py` - FastAPI application (MCP + REST API)
- `src/tools.py` - Tool registry for smart home control
- `src/mqtt_client.py` - MQTT client for MCP protocol
- `src/mqtt_handler.py` - MQTT handler for backend operations
- `src/database.py` - Database operations
- `src/ai_service.py` - Gemini AI service
- `src/emergency_service.py` - Emergency handling
- `src/websocket_handler.py` - WebSocket for cameras
- `src/translation_service.py` - Translation service

### 2. MCP Client (`mcp-client/`)

Client library for connecting to the MCP Server. Provides:
- MCP protocol client implementation
- Tool calling interface
- Chat interface
- Health checking

**Key Files:**
- `mcp_client.py` - Main client implementation

### 3. LLM Service (`llm/`)

Shared LLM service module that provides:
- Ollama client for local LLM integration
- Chat and generation capabilities
- Model management

**Key Files:**
- `llm_client.py` - Ollama client implementation

## Other Services

Other services (dashboard, camera-service, mongodb, mosquitto, nginx) are located in the parent `services/` directory and referenced in `docker-compose.yml`.

## Architecture Flow

```
┌─────────────┐
│   Client    │
│ (Dashboard) │
└──────┬──────┘
       │
       ▼
┌─────────────────┐     ┌──────────────┐
│   MCP Server    │─────▶│ LLM Service │
│  (Main Server)  │      │   (llm/)    │
│                 │      └──────────────┘
│  - MCP Protocol │
│  - REST API     │
│  - Tools        │
│  - Database     │
│  - MQTT         │
│  - WebSocket    │
└──────┬──────────┘
       │
       ├──▶ MQTT Broker ──▶ Devices
       │
       └──▶ MongoDB ──▶ Database
```

## Ports

- **8000** - Backend REST API
- **8080** - MCP Protocol
- **8765** - WebSocket for camera connections

## Dependencies

- **MCP Server** depends on:
  - LLM Service (for AI interactions)
  - MongoDB (for data storage)
  - MQTT Broker (for device communication)

- **MCP Client** depends on:
  - MCP Server (for protocol communication)

- **LLM Service** is standalone:
  - Can be used by any service needing LLM capabilities
