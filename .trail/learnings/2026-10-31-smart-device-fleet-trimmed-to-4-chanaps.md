---
title: Smart-device fleet trimmed to 4 rooms + room-word matching fix + chat task creation
author: Chanaps
date: 2026-10-31
branch: wheelsense-InnoServe
id: l-3c616c43
scope: repo
status: active
src: agent
---

Demo fleet should be exactly 11 SmartDevices across the 4 camera rooms (Living Room Light/AC/Fan/TV, Bedroom Light/AC/TV/Alarm, Kitchen Light/Alarm, Bathroom Light) - deleted stray ids 12 Dining Room AC, 13 Nurses Station Switch, 14 Garden Lounge Light so 'ปิดไฟ' resolves 4 lights not 5. Fixed a real room-matching bug: the generic token 'room' substring-matched room_keys ('living room' also hit Bedroom TV because 'room' is inside 'bedroom'); smart_device_matches and the duplicated _matches in mcp/server.py now drop 'room'/'ห้อง' from room_words - keep both copies in sync (they are meant to mirror). Task creation via chat: _is_task_creation_request now also catches schedule|book|set and Thai นัด/จัดนัด/นัดหมาย + appointments - 'นัดตรวจสุขภาพให้ Margaret' reaches task_dialogue + create_task_management_task. Added create_task_management_task to caregiver allowlist (workflow.write parity). Verified on real DB: 'ปิดทีวีห้องนั่งเล่น'->Living Room TV only, 'เปิดแอร์ห้องนอน'->Bedroom AC, task-intent True for TH+EN phrasings, tool allowed for admin/head_caregiver/caregiver.
