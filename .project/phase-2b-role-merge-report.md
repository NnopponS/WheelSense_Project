# Phase 2B Completion Report — Head Nurse into Supervisor

Date: 2026-08-19  
Status: **SOFTWARE COMPLETE**  
Hardware relevance: none; this phase changes platform identity, authorization, persistence, and routes. It does not validate E84 hardware.

## Approved contract

- Canonical stored and emitted role: `supervisor`.
- Effective Supervisor rights: previous Supervisor rights plus previous Head Nurse rights, excluding Admin-only rights.
- `facilities.manage` and `/admin/**` remain Admin-only.
- Legacy `head_nurse` inputs, JWT claims, and `/head-nurse/**` URLs remain accepted for Release N and normalize to Supervisor.
- New account, caregiver, task, workflow, handover, calendar, support, and demo writes emit `supervisor` only.
- Release N+1 may remove compatibility only after deployed-client telemetry and database scans show no remaining legacy dependency.

## Database and rollback safety

Alembic revision `ia2b3c4d5e6f` updates these role-bearing columns from `head_nurse` to `supervisor`:

1. `care_directives.target_role`
2. `care_schedules.assigned_role`
3. `care_tasks.assigned_role`
4. `care_workflow_job_assignees.role_hint`
5. `caregivers.role`
6. `handover_notes.target_role`
7. `role_messages.recipient_role`
8. `routine_tasks.assigned_role`
9. `support_ticket_comments.author_role`
10. `support_tickets.reporter_role`
11. `tasks.assigned_role`
12. `users.role`

Chat speaker roles and hardware `device_role` values are deliberately excluded because they are different domains. Active sessions belonging to legacy-role users are revoked before stored roles change. The upgrade is idempotent. Downgrade is intentionally rejected because the merged records no longer contain reliable evidence identifying which users were formerly Head Nurses.

Before migration, a PostgreSQL custom-format backup was created inside the database container at `/tmp/ease_ai_pre_phase2b.dump`. `pg_restore --list` verified 865 archive entries. This is an operator recovery artifact inside the running container, not a durable off-host backup; copy it outside the container before any container/volume replacement. Prefer a forward corrective migration. A destructive database restore requires an explicit maintenance window and operator approval.

Runtime evidence after migration:

- `alembic current`: `ia2b3c4d5e6f (head)`.
- Legacy-row SQL counts: zero in `care_tasks`, `caregivers`, `role_messages`, `support_tickets`, and `users`.
- API health: `GET /api/health` returned HTTP 200 with `{"status":"ok","model_ready":false}`.

## Backend implementation

- `server/app/roles.py`: one canonicalization and role-membership boundary.
- `server/app/schemas/roles.py`: Pydantic pre-validation type for role-bearing fields.
- Role-bearing request/response schemas normalize legacy input without touching chat or device domains.
- Authorization dependencies, endpoint guards, service policies, worker policies, MCP scopes, MCP tool allowlists, and token scopes grant Supervisor the approved operational union.
- Workspace-wide visibility and operational actions recognize canonical Supervisor.
- Seed and simulator writers emit Supervisor while retaining only the compatibility keys needed to consume old fixtures.
- `server/pytest.ini` limits pytest discovery to `tests/`; diagnostic scripts are no longer executed accidentally during collection.

## Frontend implementation

- `frontend/lib/roles.ts` owns the canonical staff-role list and compatibility mapping.
- Route, permission, sidebar, notification, workflow-message, and proxy decisions canonicalize legacy input.
- Legacy JWT/route entry reaches `/supervisor`; Next redirects preserve Release N deep links.
- New role selectors expose Admin, Supervisor, and Observer only.
- Legacy role values display as Supervisor in the top bar, staffing views, role counts, directories, and workflow mailbox.
- Admin alerts resolve to `/admin/alerts`; Supervisor alerts resolve to `/supervisor/emergency`.
- The staffing shortcut resolves to `/supervisor/personnel?tab=staff`, not a deprecated Head Nurse route.
- Physical `app/head-nurse/**` compatibility files remain for Release N. They are not new navigation destinations and must not be deleted before the N+1 evidence gate.

## TDD and verification evidence

| Gate | Result |
|---|---|
| Focused backend role/RBAC/MCP/service/migration suites | 82 passed |
| Migration-specific stale expectation follow-up | 3 passed |
| Broad backend suite excluding unrelated AI-runtime/chat files | 613 passed, 1 skipped |
| Full backend discovery | 651 passed, 18 failed, 1 skipped |
| Frontend full Jest | 3 suites, 22 passed |
| Final role/brand routing Jest | 2 suites, 10 passed |
| TypeScript | `npx tsc --noEmit` passed |
| Next.js production build | passed; 90 routes |
| Docker web production build | passed; 90 routes |
| Docker Chromium role/access suite | 19 passed |
| Docker desktop/mobile login smoke | 2 passed |
| MQTT compatibility suite | 27 passed |
| Impeccable detector on changed UI files | zero findings |

The 18 full-suite failures are not role-migration regressions. Fifteen remaining failures are isolated to pre-existing/in-progress AI runtime and chat work in `test_agent_runtime_extended.py`, `test_chat.py`, and `test_smoke_ai_primary_mode.py`; three role-related stale expectations were corrected and passed independently. Those AI files are owned by concurrent user/GLM work and were not rewritten in this phase.

## Docker evidence

- Rebuilt server, simulator, agent-runtime, and web images.
- Recreated services applied the Alembic migration during server startup.
- Database, Mosquitto, and web health checks are green; server and simulator are active.
- Runtime MQTT connects to `mosquitto:1883` and retains the deployed `WheelSense/...` compatibility topics.
- No Compose service key, volume namespace, container DNS contract, or MQTT topic was renamed during the Ease AI display-brand transition.

## Release N telemetry and removal gate

Before removing compatibility in Release N+1, record all of the following for an agreed observation window:

1. No database row contains the exact role value `head_nurse` in the 12 migrated columns.
2. No authenticated token arrives with a legacy role claim.
3. No API request body submits a legacy role value.
4. No request reaches `/head-nurse` or `/head-nurse/**` except known synthetic compatibility tests.
5. Supported mobile/web clients have upgraded to canonical Supervisor routes and payloads.
6. A final negative authorization suite proves Supervisor still cannot access Admin-only operations.

Only then remove compatibility adapters, redirects, legacy route files, legacy translation keys, and legacy fixture aliases in one separately reviewed migration.

## Known limits

- The database backup currently resides inside the database container; it is not disaster-recovery storage.
- `model_ready=false` is an AI-runtime state and outside the role-migration acceptance boundary.
- No physical board, BLE, Wi-Fi, camera, touchscreen, sensor, microphone, or speaker behavior was exercised in Phase 2B.
- No commit or external push was performed.

