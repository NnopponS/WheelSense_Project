---
title: Rules for task_dialogue missing-field handling
author: Chanaps
date: 2026-10-31
branch: wheelsense-InnoServe
id: l-05e1e1b8
scope: repo
status: active
src: agent
---

In server/app/agent_runtime/task_dialogue.py never trust answer.question verbatim while required fields are missing because the intake model fabricates completion claims ('สร้างเรียบร้อยแล้ว') that make users believe a task persisted; filter completion-claim phrasing and prefer deterministic fallback questions plus roster-driven choices (patient_display_name buttons resolve through resolve_patient_mentions on the reply round-trip). Keep _is_task_management_create_request in service.py in sync with _is_task_creation_request in llm_tool_router.py because standalone Thai phrases like 'นัดตรวจสุขภาพ' must re-enter the task path even when conversation context is lost. Task draft survives only when frontend passes conversation_id because _get_or_create_context returns a fresh context for None.
