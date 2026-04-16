---
# Repo Wiki Documentation Reference

## Overview

Complete documentation map of the WheelSense **Repo Wiki** under `.qoder/repowiki/en/content/`. Pages are Markdown, cite repository paths, and are organized by domain. **Total wiki pages:** 140.

**Note:** Two different files are named `Getting Started.md` (one at the wiki content root and one under `Project Overview/`); use the full path when referencing.

## Wiki File Index

### Root-level pages

Location: `.qoder/repowiki/en/content/`

- `Getting Started.md` — Local install, Docker, DB init, env vars, demo seeding, dev vs production setup (see also Project Overview variant).
- `Development Guidelines.md` — Cross-stack standards: Python/TS/firmware style, PR/review, QA, ADRs, workflows, testing and deployment expectations.
- `Security & Access Control.md` — JWT auth, RBAC, workspace scoping, REST/MCP authorization, middleware, and security-relevant tests and ADRs.
- `Testing & Deployment.md` — pytest/Next.js testing, simulation, Docker Compose topologies, CI/CD, production ops, monitoring, backups, rollback runbooks.

### Project Overview

Location: `.qoder/repowiki/en/content/Project Overview/`

- `Getting Started.md` — Onboarding focused on compose variants, MQTT, simulators, and quick-start commands with referenced config files.
- `Key Features.md` — Capability-oriented overview of major platform features.
- `Project Overview.md` — High-level product and platform summary for the WheelSense documentation set.
- `System Architecture.md` — Narrative system architecture aligned with the overview track (distinct from Architecture & Design/).
- `Technology Stack.md` — Languages, frameworks, and major dependencies across server, web, and firmware.

### Architecture & Design

Location: `.qoder/repowiki/en/content/Architecture & Design/`

- `Architecture & Design.md` — Architecture topic: **Architecture & Design** (platform composition, subsystem communication, data-flow views, and deployment topology).
- `Component Interactions & Communication.md` — Architecture topic: **Component Interactions & Communication** (platform composition, subsystem communication, data-flow views, and deployment topology).
- `Data Flow & Processing Architecture.md` — Architecture topic: **Data Flow & Processing Architecture** (platform composition, subsystem communication, data-flow views, and deployment topology).
- `Deployment & Infrastructure Architecture.md` — Architecture topic: **Deployment & Infrastructure Architecture** (platform composition, subsystem communication, data-flow views, and deployment topology).
- `Design Patterns & Principles.md` — Architecture topic: **Design Patterns & Principles** (platform composition, subsystem communication, data-flow views, and deployment topology).
- `System Overview.md` — Architecture topic: **System Overview** (platform composition, subsystem communication, data-flow views, and deployment topology).

### Backend Services

Location: `.qoder/repowiki/en/content/Backend Services/`

- `API Endpoints/Administrative Functions.md` — REST API map for **Administrative Functions** (routers, schemas, services, and tests cited).
- `API Endpoints/Analytics & Reporting.md` — REST API map for **Analytics & Reporting** (routers, schemas, services, and tests cited).
- `API Endpoints/API Endpoints.md` — REST API map for **API Endpoints** (routers, schemas, services, and tests cited).
- `API Endpoints/Authentication & Authorization.md` — REST API map for **Authentication & Authorization** (routers, schemas, services, and tests cited).
- `API Endpoints/Caregiver & Services.md` — REST API map for **Caregiver & Services** (routers, schemas, services, and tests cited).
- `API Endpoints/Device Management.md` — REST API map for **Device Management** (routers, schemas, services, and tests cited).
- `API Endpoints/Patient Management.md` — REST API map for **Patient Management** (routers, schemas, services, and tests cited).
- `API Endpoints/Smart Home Integration.md` — REST API map for **Smart Home Integration** (routers, schemas, services, and tests cited).
- `API Endpoints/Workflow & Task Management.md` — REST API map for **Workflow & Task Management** (routers, schemas, services, and tests cited).
- `Backend Services.md` — Backend topic: **Backend Services** (FastAPI application layout, persistence/services, and platform integrations).
- `Database Layer.md` — Backend topic: **Database Layer** (FastAPI application layout, persistence/services, and platform integrations).
- `FastAPI Application.md` — Backend topic: **FastAPI Application** (FastAPI application layout, persistence/services, and platform integrations).
- `MQTT Integration.md` — Backend topic: **MQTT Integration** (FastAPI application layout, persistence/services, and platform integrations).
- `Security & Access Control.md` — Backend topic: **Security & Access Control** (FastAPI application layout, persistence/services, and platform integrations).
- `Service Layer Architecture.md` — Backend topic: **Service Layer Architecture** (FastAPI application layout, persistence/services, and platform integrations).

### Frontend Application

Location: `.qoder/repowiki/en/content/Frontend Application/`

- `Component Library/Component Library.md` — UI component library topic: **Component Library** (primitives, theming, notifications, shared and dashboard widgets).
- `Component Library/Dashboard Components.md` — UI component library topic: **Dashboard Components** (primitives, theming, notifications, shared and dashboard widgets).
- `Component Library/Notification Components.md` — UI component library topic: **Notification Components** (primitives, theming, notifications, shared and dashboard widgets).
- `Component Library/Shared Components.md` — UI component library topic: **Shared Components** (primitives, theming, notifications, shared and dashboard widgets).
- `Component Library/Theme System.md` — UI component library topic: **Theme System** (primitives, theming, notifications, shared and dashboard widgets).
- `Component Library/UI Primitives.md` — UI component library topic: **UI Primitives** (primitives, theming, notifications, shared and dashboard widgets).
- `Forms & Validation.md` — Next.js application wiki for **Forms & Validation** (app shell, navigation, state, forms).
- `Frontend Application.md` — Next.js application wiki for **Frontend Application** (app shell, navigation, state, forms).
- `Next.js Application.md` — Next.js application wiki for **Next.js Application** (app shell, navigation, state, forms).
- `Role-Based Dashboards/Admin Dashboard/Account Management.md` — Role dashboard wiki (**Admin Dashboard**): **Account Management** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Admin Dashboard/Admin Dashboard Overview.md` — Role dashboard wiki (**Admin Dashboard**): **Admin Dashboard Overview** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Admin Dashboard/Admin Dashboard.md` — Role dashboard wiki (**Admin Dashboard**): **Admin Dashboard** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Admin Dashboard/Audit Trail & Compliance.md` — Role dashboard wiki (**Admin Dashboard**): **Audit Trail & Compliance** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Admin Dashboard/Demo Environment Control.md` — Role dashboard wiki (**Admin Dashboard**): **Demo Environment Control** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Admin Dashboard/Device Management.md` — Role dashboard wiki (**Admin Dashboard**): **Device Management** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Admin Dashboard/Facility Administration.md` — Role dashboard wiki (**Admin Dashboard**): **Facility Administration** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Admin Dashboard/Machine Learning Calibration.md` — Role dashboard wiki (**Admin Dashboard**): **Machine Learning Calibration** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Admin Dashboard/Operations Monitoring.md` — Role dashboard wiki (**Admin Dashboard**): **Operations Monitoring** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Admin Dashboard/Patient Registry Management.md` — Role dashboard wiki (**Admin Dashboard**): **Patient Registry Management** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Admin Dashboard/Personnel Coordination.md` — Role dashboard wiki (**Admin Dashboard**): **Personnel Coordination** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Admin Dashboard/Smart Device Integration.md` — Role dashboard wiki (**Admin Dashboard**): **Smart Device Integration** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Admin Dashboard/Support Ticketing System.md` — Role dashboard wiki (**Admin Dashboard**): **Support Ticketing System** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Admin Dashboard/System Settings & Configuration.md` — Role dashboard wiki (**Admin Dashboard**): **System Settings & Configuration** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Admin Dashboard/Workflow Messaging & Communication.md` — Role dashboard wiki (**Admin Dashboard**): **Workflow Messaging & Communication** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Head Nurse Dashboard/Alerts Management.md` — Role dashboard wiki (**Head Nurse Dashboard**): **Alerts Management** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Head Nurse Dashboard/Communication System.md` — Role dashboard wiki (**Head Nurse Dashboard**): **Communication System** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Head Nurse Dashboard/Floorplan Monitoring.md` — Role dashboard wiki (**Head Nurse Dashboard**): **Floorplan Monitoring** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Head Nurse Dashboard/Head Nurse Dashboard.md` — Role dashboard wiki (**Head Nurse Dashboard**): **Head Nurse Dashboard** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Head Nurse Dashboard/Monitoring Dashboard.md` — Role dashboard wiki (**Head Nurse Dashboard**): **Monitoring Dashboard** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Head Nurse Dashboard/Patient Care Coordination.md` — Role dashboard wiki (**Head Nurse Dashboard**): **Patient Care Coordination** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Head Nurse Dashboard/Reports & Analytics.md` — Role dashboard wiki (**Head Nurse Dashboard**): **Reports & Analytics** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Head Nurse Dashboard/Settings & Configuration.md` — Role dashboard wiki (**Head Nurse Dashboard**): **Settings & Configuration** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Head Nurse Dashboard/Staff Supervision.md` — Role dashboard wiki (**Head Nurse Dashboard**): **Staff Supervision** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Head Nurse Dashboard/Support Resources.md` — Role dashboard wiki (**Head Nurse Dashboard**): **Support Resources** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Head Nurse Dashboard/Task Management.md` — Role dashboard wiki (**Head Nurse Dashboard**): **Task Management** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Head Nurse Dashboard/Ward Overview Dashboard.md` — Role dashboard wiki (**Head Nurse Dashboard**): **Ward Overview Dashboard** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Observer Dashboard/Alerts Management.md` — Role dashboard wiki (**Observer Dashboard**): **Alerts Management** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Observer Dashboard/Clinical Monitoring Dashboard.md` — Role dashboard wiki (**Observer Dashboard**): **Clinical Monitoring Dashboard** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Observer Dashboard/Device Monitoring.md` — Role dashboard wiki (**Observer Dashboard**): **Device Monitoring** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Observer Dashboard/Floorplan & Zone Monitoring.md` — Role dashboard wiki (**Observer Dashboard**): **Floorplan & Zone Monitoring** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Observer Dashboard/Messaging & Communication.md` — Role dashboard wiki (**Observer Dashboard**): **Messaging & Communication** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Observer Dashboard/Observer Dashboard.md` — Role dashboard wiki (**Observer Dashboard**): **Observer Dashboard** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Observer Dashboard/Patient Management.md` — Role dashboard wiki (**Observer Dashboard**): **Patient Management** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Observer Dashboard/Prescription Management.md` — Role dashboard wiki (**Observer Dashboard**): **Prescription Management** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Observer Dashboard/Settings & Support.md` — Role dashboard wiki (**Observer Dashboard**): **Settings & Support** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Observer Dashboard/Task Management & Workflow.md` — Role dashboard wiki (**Observer Dashboard**): **Task Management & Workflow** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Patient Dashboard/Patient Care Services.md` — Role dashboard wiki (**Patient Dashboard**): **Patient Care Services** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Patient Dashboard/Patient Dashboard.md` — Role dashboard wiki (**Patient Dashboard**): **Patient Dashboard** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Patient Dashboard/Patient Messaging & Communication.md` — Role dashboard wiki (**Patient Dashboard**): **Patient Messaging & Communication** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Patient Dashboard/Patient Overview Dashboard.md` — Role dashboard wiki (**Patient Dashboard**): **Patient Overview Dashboard** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Patient Dashboard/Patient Pharmacy Services.md` — Role dashboard wiki (**Patient Dashboard**): **Patient Pharmacy Services** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Patient Dashboard/Patient Room Controls.md` — Role dashboard wiki (**Patient Dashboard**): **Patient Room Controls** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Patient Dashboard/Patient Schedule Management.md` — Role dashboard wiki (**Patient Dashboard**): **Patient Schedule Management** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Patient Dashboard/Patient Settings & Preferences.md` — Role dashboard wiki (**Patient Dashboard**): **Patient Settings & Preferences** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Patient Dashboard/Patient Support & Resources.md` — Role dashboard wiki (**Patient Dashboard**): **Patient Support & Resources** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Role Navigation System.md` — Role dashboard wiki (**Role Navigation System.md**): **Role Navigation System** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Role-Based Dashboards.md` — Role dashboard wiki (**Role-Based Dashboards.md**): **Role-Based Dashboards** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Supervisor Dashboard/Communication & Messaging Coordination.md` — Role dashboard wiki (**Supervisor Dashboard**): **Communication & Messaging Coordination** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Supervisor Dashboard/Emergency Response Coordination.md` — Role dashboard wiki (**Supervisor Dashboard**): **Emergency Response Coordination** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Supervisor Dashboard/Floorplan & Facility Monitoring.md` — Role dashboard wiki (**Supervisor Dashboard**): **Floorplan & Facility Monitoring** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Supervisor Dashboard/Patient Monitoring & Tracking.md` — Role dashboard wiki (**Supervisor Dashboard**): **Patient Monitoring & Tracking** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Supervisor Dashboard/Prescription & Medication Oversight.md` — Role dashboard wiki (**Supervisor Dashboard**): **Prescription & Medication Oversight** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Supervisor Dashboard/Settings & Preferences.md` — Role dashboard wiki (**Supervisor Dashboard**): **Settings & Preferences** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Supervisor Dashboard/Supervisor Dashboard.md` — Role dashboard wiki (**Supervisor Dashboard**): **Supervisor Dashboard** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Supervisor Dashboard/Support & Resource Coordination.md` — Role dashboard wiki (**Supervisor Dashboard**): **Support & Resource Coordination** (routes, UI modules, cited sources).
- `Role-Based Dashboards/Supervisor Dashboard/Task Supervision & Workflow Oversight.md` — Role dashboard wiki (**Supervisor Dashboard**): **Task Supervision & Workflow Oversight** (routes, UI modules, cited sources).
- `Routing & Navigation.md` — Next.js application wiki for **Routing & Navigation** (app shell, navigation, state, forms).
- `State Management.md` — Next.js application wiki for **State Management** (app shell, navigation, state, forms).

### AI & Agent Runtime

Location: `.qoder/repowiki/en/content/AI & Agent Runtime/`

- `Agent Runtime Core Services.md` — Agent runtime wiki for **Agent Runtime Core Services** (planning/execution services and boundaries).
- `AI & Agent Runtime.md` — Agent runtime wiki for **AI & Agent Runtime** (planning/execution services and boundaries).
- `Chat Actions & Three-Stage Flow/Action Proposal Stage.md` — Chat-actions wiki for **Action Proposal Stage** (proposal → confirmation → execution, UI touchpoints).
- `Chat Actions & Three-Stage Flow/Chat Actions & Three-Stage Flow.md` — Chat-actions wiki for **Chat Actions & Three-Stage Flow** (proposal → confirmation → execution, UI touchpoints).
- `Chat Actions & Three-Stage Flow/Confirmation Stage.md` — Chat-actions wiki for **Confirmation Stage** (proposal → confirmation → execution, UI touchpoints).
- `Chat Actions & Three-Stage Flow/Execution Stage.md` — Chat-actions wiki for **Execution Stage** (proposal → confirmation → execution, UI touchpoints).
- `Chat Actions & Three-Stage Flow/UI Components & Interfaces.md` — Chat-actions wiki for **UI Components & Interfaces** (proposal → confirmation → execution, UI touchpoints).
- `Intent Classification & NLP/Conversation Context & Multi-Turn Awareness.md` — Intent/NLP wiki for **Conversation Context & Multi-Turn Awareness** (regex/semantic matching, permissions, multi-turn context).
- `Intent Classification & NLP/Intent Classification & NLP.md` — Intent/NLP wiki for **Intent Classification & NLP** (regex/semantic matching, permissions, multi-turn context).
- `Intent Classification & NLP/Intent Metadata & Permission System.md` — Intent/NLP wiki for **Intent Metadata & Permission System** (regex/semantic matching, permissions, multi-turn context).
- `Intent Classification & NLP/Regex Pattern Library.md` — Intent/NLP wiki for **Regex Pattern Library** (regex/semantic matching, permissions, multi-turn context).
- `Intent Classification & NLP/Semantic Matching & Embeddings.md` — Intent/NLP wiki for **Semantic Matching & Embeddings** (regex/semantic matching, permissions, multi-turn context).
- `MCP Integration & Tool Execution/LLM Tool Router & Intent Classification.md` — MCP wiki for **LLM Tool Router & Intent Classification** (tool routing, authz, server wiring, tool-creation guidance).
- `MCP Integration & Tool Execution/MCP Authentication & Authorization.md` — MCP wiki for **MCP Authentication & Authorization** (tool routing, authz, server wiring, tool-creation guidance).
- `MCP Integration & Tool Execution/MCP Development & Tool Creation Guide.md` — MCP wiki for **MCP Development & Tool Creation Guide** (tool routing, authz, server wiring, tool-creation guidance).
- `MCP Integration & Tool Execution/MCP Integration & Tool Execution.md` — MCP wiki for **MCP Integration & Tool Execution** (tool routing, authz, server wiring, tool-creation guidance).
- `MCP Integration & Tool Execution/MCP Server Implementation.md` — MCP wiki for **MCP Server Implementation** (tool routing, authz, server wiring, tool-creation guidance).

### Device Management

Location: `.qoder/repowiki/en/content/Device Management/`

- `Device Management.md` — Device platform wiki for **Device Management** (registry, telemetry, localization, smart devices).
- `Device Registry.md` — Device platform wiki for **Device Registry** (registry, telemetry, localization, smart devices).
- `Localization System.md` — Device platform wiki for **Localization System** (registry, telemetry, localization, smart devices).
- `Smart Device Integration.md` — Device platform wiki for **Smart Device Integration** (registry, telemetry, localization, smart devices).
- `Telemetry Processing.md` — Device platform wiki for **Telemetry Processing** (registry, telemetry, localization, smart devices).

### Workflow Management

Location: `.qoder/repowiki/en/content/Workflow Management/`

- `Audit Trail & Compliance.md` — Workflow wiki for **Audit Trail & Compliance** (tasks, schedules, messaging, audit/compliance hooks).
- `Messaging System.md` — Workflow wiki for **Messaging System** (tasks, schedules, messaging, audit/compliance hooks).
- `Schedule Management.md` — Workflow wiki for **Schedule Management** (tasks, schedules, messaging, audit/compliance hooks).
- `Task Management.md` — Workflow wiki for **Task Management** (tasks, schedules, messaging, audit/compliance hooks).
- `Workflow Management.md` — Workflow wiki for **Workflow Management** (tasks, schedules, messaging, audit/compliance hooks).

### Analytics & Reporting

Location: `.qoder/repowiki/en/content/Analytics & Reporting/`

- `Analytics & Reporting.md` — Analytics wiki for **Analytics & Reporting** (metrics pipelines, dashboards, floorplans, reporting).
- `Dashboard Components.md` — Analytics wiki for **Dashboard Components** (metrics pipelines, dashboards, floorplans, reporting).
- `Data Analytics.md` — Analytics wiki for **Data Analytics** (metrics pipelines, dashboards, floorplans, reporting).
- `Floorplan Visualization.md` — Analytics wiki for **Floorplan Visualization** (metrics pipelines, dashboards, floorplans, reporting).
- `Reporting System.md` — Analytics wiki for **Reporting System** (metrics pipelines, dashboards, floorplans, reporting).

### Firmware & Embedded Systems

Location: `.qoder/repowiki/en/content/Firmware & Embedded Systems/`

- `Development & Build Workflow.md` — Firmware/hardware wiki for **Development & Build Workflow** (tooling, specs, and alternate device targets).
- `Firmware & Embedded Systems.md` — Firmware/hardware wiki for **Firmware & Embedded Systems** (tooling, specs, and alternate device targets).
- `Hardware Specifications & Components.md` — Firmware/hardware wiki for **Hardware Specifications & Components** (tooling, specs, and alternate device targets).
- `M5StickCPlus2 Device Implementation/Configuration & Storage.md` — M5StickCPlus2 firmware wiki for **Configuration & Storage** (init loop, sensors, network, power/UI, NVS).
- `M5StickCPlus2 Device Implementation/Device Initialization & Main Loop.md` — M5StickCPlus2 firmware wiki for **Device Initialization & Main Loop** (init loop, sensors, network, power/UI, NVS).
- `M5StickCPlus2 Device Implementation/M5StickCPlus2 Device Implementation.md` — M5StickCPlus2 firmware wiki for **M5StickCPlus2 Device Implementation** (init loop, sensors, network, power/UI, NVS).
- `M5StickCPlus2 Device Implementation/Networking & Communication.md` — M5StickCPlus2 firmware wiki for **Networking & Communication** (init loop, sensors, network, power/UI, NVS).
- `M5StickCPlus2 Device Implementation/Power Management & User Interface.md` — M5StickCPlus2 firmware wiki for **Power Management & User Interface** (init loop, sensors, network, power/UI, NVS).
- `M5StickCPlus2 Device Implementation/Sensor Data Collection & Processing.md` — M5StickCPlus2 firmware wiki for **Sensor Data Collection & Processing** (init loop, sensors, network, power/UI, NVS).
- `Node_Tsimcam Device Implementation.md` — Firmware/hardware wiki for **Node_Tsimcam Device Implementation** (tooling, specs, and alternate device targets).

## How to Use in Cursor

Attach the relevant wiki page when planning or implementing a change. Paths are from the repository root:

```
@.qoder/repowiki/en/content/<RELATIVE_PATH>.md
```

Examples (quote paths with spaces exactly as shown):

```
@.qoder/repowiki/en/content/Architecture & Design/System Overview.md
@.qoder/repowiki/en/content/Frontend Application/Role-Based Dashboards/Admin Dashboard/Device Management.md
```

## Quick Reference Prompts

### Architecture questions

```
Based on @.qoder/repowiki/en/content/Architecture & Design/Architecture & Design.md, how should I implement [feature]?
```

### Backend development

```
Following @.qoder/repowiki/en/content/Backend Services/Backend Services.md and @.qoder/repowiki/en/content/Backend Services/FastAPI Application.md, create [feature].
```

### Frontend development

```
Using patterns from @.qoder/repowiki/en/content/Frontend Application/Frontend Application.md, implement [component].
```

### Full-context development

```
Implement [feature] following project documentation:
@.qoder/repowiki/en/content/Architecture & Design/System Overview.md
@.qoder/repowiki/en/content/Backend Services/Backend Services.md
@.qoder/repowiki/en/content/Frontend Application/Frontend Application.md
@.qoder/repowiki/en/content/Development Guidelines.md
```

## Important Notes

- All wiki files are Markdown (`.md`).
- Topics are grouped by domain under `.qoder/repowiki/en/content/`.
- In Cursor, reference files with `@` plus the path from the repo root.
- This wiki is generated/repo-cited documentation; regenerate or edit upstream sources when the codebase changes materially.

---
