---
title: EaseAI generative response cards - direct device toggles
author: Chanaps
date: 2026-10-31
branch: wheelsense-InnoServe
id: l-fbcd4fd3
scope: repo
status: active
src: agent
touches:
  - frontend/components/ai/EaseAIResponseCards.tsx
---

EaseAI chat already has a full generative-card pipeline end-to-end: backend response_cards.py emits typed cards (smart_home, device_control, floorplan_map, alert_feed, data_table...) into grounding.response_cards, and frontend EaseAIResponseCards.tsx renders every kind. Before this change, smart_home/device_control card buttons only re-sent a chat message ('Turn off X') through the whole propose-confirm-execute pipeline - slow for demos. Now SmartDeviceControlRow + useDirectDeviceControl in EaseAIResponseCards.tsx POST /api/ha/devices/{id}/control directly (same endpoint as the manual Smart Home toggles, drives physical relays + E84 room screens). DeviceControlCard also looks up the toggled device's room_id via GET /ha/devices and renders ALL sibling devices in that room as a control panel. Fallback: when a card device lacks a numeric id the button still routes through onQuestionChoice chat. Watch out: GET/POST /ha/devices allows admin/head_caregiver/caregiver/patient - observer/supervisor chat users get a fetch failure and see the plain card. Repo-wide gotcha: vitest cannot resolve the '@/...' alias (every component test fails at import, pre-existing, unrelated to this change).
