---
title: Device-control prompts bypass flaky llm_tools router via deterministic precheck
author: Chanaps
date: 2026-10-28
branch: wheelsense-InnoServe
id: l-ec2f448d
scope: repo
status: active
src: agent
---

decided
- Room smart-device commands ("Turn off the kitchen light", "ปิดไฟห้องนอน") are now handled by a NEW deterministic precheck `_try_v2_device_control_precheck` (server/app/agent_runtime/service.py ~L1822) that runs BEFORE `_try_v2_llm_tools_strategy` in the v2 block (~L2267) and before the legacy llm_tools block (~L2475). It parses EN/TH imperatives via app/agent_runtime/device_control.py, resolves the SmartDevice row (same rules as the MCP tool's `_matches`), and returns mode="plan" with a `control_room_smart_device` step — grounding classification_method=`easeai_pipeline_v2_device_control_precheck`.
- Root cause of the QA failure: with AI_PROVIDER=copilot the router uses collect_copilot_json_tool_calls whose prompt NEVER included the tool catalog, so gpt-4.1 invented names (`turn_on_light`, `turn_off_kitchen_light`) which `_validate_calls_for_role` dropped -> return None -> intent fallback picked a wrong READ tool. Fixed generally by appending `_tool_catalog_for_prompt(tools)` (name+signature+desc for every allowlisted tool) to the copilot system_text in propose_llm_tool_turn (~L856); verified live: read prompts now return `llm_tool_router_reads` answers.
watch out
- wheelsense-agent-runtime is a BUILT image (no volume mount): code edits need `docker cp app/agent_runtime/<f> wheelsense-agent-runtime:/app/app/agent_runtime/<f>` + `docker restart wheelsense-agent-runtime` (propose runs there, NOT in platform-server). Changes are lost on rebuild/recreate — rebuild the image for permanence.
- Agent-runtime pytest with compose env has 10 pre-existing failures (fake `token_<id>` vs real JWT in resolve_current_user_from_token) — identical set on the pristine image, so not a regression signal.
- Thai text in curl bodies from Git Bash gets mangled; send --data-binary @file written with UTF-8.
- The precheck proposes a plan even when zero devices match (device_id omitted) — the MCP tool's own resolver then reports "No smart device matched" at execute; intentional so the demo plan flow always works.
