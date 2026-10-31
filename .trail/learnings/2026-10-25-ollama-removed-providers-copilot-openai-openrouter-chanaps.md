---
title: Ollama removed; providers=copilot/openai/openrouter; camera capture API
author: Chanaps
date: 2026-10-25
branch: wheelsense-InnoServe
id: l-ffe84aac
scope: repo
status: active
src: agent
touches:
  - CucumberRS-Controller/src/main.cpp
  - TsimCam-Controller/src/main.cpp
  - docker/backend/src/api/frontend_v2_compat.py
  - docker/backend/src/core/database_compat_property.py
  - docker/backend/src/core/database_property_append.py
  - docker/backend/src/core/mqtt_handler.py
  - docker/backend/src/core/websocket_handler.py
  - docker/backend/src/init_data.py
  - docker/backend/src/main.py
  - docker/backend/src/services/command_parser.py
---

## Decided
- AI providers are copilot | openai | openrouter only. Ollama fully removed: container/image/volume, config fields (ollama_base_url, ollama_fallback_model), /api/settings/ai/ollama/* routes, UI panel sections, i18n keys.
- OpenAI-compatible transports renamed: stream_ollama -> stream_openai_compatible, complete_ollama_with_tool_calls -> complete_openai_compatible_tool_calls. base_url + api_key are now REQUIRED kwargs, always supplied via get_cloud_provider_options(db, workspace_id, provider).
- Copilot chat = stream_copilot + collect_copilot_json_tool_calls (JSON-blob routing); native tools= leg serves openai/openrouter only. The old "copilot falls back to Ollama" legs were deleted (dead endpoints).
- Device flow needs GITHUB_OAUTH_CLIENT_ID; core compose defaults it to GitHub's VS Code public client id.
- Detection-test capture API on video_router: POST /api/capture/{room}/snapshot, POST /api/record/{room}/start|stop, GET /api/record/status + /api/capture/config. Writes JPEG sequence + .mjpg under CAPTURE_ROOT (/app/captures, bind-mounted to host server/captures). Throttled per-fps in HardwareBridge._record_frame, hooked in the TsimCam frame loop.
## Watch out
- WorkspaceAISettings column defaults changed to copilot/gpt-4.1 (python-side only; rows always written explicitly).
- save_dir from the UI is a subpath under CAPTURE_ROOT — sanitized by _safe_subdir (no .. / absolute). To move files elsewhere, change the ./captures bind mount or CAPTURE_ROOT.
- Full pytest suite hangs ad-hoc in the server container (DB fixtures); verified via imports + live API instead.
