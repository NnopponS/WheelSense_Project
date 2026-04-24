---
name: wheelsense-mcp-tools
description: >-
  Adding MCP tools to the WheelSense platform with proper scope-based auth,
  tool annotations, and service integration.
---

# WheelSense MCP Tools Development

## Purpose

This skill guides adding new MCP (Model Context Protocol) tools to the WheelSense AI system. MCP tools expose workspace operations to AI assistants with proper authorization, scope checks, and semantic annotations.

## First Reads

1. `server/app/mcp/server.py` - Tool definitions and registry
2. `server/app/mcp/context.py` - Actor context dataclass
3. `server/app/api/dependencies.py` - Scope resolution helpers
4. `server/app/schemas/agent_runtime.py` - Tool output schemas (if needed)
5. This skill file

## Workflow: Adding a New MCP Tool

### 1. Determine Tool Scope and Risk Level

Before writing code, classify the tool:

| Aspect | Questions |
|--------|-----------|
| **Access pattern** | Read or write? Single row or list? |
| **Scope needed** | Which permission scope (e.g., `patients.read`)? |
| **Risk level** | Low (read), Medium (write), High (patient mutation) |
| **Idempotency** | Safe to retry? Same result on duplicate call? |
| **Destructive** | Does it mutate data or have side effects? |

### 2. Add Tool to `server/app/mcp/server.py`

**Basic structure:**

```python
@mcp.tool(
    name="your_tool_name",
    description="Clear, concise description of what the tool does.",
    annotations=mcp_types.ToolAnnotations(
        title="Human-Readable Title",
        readOnlyHint=True,      # Set based on classification
        destructiveHint=False,  # Set based on classification
        idempotentHint=True,    # Set based on classification
        openWorldHint=False,    # True only for external APIs
    ),
    structured_output=True,
)
async def your_tool_name(param: str) -> dict[str, Any]:
    # 1. Require scope
    _require_scope("your.scope")
    
    # 2. Get actor context
    actor = require_actor_context()
    
    # 3. Database operations
    async with AsyncSessionLocal() as db:
        # ... query logic
        return {"result": "data"}
```

### 3. Register the Tool

Add to `_WORKSPACE_TOOL_REGISTRY` at the bottom of the file:

```python
_WORKSPACE_TOOL_REGISTRY: dict[str, Callable[..., Awaitable[Any]]] = {
    # ... existing tools ...
    "your_tool_name": your_tool_name,
}
```

## Scope-Based Authorization Patterns

### Using `_require_scope()`

```python
# Simple scope check
_require_scope("patients.read")

# Multiple scope alternatives (custom logic)
actor = require_actor_context()
if "patients.read" not in actor.scopes and "patients.write" not in actor.scopes:
    raise PermissionError("MCP scope `patients.read` or `patients.write` is required")
```

### Patient Visibility Filtering

```python
from app.api.dependencies import get_visible_patient_ids, assert_patient_record_access_db

async def patient_scoped_query():
    actor = require_actor_context()
    _require_scope("patients.read")
    
    async with AsyncSessionLocal() as db:
        stmt = select(Patient).where(Patient.workspace_id == actor.workspace_id)
        
        # Filter by visible patients (for non-admin roles)
        visible_ids = await get_visible_patient_ids(db, actor.workspace_id, _actor_user())
        if visible_ids is not None:
            if not visible_ids:
                return []  # No access to any patients
            stmt = stmt.where(Patient.id.in_(visible_ids))
        
        rows = (await db.execute(stmt)).scalars().all()
        return [...]
```

### Single Patient Access Check

```python
async def get_patient_details(patient_id: int) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("patients.read")
    
    async with AsyncSessionLocal() as db:
        # This raises if patient not accessible
        await assert_patient_record_access_db(
            db, actor.workspace_id, _actor_user(), patient_id
        )
        patient = await patient_service.get(db, ws_id=actor.workspace_id, id=patient_id)
        return {...}
```

## Using Actor Context

### Getting Actor Information

```python
actor = require_actor_context()

# Core identity
actor.user_id          # Authenticated user ID
actor.workspace_id     # Current workspace
actor.role             # User role (admin, head_nurse, etc.)

# Links (may be None)
actor.patient_id       # Linked patient (for patient role)
actor.caregiver_id     # Linked caregiver (for staff roles)
actor.scopes           # Set of effective scopes
```

### Creating Actor User Proxy

For compatibility with service-layer auth helpers:

```python
def _actor_user() -> Any:
    actor = require_actor_context()
    return type(
        "McpActorUser",
        (),
        {
            "id": actor.user_id,
            "workspace_id": actor.workspace_id,
            "role": actor.role,
            "patient_id": actor.patient_id,
            "caregiver_id": actor.caregiver_id,
        },
    )()
```

## Tool Annotation Standards

### Read-Only Tools

```python
@mcp.tool(
    name="list_visible_patients",
    description="List patients visible to the acting user after backend policy filtering.",
    annotations=mcp_types.ToolAnnotations(
        title="List Visible Patients",
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,  # Same query, same results
        openWorldHint=False,
    ),
    structured_output=True,
)
```

### Destructive/Mutation Tools

```python
@mcp.tool(
    name="acknowledge_alert",
    description="Acknowledge an alert as the current authenticated actor.",
    annotations=mcp_types.ToolAnnotations(
        title="Acknowledge Alert",
        readOnlyHint=False,
        destructiveHint=True,   # Changes alert status
        idempotentHint=False,   # Second call may error (already acked)
        openWorldHint=False,
    ),
    structured_output=True,
)
```

### External API Tools

```python
@mcp.tool(
    name="control_room_smart_device",
    description="Control a room smart device with patient-safe room scoping.",
    annotations=mcp_types.ToolAnnotations(
        title="Control Room Smart Device",
        readOnlyHint=False,
        destructiveHint=True,
        idempotentHint=False,
        openWorldHint=True,     # Calls Home Assistant
    ),
    structured_output=True,
)
```

## Calling Existing Services from Tools

Reuse service layer business logic:

```python
from app.services.patient import patient_service
from app.services.activity import alert_service
from app.services.workflow import care_task_service

@mcp.tool(...)
async def acknowledge_alert(alert_id: int) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("alerts.manage")
    
    async with AsyncSessionLocal() as db:
        # Use service layer
        out = await alert_service.acknowledge(
            db,
            ws_id=actor.workspace_id,
            alert_id=alert_id,
            caregiver_id=actor.caregiver_id,
        )
        return {"id": out.id, "status": out.status}
```

## Example Tool Implementations

### Simple Read Tool

```python
@mcp.tool(
    name="get_system_health",
    description="Checks if the WheelSense platform backend is healthy.",
    annotations=mcp_types.ToolAnnotations(
        title="System Health",
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def get_system_health() -> dict[str, Any]:
    return {"status": "ok", "message": "WheelSense Platform is running and healthy."}
```

### Scoped List Tool with Visibility

```python
@mcp.tool(
    name="list_active_alerts",
    description="List active alerts filtered by the acting user's patient visibility.",
    annotations=mcp_types.ToolAnnotations(
        title="List Active Alerts",
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def list_active_alerts() -> list[dict[str, Any]]:
    actor = require_actor_context()
    _require_scope("alerts.read")
    
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Alert)
            .where(Alert.workspace_id == actor.workspace_id, Alert.status != "resolved")
            .order_by(Alert.timestamp.desc())
            .limit(100)
        )
        visible_ids = await get_visible_patient_ids(db, actor.workspace_id, _actor_user())
        rows = result.scalars().all()
        return [
            {"id": row.id, "alert_type": row.alert_type, ...}
            for row in rows
            if visible_ids is None or row.patient_id in visible_ids
        ]
```

### Destructive Tool with Validation

```python
@mcp.tool(
    name="update_patient_room",
    description="Update the canonical facility room for a visible patient.",
    annotations=mcp_types.ToolAnnotations(
        title="Update Patient Room",
        readOnlyHint=False,
        destructiveHint=True,
        idempotentHint=True,  # Same room = same result
        openWorldHint=False,
    ),
    structured_output=True,
)
async def update_patient_room(patient_id: int, room_id: int | None) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("patients.write")
    
    async with AsyncSessionLocal() as db:
        # Verify access
        await assert_patient_record_access_db(db, actor.workspace_id, _actor_user(), patient_id)
        
        # Get and update
        patient = await patient_service.get(db, ws_id=actor.workspace_id, id=patient_id)
        if not patient:
            raise ValueError("Patient not found")
        
        updated = await patient_service.update(
            db, ws_id=actor.workspace_id, db_obj=patient,
            obj_in=PatientUpdate(room_id=room_id),
        )
        return {"id": updated.id, "room_id": updated.room_id, "message": "Room updated."}
```

### MQTT Command Tool

```python
async def _publish_camera_command(device_id_str: str, payload: dict[str, Any]) -> None:
    topic = f"WheelSense/camera/{device_id_str}/control"
    async with aiomqtt.Client(...) as client:
        await client.publish(topic, json.dumps(payload))

@mcp.tool(
    name="trigger_camera_photo",
    description="Trigger a camera capture for a visible camera device.",
    annotations=mcp_types.ToolAnnotations(
        title="Trigger Camera Photo",
        readOnlyHint=False,
        destructiveHint=True,
        idempotentHint=False,
        openWorldHint=False,
    ),
    structured_output=True,
)
async def trigger_camera_photo(device_pk: int) -> dict[str, Any]:
    actor = require_actor_context()
    _require_scope("cameras.capture")
    
    async with AsyncSessionLocal() as db:
        dev = await db.get(Device, device_pk)
        if not dev or dev.workspace_id != actor.workspace_id:
            raise ValueError("Camera not found")
        if dev.device_type != "camera":
            raise ValueError("Device is not a camera")
        
        await _publish_camera_command(dev.device_id, {"command": "capture_frame"})
        return {"device_id": dev.device_id, "message": "Triggered capture"}
```

## Verification

After adding a tool:

1. **Run MCP tests:**
   ```bash
   cd server
   python -m pytest tests/test_mcp_server.py -v
   ```

2. **Test the tool directly:**
   ```bash
   # Get tools list
   curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:8000/mcp/tools/list
   
   # Call the tool
   curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"name": "your_tool_name", "arguments": {}}' \
     http://localhost:8000/mcp/tools/call
   ```

3. **Verify annotations:** Check that `readOnlyHint`, `destructiveHint`, etc. are correct

4. **Test scope enforcement:** Verify 401/403 for missing scopes

## Related Skills

- `wheelsense-agent-runtime` - Planning and execution flow
- `wheelsense-chat-actions` - Frontend action integration
- `wheelsense-workflow` - General backend workflow
