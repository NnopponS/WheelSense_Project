# Task Management

<cite>
**Referenced Files in This Document**
- [CreateTaskDialog.tsx](file://frontend/components/head-nurse/tasks/CreateTaskDialog.tsx)
- [TaskDetailModal.tsx](file://frontend/components/head-nurse/tasks/TaskDetailModal.tsx)
- [UnifiedTaskCommandBar.tsx](file://frontend/components/head-nurse/tasks/UnifiedTaskCommandBar.tsx)
- [UnifiedTaskKanbanBoard.tsx](file://frontend/components/head-nurse/tasks/UnifiedTaskKanbanBoard.tsx)
- [task_management.py](file://server/app/models/task_management.py)
- [task_management.py](file://server/app/schemas/task_management.py)
- [tasks.py](file://server/app/services/tasks.py)
- [task_management.py](file://server/app/models/tasks.py)
- [task_management.py](file://server/app/schemas/tasks.py)
- [task_management.py](file://server/app/api/endpoints/task_management.py)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)
10. [Appendices](#appendices)

## Introduction
This document describes the Head Nurse Task Management system, focusing on the workflow task management interface, patient routine management, role-specific task queues, automated care scheduling, and the task command bar. It explains how tasks are created, assigned, tracked, and completed; how routine care is scheduled and reset; and how the kanban board supports visual workflow management and prioritization. It also outlines integration points with care directives and patient monitoring timelines.

## Project Structure
The task management system spans frontend React components and backend Python services:
- Frontend components under the Head Nurse shell provide task creation, viewing, filtering, and kanban visualization.
- Backend services implement task lifecycle operations, reporting, and routine task management.
- Database models define persistent entities for tasks, reports, and routine templates/logs.

```mermaid
graph TB
subgraph "Frontend"
CT["CreateTaskDialog.tsx"]
TM["TaskDetailModal.tsx"]
UCB["UnifiedTaskCommandBar.tsx"]
UKB["UnifiedTaskKanbanBoard.tsx"]
end
subgraph "Backend"
SVC["TaskService (tasks.py)"]
MODELS["Models (task_management.py, tasks.py)"]
SCHEMAS["Schemas (task_management.py, tasks.py)"]
API["Endpoints (task_management.py)"]
end
CT --> API
TM --> API
UCB --> API
UKB --> API
API --> SVC
SVC --> MODELS
SVC --> SCHEMAS
```

**Diagram sources**
- [CreateTaskDialog.tsx:1-472](file://frontend/components/head-nurse/tasks/CreateTaskDialog.tsx#L1-L472)
- [TaskDetailModal.tsx:1-1053](file://frontend/components/head-nurse/tasks/TaskDetailModal.tsx#L1-L1053)
- [UnifiedTaskCommandBar.tsx:1-334](file://frontend/components/head-nurse/tasks/UnifiedTaskCommandBar.tsx#L1-L334)
- [UnifiedTaskKanbanBoard.tsx:1-557](file://frontend/components/head-nurse/tasks/UnifiedTaskKanbanBoard.tsx#L1-L557)
- [tasks.py:1-690](file://server/app/services/tasks.py#L1-L690)
- [task_management.py:1-129](file://server/app/models/task_management.py#L1-L129)
- [task_management.py:1-166](file://server/app/schemas/task_management.py#L1-L166)
- [task_management.py](file://server/app/api/endpoints/task_management.py)

**Section sources**
- [CreateTaskDialog.tsx:1-472](file://frontend/components/head-nurse/tasks/CreateTaskDialog.tsx#L1-L472)
- [TaskDetailModal.tsx:1-1053](file://frontend/components/head-nurse/tasks/TaskDetailModal.tsx#L1-L1053)
- [UnifiedTaskCommandBar.tsx:1-334](file://frontend/components/head-nurse/tasks/UnifiedTaskCommandBar.tsx#L1-L334)
- [UnifiedTaskKanbanBoard.tsx:1-557](file://frontend/components/head-nurse/tasks/UnifiedTaskKanbanBoard.tsx#L1-L557)
- [tasks.py:1-690](file://server/app/services/tasks.py#L1-L690)
- [task_management.py:1-129](file://server/app/models/task_management.py#L1-L129)
- [task_management.py:1-166](file://server/app/schemas/task_management.py#L1-L166)

## Core Components
- Task creation dialog with validation, subtasks, and configurable report templates.
- Task detail modal supporting updates, subtask toggles, and report submission.
- Unified command bar aggregating task metrics and actions (export, reset routines).
- Kanban board for drag-and-drop status updates, filtering, and overdue highlighting.
- Backend services implementing task CRUD, reporting, routine reset, and board aggregation.

**Section sources**
- [CreateTaskDialog.tsx:32-137](file://frontend/components/head-nurse/tasks/CreateTaskDialog.tsx#L32-L137)
- [TaskDetailModal.tsx:185-338](file://frontend/components/head-nurse/tasks/TaskDetailModal.tsx#L185-L338)
- [UnifiedTaskCommandBar.tsx:74-129](file://frontend/components/head-nurse/tasks/UnifiedTaskCommandBar.tsx#L74-L129)
- [UnifiedTaskKanbanBoard.tsx:300-554](file://frontend/components/head-nurse/tasks/UnifiedTaskKanbanBoard.tsx#L300-L554)
- [tasks.py:123-294](file://server/app/services/tasks.py#L123-L294)

## Architecture Overview
The system follows a layered architecture:
- UI layer: React components manage user interactions and present task data.
- Service layer: TaskService orchestrates business logic, enforces permissions, and coordinates persistence.
- Persistence layer: SQLAlchemy models and Pydantic schemas define data contracts and storage.

```mermaid
sequenceDiagram
participant UI as "UI Component"
participant API as "Task Endpoint"
participant SVC as "TaskService"
participant DB as "SQLAlchemy Models"
UI->>API : "Create Task"
API->>SVC : "create_task(ws_id, actor_user_id, payload)"
SVC->>DB : "Validate and persist Task"
DB-->>SVC : "Task persisted"
SVC-->>API : "TaskOut enriched"
API-->>UI : "Task created"
```

**Diagram sources**
- [tasks.py:123-207](file://server/app/services/tasks.py#L123-L207)
- [task_management.py](file://server/app/api/endpoints/task_management.py)

## Detailed Component Analysis

### Task Creation Dialog
- Purpose: Create specific or routine tasks with optional subtasks and report templates.
- Features:
  - Form validation via Zod schema.
  - Dynamic subtasks and report template fields.
  - Assignment to a patient and/or staff member.
  - Priority selection and due date.
- Integration: Submits to backend endpoint; success triggers toast and resets form.

```mermaid
flowchart TD
Start(["Open Create Task Dialog"]) --> TypeSel["Select Task Type"]
TypeSel --> Fill["Fill Title, Description, Priority"]
Fill --> Assign["Assign to Patient and/or Staff"]
Assign --> Due["Set Due Date (optional)"]
Due --> Subtasks{"Add Subtasks?"}
Subtasks --> |Yes| AddSub["Add Subtask Rows"]
Subtasks --> |No| Reports{"Add Report Template?"}
AddSub --> Reports
Reports --> |Yes| AddFields["Add Template Fields"]
Reports --> |No| Submit["Submit Task"]
AddFields --> Submit
Submit --> Validate["Server-Side Validation"]
Validate --> Success["Show Success Toast<br/>Close Dialog"]
Validate --> Error["Show Error Toast"]
```

**Diagram sources**
- [CreateTaskDialog.tsx:72-137](file://frontend/components/head-nurse/tasks/CreateTaskDialog.tsx#L72-L137)

**Section sources**
- [CreateTaskDialog.tsx:32-137](file://frontend/components/head-nurse/tasks/CreateTaskDialog.tsx#L32-L137)

### Task Detail Modal
- Purpose: View and edit task details, manage subtasks, and submit reports.
- Features:
  - Tabbed interface for Details, Subtasks, Reports.
  - Editable fields for title, description, priority, status, due date.
  - Subtask creation, toggling, and removal.
  - Structured report submission with dynamic schema derived from template.
  - Audit trail and timeline integration on report submission.
- Permissions: Editing and deletion restricted to head nurse/admin; execution allowed for assignees.

```mermaid
sequenceDiagram
participant UI as "TaskDetailModal"
participant API as "Task Endpoint"
participant SVC as "TaskService"
participant DB as "Models"
UI->>API : "Update Task"
API->>SVC : "update_task(..., TaskUpdate)"
SVC->>DB : "Persist changes"
DB-->>SVC : "Updated"
SVC-->>API : "TaskOut"
API-->>UI : "Updated"
UI->>API : "Submit Report"
API->>SVC : "submit_report(..., TaskReportCreate)"
SVC->>DB : "Create TaskReport + optional status update"
DB-->>SVC : "Report persisted"
SVC-->>API : "TaskReportOut"
API-->>UI : "Report submitted"
```

**Diagram sources**
- [TaskDetailModal.tsx:238-338](file://frontend/components/head-nurse/tasks/TaskDetailModal.tsx#L238-L338)
- [tasks.py:209-296](file://server/app/services/tasks.py#L209-L296)
- [tasks.py:296-396](file://server/app/services/tasks.py#L296-L396)

**Section sources**
- [TaskDetailModal.tsx:185-338](file://frontend/components/head-nurse/tasks/TaskDetailModal.tsx#L185-L338)
- [tasks.py:209-296](file://server/app/services/tasks.py#L209-L296)
- [tasks.py:296-396](file://server/app/services/tasks.py#L296-L396)

### Unified Task Command Bar
- Purpose: Provide at-a-glance metrics and actions for task management.
- Features:
  - Completion rate, counts per status, task type breakdown, overdue count, and report submissions.
  - Export action placeholder and reset routines action (head nurse/admin).
  - Responsive stat badges with color-coded emphasis.
- Data: Aggregated from current task list; recalculated on load.

```mermaid
flowchart TD
Load["Load Tasks"] --> Stats["Compute Stats:<br/>Status Counts, Type Split,<br/>Overdue, Completion Rate"]
Stats --> Render["Render Stat Badges"]
Render --> Actions{"User Action?"}
Actions --> |Export| Export["Trigger Export Callback"]
Actions --> |Reset Routines| Confirm["Open Reset Confirmation"]
Confirm --> Reset["Call Reset Routine Mutation"]
Reset --> Toast["Show Success/Error Toast"]
```

**Diagram sources**
- [UnifiedTaskCommandBar.tsx:74-129](file://frontend/components/head-nurse/tasks/UnifiedTaskCommandBar.tsx#L74-L129)

**Section sources**
- [UnifiedTaskCommandBar.tsx:74-334](file://frontend/components/head-nurse/tasks/UnifiedTaskCommandBar.tsx#L74-L334)

### Unified Task Kanban Board
- Purpose: Visualize tasks across statuses with quick actions and filters.
- Features:
  - Columns: Pending, In Progress, Completed, Skipped.
  - Task cards show priority, type, patient/assignee, due date, subtask progress, and report count.
  - Hover quick status menu for authorized users.
  - Search, task type, and priority filters; clear filters.
  - Empty states and “Create Task” CTA for Pending column.
  - Overdue highlighting based on due date and status.
- Interactions: Click task to open detail; status dropdown to move tasks.

```mermaid
flowchart TD
Init["Initialize Board"] --> Filter["Apply Filters:<br/>Search, Type, Priority"]
Filter --> Group["Group by Status"]
Group --> Render["Render Columns with Cards"]
Render --> Hover{"Hover Card?"}
Hover --> |Yes| Menu["Show Status Dropdown"]
Hover --> |No| Idle["Idle"]
Menu --> Change["Change Status"]
Change --> Persist["Call onStatusChange"]
Persist --> Update["Re-render Board"]
```

**Diagram sources**
- [UnifiedTaskKanbanBoard.tsx:300-554](file://frontend/components/head-nurse/tasks/UnifiedTaskKanbanBoard.tsx#L300-L554)

**Section sources**
- [UnifiedTaskKanbanBoard.tsx:40-242](file://frontend/components/head-nurse/tasks/UnifiedTaskKanbanBoard.tsx#L40-L242)
- [UnifiedTaskKanbanBoard.tsx:300-554](file://frontend/components/head-nurse/tasks/UnifiedTaskKanbanBoard.tsx#L300-L554)

### Routine Task Manager and Automated Scheduling
- Purpose: Manage daily routine templates, logs, and fixed-schedule routines for patients.
- Entities:
  - RoutineTask: Template for daily tasks with category, label, sort order, and assignment.
  - RoutineTaskLog: Per-shift completion records with status and reports.
  - PatientFixRoutine: Fixed schedule templates for groups of patients and roles.
- Operations:
  - Bulk reset of routine tasks for a shift date (head nurse/admin).
  - Daily board aggregation per user with completion metrics.

```mermaid
erDiagram
ROUTINE_TASK {
int id PK
int workspace_id
string title
string description
string label
string category
int sort_order
int assigned_user_id
string assigned_role
boolean is_active
timestamp created_at
timestamp updated_at
}
ROUTINE_TASK_LOG {
int id PK
int workspace_id
int routine_task_id FK
int assigned_user_id
date shift_date
string status
text note
text report_text
json report_images
timestamp completed_at
timestamp updated_at
}
PATIENT_FIX_ROUTINE {
int id PK
int workspace_id
string title
string description
json patient_ids
json target_roles
string schedule_type
string recurrence_rule
json steps
int created_by_user_id
boolean is_active
timestamp created_at
timestamp updated_at
}
ROUTINE_TASK ||--o{ ROUTINE_TASK_LOG : "logs"
PATIENT_FIX_ROUTINE ||--o{ ROUTINE_TASK : "instantiates"
```

**Diagram sources**
- [task_management.py:22-129](file://server/app/models/task_management.py#L22-L129)

**Section sources**
- [task_management.py:22-129](file://server/app/models/task_management.py#L22-L129)
- [task_management.py:11-166](file://server/app/schemas/task_management.py#L11-L166)

### Backend Task Service and Endpoints
- Responsibilities:
  - List, get, create, update, delete tasks with visibility checks.
  - Submit structured reports with validation against template schema.
  - Aggregate task board per user with counts and percentages.
  - Reset routine tasks for a given shift date.
- Security:
  - Head nurse/admin can update/delete tasks and reset routines.
  - Visibility scoped by workspace and optionally by visible patients.

```mermaid
classDiagram
class TaskService {
+list_tasks(...)
+get_task(...)
+create_task(...)
+update_task(...)
+delete_task(...)
+submit_report(...)
+get_task_reports(...)
+reset_routine_tasks(...)
+get_task_board(...)
-_enrich_tasks(...)
-_to_task_out(...)
-_to_report_out(...)
-_can_see_task(...)
}
class Task {
+int id
+string task_type
+string status
+string priority
+datetime due_at
+json subtasks
+json report_template
}
class TaskReport {
+int id
+int task_id
+json report_data
+string notes
+json attachments
}
TaskService --> Task : "manages"
TaskService --> TaskReport : "creates"
```

**Diagram sources**
- [tasks.py:44-689](file://server/app/services/tasks.py#L44-L689)
- [task_management.py](file://server/app/models/tasks.py)
- [task_management.py](file://server/app/schemas/tasks.py)

**Section sources**
- [tasks.py:44-689](file://server/app/services/tasks.py#L44-L689)

## Dependency Analysis
- Frontend components depend on:
  - Hooks for task mutations and queries.
  - UI primitives (Dialog, Tabs, Select, Badge, Button).
  - Translation utilities and toast notifications.
- Backend depends on:
  - SQLAlchemy ORM for persistence.
  - Pydantic for serialization and validation.
  - Audit trail and activity timeline services.
- Cross-cutting concerns:
  - Workspace scoping and RBAC enforcement.
  - Visibility constraints for patients and roles.

```mermaid
graph LR
CT["CreateTaskDialog.tsx"] --> API["task_management.py (endpoint)"]
TM["TaskDetailModal.tsx"] --> API
UCB["UnifiedTaskCommandBar.tsx"] --> API
UKB["UnifiedTaskKanbanBoard.tsx"] --> API
API --> SVC["TaskService (tasks.py)"]
SVC --> MODELS["models/tasks.py"]
SVC --> SCHEMAS["schemas/tasks.py"]
SVC --> RTMODELS["models/task_management.py"]
SVC --> RTSCH["schemas/task_management.py"]
```

**Diagram sources**
- [CreateTaskDialog.tsx:1-472](file://frontend/components/head-nurse/tasks/CreateTaskDialog.tsx#L1-L472)
- [TaskDetailModal.tsx:1-1053](file://frontend/components/head-nurse/tasks/TaskDetailModal.tsx#L1-L1053)
- [UnifiedTaskCommandBar.tsx:1-334](file://frontend/components/head-nurse/tasks/UnifiedTaskCommandBar.tsx#L1-L334)
- [UnifiedTaskKanbanBoard.tsx:1-557](file://frontend/components/head-nurse/tasks/UnifiedTaskKanbanBoard.tsx#L1-L557)
- [task_management.py](file://server/app/api/endpoints/task_management.py)
- [tasks.py:1-690](file://server/app/services/tasks.py#L1-L690)
- [task_management.py](file://server/app/models/tasks.py)
- [task_management.py](file://server/app/schemas/tasks.py)
- [task_management.py](file://server/app/models/task_management.py)
- [task_management.py](file://server/app/schemas/task_management.py)

**Section sources**
- [tasks.py:1-690](file://server/app/services/tasks.py#L1-L690)

## Performance Considerations
- Filtering and grouping: Kanban board computes grouped tasks and overdue flags client-side; keep lists reasonably sized to avoid heavy re-renders.
- Enrichment: Backend enriches tasks with names and report counts; pagination or limits can be applied at the API level if needed.
- Audit logging: Frequent status changes and report submissions trigger audit events; batch operations should consider throttling UI updates.
- Images and attachments: Report images stored as JSON arrays; large payloads can increase response sizes; consider lazy-loading or CDN integration.

## Troubleshooting Guide
- Task creation fails:
  - Verify required fields and constraints (title length, priority enum).
  - Ensure selected patient and assignee belong to the workspace and are active.
- Report submission rejected:
  - Required fields missing or extra fields present according to template.
  - Only assigned user or head nurse/admin can submit reports.
- Reset routines not working:
  - Requires head nurse/admin role.
  - Target shift date defaults to current UTC date if not provided.
- Kanban status not updating:
  - Ensure user has permission to change status; verify onStatusChange handler wired correctly.
- Overdue highlighting incorrect:
  - Overdue applies only when due date exists, task is not completed/skipped, and past due.

**Section sources**
- [CreateTaskDialog.tsx:108-137](file://frontend/components/head-nurse/tasks/CreateTaskDialog.tsx#L108-L137)
- [TaskDetailModal.tsx:322-338](file://frontend/components/head-nurse/tasks/TaskDetailModal.tsx#L322-L338)
- [tasks.py:130-155](file://server/app/services/tasks.py#L130-L155)
- [tasks.py:296-396](file://server/app/services/tasks.py#L296-L396)
- [tasks.py:418-473](file://server/app/services/tasks.py#L418-L473)
- [UnifiedTaskKanbanBoard.tsx:370-376](file://frontend/components/head-nurse/tasks/UnifiedTaskKanbanBoard.tsx#L370-L376)

## Conclusion
The Head Nurse Task Management system integrates robust UI components with a secure, workspace-scoped backend service. It supports flexible task creation, granular reporting, visual kanban management, and automated routine scheduling. The design emphasizes role-based permissions, auditability, and extensibility for future integrations with care directives and monitoring systems.

## Appendices

### Example Workflows and Patterns
- Task creation and assignment:
  - Open Create Task dialog, select type, fill metadata, assign patient/staff, set due date, optionally add subtasks and report template, submit.
- Task execution and reporting:
  - Open Task Detail, mark subtasks complete, submit structured report using template schema, status updates to completed.
- Escalation and delegation:
  - Head nurse/admin can update task ownership and status; use status filters to identify bottlenecks.
- Routine reset:
  - Head nurse/admin triggers reset routines for a shift date; clears non-pending routine tasks.

[No sources needed since this section summarizes patterns without analyzing specific files]