---
title: question_choices sections carry the whole task intake in one send
author: Chanaps
date: 2026-10-31
branch: wheelsense-InnoServe
id: l-10d6e3a1
scope: repo
status: active
src: agent
touches:
  - frontend/components/ai/EaseAIResponseCards.tsx
---

In server/app/agent_runtime/task_dialogue.py the multi-field intake emits one question_choices card with sections[] (field/question/reply_prefix/choices/allow_custom) so the user answers every missing field in a single send; EaseAIResponseCards.tsx composes 'prefix + answer' joined by ' · ' and the deterministic resolvers (patient names, มอบหมาย-gated staff, no_deadline regex) still parse the composite because they scan whole user_text. Keep card.question as the fill-all instruction while assistant_reply stays the model's natural question, and never let a composite message pass the naive draft.title fallback (guarded by ' · ').
