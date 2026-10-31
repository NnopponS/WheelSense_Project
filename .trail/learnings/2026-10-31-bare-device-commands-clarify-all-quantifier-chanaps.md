---
title: Bare device commands clarify; all-quantifier builds multi-step plans
author: Chanaps
date: 2026-10-31
branch: wheelsense-InnoServe
id: l-b2a67ee4
scope: repo
status: active
src: agent
---

Bare 'ปิดไฟ'/'turn off the light' (no room) previously let control_room_smart_device silently act on matches[0] - the first DB row (Living Room Light), arbitrary and confusing. Now _try_v2_device_control_precheck: 0 matches -> 'couldn't find' answer (previously the plan failed only at execute); >1 matches -> question_choices card asking which device, each choice reply is a fully-specified command ('Turn off Living Room Light') that re-parses deterministically via onQuestionChoice->sendMessage; apply_to_all (new DeviceControlRequest flag, set by EN 'all|every|each' or TH 'ทั้งหมด|ทุกห้อง|ทุกดวง|ทุกตัว') -> one ExecutionPlanStep per matched device (e.g. 'ปิดไฟทุกห้อง' = 5 relays). Watch out: quantifier phrases leave filler as the room token ('every room', 'ทุก') which partially matches room_keys containing 'room' (livingroom/bedroom/bathroom matched, kitchen/gardenlounge didn't) - the precheck strips all|every|each|room(s)|ทุก|หมด|ห้อง from match_room before smart_device_matches when apply_to_all.
