# WheelSense Platform

WheelSense is an IoT + clinical workflow platform for wheelchair monitoring, room localization, patient workflows, smart-device control, and role-based web dashboards.

## Repository Layout

- `server/` - FastAPI backend, PostgreSQL models, MQTT ingestion, ML/localization, CLI, Home Assistant integration
- `frontend/` - Next.js 16 web app with role-based dashboards and EaseAI chat (3-stage propose/confirm/execute)
- `mobile-app/` - React Native/Expo app with BLE beacon scanning, Polar Sense integration, offline SOS queue, and WebView embedding
- `firmware/` - PlatformIO firmware for the wheelchair device (`M5StickCPlus2`) and camera/beacon node (`Node_Tsimcam`)
- `.agents/` - shared workflow memory and change logs for AI/humans
- `.cursor/` - Cursor-specific skills, rules, and subagent prompts
- `docs/` - architecture overview (`docs/ARCHITECTURE.md`), ADRs, design notes (`docs/design/`), and implementation plans (`docs/plans/`)

## Source Of Truth

Read the repo in this order:

1. Runtime code in `server/`, `frontend/`, and `firmware/`
2. `server/AGENTS.md` for backend architecture and operating rules
3. `.agents/workflows/wheelsense.md` for cross-agent workflow and implementation patterns
4. `.cursor/skills/*`, `.cursor/rules/*`, `.cursor/agents/*` for Cursor-specific wrappers
5. `docs/adr/*` for accepted/proposed architectural decisions
6. `docs/plans/*` and `.agents/changes/*` as planning/history, not runtime truth  
   See `docs/README.md` for a compact map of architecture, design drafts, and MCP docs.

## Quick Start

### Backend

```bash
cd server
copy .env.example .env
docker compose up -d db mosquitto
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Or run the full container stack:

```bash
cd server
docker compose up -d --build
```

Optional **synthetic MQTT** (`wheelsense-simulator`): not started by default. With `--profile simulator`, the simulator container runs `seed_sim_team.py` before `sim_controller` so staff/rooms/patients exist; optionally set `SIM_WORKSPACE_ID` in `server/.env` to pin a workspace. Details: `server/docs/RUNBOOK.md`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The Next.js app proxies `/api/*` requests to the FastAPI server via `frontend/app/api/[[...path]]/route.ts`.

## Documentation

### Quick Links to Wiki Documentation

Comprehensive documentation is available in [`docs/wiki/`](docs/wiki/README.md):

#### 📋 Project Overview
- [Getting Started](docs/wiki/Getting%20Started.md)
- [Key Features](docs/wiki/Project%20Overview/Key%20Features.md)
- [Project Overview](docs/wiki/Project%20Overview/Project%20Overview.md)
- [System Architecture](docs/wiki/Project%20Overview/System%20Architecture.md)
- [Technology Stack](docs/wiki/Project%20Overview/Technology%20Stack.md)

#### 🏗️ Architecture & Design
- [System Overview](docs/wiki/Architecture%20%26%20Design/System%20Overview.md)
- [Design Patterns & Principles](docs/wiki/Architecture%20%26%20Design/Design%20Patterns%20%26%20Principles.md)
- [Component Interactions](docs/wiki/Architecture%20%26%20Design/Component%20Interactions%20%26%20Communication.md)
- [Data Flow & Processing](docs/wiki/Architecture%20%26%20Design/Data%20Flow%20%26%20Processing%20Architecture.md)
- [Deployment & Infrastructure](docs/wiki/Architecture%20%26%20Design/Deployment%20%26%20Infrastructure%20Architecture.md)

#### 🔧 Backend Services
- [FastAPI Application](docs/wiki/Backend%20Services/FastAPI%20Application.md)
- [Database Layer](docs/wiki/Backend%20Services/Database%20Layer.md)
- [Service Layer Architecture](docs/wiki/Backend%20Services/Service%20Layer%20Architecture.md)
- [MQTT Integration](docs/wiki/Backend%20Services/MQTT%20Integration.md)
- [API Endpoints](docs/wiki/Backend%20Services/API%20Endpoints/API%20Endpoints.md)
  - [Authentication & Authorization](docs/wiki/Backend%20Services/API%20Endpoints/Authentication%20%26%20Authorization.md)
  - [Patient Management](docs/wiki/Backend%20Services/API%20Endpoints/Patient%20Management.md)
  - [Device Management](docs/wiki/Backend%20Services/API%20Endpoints/Device%20Management.md)
  - [Workflow & Task Management](docs/wiki/Backend%20Services/API%20Endpoints/Workflow%20%26%20Task%20Management.md)

#### 🖥️ Frontend Application
- [Next.js Application](docs/wiki/Frontend%20Application/Next.js%20Application.md)
- [Role-Based Dashboards](docs/wiki/Frontend%20Application/Role-Based%20Dashboards/Role-Based%20Dashboards.md)
  - [Admin Dashboard](docs/wiki/Frontend%20Application/Role-Based%20Dashboards/Admin%20Dashboard/Admin%20Dashboard.md)
  - [Head Nurse Dashboard](docs/wiki/Frontend%20Application/Role-Based%20Dashboards/Head%20Nurse%20Dashboard/Head%20Nurse%20Dashboard.md)
  - [Supervisor Dashboard](docs/wiki/Frontend%20Application/Role-Based%20Dashboards/Supervisor%20Dashboard/Supervisor%20Dashboard.md)
  - [Observer Dashboard](docs/wiki/Frontend%20Application/Role-Based%20Dashboards/Observer%20Dashboard/Observer%20Dashboard.md)
  - [Patient Dashboard](docs/wiki/Frontend%20Application/Role-Based%20Dashboards/Patient%20Dashboard/Patient%20Dashboard.md)
- [Component Library](docs/wiki/Frontend%20Application/Component%20Library/Component%20Library.md)
- [State Management](docs/wiki/Frontend%20Application/State%20Management.md)
- [Forms & Validation](docs/wiki/Frontend%20Application/Forms%20%26%20Validation.md)

#### 🤖 AI & Agent Runtime
- [EaseAI Pipeline](docs/wiki/AI%20%26%20Agent%20Runtime/EaseAI%20Pipeline.md) - 5-layer intelligence pipeline (L1 intent routing, L2 context validation, L3 behavioral state, L4 LLM synthesis, L5 safety execution)
- [MCP System](docs/MCP-README.md) - Model Context Protocol implementation with 105+ workspace tools, role-based prompts, and OAuth scope narrowing

#### 📱 Mobile Application
- [Mobile App Overview](mobile-app/wheelsense-mobile/README.md) - React Native app with feature parity: BLE scanning, Polar Sense, offline SOS queue, role-aware WebView landing, and push notification deep-links
- [Intent Classification & NLP](docs/wiki/AI%20%26%20Agent%20Runtime/Intent%20Classification%20%26%20NLP/Intent%20Classification%20%26%20NLP.md)
- [MCP Integration & Tool Execution](docs/wiki/AI%20%26%20Agent%20Runtime/MCP%20Integration%20%26%20Tool%20Execution/MCP%20Integration%20%26%20Tool%20Execution.md)
- [Chat Actions & Three-Stage Flow](docs/wiki/AI%20%26%20Agent%20Runtime/Chat%20Actions%20%26%20Three-Stage%20Flow/Chat%20Actions%20%26%20Three-Stage%20Flow.md)
- [Agent Runtime Core Services](docs/wiki/AI%20%26%20Agent%20Runtime/Agent%20Runtime%20Core%20Services.md)

#### 📡 Device Management
- [Device Registry](docs/wiki/Device%20Management/Device%20Registry.md)
- [Telemetry Processing](docs/wiki/Device%20Management/Telemetry%20Processing.md)
- [Localization System](docs/wiki/Device%20Management/Localization%20System.md)
- [Smart Device Integration](docs/wiki/Device%20Management/Smart%20Device%20Integration.md)

#### ⚙️ Firmware & Embedded Systems
- [M5StickCPlus2 Device](docs/wiki/Firmware%20%26%20Embedded%20Systems/M5StickCPlus2%20Device%20Implementation/M5StickCPlus2%20Device%20Implementation.md)
- [Node_Tsimcam Device](docs/wiki/Firmware%20%26%20Embedded%20Systems/Node_Tsimcam%20Device%20Implementation.md)
- [Hardware Specifications](docs/wiki/Firmware%20%26%20Embedded%20Systems/Hardware%20Specifications%20%26%20Components.md)
- [Development & Build Workflow](docs/wiki/Firmware%20%26%20Embedded%20Systems/Development%20%26%20Build%20Workflow.md)

#### 📊 Workflow Management
- [Task Management](docs/wiki/Workflow%20Management/Task%20Management.md)
- [Schedule Management](docs/wiki/Workflow%20Management/Schedule%20Management.md)
- [Messaging System](docs/wiki/Workflow%20Management/Messaging%20System.md)
- [Audit Trail & Compliance](docs/wiki/Workflow%20Management/Audit%20Trail%20%26%20Compliance.md)

#### 📈 Analytics & Reporting
- [Data Analytics](docs/wiki/Analytics%20%26%20Reporting/Data%20Analytics.md)
- [Dashboard Components](docs/wiki/Analytics%20%26%20Reporting/Dashboard%20Components.md)
- [Floorplan Visualization](docs/wiki/Analytics%20%26%20Reporting/Floorplan%20Visualization.md)
- [Reporting System](docs/wiki/Analytics%20%26%20Reporting/Reporting%20System.md)

#### 🔐 Security & Other
- [Security & Access Control](docs/wiki/Security%20%26%20Access%20Control.md)
- [Testing & Deployment](docs/wiki/Testing%20%26%20Deployment.md)
- [Development Guidelines](docs/wiki/Development%20Guidelines.md)

### Additional Documentation

- Cross-stack architecture (web + backend contracts): `docs/ARCHITECTURE.md`
- Backend runtime + API memory: `server/AGENTS.md`
- Backend setup/ops/env: `server/docs/CONTRIBUTING.md`, `server/docs/ENV.md`, `server/docs/RUNBOOK.md`
- Frontend app notes: `frontend/README.md`
- Architecture decisions: `docs/adr/README.md`
- Product / UX design notes: `docs/design/`

## Historical Notes

- `docs/plans/*` are planning documents. Keep them for context, but verify behavior against runtime code.
- `.agents/changes/*` are change logs, not canonical architecture docs.

## License

See project files for license terms.
