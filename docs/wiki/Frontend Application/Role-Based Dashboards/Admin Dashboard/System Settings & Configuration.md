# System Settings & Configuration

<cite>
**Referenced Files in This Document**
- [page.tsx](file://frontend/app/admin/settings/page.tsx)
- [SettingsClient.tsx](file://frontend/app/admin/settings/SettingsClient.tsx)
- [AiSettingsPanel.tsx](file://frontend/components/admin/settings/AiSettingsPanel.tsx)
- [ServerSettingsPanel.tsx](file://frontend/components/admin/settings/ServerSettingsPanel.tsx)
- [ai_settings.py](file://server/app/api/endpoints/ai_settings.py)
- [ai_settings.py](file://server/app/schemas/ai_settings.py)
- [workspaces.py](file://server/app/api/endpoints/workspaces.py)
- [retention.py](file://server/app/services/retention.py)
- [retention_worker.py](file://server/app/workers/retention_worker.py)
- [retention.py](file://server/app/api/endpoints/retention.py)
- [database_clear.py](file://server/app/services/database_clear.py)
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

## Introduction
This document describes the System Settings and Configuration functionality in the Admin Dashboard. It covers the administrative configuration interface for workspace settings, global system parameters, integration configurations, and platform-wide preferences. It documents the AI settings panel, server settings panel, and configuration validation processes. It also explains workspace-scoped settings management, system-wide parameter controls, and integration point configurations, including AI provider selection, Copilot device flow, Ollama model management, retention policies, simulator controls, and database clearing.

## Project Structure
The Admin Settings feature spans the frontend Next.js application and the FastAPI backend:
- Frontend pages and components render the settings UI and orchestrate queries and actions.
- Backend endpoints expose configuration APIs for AI settings, retention, simulator, and database operations.

```mermaid
graph TB
subgraph "Frontend"
A["Admin Settings Page<br/>page.tsx"]
B["Admin Settings Client<br/>SettingsClient.tsx"]
C["AI Settings Panel<br/>AiSettingsPanel.tsx"]
D["Server Settings Panel<br/>ServerSettingsPanel.tsx"]
end
subgraph "Backend"
E["AI Settings Endpoints<br/>ai_settings.py"]
F["Workspaces Endpoints<br/>workspaces.py"]
G["Retention Services<br/>retention.py"]
H["Retention Worker<br/>retention_worker.py"]
I["Retention API<br/>retention.py"]
J["Database Clear Service<br/>database_clear.py"]
end
A --> B
B --> C
B --> D
C --> E
D --> F
D --> G
G --> H
D --> I
D --> J
```

**Diagram sources**
- [page.tsx:1-19](file://frontend/app/admin/settings/page.tsx#L1-L19)
- [SettingsClient.tsx:1-114](file://frontend/app/admin/settings/SettingsClient.tsx#L1-L114)
- [AiSettingsPanel.tsx:1-1098](file://frontend/components/admin/settings/AiSettingsPanel.tsx#L1-L1098)
- [ServerSettingsPanel.tsx:1-405](file://frontend/components/admin/settings/ServerSettingsPanel.tsx#L1-L405)
- [ai_settings.py:1-339](file://server/app/api/endpoints/ai_settings.py#L1-L339)
- [workspaces.py:1-58](file://server/app/api/endpoints/workspaces.py#L1-L58)
- [retention.py:106-147](file://server/app/services/retention.py#L106-L147)
- [retention_worker.py:42-87](file://server/app/workers/retention_worker.py#L42-L87)
- [retention.py:35-53](file://server/app/api/endpoints/retention.py#L35-L53)
- [database_clear.py:182-196](file://server/app/services/database_clear.py#L182-L196)

**Section sources**
- [page.tsx:1-19](file://frontend/app/admin/settings/page.tsx#L1-L19)
- [SettingsClient.tsx:1-114](file://frontend/app/admin/settings/SettingsClient.tsx#L1-L114)

## Core Components
- Admin Settings Page: Renders a suspense wrapper and mounts the client-side settings shell.
- Admin Settings Client: Manages tab navigation (profile, AI, server, audit, system), integrates with translations and routing, and renders the selected panel.
- AI Settings Panel: Displays effective AI settings, allows selecting workspace defaults, manages Copilot device flow, lists and pulls Ollama models, and deletes models.
- Server Settings Panel: Shows connection info, simulator controls, retention configuration and stats, ML calibration link, and database clearing.

**Section sources**
- [SettingsClient.tsx:15-111](file://frontend/app/admin/settings/SettingsClient.tsx#L15-L111)
- [AiSettingsPanel.tsx:311-1098](file://frontend/components/admin/settings/AiSettingsPanel.tsx#L311-L1098)
- [ServerSettingsPanel.tsx:64-405](file://frontend/components/admin/settings/ServerSettingsPanel.tsx#L64-L405)

## Architecture Overview
The Admin Dashboard delegates configuration concerns to backend endpoints. The AI settings panel communicates with AI endpoints for provider/model resolution, Copilot device flow, and Ollama model operations. The server settings panel coordinates with workspace endpoints, retention services, and database clearing.

```mermaid
sequenceDiagram
participant Admin as "Admin Settings Client"
participant AIUI as "AI Settings Panel"
participant Backend as "AI Settings Endpoint"
participant Ollama as "Ollama API"
participant GH as "GitHub OAuth"
Admin->>AIUI : Render AI tab
AIUI->>Backend : GET /settings/ai
Backend-->>AIUI : Current settings
AIUI->>Backend : GET /settings/ai/ollama/models
Backend->>Ollama : GET /api/tags
Ollama-->>Backend : Models list
Backend-->>AIUI : Models list
AIUI->>Backend : POST /settings/ai/copilot/device-code
Backend->>GH : POST device code
GH-->>Backend : device_code,user_code,...
Backend-->>AIUI : device_code response
AIUI->>Backend : POST /settings/ai/copilot/poll-token
Backend->>GH : Poll access token
GH-->>Backend : access_token
Backend-->>AIUI : Token stored
```

**Diagram sources**
- [AiSettingsPanel.tsx:314-341](file://frontend/components/admin/settings/AiSettingsPanel.tsx#L314-L341)
- [ai_settings.py:62-96](file://server/app/api/endpoints/ai_settings.py#L62-L96)
- [ai_settings.py:245-281](file://server/app/api/endpoints/ai_settings.py#L245-L281)
- [ai_settings.py:172-200](file://server/app/api/endpoints/ai_settings.py#L172-L200)
- [ai_settings.py:202-243](file://server/app/api/endpoints/ai_settings.py#L202-L243)

## Detailed Component Analysis

### AI Settings Panel
The AI settings panel aggregates effective settings, workspace defaults, and provider-specific capabilities. It supports:
- Effective runtime summary: current provider, current model, runtime connectivity, and Ollama origin.
- Workspace defaults: choose provider and model, save globally for the workspace.
- Copilot device flow: request device code, poll token, and persist encrypted token.
- Ollama model management: list models, pull via streaming NDJSON, and delete models.

```mermaid
flowchart TD
Start([Render AI Settings]) --> LoadSettings["GET /settings/ai"]
LoadSettings --> LoadOllama["GET /settings/ai/ollama/models"]
LoadSettings --> LoadCopilotStatus["GET /settings/ai/copilot/status"]
LoadCopilotStatus --> HasToken{"Token present?"}
HasToken --> |Yes| CopilotOK["Connected"]
HasToken --> |No| CopilotFlow["Device Flow"]
CopilotFlow --> RequestCode["POST /settings/ai/copilot/device-code"]
RequestCode --> PollToken["POST /settings/ai/copilot/poll-token"]
PollToken --> SaveToken["Store encrypted token"]
SaveToken --> Refresh["Refresh models/status"]
Refresh --> Done([Ready])
LoadOllama --> Pull["POST /settings/ai/ollama/pull (stream)"]
Pull --> UpdateList["Refresh models"]
UpdateList --> Done
```

**Diagram sources**
- [AiSettingsPanel.tsx:314-341](file://frontend/components/admin/settings/AiSettingsPanel.tsx#L314-L341)
- [ai_settings.py:119-136](file://server/app/api/endpoints/ai_settings.py#L119-L136)
- [ai_settings.py:172-200](file://server/app/api/endpoints/ai_settings.py#L172-L200)
- [ai_settings.py:202-243](file://server/app/api/endpoints/ai_settings.py#L202-L243)
- [ai_settings.py:283-305](file://server/app/api/endpoints/ai_settings.py#L283-L305)

**Section sources**
- [AiSettingsPanel.tsx:311-1098](file://frontend/components/admin/settings/AiSettingsPanel.tsx#L311-L1098)
- [ai_settings.py:62-96](file://server/app/api/endpoints/ai_settings.py#L62-L96)
- [ai_settings.py:119-136](file://server/app/api/endpoints/ai_settings.py#L119-L136)
- [ai_settings.py:138-170](file://server/app/api/endpoints/ai_settings.py#L138-L170)
- [ai_settings.py:172-200](file://server/app/api/endpoints/ai_settings.py#L172-L200)
- [ai_settings.py:202-243](file://server/app/api/endpoints/ai_settings.py#L202-L243)
- [ai_settings.py:245-281](file://server/app/api/endpoints/ai_settings.py#L245-L281)
- [ai_settings.py:283-305](file://server/app/api/endpoints/ai_settings.py#L283-L305)
- [ai_settings.py:307-325](file://server/app/api/endpoints/ai_settings.py#L307-L325)

### Server Settings Panel
The server settings panel exposes:
- Connection info: current workspace and API proxy note.
- Simulator controls: reset simulator and show statistics when in simulator mode.
- Retention configuration: enable/disable, policy windows, and interval.
- Retention stats: per-table row counts and totals.
- Immediate retention run scoped to the active workspace.
- ML calibration link to the ML Calibration client.
- Database clearing with admin confirmation and password.

```mermaid
sequenceDiagram
participant Admin as "Admin Settings Client"
participant SUI as "Server Settings Panel"
participant WS as "Workspaces Endpoint"
participant RET as "Retention API"
participant SRV as "Retention Service"
participant DB as "Database Clear Service"
Admin->>SUI : Render server tab
SUI->>WS : GET /workspaces
WS-->>SUI : Workspaces list
SUI->>RET : GET /retention/config
SUI->>RET : GET /retention/stats (scoped)
SUI->>RET : POST /retention/run (scoped)
RET->>SRV : run_full_cleanup(...)
SRV-->>RET : Report
RET-->>SUI : Report
SUI->>DB : POST /admin/database/clear {password}
DB-->>SUI : Stats
```

**Diagram sources**
- [ServerSettingsPanel.tsx:64-174](file://frontend/components/admin/settings/ServerSettingsPanel.tsx#L64-L174)
- [workspaces.py:15-23](file://server/app/api/endpoints/workspaces.py#L15-L23)
- [retention.py:35-53](file://server/app/api/endpoints/retention.py#L35-L53)
- [retention.py:134-147](file://server/app/services/retention.py#L134-L147)
- [database_clear.py:182-196](file://server/app/services/database_clear.py#L182-L196)

**Section sources**
- [ServerSettingsPanel.tsx:64-405](file://frontend/components/admin/settings/ServerSettingsPanel.tsx#L64-L405)
- [workspaces.py:15-23](file://server/app/api/endpoints/workspaces.py#L15-L23)
- [retention.py:35-53](file://server/app/api/endpoints/retention.py#L35-L53)
- [retention.py:106-147](file://server/app/services/retention.py#L106-L147)
- [database_clear.py:182-196](file://server/app/services/database_clear.py#L182-L196)

### AI Settings Backend Schema and Validation
The backend defines strict request/response models for AI settings, ensuring validated inputs and consistent outputs.

```mermaid
classDiagram
class AISettingsOut {
+provider
+model
+workspace_default_provider
+workspace_default_model
}
class AIWorkspaceSettingsUpdate {
+provider
+model
}
class GlobalAISettingsUpdate {
+default_provider
+default_model
}
class CopilotDeviceCodeOut {
+device_code
+user_code
+verification_uri
+expires_in
+interval
}
class CopilotPollIn {
+device_code
}
class CopilotPollOut {
+status
+access_token
+token_type
+scope
}
class CopilotStatusOut {
+connected
}
class CopilotModelInfo {
+id
+name
+supports_reasoning_effort
+supports_vision
}
class CopilotModelsOut {
+models
+connected
+message
}
class OllamaModelInfo {
+name
+size
+digest
}
class OllamaModelsOut {
+models
+reachable
+origin
+message
}
class OllamaPullIn {
+name
}
```

**Diagram sources**
- [ai_settings.py:10-73](file://server/app/schemas/ai_settings.py#L10-L73)

**Section sources**
- [ai_settings.py:10-73](file://server/app/schemas/ai_settings.py#L10-L73)

### Workspace-Scoped Settings Management
Workspace-scoped settings are enforced by backend services and panels:
- Workspace activation updates the current user’s active workspace.
- Base service prevents accidental workspace_id changes during updates.
- AI workspace defaults are persisted per workspace.

```mermaid
flowchart TD
A["Admin selects workspace"] --> B["POST /workspaces/{ws_id}/activate"]
B --> C["User workspace_id updated"]
C --> D["Subsequent writes preserve workspace_id"]
```

**Diagram sources**
- [workspaces.py:41-57](file://server/app/api/endpoints/workspaces.py#L41-L57)
- [base.py:76-78](file://server/app/services/base.py#L76-L78)

**Section sources**
- [workspaces.py:41-57](file://server/app/api/endpoints/workspaces.py#L41-L57)
- [base.py:76-78](file://server/app/services/base.py#L76-L78)

### Retention and Data Lifecycle Controls
Retention is configurable and can be scheduled or triggered manually:
- Configuration includes enable flag, per-table retention windows, and interval.
- Stats provide per-table counts and age range.
- Manual run triggers cleanup for the active workspace.

```mermaid
sequenceDiagram
participant Admin as "Admin Settings Client"
participant API as "Retention API"
participant SVC as "Retention Service"
participant SCH as "Retention Worker"
Admin->>API : GET /retention/config
Admin->>API : GET /retention/stats (scoped)
Admin->>API : POST /retention/run (scoped)
API->>SVC : run_full_cleanup(...)
SVC-->>API : Report(total_deleted, duration)
API-->>Admin : Report
SCH->>SVC : Scheduled cleanup (interval)
```

**Diagram sources**
- [retention.py:35-53](file://server/app/api/endpoints/retention.py#L35-L53)
- [retention.py:106-147](file://server/app/services/retention.py#L106-L147)
- [retention_worker.py:55-78](file://server/app/workers/retention_worker.py#L55-L78)

**Section sources**
- [retention.py:35-53](file://server/app/api/endpoints/retention.py#L35-L53)
- [retention.py:106-147](file://server/app/services/retention.py#L106-L147)
- [retention_worker.py:42-87](file://server/app/workers/retention_worker.py#L42-L87)

### Database Clearing and Backup/Restore Procedures
Database clearing requires explicit admin confirmation and password. The service supports preserving a user and workspace while wiping others, or a full wipe. There is no explicit backup/restore endpoint in the referenced files.

```mermaid
flowchart TD
Start([Admin initiates clear]) --> Confirm{"Confirmed?"}
Confirm --> |No| Abort([Abort])
Confirm --> |Yes| Send["POST /admin/database/clear {password}"]
Send --> Mode{"Preserve user?"}
Mode --> |Yes| Preserve["Preserve user/workspace"]
Mode --> |No| Wipe["Full wipe"]
Preserve --> Done([Done])
Wipe --> Done
```

**Diagram sources**
- [ServerSettingsPanel.tsx:118-136](file://frontend/components/admin/settings/ServerSettingsPanel.tsx#L118-L136)
- [database_clear.py:182-196](file://server/app/services/database_clear.py#L182-L196)

**Section sources**
- [ServerSettingsPanel.tsx:118-136](file://frontend/components/admin/settings/ServerSettingsPanel.tsx#L118-L136)
- [database_clear.py:182-196](file://server/app/services/database_clear.py#L182-L196)

## Dependency Analysis
- Frontend depends on backend endpoints for AI settings, retention, simulator, and database operations.
- Backend enforces role-based access for sensitive operations (admin-only).
- Workspace scoping ensures data isolation across workspaces.
- AI settings integrate with external providers (Ollama, GitHub Copilot) via backend proxies.

```mermaid
graph LR
UI["Admin Settings UI"] --> EP1["AI Settings Endpoints"]
UI --> EP2["Workspaces Endpoints"]
UI --> EP3["Retention API"]
EP1 --> EXT1["Ollama API"]
EP1 --> EXT2["GitHub OAuth"]
EP3 --> SVC["Retention Service"]
SVC --> WK["Retention Worker"]
```

**Diagram sources**
- [AiSettingsPanel.tsx:314-341](file://frontend/components/admin/settings/AiSettingsPanel.tsx#L314-L341)
- [ai_settings.py:245-281](file://server/app/api/endpoints/ai_settings.py#L245-L281)
- [ai_settings.py:172-200](file://server/app/api/endpoints/ai_settings.py#L172-L200)
- [workspaces.py:15-23](file://server/app/api/endpoints/workspaces.py#L15-L23)
- [retention.py:35-53](file://server/app/api/endpoints/retention.py#L35-L53)
- [retention_worker.py:55-78](file://server/app/workers/retention_worker.py#L55-L78)

**Section sources**
- [ai_settings.py:1-339](file://server/app/api/endpoints/ai_settings.py#L1-L339)
- [workspaces.py:1-58](file://server/app/api/endpoints/workspaces.py#L1-L58)
- [retention.py:35-53](file://server/app/api/endpoints/retention.py#L35-L53)
- [retention_worker.py:42-87](file://server/app/workers/retention_worker.py#L42-L87)

## Performance Considerations
- AI model listing and Ollama pulls are streamed to avoid blocking the UI; polling intervals adapt to slow-down signals.
- Retention runs are scoped to the active workspace and can be scheduled at configured intervals.
- Queries use appropriate stale times and polling intervals to balance freshness and load.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
- Copilot device flow failures: Check backend GitHub OAuth configuration and network connectivity; review error classification and status messages.
- Ollama unreachability: Verify Ollama origin configuration and network access; the UI surfaces reachability hints.
- Retention run failures: Inspect logs for exceptions and confirm workspace scope; re-run after resolving underlying issues.
- Database clear failures: Ensure correct password and confirmation; check service logs for detailed errors.

**Section sources**
- [AiSettingsPanel.tsx:527-537](file://frontend/components/admin/settings/AiSettingsPanel.tsx#L527-L537)
- [ai_settings.py:255-262](file://server/app/api/endpoints/ai_settings.py#L255-L262)
- [retention_worker.py:49-50](file://server/app/workers/retention_worker.py#L49-L50)
- [ServerSettingsPanel.tsx:118-136](file://frontend/components/admin/settings/ServerSettingsPanel.tsx#L118-L136)

## Conclusion
The Admin Dashboard provides a comprehensive configuration surface for AI providers, server lifecycle, and data retention. Workspace-scoped settings ensure isolation, while backend endpoints enforce validation and secure operations. Integrations with Ollama and GitHub Copilot are exposed through controlled endpoints, and retention and simulator controls help maintain system health and development workflows.