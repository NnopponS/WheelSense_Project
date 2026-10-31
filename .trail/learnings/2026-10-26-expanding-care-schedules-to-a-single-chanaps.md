---
title: Expanding care_schedules to a single-day event list
author: Chanaps
date: 2026-10-26
branch: wheelsense-InnoServe
id: l-30fc5343
scope: repo
status: active
src: agent
touches:
  - frontend/app/admin/page.tsx
  - frontend/components/calendar/scheduleEventMapper.ts
  - frontend/components/ai/AIChatPopup.tsx
---

visibleCalendarRange(anchor,'day') returns {start:startOfDay,end:startOfDay}, so every recurrence instance after 00:00 fails the instanceStart<=range.end guard and expands to nothing for a same-day view — pass {start:startOfDay(now),end:endOfDay(now)} to schedulesToCalendarEvents for a single-day list. Its output still needs an isSameDay filter because schedules with empty recurrence_rule bypass the range check entirely (scheduleToCalendarEvent is pushed unconditionally). CareScheduleOut carries room_id but no room name — resolve names via api.listRooms() cast to Room[] (lib/types) keyed by room.id. AIChatPopup listens for the 'wheelsense:open-ai' CustomEvent; detail.prompt prefills the chat input. Robert Chen = patient_id 2, routine seeded as care_schedules FREQ=DAILY on model rooms 25-28.
