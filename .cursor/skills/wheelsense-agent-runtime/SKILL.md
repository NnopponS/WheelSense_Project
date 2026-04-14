---
name: wheelsense-agent-runtime
description: >-
  WheelSense agent runtime for AI planning, intent recognition, and
  execution plan management. Plan/ground/execute flow for chat actions.
---

# WheelSense Agent Runtime

## Purpose

The agent runtime handles AI intent recognition, execution planning, and grounding for the WheelSense chat system. It bridges natural language user requests to MCP tool calls through a structured plan/ground/execute flow.

## First Reads

1. `server/app/agent_runtime/service.py` - Core planning and execution logic
2. `server/app/schemas/agent_runtime.py` - Execution plan schemas
3. `server/app/mcp/server.py` - Available MCP tools
4. `server/app/schemas/chat_actions.py` - Chat action schemas
5. This skill file

## Architecture Overview

```
User Message
    |
    v
+-------------+
| propose_turn |  (intent recognition)
+-------------+
    |
    +---> "answer" mode (direct AI reply)
    |
    +---> "plan" mode (execution plan)
              |
              v
        +-------------+
        | _plan_for_message |
        +-------------+
              |
              v
        +-------------+
        | ExecutionPlan |
        +-------------+
              |
              v
        +-------------+
        | Chat Action   |  (persisted proposal)
        +-------------+
              |
              v
        +-------------+
        | User Confirm  |
        +-------------+
              |
              v
        +-------------+
        | execute_plan  |
        +-------------+
              |
              v
        MCP Tool Calls
```

## Plan/Ground/Execute Flow

### 1. Plan Phase (`propose_turn`)

The runtime analyzes the user message and decides:

- **Answer mode** (`mode="answer"`) - Return direct AI response
- **Plan mode** (`mode="plan"`) - Create execution plan requiring confirmation

```python
async def propose_turn(
    *,
    actor_access_token: str,
    message: str,
    messages: list[ChatMessagePart],
    conversation_id: int | None,
) -> AgentRuntimeProposeResponse:
```

### 2. Ground Phase (Immediate Tools)

Some queries can be answered immediately by calling a read-only tool:

```python
if any(token in lowered for token in ("system health", "system status")):
    return "answer", None, ("get_system_health", {})
```

### 3. Execute Phase (`execute_plan`)

For confirmed plans, execute each step sequentially:

```python
async def execute_plan(
    *,
    actor_access_token: str,
    execution_plan: ExecutionPlan,
) -> AgentRuntimeExecuteResponse:
```

## Adding New Intent Patterns

### Step 1: Add Intent Recognition

Edit `_plan_for_message()` in `server/app/agent_runtime/service.py`:

```python
def _plan_for_message(message: str) -> tuple[str, ExecutionPlan | None, tuple[str, dict] | None]:
    lowered = message.lower()
    
    # Check for your new intent pattern
    if any(token in lowered for token in ("your keyword", "synonym")):
        return "answer", None, ("tool_name", {"arg": "value"})
    
    # Existing patterns...
```

### Step 2: Add Extraction Pattern (for IDs)

```python
import re

def _extract_numeric(message: str, pattern: str) -> int | None:
    match = re.search(pattern, message, flags=re.IGNORECASE)
    if not match:
        return None
    return int(match.group(1))

# Usage
entity_id = _extract_numeric(message, r"(?:keyword)\s+#?(\d+)")
if entity_id is not None:
    return "answer", None, ("get_entity", {"entity_id": entity_id})
```

### Step 3: Add Execution Plan (for multi-step)

```python
entity_id = _extract_numeric(message, r"(?:action keyword)\s+#?(\d+)")
if entity_id is not None:
    plan = ExecutionPlan(
        playbook="appropriate-playbook",  # e.g., clinical-triage, facility-ops
        summary=f"Perform action on entity {entity_id}.",
        reasoning_target="medium",  # low/medium/high
        model_target="copilot:gpt-4.1",
        risk_level="medium",  # low/medium/high
        permission_basis=["required.scope"],
        affected_entities=[{"type": "entity_type", "id": entity_id}],
        steps=[
            ExecutionPlanStep(
                id="step-id",
                title="Human-readable step title",
                tool_name="mcp_tool_name",
                arguments={"entity_id": entity_id},
                risk_level="medium",
                permission_basis=["required.scope"],
                affected_entities=[{"type": "entity_type", "id": entity_id}],
                requires_confirmation=True,
            )
        ],
    )
    return "plan", plan, None
```

## Creating Execution Plans

### ExecutionPlan Fields

| Field | Type | Description |
|-------|------|-------------|
| `playbook` | str | Context prompt: `clinical-triage`, `facility-ops`, `device-control`, `admin-operations` |
| `summary` | str | Human-readable plan summary |
| `reasoning_target` | Literal | `low`, `medium`, `high` - AI reasoning depth |
| `model_target` | str | Target model, e.g., `copilot:gpt-4.1` |
| `risk_level` | Literal | `low`, `medium`, `high` - Risk classification |
| `steps` | list | Ordered `ExecutionPlanStep` objects |
| `permission_basis` | list | Scopes required for this plan |
| `affected_entities` | list | Entities this plan touches |

### ExecutionPlanStep Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | str | Unique step identifier |
| `title` | str | Human-readable step description |
| `tool_name` | str | MCP tool to call |
| `arguments` | dict | Tool arguments |
| `risk_level` | Literal | Step-specific risk level |
| `permission_basis` | list | Scopes for this step |
| `affected_entities` | list | Entities this step affects |
| `requires_confirmation` | bool | Always `True` for mutating operations |

### Common Playbook Values

- `clinical-triage` - Patient care, alerts, vitals
- `facility-ops` - Rooms, facilities, patient placement
- `device-control` - Cameras, devices, smart controls
- `admin-operations` - Workspace settings, user management
- `observer-shift-assistant` - Tasks, schedules for floor staff
- `patient-support` - Patient-facing operations

## Example Intent Patterns

### Simple Read Pattern

```python
# "List rooms", "Show rooms", "Room list"
if any(token in lowered for token in ("list rooms", "show rooms", "room list")):
    return "answer", None, ("list_rooms", {})
```

### Extract and Read Pattern

```python
# "Show patient 123", "Get patient #456"
patient_id = _extract_numeric(message, r"(?:show patient|get patient)\s+#?(\d+)")
if patient_id is not None:
    return "answer", None, ("get_patient_details", {"patient_id": patient_id})
```

### Execution Plan Pattern (Mutation)

```python
# "Move patient 123 to room 456"
patient_id = _extract_numeric(message, r"(?:move patient)\s+#?(\d+)")
room_id = _extract_numeric(message, r"(?:room)\s+#?(\d+)")
if patient_id is not None and room_id is not None:
    plan = ExecutionPlan(
        playbook="facility-ops",
        summary=f"Move patient {patient_id} to room {room_id}.",
        reasoning_target="medium",
        model_target="copilot:gpt-4.1",
        risk_level="high",
        permission_basis=["patients.write"],
        affected_entities=[
            {"type": "patient", "id": patient_id},
            {"type": "room", "id": room_id},
        ],
        steps=[
            ExecutionPlanStep(
                id="update-patient-room",
                title=f"Update patient {patient_id} room assignment",
                tool_name="update_patient_room",
                arguments={"patient_id": patient_id, "room_id": room_id},
                risk_level="high",
                permission_basis=["patients.write"],
                affected_entities=[
                    {"type": "patient", "id": patient_id},
                    {"type": "room", "id": room_id},
                ],
            )
        ],
    )
    return "plan", plan, None
```

## Testing Agent Runtime Changes

### Unit Tests

Add tests to verify intent recognition:

```python
def test_plan_for_message_list_rooms():
    mode, plan, immediate = _plan_for_message("List all rooms")
    assert mode == "answer"
    assert immediate == ("list_rooms", {})

def test_plan_for_message_acknowledge_alert():
    mode, plan, immediate = _plan_for_message("Acknowledge alert #42")
    assert mode == "plan"
    assert plan is not None
    assert plan.steps[0].tool_name == "acknowledge_alert"
```

### Integration Test

```bash
# Start the server
cd server && docker compose up -d

# Test the proposal endpoint
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "List rooms", "messages": [{"role": "user", "content": "List rooms"}]}' \
  http://localhost:8000/api/chat/actions/propose
```

## Integration with Chat Actions

The runtime feeds into the chat actions system:

```python
# In chat_actions.py
runtime = await agent_runtime_client.propose_turn(
    actor_access_token=actor_access_token,
    message=body.message,
    messages=messages,
    conversation_id=body.conversation_id,
)

# Persist action if plan mode
if runtime.action_payload is not None:
    action_row = await ai_chat.propose_chat_action(
        db, ws_id=workspace.id, actor=user,
        payload=ChatActionProposeIn.model_validate(runtime.action_payload),
    )
```

## Frontend Integration

The frontend `AIChatPopup` handles:

1. **Proposal display** - Shows plan summary and risk level
2. **Confirmation UI** - User can approve/reject the plan
3. **Execution result** - Displays tool execution results

Key flow in `frontend/components/ai/AIChatPopup.tsx`:
- `POST /api/chat/actions/propose` - Submit message
- `POST /api/chat/actions/{id}/confirm` - Approve
- `POST /api/chat/actions/{id}/execute` - Execute

## Verification Checklist

After adding intent patterns:

- [ ] Intent recognized correctly
- [ ] IDs extracted with regex
- [ ] ExecutionPlan has correct playbook
- [ ] Risk level appropriate
- [ ] Permission basis matches tool scopes
- [ ] Steps reference correct tool names
- [ ] Tool exists in `_WORKSPACE_TOOL_REGISTRY`
- [ ] Tests pass

## Related Skills

- `wheelsense-mcp-tools` - MCP tool development
- `wheelsense-chat-actions` - 3-stage action flow
- `wheelsense-workflow` - General backend patterns
