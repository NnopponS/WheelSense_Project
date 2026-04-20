# WheelSense MCP System

A comprehensive guide to the Model Context Protocol (MCP) implementation in the WheelSense platform.

## Overview

The WheelSense MCP server provides AI assistants with secure, scope-based access to workspace data and operations. It implements the [Model Context Protocol](https://modelcontextprotocol.io) to enable natural language interaction with wheelchair monitoring, patient workflows, smart devices, and facility management.

## Key Statistics

| Metric | Value |
|--------|-------|
| MCP Tools | 27 across 8 domains |
| MCP Scopes | 17 role-based permissions |
| MCP Prompts | 6 role-safe playbooks |
| MCP Resources | 4 live data feeds |
| Test Coverage | 52+ test cases |
| Authentication | OAuth + Bearer tokens |
| Transport | Streamable HTTP + SSE |

## What is MCP in WheelSense?

MCP (Model Context Protocol) standardizes how AI assistants:

1. **Access data** via resources (current user, patients, alerts, rooms)
2. **Execute operations** via tools (27 scoped, audited actions)
3. **Follow playbooks** via prompts (6 role-based guides)
4. **Authenticate securely** via OAuth with scope narrowing

The WheelSense implementation adds:
- **Actor context** - Every request carries user identity, workspace, role, and effective scopes
- **First-party runtime** - Internal agent orchestrates MCP calls with intent classification
- **3-stage confirmation** - Mutating actions require explicit user approval
- **Workspace isolation** - All data is scoped to the authenticated workspace

## MCP Server Endpoints

| Endpoint | Transport | Purpose |
|----------|-----------|---------|
| `POST /mcp` | Streamable HTTP | Primary MCP transport (JSON streaming) |
| `GET /mcp/sse` | SSE | Legacy compatibility endpoint |
| `GET /.well-known/oauth-protected-resource/mcp` | HTTP | OAuth metadata discovery |

## Available Tools Reference

### System Tools

| Tool | Scope | Description |
|------|-------|-------------|
| `get_system_health` | Any | Check platform backend health |
| `get_current_user_context` | Any | Read current actor identity and scopes |

### Workspace Tools

| Tool | Scope | Description |
|------|-------|-------------|
| `list_workspaces` | `workspace.read` | List workspace context |
| `list_facilities` | `workspace.read` | List facilities and floors |
| `get_facility_details` | `rooms.read` | Get facility with floors and rooms |
| `get_workspace_analytics` | `workspace.read` | Workspace analytics summary |
| `get_ai_runtime_summary` | `ai_settings.read` | AI provider configuration (admin) |

### Patient Tools

| Tool | Scope | Description |
|------|-------|-------------|
| `list_visible_patients` | `patients.read` | List patients visible to actor |
| `get_patient_details` | `patients.read` | Read single patient details |
| `update_patient_room` | `patients.write` | Update patient's facility room |
| `get_patient_vitals` | `patients.read` | Get patient vitals and observations |
| `get_patient_timeline` | `patients.read` | Get patient activity timeline |

### Device Tools

| Tool | Scope | Description |
|------|-------|-------------|
| `list_devices` | `devices.read` | List visible devices |
| `send_device_command` | `devices.command` | Send MQTT command to device |
| `trigger_camera_photo` | `cameras.capture` | Trigger camera capture |

### Alert Tools

| Tool | Scope | Description |
|------|-------|-------------|
| `list_active_alerts` | `alerts.read` | List active workspace alerts |
| `acknowledge_alert` | `alerts.manage` | Acknowledge an alert |
| `resolve_alert` | `alerts.manage` | Resolve an alert with note |
| `sos_create_alert` | `patients.read` | **Patient-only** SOS creation; requires `actor.role == "patient"` and `actor.patient_id` |

### Room Tools

| Tool | Scope | Description |
|------|-------|-------------|
| `list_rooms` | `rooms.read` | List workspace rooms |
| `get_floorplan_layout` | `rooms.read` | Get floorplan layout data |
| `control_room_smart_device` | `room_controls.use` | Control smart home device |

### Workflow Tools

| Tool | Scope | Description |
|------|-------|-------------|
| `list_workflow_tasks` | `workflow.read` | List visible tasks |
| `list_workflow_schedules` | `workflow.read` | List visible schedules |
| `create_workflow_task` | `workflow.write` | Create a care task |
| `update_workflow_task_status` | `workflow.write` | Claim, handoff, complete task |

### Messaging Tools

| Tool | Scope | Description |
|------|-------|-------------|
| `send_message` | `workflow.write` | Send message to staff/patient |
| `get_message_recipients` | `workspace.read` | Get available recipients |

## Authentication Flow

### Bearer Token Authentication

All MCP requests require a valid WheelSense JWT bearer token:

```http
Authorization: Bearer <jwt_token>
```

The token must be obtained through the standard WheelSense login flow:

```bash
# Login to get token
curl -X POST https://wheelsense.example.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "..."}'

# Use token with MCP
curl -H "Authorization: Bearer $TOKEN" \
  https://wheelsense.example.com/mcp/tools/list
```

### OAuth Protected Resource

For remote MCP clients, WheelSense supports OAuth scope narrowing:

```bash
# Discover OAuth metadata
curl https://wheelsense.example.com/.well-known/oauth-protected-resource/mcp

# Response:
{
  "resource": "wheelsense-mcp",
  "authorization_servers": ["..."],
  "scopes_supported": ["patients.read", "alerts.read", ...]
}
```

### Token Types

1. **Session Tokens** - Full role-based scopes, tied to auth session
2. **MCP Tokens** - Narrowed scopes, independently revocable

## Role-Based Access

### Scope Matrix by Role

| Scope | Admin | Head Nurse | Supervisor | Observer | Patient |
|-------|:-----:|:----------:|:----------:|:--------:|:-------:|
| `workspace.read` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `patients.read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `patients.write` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `alerts.read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `alerts.manage` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `devices.read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `devices.command` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `rooms.read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `room_controls.use` | ✅ | ❌ | ❌ | ❌ | ✅ |
| `workflow.read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `workflow.write` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `cameras.capture` | ✅ | ✅ | ❌ | ❌ | ❌ |

### Patient Visibility

- **Admin**: All patients in workspace
- **Head Nurse/Supervisor/Observer**: Only assigned patients via `caregiver_patient_access`
- **Patient**: Only their own linked patient record

## MCP Prompts (Role Playbooks)

Prompts guide AI assistants with role-appropriate instructions:

### `admin-operations`
Operational playbook for infrastructure, staffing, facilities, and broad workspace actions.

### `clinical-triage`
Playbook for reading patient state, alerts, and workflow queues safely. Do not diagnose; summarize risks and next operational steps.

### `observer-shift-assistant`
Playbook for floor staff tasking and alert follow-up. Focus on assigned patients, visible rooms, current tasks, and escalation hygiene.

### `patient-support`
Playbook for patient-safe assistance. Use simple language. Only use own-scope patient, room, and schedule information.

### `device-control`
Playbook for device and room-control operations. Validate target scope first, then describe the exact command or device mutation before execution.

### `facility-ops`
Playbook for facilities, floorplans, and room workflows. Ground on facilities, floors, rooms, and presence before proposing layout or room actions.

## MCP Resources

Resources provide live data via URI scheme `wheelsense://`:

### `wheelsense://current-user`
Current authenticated MCP user plus effective scopes and links.

```json
{
  "user_id": 1,
  "workspace_id": 1,
  "role": "admin",
  "patient_id": null,
  "caregiver_id": null,
  "scopes": ["patients.read", "patients.write", "alerts.read", ...]
}
```

### `wheelsense://patients/visible`
Patients visible to the acting MCP user after backend policy filtering.

### `wheelsense://alerts/active`
Workspace alerts filtered by the current user's visibility policy.

### `wheelsense://rooms`
Rooms visible inside the actor's workspace.

## Using MCP from External Clients

### Python Example

```python
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

async def use_wheelsense_mcp(token: str):
    headers = {"Authorization": f"Bearer {token}"}
    async with streamablehttp_client(
        "https://wheelsense.example.com/mcp",
        headers=headers,
    ) as (read_stream, write_stream, _):
        session = ClientSession(read_stream, write_stream)
        await session.initialize()
        
        # List available tools
        tools = await session.list_tools()
        
        # Call a tool
        result = await session.call_tool(
            "list_visible_patients",
            {}
        )
        return result
```

### TypeScript/JavaScript Example

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function useWheelsenseMCP(token: string) {
  const transport = new StreamableHTTPClientTransport(
    new URL("https://wheelsense.example.com/mcp"),
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  
  const client = new Client({ name: "example-client", version: "1.0.0" });
  await client.connect(transport);
  
  // List tools
  const tools = await client.listTools();
  
  // Call tool
  const result = await client.callTool({
    name: "list_visible_patients",
    arguments: {},
  });
  
  return result;
}
```

### cURL Example

```bash
# Health check (no auth required for base endpoint)
curl https://wheelsense.example.com/api/health

# MCP requires authentication
curl -H "Authorization: Bearer $TOKEN" \
  https://wheelsense.example.com/mcp/tools/list
```

## First-Party Agent Runtime

The WheelSense agent runtime (`server/app/agent_runtime/`) provides orchestration:

### Intent Classification

User messages are classified into intents with confidence scores:

```python
{
  "intent": "list_patients",
  "confidence": 0.95,
  "tool_name": "list_visible_patients",
  "arguments": {},
  "playbook": "clinical-triage",
  "entities": {}
}
```

### Execution Plan Generation

Compound intents generate multi-step execution plans:

```python
{
  "playbook": "clinical-triage",
  "summary": "List patients and check active alerts",
  "risk_level": "low",
  "steps": [
    {
      "id": "step-1",
      "title": "List visible patients",
      "tool_name": "list_visible_patients",
      "arguments": {},
      "risk_level": "low",
      "permission_basis": ["patients.read"]
    },
    {
      "id": "step-2",
      "title": "List active alerts",
      "tool_name": "list_active_alerts",
      "arguments": {},
      "risk_level": "low",
      "permission_basis": ["alerts.read"]
    }
  ],
  "affected_entities": [],
  "permission_basis": ["patients.read", "alerts.read"]
}
```

### 3-Stage Chat Flow

1. **Propose** - Classify intent, generate plan
2. **Confirm** - User reviews and approves
3. **Execute** - Run plan steps, return results

## Tool Annotations

All tools include metadata hints for AI assistants:

```python
{
  "title": "Acknowledge Alert",
  "readOnlyHint": False,      # True for reads only
  "destructiveHint": True,     # True if mutates data
  "idempotentHint": False,     # True if safe to retry
  "openWorldHint": False       # True if calls external APIs
}
```

## Error Handling

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 401 | Authentication required / invalid token |
| 403 | Insufficient scope / origin not allowed |
| 404 | Resource not found |
| 500 | Server error |

### Error Response Format

```json
{
  "detail": "MCP scope `patients.write` is required"
}
```

### WWW-Authenticate Header

On 401 responses:

```http
WWW-Authenticate: Bearer realm="wheelsense-mcp",
                   resource_metadata="/.well-known/oauth-protected-resource/mcp"
```

## Security Best Practices

1. **Never expose tokens** - Keep JWTs in HttpOnly cookies or secure storage
2. **Use narrowed scopes** - Request only scopes your client needs
3. **Validate origins** - Enable origin validation for production
4. **Monitor usage** - Review `last_used_at` for MCP tokens
5. **Revoke promptly** - Delete tokens when no longer needed

## Related Documentation

- [server/AGENTS.md](../server/AGENTS.md) - Server canonical memory
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [MCP implementation handoff](./plans/mcp-implementation-handoff.md) - Agent continuation notes (historical context)
- [frontend/README.md](../frontend/README.md) - Frontend integration
- [MCP Specification](https://modelcontextprotocol.io) - Official MCP docs

## SDK References

- [Python MCP SDK](https://github.com/modelcontextprotocol/python-sdk)
- [TypeScript MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)

---

*Last updated: April 2026*
