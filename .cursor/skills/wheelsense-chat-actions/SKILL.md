---
name: wheelsense-chat-actions
description: >-
  WheelSense chat actions 3-stage flow (propose -> confirm -> execute).
  Creating action proposals, handling confirmations, execution plan
  persistence, and frontend integration patterns.
---

# WheelSense Chat Actions

## Purpose

Chat actions provide a safe, auditable 3-stage flow for AI-initiated operations in WheelSense. Users see proposed actions, confirm them explicitly, and the system executes with full traceability.

## First Reads

1. `server/app/api/endpoints/chat_actions.py` - API endpoints
2. `server/app/schemas/chat_actions.py` - Request/response schemas
3. `server/app/services/ai_chat.py` - Action persistence (propose/confirm/execute)
4. `server/app/agent_runtime/service.py` - Execution planning
5. `frontend/components/ai/AIChatPopup.tsx` - Frontend implementation
6. This skill file

## 3-Stage Flow Overview

```
┌──────────┐    propose     ┌──────────┐
│  User    │ ─────────────> │  AI      │
│  Message │                │  Runtime │
└──────────┘                └────┬─────┘
                                  │
                          "plan" mode
                                  │
                                  v
                           ┌──────────┐
                           │ ChatAction│ (persisted)
                           │ PROPOSED  │
                           └────┬─────┘
                                  │
                     display to user
                                  │
                                  v
                           ┌──────────┐
                           │  User    │
                           │ Confirm  │
                           └────┬─────┘
                                  │
                           confirm endpoint
                                  │
                                  v
                           ┌──────────┐
                           │ ChatAction│
                           │ CONFIRMED │
                           └────┬─────┘
                                  │
                           execute endpoint
                                  │
                                  v
                           ┌──────────┐
                           │ MCP Tools │
                           │ Called    │
                           └────┬─────┘
                                  │
                                  v
                           ┌──────────┐
                           │ ChatAction│
                           │ EXECUTED │
                           └──────────┘
```

## Stage 1: Creating Action Proposals

### API Endpoint

```python
@router.post("/actions/propose", response_model=ChatActionProposalResponse)
async def propose_action(
    body: ChatActionProposalRequest | ChatActionProposeIn,
    ...
):
```

### Flow

1. **Receive user message**
2. **Persist user message** to conversation (if exists)
3. **Call agent runtime** to analyze intent
4. **If plan mode:** Persist ChatAction with `proposed` status
5. **Return proposal** with action ID, summary, and risk level

### ChatActionProposeIn Schema

```python
class ChatActionProposeIn(BaseModel):
    conversation_id: int | None = None
    title: str = Field(..., min_length=1, max_length=160)
    action_type: ChatActionType = "mcp_tool"  # or "mcp_plan", "note"
    tool_name: str | None = Field(default=None, max_length=96)
    tool_arguments: dict[str, Any] = Field(default_factory=dict)
    summary: str = ""
    proposed_changes: dict[str, Any] = Field(default_factory=dict)
```

### Creating Proposals Manually

For programmatic proposal creation:

```python
from app.schemas.chat_actions import ChatActionProposeIn

payload = ChatActionProposeIn(
    conversation_id=conversation_id,
    title="Move patient to room",
    action_type="mcp_plan",
    summary="Move patient 123 to room 456",
    proposed_changes={
        "mode": "plan",
        "execution_plan": plan.model_dump(mode="json"),
        "steps": [...],
        "affected_entities": [...],
        "permission_basis": ["patients.write"],
        "risk_level": "high",
    },
)

action_row = await ai_chat.propose_chat_action(
    db, ws_id=workspace.id, actor=user, payload=payload
)
```

## Stage 2: Handling Confirmations and Rejections

### API Endpoint

```python
@router.post("/actions/{action_id}/confirm", response_model=ChatActionOut)
async def confirm_action(
    action_id: int,
    body: ChatActionConfirmIn = Body(default_factory=ChatActionConfirmIn),
    ...
):
```

### ChatActionConfirmIn Schema

```python
class ChatActionConfirmIn(BaseModel):
    approved: bool = True   # False to reject
    note: str = ""         # Optional confirmation note
```

### Confirmation Flow

```python
row = await ai_chat.confirm_chat_action(
    db,
    ws_id=workspace.id,
    action_id=action_id,
    actor=user,
    approved=body.approved,
    note=body.note,
)
```

### Status Transitions

| From | Action | To |
|------|--------|-----|
| `proposed` | Confirm (approved=True) | `confirmed` |
| `proposed` | Confirm (approved=False) | `rejected` |
| `confirmed` | Execute success | `executed` |
| `confirmed` | Execute failure | `failed` |

### Permission Check

Only the proposer, admin, or head_nurse can confirm:

```python
if user.role not in {"admin", "head_nurse"} and row.proposed_by_user_id != user.id:
    raise HTTPException(status_code=403, detail="Operation not permitted")
```

## Stage 3: Execution

### API Endpoint

```python
@router.post("/actions/{action_id}/execute", response_model=ChatActionExecuteOut)
async def execute_action(
    action_id: int,
    body: ChatActionExecuteIn = Body(default_factory=ChatActionExecuteIn),
    ...
):
```

### ChatActionExecuteIn Schema

```python
class ChatActionExecuteIn(BaseModel):
    force: bool = False  # Bypass some checks (admin only)
```

### Execution Flow

```python
row, execution_result = await ai_chat.execute_chat_action(
    db,
    ws_id=workspace.id,
    action_id=action_id,
    actor=user,
    force=body.force,
)
```

### Execution Plan Persistence

The execution plan is stored in `proposed_changes`:

```python
# Extract plan from persisted action
plan_payload = dict(row.proposed_changes or {}).get("execution_plan")
if isinstance(plan_payload, dict):
    execution_plan = ExecutionPlan.model_validate(plan_payload)
```

## Frontend Integration Patterns

### TypeScript Types (Frontend)

```typescript
type ProposedAction = {
  action_id?: string | number | null;
  title?: string | null;
  description?: string | null;
  risk_level?: string | null;  // "low", "medium", "high"
  params?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
};

type ActionProposal = {
  proposal_id?: string | number | null;
  reply?: string | null;
  assistant_reply?: string | null;
  summary?: string | null;
  actions?: ProposedAction[] | null;
  mode?: "answer" | "plan";
};

type ExecuteResponse = {
  reply?: string | null;
  result?: unknown;
  message?: string | null;
};
```

### Frontend Flow (AIChatPopup.tsx)

**1. Send Message & Receive Proposal**

```typescript
const proposalRes = await fetch(`${API_BASE}/chat/actions/propose`, {
  method: "POST",
  headers: authHeaders(),
  body: JSON.stringify({
    conversation_id: convId,
    message: userMessage.content,
    messages: nextMessages.map(m => ({ role: m.role, content: m.content })),
  }),
});

const data = (await proposalRes.json()) as ActionProposal;

// Show assistant reply
if (data.assistant_reply) {
  setMessages(prev => [...prev, { role: "assistant", content: data.assistant_reply }]);
}

// Show proposal UI if actions exist
if (data.actions && data.actions.length > 0) {
  setProposal(data);
}
```

**2. Display Proposal UI**

```typescript
{proposal?.actions && proposal.actions.length > 0 ? (
  <div className="border-t border-outline-variant/15 bg-amber-50/60 px-3 py-3">
    <div className="mb-2 flex items-center gap-2">
      <ShieldCheck className="h-4 w-4 text-amber-700" />
      <p className="text-xs font-semibold uppercase">Confirm AI actions</p>
    </div>
    <p className="text-xs text-foreground-variant">
      {proposal.summary || "The assistant prepared changes..."}
    </p>
    <div className="mt-2 space-y-2">
      {proposal.actions.map((action, index) => (
        <div key={index} className="rounded-lg border border-outline-variant/15 p-2">
          <p className="text-xs font-semibold">{action.title}</p>
          {action.description ? (
            <p className="mt-0.5 text-[11px] text-foreground-variant">
              {action.description}
            </p>
          ) : null}
          {action.risk_level ? (
            <div className="mt-1 inline-flex items-center gap-1 rounded-full 
                            bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              {action.risk_level}
            </div>
          ) : null}
        </div>
      ))}
    </div>
    <div className="mt-3 flex gap-2">
      <button onClick={() => setProposal(null)}>Cancel</button>
      <button onClick={() => void confirmAndExecuteActions()}>
        Confirm and Execute
      </button>
    </div>
  </div>
) : null}
```

**3. Confirm and Execute**

```typescript
const confirmAndExecuteActions = useCallback(async () => {
  if (!proposal?.proposal_id) return;
  
  setConfirmingActions(true);
  try {
    // 1. Confirm
    const proposalId = encodeURIComponent(String(proposal.proposal_id));
    const confirmRes = await fetch(`${API_BASE}/chat/actions/${proposalId}/confirm`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (!confirmRes.ok) throw new Error("Could not confirm");

    // 2. Execute
    const executeRes = await fetch(`${API_BASE}/chat/actions/${proposalId}/execute`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (!executeRes.ok) throw new Error("Could not execute");
    
    const result = (await executeRes.json()) as ExecuteResponse;
    const reply = result.reply || result.message || "Action executed.";
    
    // 3. Show result
    setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    setProposal(null);
  } finally {
    setConfirmingActions(false);
  }
}, [proposal?.proposal_id, authHeaders]);
```

## Action Status Lifecycle

```
PROPOSED
   │
   ├─ confirm (approved=False) ─> REJECTED
   │
   └─ confirm (approved=True) ─> CONFIRMED
                                   │
                                   ├─ execute success ─> EXECUTED
                                   │
                                   └─ execute failure ─> FAILED
```

## Service Methods Reference

### Propose

```python
# server/app/services/ai_chat.py
async def propose_chat_action(
    db: AsyncSession,
    ws_id: int,
    actor: User,
    payload: ChatActionProposeIn,
) -> ChatAction:
```

### Confirm

```python
async def confirm_chat_action(
    db: AsyncSession,
    ws_id: int,
    action_id: int,
    actor: User,
    approved: bool,
    note: str,
) -> ChatAction:
```

### Execute

```python
async def execute_chat_action(
    db: AsyncSession,
    ws_id: int,
    action_id: int,
    actor: User,
    force: bool,
) -> tuple[ChatAction, dict[str, Any]]:
```

## Testing Chat Actions

### API Tests

```bash
cd server
python -m pytest tests/test_chat_actions.py -v
```

### Manual Test Flow

```bash
# 1. Get token
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' | jq -r '.access_token')

# 2. Propose action
curl -X POST http://localhost:8000/api/chat/actions/propose \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "List rooms", "messages": [{"role": "user", "content": "List rooms"}]}'

# 3. Confirm (use proposal_id from response)
curl -X POST http://localhost:8000/api/chat/actions/123/confirm \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"approved": true}'

# 4. Execute
curl -X POST http://localhost:8000/api/chat/actions/123/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

## Risk Level Display

Frontend shows risk badges:

| Level | Color | Use Case |
|-------|-------|----------|
| `low` | Green/Blue | Read operations |
| `medium` | Amber/Yellow | Standard mutations |
| `high` | Red | Patient mutations, critical ops |

## Verification Checklist

When adding new action types:

- [ ] Schema validates correctly (ChatActionProposeIn)
- [ ] Action type handled in propose endpoint
- [ ] Permission check in confirm endpoint
- [ ] Execution calls correct runtime/service
- [ ] Status transitions work correctly
- [ ] Frontend shows proposal UI
- [ ] Risk level displayed appropriately
- [ ] Execution result shown to user
- [ ] Conversation updated with results
- [ ] Tests pass

## Related Skills

- `wheelsense-agent-runtime` - Intent planning and execution
- `wheelsense-mcp-tools` - MCP tool development
- `wheelsense-workflow` - General backend patterns
