# ADR-0008: Workflow Domains for Role Operations

## Status
Accepted

## Context

Phase 12R role screens (`/head-nurse`, `/supervisor`, `/observer`, `/patient`) required operational flows that were previously represented as placeholders. The backend lacked first-class domains for:
- schedules
- care tasks
- role/user messaging
- handover notes
- directives
- queryable workflow audit trail

Without these domains, the frontend could only render static or partial views and could not complete role workflows end-to-end.

## Decision

Introduce a workspace-scoped workflow module under `/api/workflow` with service-layer business rules and RBAC controls:
- `GET/POST/PATCH /api/workflow/schedules`
- `GET/POST/PATCH /api/workflow/tasks`
- `GET/POST /api/workflow/messages`
- `POST /api/workflow/messages/{message_id}/read`
- `GET/POST /api/workflow/handovers`
- `GET/POST/PATCH /api/workflow/directives`
- `POST /api/workflow/directives/{directive_id}/acknowledge`
- `GET /api/workflow/audit`

Add normalized tables (`care_schedules`, `care_tasks`, `role_messages`, `handover_notes`, `care_directives`, `audit_trail_events`) with Alembic migration `9a6b3f4d2c10_add_workflow_domain_tables.py`.

All endpoints bind scope from `current_user.workspace_id` and do not accept client-supplied workspace identifiers for ownership.

## Consequences

### Positive
- Removes placeholder-only role workflows in Phase 12R UI.
- Provides consistent auditability for workflow mutations.
- Preserves existing workspace isolation and RBAC model.

### Trade-offs
- Adds six new tables and additional API surface area to maintain.
- Introduces more cross-role coordination for message/directive/task visibility semantics.

## Validation

- `pytest tests/test_workflow_domains.py -q`
- `pytest tests/e2e/test_role_workflow_chat.py -q`
- role-route pages now use live workflow APIs instead of placeholder content

## Supplementary — frontend task surfaces (2026-04)

The backend contract for care tasks is unchanged (`GET/PATCH /api/workflow/tasks`, workspace scope from the authenticated user). The Next.js app adds **presentation-only** variants:

- **Task-focused pages** may offer **calendar**, **list**, and **Kanban** views; column moves use **`PATCH`** with `status` values aligned to ward execution (`pending`, `in_progress`, `completed`). Implementation: `frontend/components/workflow/WorkflowTasksKanban.tsx`, `frontend/lib/workflowTaskBoard.ts` (see **`frontend/README.md`** — “Workflow care tasks — calendar vs board”).
- **Operations Console** (`frontend/components/workflow/OperationsConsole.tsx`) remains the **mixed queue** (tasks + schedules + directives) and is **not** the Kanban host — avoids conflating incompatible workflow item types on one board.

**Head nurse dashboard** (`frontend/app/head-nurse/page.tsx`) adds a compact **staff context strip** above priority alerts/tasks for at-a-glance coverage; full roster remains in the existing **On-Duty Staff** card next to the floorplan. Documented in **`frontend/README.md`** (“Head nurse dashboard — staff context strip”).
