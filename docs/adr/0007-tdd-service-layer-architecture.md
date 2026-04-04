# ADR-0007: TDD with Service Layer Architecture

**Date**: 2026-04-01
**Status**: accepted
**Deciders**: User, AI Assistant

## Context

The current codebase has business logic scattered between API endpoints and the MQTT handler. As the system grows from ~8 tables to ~20+ tables with complex cross-cutting concerns (vitals → alerts → timeline → notifications), a structured approach is needed. The user explicitly requested TDD and systematic testing.

## Decision

We adopt a **Service Layer Architecture** with strict **Test-Driven Development (TDD)**:

1. **Service Layer**: All business logic encapsulated in service classes (`PatientService`, `VitalService`, `AlertService`, etc.). Endpoints and MQTT handlers only do: parse input → call service → format output.

2. **TDD Workflow**:
   - Write tests FIRST (target behavior, not implementation)
   - Implement minimal code to pass tests
   - Refactor while keeping tests green
   - Target: **85%+ coverage**

3. **Test Categories**:
   - Unit tests: Service methods with mocked DB
   - Integration tests: Full API endpoint with SQLite in-memory
   - MQTT tests: Handler with mocked MQTT client

4. **Quality Gates** (run after every phase):
   ```bash
   pytest --cov=app --cov-report=term-missing  # 85%+ coverage
   mypy .                                       # 0 errors
   ruff check .                                 # 0 issues
   bandit -r app                                # 0 issues
   ```

## Alternatives Considered

### Alternative 1: Keep logic in endpoints (current pattern)
- **Pros**: Less boilerplate, simpler file structure
- **Cons**: Duplicate logic between REST and MQTT handlers, hard to test, tight coupling
- **Why not**: Already causing issues — MQTT handler and endpoints both do room prediction logic independently.

### Alternative 2: Repository pattern (separate data access layer)
- **Pros**: Full separation of concerns, pure domain logic
- **Cons**: Over-engineered for current team size (1 developer), too many abstraction layers
- **Why not**: Service layer provides enough separation without the extra repository abstraction. Can be added later if needed.

## Consequences

### Positive
- Single source of truth for business logic (services)
- MQTT handler and REST endpoints share the same service methods
- MCP tools can reuse service methods directly
- High test coverage catches regressions early
- Quality gates prevent security and type issues

### Negative
- More files and boilerplate per feature
- Initial setup takes longer than "just write the endpoint"

### Risks
- **Over-abstraction**: Mitigation — keep services as static methods, not complex class hierarchies. Simple and flat.
