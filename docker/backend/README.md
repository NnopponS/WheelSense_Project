# MCP Server (Main Server)

This is the main MCP (Model Context Protocol) server for WheelSense. It handles:
- MCP protocol requests
- Tool registry and execution
- LLM integration (via LLM service)
- MQTT communication
- Database operations

## Architecture

The MCP server is the central component that:
1. Receives MCP protocol requests
2. Uses the LLM service for AI interactions
3. Executes tools via the tool registry
4. Communicates with devices via MQTT

## Components

- `main.py` - FastAPI application and MCP protocol handlers
- `tools.py` - Tool registry for smart home control
- `mqtt_client.py` - MQTT client for device communication
- `config.py` - Configuration management

## Dependencies

- LLM Service (`../llm/`) - For LLM interactions
- SQLite - For data storage (stored in Docker volume)
- MQTT Broker - For device communication

