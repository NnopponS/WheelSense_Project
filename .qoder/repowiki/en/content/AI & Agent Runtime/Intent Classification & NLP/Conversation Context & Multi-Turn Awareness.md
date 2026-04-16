# Conversation Context & Multi-Turn Awareness

<cite>
**Referenced Files in This Document**
- [intent.py](file://server/app/agent_runtime/intent.py)
- [service.py](file://server/app/agent_runtime/service.py)
- [conversation_fastpath.py](file://server/app/agent_runtime/conversation_fastpath.py)
- [chat_actions.py](file://server/app/api/endpoints/chat_actions.py)
- [agent_runtime_client.py](file://server/app/services/agent_runtime_client.py)
- [test_agent_runtime.py](file://server/tests/test_agent_runtime.py)
- [context.py](file://server/app/mcp/context.py)
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
This document explains the conversation context tracking system that enables multi-turn awareness in the WheelSense AI runtime. It covers the ConversationContext class for managing message history, entity extraction persistence, and patient focus management. It documents context window management, patient ID resolution for short follow-up questions, automatic patient context detection for vitals/timeline/profile requests, and integration with conversation history and workspace-scoped context management.

## Project Structure
The conversation context system spans several modules:
- Intent classification and context-awareness logic
- Agent runtime service orchestrating classification, tool execution, and context updates
- Fast-path heuristics for general conversation
- API endpoints exposing chat actions with conversation context
- Agent runtime client for internal service calls
- MCP actor context for workspace-scoped execution

```mermaid
graph TB
subgraph "Frontend"
UI["AI Chat Popup<br/>/chat/actions/propose"]
end
subgraph "Server API"
API["Chat Actions Endpoint<br/>POST /api/chat/actions/propose"]
end
subgraph "Agent Runtime"
Client["Agent Runtime Client<br/>propose_turn()"]
Service["Service Layer<br/>propose_turn(), _plan_for_message()"]
Intent["Intent Classifier<br/>ConversationContext"]
Fastpath["Conversation Fast Path<br/>is_general_conversation_only()"]
end
subgraph "MCP Layer"
MCP["MCP Tool Execution<br/>execute_workspace_tool()"]
Actor["MCP Actor Context<br/>McpActorContext"]
end
UI --> API
API --> Client
Client --> Service
Service --> Intent
Service --> Fastpath
Service --> MCP
MCP --> Actor
```

**Diagram sources**
- [chat_actions.py:124-239](file://server/app/api/endpoints/chat_actions.py#L124-L239)
- [agent_runtime_client.py:23-45](file://server/app/services/agent_runtime_client.py#L23-L45)
- [service.py:346-519](file://server/app/agent_runtime/service.py#L346-L519)
- [intent.py:76-107](file://server/app/agent_runtime/intent.py#L76-L107)
- [conversation_fastpath.py:32-44](file://server/app/agent_runtime/conversation_fastpath.py#L32-L44)
- [context.py:8-37](file://server/app/mcp/context.py#L8-L37)

**Section sources**
- [chat_actions.py:124-239](file://server/app/api/endpoints/chat_actions.py#L124-L239)
- [agent_runtime_client.py:23-45](file://server/app/services/agent_runtime_client.py#L23-L45)
- [service.py:346-519](file://server/app/agent_runtime/service.py#L346-L519)
- [intent.py:76-107](file://server/app/agent_runtime/intent.py#L76-L107)
- [conversation_fastpath.py:32-44](file://server/app/agent_runtime/conversation_fastpath.py#L32-L44)
- [context.py:8-37](file://server/app/mcp/context.py#L8-L37)

## Core Components
- ConversationContext: Tracks conversation state with a bounded message history, last entities, recent patient cards, focused patient ID, and last intent/playbook.
- IntentClassifier: Provides regex-based and semantic intent classification with context-awareness for patient-scoped reads.
- Agent Runtime Service: Orchestrates classification, immediate tool execution, plan building, and context updates.
- Conversation Fast Path: Heuristic to skip MCP/intent for general conversation.
- MCP Actor Context: Provides workspace-scoped execution context for tools.

**Section sources**
- [intent.py:76-107](file://server/app/agent_runtime/intent.py#L76-L107)
- [intent.py:347-800](file://server/app/agent_runtime/intent.py#L347-L800)
- [service.py:202-320](file://server/app/agent_runtime/service.py#L202-L320)
- [conversation_fastpath.py:32-44](file://server/app/agent_runtime/conversation_fastpath.py#L32-L44)
- [context.py:8-37](file://server/app/mcp/context.py#L8-L37)

## Architecture Overview
The system integrates conversation context across the runtime pipeline:
- Frontend sends a chat proposal with conversation_id and messages.
- API validates and forwards to agent runtime client.
- Agent runtime service loads or creates ConversationContext keyed by conversation_id.
- Intent classifier evaluates message with context-aware patterns and thresholds.
- For high-confidence, read-only tools may auto-run; otherwise, a plan is built.
- Tool execution updates context (patient cards, entities, focused patient).
- Final response is returned to the frontend.

```mermaid
sequenceDiagram
participant FE as "Frontend"
participant API as "Chat Actions Endpoint"
participant ARC as "Agent Runtime Client"
participant SRV as "Agent Runtime Service"
participant INT as "Intent Classifier"
participant MCP as "MCP Tools"
participant ACT as "MCP Actor Context"
FE->>API : POST /api/chat/actions/propose<br/>{conversation_id, message, messages, page_patient_id}
API->>ARC : propose_turn(actor_access_token, message, messages, conversation_id, page_patient_id)
ARC->>SRV : propose_turn(...)
SRV->>SRV : _seed_page_patient_context()
SRV->>SRV : _get_or_create_context(conversation_id)
SRV->>INT : classify(message, context)
INT-->>SRV : IntentMatch or None
alt Immediate tool
SRV->>MCP : execute_workspace_tool(tool_name, arguments)
MCP->>ACT : require_actor_context()
SRV->>SRV : _ingest_patient_context_from_tool_result()
SRV-->>FE : AgentRuntimeProposeResponse(mode="answer")
else Plan
SRV-->>FE : AgentRuntimeProposeResponse(mode="plan")
end
```

**Diagram sources**
- [chat_actions.py:174-181](file://server/app/api/endpoints/chat_actions.py#L174-L181)
- [agent_runtime_client.py:23-45](file://server/app/services/agent_runtime_client.py#L23-L45)
- [service.py:346-519](file://server/app/agent_runtime/service.py#L346-L519)
- [intent.py:719-800](file://server/app/agent_runtime/intent.py#L719-L800)
- [context.py:33-37](file://server/app/mcp/context.py#L33-L37)

## Detailed Component Analysis

### ConversationContext Class
The ConversationContext class encapsulates multi-turn awareness:
- Message history: bounded to last 10 entries to keep context window manageable.
- Entities: tracks the latest extracted entities (e.g., patients) for cross-turn resolution.
- Patient cards: stores recent patient rows from roster/list/detail for name-based follow-ups.
- Focused patient: the last narrowed patient ID used for context-aware reads.
- Last intent/playbook: for analytics and plan building.

```mermaid
classDiagram
class ConversationContext {
+dict[] messages
+dict[] last_entities
+dict[] last_patient_cards
+int|None last_focused_patient_id
+str|None last_intent
+str|None last_playbook
+add_message(role, content) void
+update_entities(entities) void
}
```

**Diagram sources**
- [intent.py:76-107](file://server/app/agent_runtime/intent.py#L76-L107)

**Section sources**
- [intent.py:76-107](file://server/app/agent_runtime/intent.py#L76-L107)
- [test_agent_runtime.py:45-62](file://server/tests/test_agent_runtime.py#L45-L62)

### Context Window Management
- The add_message method enforces a maximum of 10 messages.
- When exceeded, the oldest messages are pruned from the front while preserving the latest.

```mermaid
flowchart TD
Start(["add_message called"]) --> Append["Append new message"]
Append --> CheckSize{"len(messages) > 10?"}
CheckSize --> |No| End(["Done"])
CheckSize --> |Yes| Prune["Keep last 10 messages"]
Prune --> End
```

**Diagram sources**
- [intent.py:89-94](file://server/app/agent_runtime/intent.py#L89-L94)

**Section sources**
- [intent.py:89-94](file://server/app/agent_runtime/intent.py#L89-L94)
- [test_agent_runtime.py:45-53](file://server/tests/test_agent_runtime.py#L45-L53)

### Patient Focus Management
- Roster ingestion: list_visible_patients updates last_patient_cards, last_entities, and sets last_focused_patient_id when a single patient is present.
- Details ingestion: get_patient_details updates last_patient_cards, last_entities, and last_focused_patient_id.
- Context-aware reads: vitals/timeline/profile reads update last_focused_patient_id when arguments include patient_id.

```mermaid
flowchart TD
Start(["Tool result received"]) --> Type{"tool_name"}
Type --> |list_visible_patients| Roster["Update cards + entities<br/>Set focused if single"]
Type --> |get_patient_details| Detail["Update cards + entities<br/>Set focused"]
Type --> |get_patient_vitals or get_patient_timeline| Arg["Extract patient_id from args<br/>Update focused"]
Roster --> End(["Context updated"])
Detail --> End
Arg --> End
```

**Diagram sources**
- [service.py:69-120](file://server/app/agent_runtime/service.py#L69-L120)

**Section sources**
- [service.py:69-120](file://server/app/agent_runtime/service.py#L69-L120)

### Patient ID Resolution for Follow-Up Questions
The pick_patient_id_for_followup function resolves patient_id for short follow-ups using:
- Numeric patient ID (direct match).
- Single patient in last_entities.
- Name substring matching against last_patient_cards.
- Unique substring matching across unsegmented Thai text using prior user turns.
- Automatic fallback to last_focused_patient_id for vitals/timeline/profile cues.

```mermaid
flowchart TD
Start(["pick_patient_id_for_followup"]) --> Empty{"context is None?"}
Empty --> |Yes| ReturnNone["Return None"]
Empty --> |No| ParseNum["Match digits-only input"]
ParseNum --> NumHit{"Numeric ID?"}
NumHit --> |Yes| ReturnNum["Return ID"]
NumHit --> |No| SingleRoster["If single patient in last_entities<br/>return that ID"]
SingleRoster --> NameMatch["Substring match against last_patient_cards"]
NameMatch --> CardsHit{"Match found?"}
CardsHit --> |Yes| ReturnCard["Return matched ID"]
CardsHit --> |No| Unseg["Try unique substring match on prior user turns"]
Unseg --> UnsegHit{"Unique match?"}
UnsegHit --> |Yes| ReturnUnseg["Return matched ID"]
UnsegHit --> |No| Focused{"Has last_focused_patient_id<br/>and clinical cue?"}
Focused --> |Yes| ReturnFocus["Return focused ID"]
Focused --> |No| ReturnNone
```

**Diagram sources**
- [intent.py:271-320](file://server/app/agent_runtime/intent.py#L271-L320)

**Section sources**
- [intent.py:271-320](file://server/app/agent_runtime/intent.py#L271-L320)

### Automatic Patient Context Detection
Certain Thai phrases trigger automatic patient-scoped reads without explicit naming:
- Vitals/timeline follow-ups: "สัญญาณชีพ", "ประวัติสุขภาพ", "ไทม์ไลน์" map to get_patient_vitals/get_patient_timeline.
- Profile follow-ups: "โรคเรื้อรัง", "แพ้ยา", "ภาวะสุขภาพ" map to get_patient_details.
- The classifier injects entity hints and may auto-run when confidence is high and no confirmation is required.

**Section sources**
- [intent.py:363-383](file://server/app/agent_runtime/intent.py#L363-L383)
- [intent.py:755-776](file://server/app/agent_runtime/intent.py#L755-L776)

### Integration with Conversation History and Workspace-Scoped Context
- Conversation history: messages are appended and pruned to the last 10 entries.
- Workspace-scoped context: MCP actor context includes workspace_id and roles for permission checks.
- Page-scoped priming: When EaseAI opens from a patient page, the system seeds context with that patient’s card and focus.

```mermaid
sequenceDiagram
participant API as "Chat Actions Endpoint"
participant SRV as "Agent Runtime Service"
participant CTX as "ConversationContext Store"
participant ACT as "MCP Actor Context"
API->>SRV : propose_turn(conversation_id, page_patient_id)
SRV->>CTX : _seed_page_patient_context()
SRV->>CTX : _get_or_create_context(conversation_id)
SRV->>ACT : require_actor_context()
SRV-->>API : AgentRuntimeProposeResponse
```

**Diagram sources**
- [service.py:161-200](file://server/app/agent_runtime/service.py#L161-L200)
- [service.py:152-158](file://server/app/agent_runtime/service.py#L152-L158)
- [context.py:33-37](file://server/app/mcp/context.py#L33-L37)

**Section sources**
- [service.py:161-200](file://server/app/agent_runtime/service.py#L161-L200)
- [service.py:152-158](file://server/app/agent_runtime/service.py#L152-L158)
- [context.py:33-37](file://server/app/mcp/context.py#L33-L37)

### Practical Examples

#### Example 1: Context-Aware Intent Resolution
- User: "สัญญาณชีพล่าสุด"
- Classifier detects vitals intent and injects entity hints.
- If last_focused_patient_id is set, immediate tool get_patient_vitals is executed with patient_id.

**Section sources**
- [intent.py:363-370](file://server/app/agent_runtime/intent.py#L363-L370)
- [intent.py:755-776](file://server/app/agent_runtime/intent.py#L755-L776)

#### Example 2: Patient Focus Management
- User: "แสดงรายชื่อผู้ป่วย"
- Classifier triggers list_visible_patients.
- Service updates last_patient_cards, last_entities, and last_focused_patient_id when a single patient is shown.

**Section sources**
- [service.py:81-98](file://server/app/agent_runtime/service.py#L81-L98)

#### Example 3: Multi-Turn Conversation Handling
- Turn 1: "ผู้ป่วยมีใครบ้าง" → list_visible_patients → context updated with cards/entities.
- Turn 2: "ขอของคุณวิชัย" → pick_patient_id_for_followup resolves via name substring match.
- Turn 3: "ประวัติสุขภาพล่าสุด" → uses last_focused_patient_id for vitals.

**Section sources**
- [test_agent_runtime.py:100-142](file://server/tests/test_agent_runtime.py#L100-L142)
- [intent.py:271-320](file://server/app/agent_runtime/intent.py#L271-L320)

## Dependency Analysis
The system exhibits clear separation of concerns:
- API layer depends on agent runtime client.
- Agent runtime service depends on intent classifier and MCP execution.
- Intent classifier depends on ConversationContext and regex/semantic patterns.
- MCP actor context provides workspace-scoped execution context.

```mermaid
graph LR
API["chat_actions.py"] --> ARC["agent_runtime_client.py"]
ARC --> SRV["service.py"]
SRV --> INT["intent.py"]
SRV --> MCP["MCP Tools"]
MCP --> ACT["mcp/context.py"]
INT --> CTX["ConversationContext"]
```

**Diagram sources**
- [chat_actions.py:174-181](file://server/app/api/endpoints/chat_actions.py#L174-L181)
- [agent_runtime_client.py:23-45](file://server/app/services/agent_runtime_client.py#L23-L45)
- [service.py:346-519](file://server/app/agent_runtime/service.py#L346-L519)
- [intent.py:719-800](file://server/app/agent_runtime/intent.py#L719-L800)
- [context.py:33-37](file://server/app/mcp/context.py#L33-L37)

**Section sources**
- [chat_actions.py:174-181](file://server/app/api/endpoints/chat_actions.py#L174-L181)
- [agent_runtime_client.py:23-45](file://server/app/services/agent_runtime_client.py#L23-L45)
- [service.py:346-519](file://server/app/agent_runtime/service.py#L346-L519)
- [intent.py:719-800](file://server/app/agent_runtime/intent.py#L719-L800)
- [context.py:33-37](file://server/app/mcp/context.py#L33-L37)

## Performance Considerations
- Context window pruning ensures constant-time message management and bounded memory usage.
- Regex-based intent classification is deterministic and fast; semantic similarity is optional and lazy-loaded.
- Immediate tool execution avoids plan building for high-confidence, read-only queries.
- Conversation context store is in-memory; for production, consider Redis or database-backed storage to scale across instances.

## Troubleshooting Guide
Common issues and resolutions:
- No patient context for vitals/timeline: Ensure a previous list_visible_patients or get_patient_details was executed to populate last_patient_cards and last_focused_patient_id.
- Follow-up not resolving patient ID: Verify that the message contains a unique name substring or that last_focused_patient_id is set via prior context.
- Low confidence fallback: If confidence falls below thresholds, the system falls back to AI chat; adjust prompts or ensure sufficient context is present.

**Section sources**
- [service.py:202-320](file://server/app/agent_runtime/service.py#L202-L320)
- [intent.py:190-193](file://server/app/agent_runtime/intent.py#L190-L193)

## Conclusion
The WheelSense AI runtime’s conversation context system provides robust multi-turn awareness through a bounded message history, persistent entity and patient card tracking, and intelligent patient focus management. It supports seamless Thai/English follow-ups, automatic patient-scoped reads, and workspace-scoped execution via MCP actor context. The design balances performance with flexibility, enabling both fast-path general conversation and deep, context-aware clinical workflows.