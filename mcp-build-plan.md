Detailed Handoff For Next AI

ใช้ brief นี้เป็นงานต่อเนื่องจากสถานะปัจจุบันของ repo wheelsense-platform เพื่อปิด MCP architecture ให้เสร็จจนพร้อมใช้งานจริงใน production-like environment โดย ห้ามรื้อของที่เพิ่งทำไปแล้ว และ ห้าม revert งานที่มีอยู่ใน worktree เพราะ repo นี้ dirty อยู่แล้ว

เริ่มจากอ่านไฟล์เหล่านี้ก่อนตามลำดับ:

ARCHITECTURE.md
server/AGENTS.md
.cursor/agents/HANDOFF.md
server/app/main.py
server/app/mcp/server.py
server/app/mcp/auth.py
server/app/mcp/context.py
server/app/mcp_server.py
server/app/agent_runtime/main.py
server/app/agent_runtime/service.py
server/app/services/agent_runtime_client.py
server/app/api/endpoints/chat_actions.py
server/app/services/ai_chat.py
server/app/api/dependencies.py
server/app/schemas/chat_actions.py
server/app/schemas/agent_runtime.py
frontend/components/ai/AIChatPopup.tsx
server/docker-compose.core.yml

1. Current state you are inheriting
สิ่งที่เสร็จแล้ว:

/mcp ไม่ได้เป็นแค่ FastMCP SSE mount แบบเดิมแล้ว
backend มี MCP package แยกใน server/app/mcp/
มี MCP auth middleware ที่บังคับ bearer auth และ origin gate
มี protected-resource metadata endpoint ที่ /.well-known/oauth-protected-resource/mcp
มี actor context ใน MCP:
user_id
workspace_id
role
patient_id
caregiver_id
scopes
chat action flow เปลี่ยนจาก direct internal execute_workspace_tool() มาเป็น:
FastAPI chat actions endpoint
-> internal HTTP call ไป wheelsense-agent-runtime
-> runtime ใช้ MCP client ย้อนกลับเข้า /mcp
chat_actions รองรับ mcp_plan
compose มี service wheelsense-agent-runtime
OpenAPI ถูก regen แล้ว
targeted backend tests ผ่าน
สิ่งที่ยังเป็น MVP / ยังไม่ production-complete:

OAuth for remote MCP clients ยังไม่ครบจริง
agent runtime ยังเป็น deterministic MVP ไม่ใช่ full planner-grounder-executor
MCP tool/resource coverage ยังไม่ครบทุก domain ที่ต้องใช้
frontend AI popup ยังไม่ได้ render plan model ใหม่เต็มรูปแบบ
persistence ของ chat_actions ยังฝัง execution plan ใน proposed_changes
test coverage ยังไม่ครอบ flow ใหม่ครบทุก role/domain
2. Non-negotiable architecture constraints
สิ่งเหล่านี้ต้องคงไว้ ห้ามเปลี่ยน:

Backend เป็น source of truth สำหรับ auth, workspace scope, patient visibility, device ownership, room ownership
Browser ห้ามถือ MCP credentials ตรง
Browser flow ต้องยังเป็น:
browser -> Next /api/* -> FastAPI
MCP writes ห้ามเชื่อ caller-supplied actor identifiers เช่น:
workspace_id
caregiver_id
user_id
patient_id ถ้าเป็น actor identity
Patient scope ต้องแคบมาก:
อ่านเฉพาะของตัวเอง
room controls เฉพาะห้องตัวเอง
ไม่มี admin writes
Popup ห้ามโชว์:
provider
model
reasoning effort
Product rule ต้องคง:
read-only = auto-run ได้
mutation/device command = confirm ครั้งเดียวระดับ plan
3. The exact goal
ทำให้ระบบ MCP/agent/chat พร้อมใช้งานจริงในระดับที่:

external MCP clients เชื่อม /mcp ได้อย่างปลอดภัย
first-party chat popup ใช้ MCP ผ่าน agent runtime end-to-end
plan/confirm/execute ทำงานจริง
policy ผ่าน MCP ตรงกับ policy ของ REST
audit trail ใช้งานย้อนหลังได้จริง
docs/runbook/env พร้อมสำหรับทีมอื่น
4. Highest-priority remaining work
A. Finish remote MCP authentication properly
ตอนนี้มีแค่ protected-resource metadata + bearer enforcement บน JWT/session เดิม
งานที่ต้องทำ:

ออกแบบและ implement auth flow สำหรับ remote MCP clients ให้ครบ
อย่างน้อยต้องมี:
authorization metadata หรือ equivalent discovery
วิธี issuance token สำหรับ MCP scopes
expiry/revocation semantics ที่ผูกกับ AuthSession
scope narrowing ต่อ role จริง
ถ้าเลือกใช้ WheelSense JWT เดิมต่อ:
ต้องมี path ที่ออก token พร้อม scope
ต้องมีการ validate scope ชัด
ต้องไม่เปิดให้ remote client ใช้ broad session token ตรงๆ โดยไม่มี scope reduction
ถ้าจะเพิ่ม dedicated MCP access token:
ทำ endpoint สำหรับ issue/revoke
tie back to AuthSession หรือ user session ที่ยัง active
สิ่งที่ต้องได้:

unauthenticated -> 401
wrong origin -> 403
insufficient scope -> deny
revoked session/token -> ใช้ MCP ไม่ได้
ไฟล์น่าจะแตะ:
server/app/mcp/auth.py
server/app/main.py
server/app/core/security.py
server/app/api/endpoints/auth.py
server/app/models/users.py

B. Make MCP policy coverage match REST truth
ตอนนี้ MCP policy ครอบบางส่วนแล้ว แต่ยังไม่ครบ
ต้องเติมให้ MCP ใช้ service/helper เดิมจาก REST ให้มากที่สุด

ต้องครอบอย่างน้อย:

patients.read
patients.write
alerts.read
alerts.manage
devices.read
devices.manage
devices.command
rooms.read
rooms.manage
room_controls.use
workflow.read
workflow.write
cameras.capture
ai_settings.read
ai_settings.write
admin.audit.read
ต้องตรวจว่าทุก tool/resource:

derive actor จาก auth context
filter object visibility ตาม backend truth
ไม่ bypass CareGiverPatientAccess
ไม่ bypass Patient.room_id
ไม่ bypass PatientDeviceAssignment
ไฟล์สำคัญ:
server/app/mcp/server.py
server/app/api/dependencies.py
server/app/api/endpoints/patients.py
server/app/api/endpoints/alerts.py
server/app/api/endpoints/homeassistant.py
server/app/api/endpoints/devices.py
server/app/api/endpoints/workflow.py

C. Expand MCP resources/tools/prompts to full working coverage
ตอนนี้มีพื้นฐาน แต่ยังไม่ครบระบบ
ต้องเพิ่ม resources/templates/tools ให้ AI “ทำงานแทน user” ได้จริง

ควรมี resources/templates อย่างน้อย:

current user profile + capabilities
visible patients
patient detail by id
rooms
room presence
smart devices by room
devices registry + activity
alerts active/history
workflow tasks
workflow schedules
workflow messages
vitals
timeline
facilities/floors
floorplan context
AI runtime summary admin only
ควรมี tools อย่างน้อย:

update patient room
allowed patient patch operations
acknowledge alert
resolve alert
list devices
allowed device commands
room smart-device control
room capture
workflow claim
workflow handoff
workflow update status
AI settings read/write
facility/floorplan admin ops ถ้ามี backend contract พร้อม
prompt catalog ต้องมีและต้องใช้งานได้จริง:

admin-operations
clinical-triage
observer-shift-assistant
patient-support
device-control
facility-ops
ทุก tool ต้องใส่ annotations ให้ถูก

D. Replace deterministic agent runtime with real orchestration
ตอนนี้ server/app/agent_runtime/service.py ใช้ rule-based intent parsing เป็นหลัก
ต้องยกระดับเป็น runtime ที่:

planner เข้าใจ intent
grounding layer ดึง resources/tools จริง
executor รัน step แบบ deterministic
write intent ถูก normalize เป็น execution plan ทุกครั้ง
read intent ตอบ grounded answer โดยไม่เดา
สิ่งที่ต้องมี:

planner role
grounding role
executor role
playbook routing
step normalization
partial failure handling
clear response format for FastAPI chat layer
ถ้าจะยังไม่ใช้ sub-agents/process จริงหลายตัว ก็ได้ แต่ต้องแยก logic เป็น 3 phases ใน code ให้ชัด
ห้ามให้ executor ตัดสินใจ policy เอง

ไฟล์หลัก:
server/app/agent_runtime/service.py
server/app/services/agent_runtime_client.py
server/app/api/endpoints/chat_actions.py

E. Promote execution plan to a first-class persisted model
ตอนนี้ execution plan ยังอยู่ใน proposed_changes blob
ถ้าจะใช้จริง ต้อง query/audit/debug ได้ง่าย

อย่างน้อยพิจารณาเพิ่มใน chat_actions:

mode
execution_plan
affected_entities
permission_basis
runtime_metadata
step_results
failure_summary
ถ้าทำ migration:

อย่าทำให้ test schema พัง
sync Pydantic schema
sync OpenAPI
sync docs
ไฟล์:
server/app/models/chat_actions.py
server/app/schemas/chat_actions.py
server/alembic/versions/...

F. Finish frontend AI popup integration
ตอนนี้ backend ส่ง mode + execution_plan แต่ popup ยังไม่ได้ใช้เต็ม
ต้องปรับ frontend/components/ai/AIChatPopup.tsx ให้รองรับ:

mode: "answer" -> render assistant answer ปกติ
mode: "plan" -> render plan card
แสดง:
summary
steps
risk level
affected entities
permission basis
ปุ่ม:
cancel
confirm and execute
execute แล้ว append result กลับเข้า conversation
reject แล้วไม่มี mutation
ยังต้องไม่โชว์ provider/model
ถ้าจำเป็น ให้เพิ่ม component ใหม่:

ActionPlanPreview.tsx
ExecutionStepList.tsx
นอกจากนี้ตรวจว่า generated schema ใหม่ไม่ทำให้ frontend code อื่นใช้ /api/chat/actions/* ผิด

G. Full docs and operational readiness
อัปเดตเอกสารให้ตรงกับของจริง:
ARCHITECTURE.md
server/AGENTS.md
frontend/README.md
server/docs/ENV.md
server/docs/RUNBOOK.md

สิ่งที่ต้องมีใน docs:

/mcp auth model
streamable HTTP vs SSE compatibility
wheelsense-agent-runtime role
env vars ใหม่
how to run compose
how to verify remote MCP
first-party chat flow
known limitations ถ้ายังมี
H. Increase test coverage to real acceptance level
ต้องเพิ่ม tests ให้ครอบ:

unauthenticated MCP -> 401
authenticated but insufficient scope -> deny
wrong origin -> deny
observer/supervisor cannot read unauthorized patient via MCP
patient cannot control other room/device
alert acknowledge cannot spoof caregiver identity
propose returns mode: "answer" on read-only turn
propose returns mode: "plan" on mutation turn
confirm once + execute runs full plan
cancel/reject causes no mutation
popup contract never includes provider/model fields for user display paths
remote MCP streamable HTTP smoke test
runtime service internal secret enforcement
ควรเพิ่ม test files เช่น:

server/tests/test_mcp_auth.py
server/tests/test_mcp_policy.py
server/tests/test_agent_runtime.py
server/tests/test_chat_actions_integration.py
5. Suggested execution order
ปิด auth/token/scope model สำหรับ remote MCP
ปิด MCP policy truth ให้ครบกับ REST
ขยาย MCP resources/tools/prompts ให้ครบ domain หลัก
ยกระดับ agent runtime ให้ plan/ground/execute จริง
ย้าย execution plan persistence เป็น first-class fields หรืออย่างน้อย normalized structure ที่ queryable
ปรับ frontend popup ให้รองรับ plan model ใหม่เต็ม
sync docs/runbook/env
run full verification
6. Files likely safe to edit for this task
Backend:
server/app/main.py
server/app/mcp/auth.py
server/app/mcp/context.py
server/app/mcp/server.py
server/app/mcp_server.py
server/app/agent_runtime/main.py
server/app/agent_runtime/service.py
server/app/services/agent_runtime_client.py
server/app/api/endpoints/chat_actions.py
server/app/services/ai_chat.py
server/app/schemas/chat_actions.py
server/app/schemas/agent_runtime.py
server/app/models/chat_actions.py
server/app/config.py
server/docker-compose.core.yml

Frontend:
frontend/components/ai/AIChatPopup.tsx
frontend/lib/api/generated/schema.ts
frontend/README.md

Docs:
ARCHITECTURE.md
server/AGENTS.md
.cursor/agents/HANDOFF.md

7. Files you must read carefully before editing because existing logic is subtle
server/app/api/dependencies.py
server/app/api/endpoints/patients.py
server/app/api/endpoints/alerts.py
server/app/api/endpoints/homeassistant.py
server/app/api/endpoints/workflow.py
server/app/services/workflow.py
server/app/services/patient.py
server/app/services/activity.py

8. Do not do these things
อย่า revert unrelated frontend files
อย่า revert dirty worktree
อย่ากลับไปใช้ direct internal dispatch จาก chat endpoint ไป MCP tool function
อย่าให้ browser เรียก /mcp ตรง
อย่าใส่ policy ใน prompt แทน backend
อย่าปล่อย MCP writes รับ actor ids จาก request payload
อย่าซ่อน failures ใน executor ถ้ามี step fail ต้อง report
อย่าทำ docs lag จาก runtime
9. Minimum validation before claiming done
Backend:

cd server
python -m pytest tests/test_chat_actions.py tests/test_mcp_server.py tests/test_chat.py -q
จากนั้นเพิ่ม targeted suites ใหม่ที่คุณสร้างสำหรับ:

cd server
python -m pytest tests/test_mcp_auth.py tests/test_mcp_policy.py tests/test_agent_runtime.py -q
OpenAPI:

cd server
python scripts/export_openapi.py openapi.generated.json
Frontend types:

cd frontend
npm run openapi:types
npx tsc --noEmit
ถ้า popup UI เปลี่ยนจริง:

cd frontend
npm run build
ถ้าปรับ compose/runtime:

smoke test wheelsense-platform-server
smoke test wheelsense-agent-runtime
smoke test authenticated /mcp
smoke test chat popup propose/confirm/execute
10. Final definition of done
งานถือว่าเสร็จเมื่อครบทุกข้อ:

/mcp ใช้ได้จริงสำหรับ remote authenticated clients
auth + scope + policy ใช้งานจริง ไม่ใช่แค่ metadata
first-party chat ใช้ agent runtime + MCP end-to-end
read-only auto-run ทำงาน
mutation turns ให้ plan preview และ confirm-once
execute วิ่งครบทั้ง plan และ report step results
patient/supervisor/observer/head_nurse/admin scope ถูกผ่าน MCP เหมือน REST
popup ไม่โชว์ provider/model/reasoning
audit trail อ่านย้อนหลังได้และเห็น plan/result
compose/docs/runbook พร้อม
validation ผ่าน