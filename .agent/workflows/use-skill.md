---
description: How to automatically use relevant skills when working on the WheelSense project
---

# Auto Skill Usage

When working on any task, automatically identify and apply relevant skills from `.agent/skills/`.

## Steps

1. **Identify relevant skills** by matching the task to skill descriptions:
   - **Frontend work (React, Next.js, Zustand, Tailwind):** Read `nextjs-frontend`, `react-patterns`, `react-state-management`
   - **Backend work (FastAPI, Python, async):** Read `fastapi-backend`, `fastapi-pro`, `async-python-patterns`
   - **API design or new endpoints:** Read `api-design-principles`, `fastapi-pro`
   - **Docker or deployment:** Read `docker-deployment`, `docker-expert`
   - **MQTT or IoT data:** Read `mqtt-protocol`
   - **Writing tests:** Read `testing`, `python-testing-patterns`, `test-driven-development`
   - **Debugging bugs or errors:** Read `systematic-debugging`, `error-handling`
   - **Error handling or resilience:** Read `error-handling`, `async-python-patterns`

// turbo
2. **Read the relevant SKILL.md** file(s) using `view_file` before starting work:
   ```
   view_file .agent/skills/<skill-name>/SKILL.md
   ```

// turbo
3. **Check for additional resources** in the skill's directory (e.g., `resources/implementation-playbook.md`, `assets/`, `references/`). Read these if the task requires deeper guidance.

4. **Apply the skill's patterns** directly to your implementation. Follow the conventions, patterns, and anti-patterns documented in the skill.

5. **When multiple skills apply**, prioritize project-specific skills (`nextjs-frontend`, `fastapi-backend`, `docker-deployment`, `mqtt-protocol`, `error-handling`, `testing`) over community skills, as they contain WheelSense-specific conventions.
