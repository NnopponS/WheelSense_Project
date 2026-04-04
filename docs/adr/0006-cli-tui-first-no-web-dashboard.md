# ADR-0006: CLI/TUI First — No Web Dashboard Until System Matures

**Date**: 2026-04-01
**Status**: accepted
**Deciders**: User, AI Assistant

## Context

The user has explicitly stated that the system should be built with CLI/TUI interfaces first. A web dashboard (Next.js or similar) will be added later after all backend systems are stable and tested.

## Decision

All user-facing interactions are built as **CLI/TUI tools** using Python (Rich, Click, or similar). No web frontend is developed in this phase. The REST API serves as the interface for:
- CLI tools (via `requests` or `httpx`)
- MCP AI agents (via `/mcp` SSE endpoint)
- Future mobile app (via REST)
- Future web dashboard (via REST)

## Alternatives Considered

### Alternative 1: Build web dashboard simultaneously
- **Pros**: Visual interface immediately, easier to demo
- **Cons**: Splits development effort, frontend may need rework as backend evolves, premature UI decisions
- **Why not**: User explicitly wants to stabilize backend first. UI changes are expensive if the underlying data model is still evolving.

## Consequences

### Positive
- Focus development effort on correctness and stability
- API design is validated by CLI usage before building UI
- Faster iteration — no frontend build step
- MCP integration provides an AI-powered "interface" in the meantime

### Negative
- No visual interface for demos or stakeholder presentations
- CLI requires terminal familiarity

### Risks
- None significant. CLI is a stepping stone, not a permanent choice.
