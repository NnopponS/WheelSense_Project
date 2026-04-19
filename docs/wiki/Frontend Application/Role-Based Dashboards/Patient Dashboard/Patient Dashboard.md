# Patient Dashboard

<cite>
**Referenced Files in This Document**
- [frontend/app/patient/page.tsx](file://frontend/app/patient/page.tsx)
- [frontend/app/patient/layout.tsx](file://frontend/app/patient/layout.tsx)
- [frontend/components/patient/PatientCareRoadmap.tsx](file://frontend/components/patient/PatientCareRoadmap.tsx)
- [frontend/components/patient/PatientMySensors.tsx](file://frontend/components/patient/PatientMySensors.tsx)
- [frontend/app/patient/schedule/page.tsx](file://frontend/app/patient/schedule/page.tsx)
- [frontend/app/patient/room-controls/page.tsx](file://frontend/app/patient/room-controls/page.tsx)
- [frontend/app/patient/services/page.tsx](file://frontend/app/patient/services/page.tsx)
- [frontend/app/patient/pharmacy/page.tsx](file://frontend/app/patient/pharmacy/page.tsx)
- [frontend/app/patient/messages/page.tsx](file://frontend/app/patient/messages/page.tsx)
- [frontend/components/messaging/PatientWorkflowMailbox.tsx](file://frontend/components/messaging/PatientWorkflowMailbox.tsx)
- [frontend/lib/patientRoomQuickInfo.ts](file://frontend/lib/patientRoomQuickInfo.ts)
- [frontend/lib/patientMetrics.ts](file://frontend/lib/patientMetrics.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)
10. [Appendices](#appendices)

## Introduction
This document describes the Patient Dashboard interface in the WheelSense Platform. It covers the patient’s self-service portal, including personal health monitoring, room environment controls, appointment scheduling, pharmacy services, communication tools, and care roadmap management. It also documents patient-specific navigation patterns, self-service features, and personalized health tools, with implementation details for care roadmap visualization, sensor monitoring interfaces, room control panels, and service booking systems.

## Project Structure
The Patient Dashboard is implemented as a Next.js app under the “patient” route group. It integrates reusable UI components and shared messaging infrastructure. The layout wraps the patient shell with role-specific styling and spacing. Key pages include:
- Dashboard overview with quick links, care roadmap, and sensor monitoring
- Schedule and services (including pharmacy)
- Room controls
- Messages (workflow mailbox)
- Support (issue reporting)

```mermaid
graph TB
subgraph "Patient App"
L["Patient Layout<br/>frontend/app/patient/layout.tsx"]
D["Dashboard Page<br/>frontend/app/patient/page.tsx"]
S["Schedule Page<br/>frontend/app/patient/schedule/page.tsx"]
R["Room Controls Page<br/>frontend/app/patient/room-controls/page.tsx"]
SV["Services Page<br/>frontend/app/patient/services/page.tsx"]
P["Pharmacy Page<br/>frontend/app/patient/pharmacy/page.tsx"]
M["Messages Page<br/>frontend/app/patient/messages/page.tsx"]
end
subgraph "Shared Components"
CRM["Care Roadmap<br/>frontend/components/patient/PatientCareRoadmap.tsx"]
SMS["My Sensors<br/>frontend/components/patient/PatientMySensors.tsx"]
MBOX["Patient Workflow Mailbox<br/>frontend/components/messaging/PatientWorkflowMailbox.tsx"]
ROOMINFO["Room Quick Info<br/>frontend/lib/patientRoomQuickInfo.ts"]
BMICALC["BMI Calculator<br/>frontend/lib/patientMetrics.ts"]
end
L --> D
D --> CRM
D --> SMS
D --> S
D --> R
D --> SV
D --> P
D --> M
M --> MBOX
D --> ROOMINFO
D --> BMICALC
```

**Diagram sources**
- [frontend/app/patient/layout.tsx:1-24](file://frontend/app/patient/layout.tsx#L1-L24)
- [frontend/app/patient/page.tsx:1-455](file://frontend/app/patient/page.tsx#L1-L455)
- [frontend/app/patient/schedule/page.tsx:1-254](file://frontend/app/patient/schedule/page.tsx#L1-L254)
- [frontend/app/patient/room-controls/page.tsx:1-639](file://frontend/app/patient/room-controls/page.tsx#L1-L639)
- [frontend/app/patient/services/page.tsx:1-271](file://frontend/app/patient/services/page.tsx#L1-L271)
- [frontend/app/patient/pharmacy/page.tsx:1-413](file://frontend/app/patient/pharmacy/page.tsx#L1-L413)
- [frontend/app/patient/messages/page.tsx:1-8](file://frontend/app/patient/messages/page.tsx#L1-L8)
- [frontend/components/patient/PatientCareRoadmap.tsx:1-293](file://frontend/components/patient/PatientCareRoadmap.tsx#L1-L293)
- [frontend/components/patient/PatientMySensors.tsx:1-328](file://frontend/components/patient/PatientMySensors.tsx#L1-L328)
- [frontend/components/messaging/PatientWorkflowMailbox.tsx:1-517](file://frontend/components/messaging/PatientWorkflowMailbox.tsx#L1-L517)
- [frontend/lib/patientRoomQuickInfo.ts:1-20](file://frontend/lib/patientRoomQuickInfo.ts#L1-L20)
- [frontend/lib/patientMetrics.ts:1-21](file://frontend/lib/patientMetrics.ts#L1-L21)

**Section sources**
- [frontend/app/patient/layout.tsx:1-24](file://frontend/app/patient/layout.tsx#L1-L24)
- [frontend/app/patient/page.tsx:1-455](file://frontend/app/patient/page.tsx#L1-L455)

## Core Components
- Patient Dashboard overview: Tabbed interface with “Overview,” “Profile,” and “Support.” Includes care roadmap, sensor monitoring, quick links, and emergency assistance buttons.
- Care Roadmap: Aggregates scheduled events and tasks for the patient, grouped into past, now, and next buckets with location and status.
- My Sensors: Lists active device assignments and displays real-time metrics per device type (wheelchair, mobile, Polar HR), with battery indicators and readings.
- Schedule: Calendar and agenda views for workflow schedules; supports admin preview mode.
- Room Controls: Lists active smart devices, shows state snapshots, and allows supported actions (on/off/toggle) and temperature setting for climate devices.
- Services: Allows requesting food, transport, and housekeeping with history and status.
- Pharmacy: Lists active prescriptions and pharmacy orders, and enables refill requests.
- Messages: Patient workflow mailbox with compose, search, read/unread, and attachments.
- Support: Embedded issue reporting form accessed via the Support tab.

**Section sources**
- [frontend/app/patient/page.tsx:67-247](file://frontend/app/patient/page.tsx#L67-L247)
- [frontend/components/patient/PatientCareRoadmap.tsx:65-293](file://frontend/components/patient/PatientCareRoadmap.tsx#L65-L293)
- [frontend/components/patient/PatientMySensors.tsx:83-328](file://frontend/components/patient/PatientMySensors.tsx#L83-L328)
- [frontend/app/patient/schedule/page.tsx:40-254](file://frontend/app/patient/schedule/page.tsx#L40-L254)
- [frontend/app/patient/room-controls/page.tsx:156-639](file://frontend/app/patient/room-controls/page.tsx#L156-L639)
- [frontend/app/patient/services/page.tsx:70-271](file://frontend/app/patient/services/page.tsx#L70-L271)
- [frontend/app/patient/pharmacy/page.tsx:71-413](file://frontend/app/patient/pharmacy/page.tsx#L71-L413)
- [frontend/app/patient/messages/page.tsx:1-8](file://frontend/app/patient/messages/page.tsx#L1-L8)
- [frontend/components/messaging/PatientWorkflowMailbox.tsx:71-517](file://frontend/components/messaging/PatientWorkflowMailbox.tsx#L71-L517)

## Architecture Overview
The Patient Dashboard follows a modular pattern:
- Route pages orchestrate queries and render shared components.
- Shared components encapsulate UI logic and data fetching.
- Utilities provide domain helpers (room info, BMI calculation).
- Messaging is centralized via a workflow mailbox component reused across roles.

```mermaid
graph TB
subgraph "UI Pages"
DP["Dashboard Page"]
SP["Schedule Page"]
RP["Room Controls Page"]
SV["Services Page"]
PP["Pharmacy Page"]
MP["Messages Page"]
end
subgraph "Components"
CRM["PatientCareRoadmap"]
SMS["PatientMySensors"]
MBOX["PatientWorkflowMailbox"]
end
subgraph "Libraries"
ROOMINFO["patientRoomQuickInfo"]
BMICALC["patientMetrics"]
end
DP --> CRM
DP --> SMS
DP --> SP
DP --> RP
DP --> SV
DP --> PP
DP --> MP
MP --> MBOX
DP --> ROOMINFO
DP --> BMICALC
```

**Diagram sources**
- [frontend/app/patient/page.tsx:67-247](file://frontend/app/patient/page.tsx#L67-L247)
- [frontend/components/patient/PatientCareRoadmap.tsx:65-293](file://frontend/components/patient/PatientCareRoadmap.tsx#L65-L293)
- [frontend/components/patient/PatientMySensors.tsx:83-328](file://frontend/components/patient/PatientMySensors.tsx#L83-L328)
- [frontend/app/patient/messages/page.tsx:1-8](file://frontend/app/patient/messages/page.tsx#L1-L8)
- [frontend/components/messaging/PatientWorkflowMailbox.tsx:71-517](file://frontend/components/messaging/PatientWorkflowMailbox.tsx#L71-L517)
- [frontend/lib/patientRoomQuickInfo.ts:1-20](file://frontend/lib/patientRoomQuickInfo.ts#L1-L20)
- [frontend/lib/patientMetrics.ts:1-21](file://frontend/lib/patientMetrics.ts#L1-L21)

## Detailed Component Analysis

### Dashboard Overview
The dashboard page renders:
- A top banner with portal badge, greeting, care level badge, and room headline.
- A tabbed interface (Overview, Profile, Support).
- Overview tab: care roadmap, sensors, assistance buttons, and quick links to schedule, room controls, messages, and services.
- Profile tab: merged patient and account profile details.
- Support tab: embedded issue reporting form.

```mermaid
sequenceDiagram
participant U as "User"
participant P as "Dashboard Page"
participant Q as "Queries"
participant C1 as "Care Roadmap"
participant C2 as "My Sensors"
U->>P : Load /patient
P->>Q : Fetch patient, profile, room
Q-->>P : Patient data
P->>C1 : Render roadmap (schedules/tasks)
P->>C2 : Render sensors (assignments/readings)
U->>P : Click "Call Nurse"/"Emergency SOS"
P->>Q : Create alert (non-emergency/emergency)
Q-->>P : Success/Failure
```

**Diagram sources**
- [frontend/app/patient/page.tsx:67-247](file://frontend/app/patient/page.tsx#L67-L247)
- [frontend/components/patient/PatientCareRoadmap.tsx:65-293](file://frontend/components/patient/PatientCareRoadmap.tsx#L65-L293)
- [frontend/components/patient/PatientMySensors.tsx:83-328](file://frontend/components/patient/PatientMySensors.tsx#L83-L328)

**Section sources**
- [frontend/app/patient/page.tsx:67-247](file://frontend/app/patient/page.tsx#L67-L247)
- [frontend/lib/patientRoomQuickInfo.ts:1-20](file://frontend/lib/patientRoomQuickInfo.ts#L1-L20)

### Care Roadmap Visualization
The roadmap aggregates schedules and tasks for the patient and classifies them into past, now, and next columns. It resolves room labels and displays statuses and due times.

```mermaid
flowchart TD
Start(["Load schedules & tasks"]) --> Filter["Filter patient tasks"]
Filter --> Classify["Classify by time/status"]
Classify --> Group{"Group into Past/Now/Next"}
Group --> Render["Render cards with title, time, location, status"]
Render --> End(["Done"])
```

**Diagram sources**
- [frontend/components/patient/PatientCareRoadmap.tsx:65-293](file://frontend/components/patient/PatientCareRoadmap.tsx#L65-L293)

**Section sources**
- [frontend/components/patient/PatientCareRoadmap.tsx:65-293](file://frontend/components/patient/PatientCareRoadmap.tsx#L65-L293)

### Personal Health Monitoring (My Sensors)
The sensors panel lists active device assignments and fetches device details. It formats metrics per device type (wheelchair, mobile, Polar HR) and shows battery levels.

```mermaid
sequenceDiagram
participant U as "User"
participant S as "My Sensors"
participant Q as "Queries"
participant API as "Device API"
U->>S : Open dashboard
S->>Q : List active assignments
Q-->>S : Assignments
loop For each device
S->>API : Get device detail
API-->>S : Metrics & battery
S->>S : Format metrics & render
end
```

**Diagram sources**
- [frontend/components/patient/PatientMySensors.tsx:83-328](file://frontend/components/patient/PatientMySensors.tsx#L83-L328)

**Section sources**
- [frontend/components/patient/PatientMySensors.tsx:83-328](file://frontend/components/patient/PatientMySensors.tsx#L83-L328)

### Room Environment Control Panel
The room controls page lists active smart devices, resolves device kinds, and exposes supported actions. It supports refresh, on/off/toggle, and temperature setting for climate devices.

```mermaid
sequenceDiagram
participant U as "User"
participant RC as "Room Controls"
participant Q as "Queries"
participant API as "Smart Device API"
U->>RC : Open room controls
RC->>API : List active devices
API-->>RC : Devices
RC->>API : Get device state
API-->>RC : Snapshot
U->>RC : Toggle/Control device
RC->>API : Control action
API-->>RC : Success/Error
RC->>RC : Refresh snapshot
```

**Diagram sources**
- [frontend/app/patient/room-controls/page.tsx:156-639](file://frontend/app/patient/room-controls/page.tsx#L156-L639)

**Section sources**
- [frontend/app/patient/room-controls/page.tsx:156-639](file://frontend/app/patient/room-controls/page.tsx#L156-L639)

### Appointment Scheduling and Services
The schedule page provides calendar and agenda views for workflow schedules, with admin preview support. Services allow requesting food, transport, and housekeeping with history and status.

```mermaid
sequenceDiagram
participant U as "User"
participant SCH as "Schedule Page"
participant Q as "Queries"
participant CAL as "Calendar/Agenda"
U->>SCH : Open schedule
SCH->>Q : List schedules & patient
Q-->>SCH : Data
SCH->>CAL : Render events
U->>SCH : Switch to Services
SCH->>Q : List service requests
Q-->>SCH : Requests
U->>SCH : Submit service request
SCH->>Q : Create request
Q-->>SCH : Success
```

**Diagram sources**
- [frontend/app/patient/schedule/page.tsx:40-254](file://frontend/app/patient/schedule/page.tsx#L40-L254)
- [frontend/app/patient/services/page.tsx:70-271](file://frontend/app/patient/services/page.tsx#L70-L271)

**Section sources**
- [frontend/app/patient/schedule/page.tsx:40-254](file://frontend/app/patient/schedule/page.tsx#L40-L254)
- [frontend/app/patient/services/page.tsx:70-271](file://frontend/app/patient/services/page.tsx#L70-L271)

### Pharmacy Services
The pharmacy page lists active prescriptions and orders, and enables refill requests with validation and submission.

```mermaid
sequenceDiagram
participant U as "User"
participant PH as "Pharmacy Page"
participant Q as "Queries"
participant API as "Pharmacy API"
U->>PH : Open pharmacy
PH->>Q : List prescriptions & orders
Q-->>PH : Data
U->>PH : Fill form & submit
PH->>API : Request refill
API-->>PH : Success/Error
PH->>Q : Invalidate cache
```

**Diagram sources**
- [frontend/app/patient/pharmacy/page.tsx:71-413](file://frontend/app/patient/pharmacy/page.tsx#L71-L413)

**Section sources**
- [frontend/app/patient/pharmacy/page.tsx:71-413](file://frontend/app/patient/pharmacy/page.tsx#L71-L413)

### Communication Tools (Messages)
The messages page uses a shared workflow mailbox component to list inbox and sent messages, enable compose, search, read/unread, and manage attachments.

```mermaid
sequenceDiagram
participant U as "User"
participant MSG as "Messages Page"
participant MB as "PatientWorkflowMailbox"
participant Q as "Queries"
participant API as "Messaging API"
U->>MSG : Open messages
MSG->>MB : Render mailbox
MB->>Q : List recipients & messages
Q-->>MB : Data
U->>MB : Compose/send
MB->>API : Send message
API-->>MB : Success
MB->>Q : Invalidate cache
```

**Diagram sources**
- [frontend/app/patient/messages/page.tsx:1-8](file://frontend/app/patient/messages/page.tsx#L1-L8)
- [frontend/components/messaging/PatientWorkflowMailbox.tsx:71-517](file://frontend/components/messaging/PatientWorkflowMailbox.tsx#L71-L517)

**Section sources**
- [frontend/app/patient/messages/page.tsx:1-8](file://frontend/app/patient/messages/page.tsx#L1-L8)
- [frontend/components/messaging/PatientWorkflowMailbox.tsx:71-517](file://frontend/components/messaging/PatientWorkflowMailbox.tsx#L71-L517)

### Support and Issue Reporting
The Support tab embeds an issue reporting form for submitting support tickets.

**Section sources**
- [frontend/app/patient/page.tsx:249-261](file://frontend/app/patient/page.tsx#L249-L261)

## Dependency Analysis
- Dashboard depends on:
  - Queries for patient, profile, room, schedules, tasks, rooms, devices, and smart devices.
  - Shared components for roadmap and sensors.
  - Utility functions for room quick info and BMI calculations.
- Room controls depends on:
  - Smart device listing and state retrieval APIs.
  - Action routing for supported device kinds.
- Services and pharmacy depend on:
  - Request creation and history retrieval APIs.
- Messages depends on:
  - Recipient discovery and workflow messaging APIs.

```mermaid
graph LR
DP["Dashboard Page"] --> CRM["Care Roadmap"]
DP --> SMS["My Sensors"]
DP --> SCH["Schedule"]
DP --> RC["Room Controls"]
DP --> SVC["Services"]
DP --> PH["Pharmacy"]
DP --> MSG["Messages"]
RC --> API1["Smart Devices API"]
SVC --> API2["Service Requests API"]
PH --> API3["Prescriptions/Orders API"]
MSG --> API4["Workflow Messaging API"]
```

**Diagram sources**
- [frontend/app/patient/page.tsx:67-247](file://frontend/app/patient/page.tsx#L67-L247)
- [frontend/app/patient/room-controls/page.tsx:156-639](file://frontend/app/patient/room-controls/page.tsx#L156-L639)
- [frontend/app/patient/services/page.tsx:70-271](file://frontend/app/patient/services/page.tsx#L70-L271)
- [frontend/app/patient/pharmacy/page.tsx:71-413](file://frontend/app/patient/pharmacy/page.tsx#L71-L413)
- [frontend/components/messaging/PatientWorkflowMailbox.tsx:71-517](file://frontend/components/messaging/PatientWorkflowMailbox.tsx#L71-L517)

**Section sources**
- [frontend/app/patient/page.tsx:67-247](file://frontend/app/patient/page.tsx#L67-L247)

## Performance Considerations
- Efficient data fetching:
  - Use React Query with appropriate query keys and enabled booleans to avoid unnecessary requests.
  - Enable refetch intervals for live data (e.g., sensors, messages).
- Rendering optimization:
  - Memoize derived data (e.g., room labels, metrics) to prevent re-computation.
  - Use lazy loading for heavy components (e.g., calendar/agenda).
- Network resilience:
  - Handle loading and error states gracefully with skeleton loaders and error banners.
  - Debounce user actions (e.g., search) to reduce API churn.

## Troubleshooting Guide
Common issues and resolutions:
- No patient linked:
  - The dashboard shows a friendly message when the user lacks a linked patient record. Users should contact staff to link their account.
- Room details unavailable:
  - The room quick info falls back to a placeholder when room data is missing or loading.
- Assistance request failures:
  - Emergency/non-emergency assistance triggers alert creation; failures surface as errors and can be retried.
- Device state refresh failures:
  - Room controls show device-specific errors and allow manual refresh.
- Messaging errors:
  - Compose/send failures are surfaced with localized messages; ensure a recipient is selected and content is present.
- Services/Pharmacy submission errors:
  - Validation errors guide users to correct inputs; ensure a patient profile exists and required fields are filled.

**Section sources**
- [frontend/app/patient/page.tsx:148-175](file://frontend/app/patient/page.tsx#L148-L175)
- [frontend/lib/patientRoomQuickInfo.ts:1-20](file://frontend/lib/patientRoomQuickInfo.ts#L1-L20)
- [frontend/app/patient/room-controls/page.tsx:156-639](file://frontend/app/patient/room-controls/page.tsx#L156-L639)
- [frontend/components/messaging/PatientWorkflowMailbox.tsx:71-517](file://frontend/components/messaging/PatientWorkflowMailbox.tsx#L71-L517)
- [frontend/app/patient/services/page.tsx:70-271](file://frontend/app/patient/services/page.tsx#L70-L271)
- [frontend/app/patient/pharmacy/page.tsx:71-413](file://frontend/app/patient/pharmacy/page.tsx#L71-L413)

## Conclusion
The Patient Dashboard provides a cohesive, role-specific self-service experience centered on care coordination, personal monitoring, and communication. Its modular design leverages shared components and robust data flows to deliver a responsive and accessible interface for patients.

## Appendices

### Patient Workflows Overview
- Self-monitoring:
  - View active device assignments and metrics in the “My Sensors” panel.
- Room customization:
  - Control lights, fans, switches, and climate devices from the “Room Controls” page.
- Appointment management:
  - Browse schedules and agendas in the “Schedule” page; admin preview mode available.
- Medication requests:
  - Submit refill requests via the “Pharmacy” page after selecting an active prescription.
- Communication with care team:
  - Use the “Messages” mailbox to compose and manage workflow messages.
- Accessing care services:
  - Request food, transport, and housekeeping through the “Services” page.

[No sources needed since this section summarizes workflows conceptually]