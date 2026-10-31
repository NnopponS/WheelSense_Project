---
title: Rules for editing chat intent matching in agent_runtime
author: Chanaps
date: 2026-10-31
branch: wheelsense-InnoServe
id: l-ee3ca426
scope: repo
status: active
src: agent
---

Keep _is_patient_timeline_request (service.py) and _is_timeline_request (llm_tool_router.py) token lists in sync because they are duplicate intent matchers and drift makes deterministic vs LLM paths disagree. Thai matching must stay substring-based because \b regex cannot delimit Thai script. Pass wants_today into _timeline_sections' Bangkok-TZ filter because get_patient_timeline returns unbounded recents regardless of the asked day. Use {input} as the custom_reply_template placeholder because EaseAIResponseCards.tsx substitutes that literal. Never widen create_task_management_task via role allowlist alone because the tool in mcp/server.py hard-gates admin+head_caregiver and the plan fails at execute.
