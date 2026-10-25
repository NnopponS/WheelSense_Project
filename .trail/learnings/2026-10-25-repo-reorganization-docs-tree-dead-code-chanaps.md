---
title: "Repo reorganization: docs tree + dead code removal"
author: Chanaps
date: 2026-10-25
branch: feature/working-hardware-setup
id: l-6b0ec8aa
scope: repo
status: active
src: agent
touches:
  - docker/README.md
  - docker/ARCHITECTURE.md
  - docker/backend/README.md
  - README.md
  - ".gitignore"
---

Repo was cleaned up in commit 1354bcd8: docs now live in docs/ (ARCHITECTURE.md + NETWORK_SETUP.md at root, backend/ for backend internals, archive/ for historical docs). Deleted frontend/graft (old graft cache — use .trail/cache), docker/services/dashboard (dead Vite app — compose 'dashboard' builds ../frontend Next.js), docker/services/nginx/dashboard.nginx.conf, and the empty mcp_llm-wheelsense gitlink. Gotchas: docker-compose mounts ./.cursor into the backend container (git-ignored junk dir, recreated on up); docker/backend/src/core/database_append.txt is a tracked code fragment left in place; backend MCP runs in-process via src/mcp (no port 8080 service); DB is SQLite in the sqlite_data volume, not MongoDB.
