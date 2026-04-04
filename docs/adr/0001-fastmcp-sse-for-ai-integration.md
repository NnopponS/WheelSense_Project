# ADR-0001: Use FastMCP SSE for AI Agent Integration

**Date**: 2026-04-01
**Status**: accepted
**Deciders**: User, AI Assistant

## Context

WheelSense needs an AI integration layer so that LLM agents (Claude, Gemini, etc.) can query patient data, manage alerts, trigger camera captures, and control devices through a standardized protocol. The Model Context Protocol (MCP) has emerged as the standard for LLM ↔ tool communication.

The question is whether to mount the MCP server within the existing FastAPI process or run it as a separate service.

## Decision

We use **FastMCP with SSE transport**, mounted directly within the existing FastAPI application at `/mcp` using `app.mount("/mcp", mcp.sse_app())`.

## Alternatives Considered

### Alternative 1: Separate MCP Process
- **Pros**: Independent scaling, crash isolation, separate deployment
- **Cons**: Network hop overhead, duplicate database connections, more complex Docker setup, configuration duplication
- **Why not**: Adds deployment complexity for a system that currently runs as a single Docker Compose stack. The MCP tools need direct access to the same service layer and database session used by REST endpoints.

### Alternative 2: MCP via stdio
- **Pros**: Simple, works with Claude Desktop directly
- **Cons**: Not accessible over network, single-user only, can't be used by remote agents or mobile clients
- **Why not**: We need network-accessible MCP for multiple AI agents and future dashboard integration.

## Consequences

### Positive
- Single deployment unit — one Docker container, one port
- MCP tools share the service layer with REST endpoints — no code duplication
- FastMCP handles SSE transport automatically

### Negative
- MCP server shares resources with REST API — a heavy MCP query could slow API responses
- Authentication for MCP must be added separately (future work)

### Risks
- **Security**: MCP endpoint gives full system access. Mitigation: defer to auth phase, restrict to localhost/VPN until auth is ready.
