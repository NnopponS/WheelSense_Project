# Patient Messaging & Communication

<cite>
**Referenced Files in This Document**
- [PatientWorkflowMailbox.tsx](file://frontend/components/messaging/PatientWorkflowMailbox.tsx)
- [StaffWorkflowMailbox.tsx](file://frontend/components/messaging/StaffWorkflowMailbox.tsx)
- [AdminWorkflowMailbox.tsx](file://frontend/components/messaging/AdminWorkflowMailbox.tsx)
- [WorkflowMessageAttachmentViews.tsx](file://frontend/components/messaging/WorkflowMessageAttachmentViews.tsx)
- [MessagingRecipientPicker.tsx](file://frontend/components/messaging/MessagingRecipientPicker.tsx)
- [WorkflowMessageDetailDialog.tsx](file://frontend/components/messaging/WorkflowMessageDetailDialog.tsx)
- [workflowMessaging.ts](file://frontend/lib/workflowMessaging.ts)
- [api.ts](file://frontend/lib/api.ts)
- [workflow.py](file://server/app/services/workflow.py)
- [workflow_message_attachments.py](file://server/app/services/workflow_message_attachments.py)
- [workflow.py](file://server/app/models/workflow.py)
- [workflow.py](file://server/app/api/endpoints/workflow.py)
- [test_workflow_domains.py](file://server/tests/test_workflow_domains.py)
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

## Introduction
This document describes the secure patient messaging and communication system that enables direct, threaded conversations between patients and their care team. It covers the mailbox implementations for patients, staff roles, and administrators; the message attachment system supporting photos, documents, and multimedia; integration with the broader workflow system for care-related discussions; common communication scenarios; categorization and priority handling; and privacy/security measures.

## Project Structure
The messaging system spans the frontend React components and the backend FastAPI service:
- Frontend: mailboxes for patients, staff, and admins; attachment composition and viewing; recipient selection; detail dialogs
- Backend: endpoints for listing, sending, marking read, deleting messages; uploading and serving attachments; workflow-aware message linking

```mermaid
graph TB
subgraph "Frontend"
PM["PatientWorkflowMailbox.tsx"]
SM["StaffWorkflowMailbox.tsx"]
AM["AdminWorkflowMailbox.tsx"]
ARP["MessagingRecipientPicker.tsx"]
WMAV["WorkflowMessageAttachmentViews.tsx"]
WMD["WorkflowMessageDetailDialog.tsx"]
API["api.ts"]
WFMS["workflowMessaging.ts"]
end
subgraph "Backend"
EP["workflow.py (endpoints)"]
SVC["workflow.py (service)"]
ATT["workflow_message_attachments.py"]
MOD["models/workflow.py"]
end
PM --> API
SM --> API
AM --> API
PM --> WMAV
SM --> WMAV
AM --> WMAV
PM --> ARP
SM --> ARP
AM --> ARP
PM --> WMD
SM --> WMD
AM --> WMD
API --> EP
EP --> SVC
SVC --> ATT
SVC --> MOD
```

**Diagram sources**
- [PatientWorkflowMailbox.tsx:71-517](file://frontend/components/messaging/PatientWorkflowMailbox.tsx#L71-L517)
- [StaffWorkflowMailbox.tsx:153-723](file://frontend/components/messaging/StaffWorkflowMailbox.tsx#L153-L723)
- [AdminWorkflowMailbox.tsx:110-688](file://frontend/components/messaging/AdminWorkflowMailbox.tsx#L110-L688)
- [MessagingRecipientPicker.tsx:68-155](file://frontend/components/messaging/MessagingRecipientPicker.tsx#L68-L155)
- [WorkflowMessageAttachmentViews.tsx:26-142](file://frontend/components/messaging/WorkflowMessageAttachmentViews.tsx#L26-L142)
- [WorkflowMessageDetailDialog.tsx:28-102](file://frontend/components/messaging/WorkflowMessageDetailDialog.tsx#L28-L102)
- [api.ts:881-919](file://frontend/lib/api.ts#L881-L919)
- [workflow.py:261-404](file://server/app/api/endpoints/workflow.py#L261-L404)
- [workflow.py:296-312](file://server/app/services/workflow.py#L296-L312)
- [workflow_message_attachments.py:52-202](file://server/app/services/workflow_message_attachments.py#L52-L202)
- [workflow.py:67-89](file://server/app/models/workflow.py#L67-L89)

**Section sources**
- [PatientWorkflowMailbox.tsx:71-517](file://frontend/components/messaging/PatientWorkflowMailbox.tsx#L71-L517)
- [StaffWorkflowMailbox.tsx:153-723](file://frontend/components/messaging/StaffWorkflowMailbox.tsx#L153-L723)
- [AdminWorkflowMailbox.tsx:110-688](file://frontend/components/messaging/AdminWorkflowMailbox.tsx#L110-L688)
- [WorkflowMessageAttachmentViews.tsx:26-142](file://frontend/components/messaging/WorkflowMessageAttachmentViews.tsx#L26-L142)
- [MessagingRecipientPicker.tsx:68-155](file://frontend/components/messaging/MessagingRecipientPicker.tsx#L68-L155)
- [WorkflowMessageDetailDialog.tsx:28-102](file://frontend/components/messaging/WorkflowMessageDetailDialog.tsx#L28-L102)
- [api.ts:881-919](file://frontend/lib/api.ts#L881-L919)
- [workflow.py:261-404](file://server/app/api/endpoints/workflow.py#L261-L404)
- [workflow.py:296-312](file://server/app/services/workflow.py#L296-L312)
- [workflow_message_attachments.py:52-202](file://server/app/services/workflow_message_attachments.py#L52-L202)
- [workflow.py:67-89](file://server/app/models/workflow.py#L67-L89)

## Core Components
- Patient mailbox: lists inbox/sent threads, composes messages to staff, manages attachments, marks read, deletes messages
- Staff mailboxes (head nurse, supervisor, observer): role-filtered compose, patient targeting, read/unread management
- Admin mailbox: broad visibility across roles/users, compose targeting role or user, administrative controls
- Attachment system: pick, preview, upload pending, finalize on send, download with cookie-authenticated URLs
- Recipient picker: role filtering, search, and selection for staff compose
- Workflow integration: messages can be linked to workflow items (task, schedule, directive) for care-related discussions

**Section sources**
- [PatientWorkflowMailbox.tsx:71-517](file://frontend/components/messaging/PatientWorkflowMailbox.tsx#L71-L517)
- [StaffWorkflowMailbox.tsx:153-723](file://frontend/components/messaging/StaffWorkflowMailbox.tsx#L153-L723)
- [AdminWorkflowMailbox.tsx:110-688](file://frontend/components/messaging/AdminWorkflowMailbox.tsx#L110-L688)
- [WorkflowMessageAttachmentViews.tsx:26-142](file://frontend/components/messaging/WorkflowMessageAttachmentViews.tsx#L26-L142)
- [MessagingRecipientPicker.tsx:68-155](file://frontend/components/messaging/MessagingRecipientPicker.tsx#L68-L155)
- [workflow.py:261-404](file://server/app/api/endpoints/workflow.py#L261-L404)

## Architecture Overview
The system uses authenticated requests with role-based access control. Messages are stored with optional attachments and can be linked to workflow items. Attachments are staged temporarily and finalized when a message is sent.

```mermaid
sequenceDiagram
participant UI as "Mailbox UI"
participant API as "Frontend API"
participant EP as "Backend Endpoints"
participant SVC as "Workflow Service"
participant ATT as "Attachment Service"
participant DB as "Database"
UI->>API : listWorkflowMessages()
API->>EP : GET /workflow/messages
EP->>SVC : list_messages(...)
SVC->>DB : SELECT role_messages
DB-->>SVC : messages[]
SVC-->>EP : messages[]
EP-->>API : messages[]
API-->>UI : render list
UI->>API : uploadWorkflowMessageAttachment(file)
API->>EP : POST /workflow/messages/attachments
EP->>ATT : save_pending_upload(...)
ATT-->>EP : {pending_id, filename, ...}
EP-->>API : {pending_id}
API-->>UI : show pending chip
UI->>API : sendWorkflowMessage({pending_attachment_ids})
API->>EP : POST /workflow/messages
EP->>SVC : send_message(...)
SVC->>ATT : finalize_pending_attachments(...)
ATT-->>SVC : [{id, filename, ...}]
SVC->>DB : INSERT role_messages + attachments
DB-->>SVC : OK
SVC-->>EP : message
EP-->>API : message
API-->>UI : refresh list/sent tab
```

**Diagram sources**
- [api.ts:881-919](file://frontend/lib/api.ts#L881-L919)
- [workflow.py:261-404](file://server/app/api/endpoints/workflow.py#L261-L404)
- [workflow.py:296-312](file://server/app/services/workflow.py#L296-L312)
- [workflow_message_attachments.py:52-202](file://server/app/services/workflow_message_attachments.py#L52-L202)
- [workflow.py:67-89](file://server/app/models/workflow.py#L67-L89)

## Detailed Component Analysis

### Patient Mailbox
- Lists inbox vs sent, supports search, selection, read/unread badges
- Compose sheet with recipient selection, subject/body, and attachments
- Deletion and read marking with role-aware permissions
- Attachment composition with file type and size limits

```mermaid
flowchart TD
Start(["Open Patient Mailbox"]) --> Load["Load messages + recipients"]
Load --> View["Render inbox/sent list"]
View --> Select["Select message"]
Select --> Details["Show details + attachments"]
Details --> Actions{"Actions"}
Actions --> |Mark read| Mark["POST /workflow/messages/{id}/read"]
Actions --> |Delete| Del["DELETE /workflow/messages/{id}"]
Actions --> |Compose| Compose["Open compose sheet"]
Compose --> Pick["Pick recipient"]
Pick --> Attach["Attach files (<=8MB, <=5)"]
Attach --> Send["Send message"]
Send --> Refresh["Invalidate queries + switch to sent"]
Refresh --> View
```

**Diagram sources**
- [PatientWorkflowMailbox.tsx:71-517](file://frontend/components/messaging/PatientWorkflowMailbox.tsx#L71-L517)
- [workflowMessaging.ts:8-17](file://frontend/lib/workflowMessaging.ts#L8-L17)
- [WorkflowMessageAttachmentViews.tsx:26-103](file://frontend/components/messaging/WorkflowMessageAttachmentViews.tsx#L26-L103)

**Section sources**
- [PatientWorkflowMailbox.tsx:71-517](file://frontend/components/messaging/PatientWorkflowMailbox.tsx#L71-L517)
- [workflowMessaging.ts:8-17](file://frontend/lib/workflowMessaging.ts#L8-L17)
- [WorkflowMessageAttachmentViews.tsx:26-103](file://frontend/components/messaging/WorkflowMessageAttachmentViews.tsx#L26-L103)

### Staff Mailboxes (Head Nurse, Supervisor, Observer)
- Role-specific compose sheets with recipient role filters and live search
- Optional patient targeting for care-related messages
- Read/unread management and deletion controls
- Administrative compose supports role or user targets

```mermaid
sequenceDiagram
participant Staff as "Staff Mailbox"
participant API as "Frontend API"
participant EP as "Endpoints"
participant SVC as "Service"
participant ATT as "Attachment Service"
Staff->>API : listWorkflowMessagingRecipients()
API->>EP : GET /workflow/messaging/recipients
EP->>SVC : search users (staff+patients)
SVC-->>EP : recipients[]
EP-->>API : recipients[]
API-->>Staff : populate picker
Staff->>API : uploadWorkflowMessageAttachment(file)
API->>EP : POST /workflow/messages/attachments
EP->>ATT : save_pending_upload
ATT-->>EP : {pending_id}
EP-->>API : {pending_id}
API-->>Staff : show pending chip
Staff->>API : sendWorkflowMessage({recipient_role/user, patient_id?, subject, body})
API->>EP : POST /workflow/messages
EP->>SVC : send_message(...)
SVC->>ATT : finalize_pending_attachments(...)
ATT-->>SVC : [{id, filename, ...}]
SVC-->>EP : message
EP-->>API : message
API-->>Staff : refresh list
```

**Diagram sources**
- [StaffWorkflowMailbox.tsx:153-723](file://frontend/components/messaging/StaffWorkflowMailbox.tsx#L153-L723)
- [MessagingRecipientPicker.tsx:68-155](file://frontend/components/messaging/MessagingRecipientPicker.tsx#L68-L155)
- [workflow.py:282-325](file://server/app/api/endpoints/workflow.py#L282-L325)
- [workflow_message_attachments.py:52-202](file://server/app/services/workflow_message_attachments.py#L52-L202)

**Section sources**
- [StaffWorkflowMailbox.tsx:153-723](file://frontend/components/messaging/StaffWorkflowMailbox.tsx#L153-L723)
- [MessagingRecipientPicker.tsx:68-155](file://frontend/components/messaging/MessagingRecipientPicker.tsx#L68-L155)
- [workflow.py:282-325](file://server/app/api/endpoints/workflow.py#L282-L325)
- [workflow_message_attachments.py:52-202](file://server/app/services/workflow_message_attachments.py#L52-L202)

### Admin Mailbox
- Comprehensive compose with role or user target selection
- All/inbox/sent tabs with counts and unread indicators
- Detailed message view with metadata and attachments

```mermaid
flowchart TD
AStart(["Admin Mailbox"]) --> AList["List messages (all/inbox/sent)"]
AList --> ASelect["Select message"]
ASelect --> ADetails["Show metadata + attachments"]
ADetails --> AActions{"Actions"}
AActions --> |Mark read| ARead["POST /workflow/messages/{id}/read"]
AActions --> |Delete| ADel["DELETE /workflow/messages/{id}"]
AActions --> |Compose| ACompose["Open compose (role/user)"]
ACompose --> APick["Pick recipient"]
APick --> AAttach["Attach files"]
AAttach --> ASend["Send message"]
ASend --> ARefresh["Invalidate queries + switch to sent"]
ARefresh --> AList
```

**Diagram sources**
- [AdminWorkflowMailbox.tsx:110-688](file://frontend/components/messaging/AdminWorkflowMailbox.tsx#L110-L688)
- [workflow.py:261-404](file://server/app/api/endpoints/workflow.py#L261-L404)

**Section sources**
- [AdminWorkflowMailbox.tsx:110-688](file://frontend/components/messaging/AdminWorkflowMailbox.tsx#L110-L688)
- [workflow.py:261-404](file://server/app/api/endpoints/workflow.py#L261-L404)

### Attachment System
- Composition: choose files (JPEG, PNG, GIF, WebP, PDF), preview, remove
- Upload: temporary staging with size/type validation
- Finalization: move to final storage, record metadata in message
- Viewing: download via authenticated URLs with cookie-based auth

```mermaid
flowchart TD
UStart(["Attach Files"]) --> Choose["Choose file (<=8MB)"]
Choose --> Validate{"Allowed type?"}
Validate --> |No| Error["Reject (415)"]
Validate --> |Yes| Stage["Upload to pending storage"]
Stage --> Pending["Return pending_id"]
Pending --> Compose["Include pending_id in send"]
Compose --> Finalize["Finalize pending attachments"]
Finalize --> Store["Move to final storage"]
Store --> DB["Persist attachment metadata"]
DB --> Download["Download via authenticated URL"]
```

**Diagram sources**
- [WorkflowMessageAttachmentViews.tsx:26-103](file://frontend/components/messaging/WorkflowMessageAttachmentViews.tsx#L26-L103)
- [workflow_message_attachments.py:52-202](file://server/app/services/workflow_message_attachments.py#L52-L202)
- [workflowMessaging.ts:3-6](file://frontend/lib/workflowMessaging.ts#L3-L6)

**Section sources**
- [WorkflowMessageAttachmentViews.tsx:26-142](file://frontend/components/messaging/WorkflowMessageAttachmentViews.tsx#L26-L142)
- [workflow_message_attachments.py:52-202](file://server/app/services/workflow_message_attachments.py#L52-L202)
- [workflowMessaging.ts:3-6](file://frontend/lib/workflowMessaging.ts#L3-L6)

### Workflow Integration
- Messages can be associated with workflow items (task, schedule, directive)
- Item detail endpoint aggregates messages and audit events for a given item
- Enrichment adds person metadata for sender/recipients

```mermaid
sequenceDiagram
participant UI as "Workflow Item Detail"
participant API as "Frontend API"
participant EP as "Endpoints"
participant SVC as "Service"
participant DB as "Database"
UI->>API : getWorkflowItemDetail("task"|"schedule"|"directive", id)
API->>EP : GET /workflow/items/{type}/{id}
EP->>SVC : load item + messages + audit
SVC->>DB : SELECT role_messages WHERE item_type/id
DB-->>SVC : messages[]
SVC-->>EP : enriched item + messages + audit
EP-->>API : combined detail
API-->>UI : render
```

**Diagram sources**
- [workflow.py:546-664](file://server/app/api/endpoints/workflow.py#L546-L664)
- [workflow.py:296-312](file://server/app/services/workflow.py#L296-L312)

**Section sources**
- [workflow.py:546-664](file://server/app/api/endpoints/workflow.py#L546-L664)
- [workflow.py:296-312](file://server/app/services/workflow.py#L296-L312)

### Common Communication Scenarios
- Symptom reporting: patient composes to assigned staff; optional photo/video attachment; read receipt
- Care question submission: staff recipient picker selects appropriate role; optional patient tagging
- Appointment inquiries: workflow-linked messages reference scheduling item; thread visible in item detail
- Discharge planning discussions: multi-party messages among head nurse, supervisor, observer, and patient; attachments include documents

[No sources needed since this section provides scenario descriptions without analyzing specific files]

## Dependency Analysis
- Frontend mailboxes depend on shared APIs for listing messages, recipients, sending, marking read, and deleting
- Attachment composition depends on shared constants for limits and URL generation
- Backend endpoints depend on service layer for business logic and attachment staging/finalization
- Services depend on SQLAlchemy models for persistence and on attachment service for file lifecycle

```mermaid
graph LR
PM["PatientWorkflowMailbox.tsx"] --> API["api.ts"]
SM["StaffWorkflowMailbox.tsx"] --> API
AM["AdminWorkflowMailbox.tsx"] --> API
PM --> WMAV["WorkflowMessageAttachmentViews.tsx"]
SM --> WMAV
AM --> WMAV
PM --> ARP["MessagingRecipientPicker.tsx"]
SM --> ARP
AM --> ARP
API --> EP["workflow.py (endpoints)"]
EP --> SVC["workflow.py (service)"]
EP --> ATT["workflow_message_attachments.py"]
SVC --> MOD["models/workflow.py"]
```

**Diagram sources**
- [PatientWorkflowMailbox.tsx:71-517](file://frontend/components/messaging/PatientWorkflowMailbox.tsx#L71-L517)
- [StaffWorkflowMailbox.tsx:153-723](file://frontend/components/messaging/StaffWorkflowMailbox.tsx#L153-L723)
- [AdminWorkflowMailbox.tsx:110-688](file://frontend/components/messaging/AdminWorkflowMailbox.tsx#L110-L688)
- [WorkflowMessageAttachmentViews.tsx:26-142](file://frontend/components/messaging/WorkflowMessageAttachmentViews.tsx#L26-L142)
- [MessagingRecipientPicker.tsx:68-155](file://frontend/components/messaging/MessagingRecipientPicker.tsx#L68-L155)
- [api.ts:881-919](file://frontend/lib/api.ts#L881-L919)
- [workflow.py:261-404](file://server/app/api/endpoints/workflow.py#L261-L404)
- [workflow.py:296-312](file://server/app/services/workflow.py#L296-L312)
- [workflow_message_attachments.py:52-202](file://server/app/services/workflow_message_attachments.py#L52-L202)
- [workflow.py:67-89](file://server/app/models/workflow.py#L67-L89)

**Section sources**
- [api.ts:881-919](file://frontend/lib/api.ts#L881-L919)
- [workflow.py:261-404](file://server/app/api/endpoints/workflow.py#L261-L404)
- [workflow.py:296-312](file://server/app/services/workflow.py#L296-L312)
- [workflow_message_attachments.py:52-202](file://server/app/services/workflow_message_attachments.py#L52-L202)
- [workflow.py:67-89](file://server/app/models/workflow.py#L67-L89)

## Performance Considerations
- Polling intervals: mailboxes poll for new messages at short intervals to keep inboxes fresh
- Pagination: list endpoints support limits to constrain payload sizes
- Attachment staging: pending uploads avoid blocking send until finalize step
- Image/pdf handling: enforced size and type limits reduce storage overhead and improve download performance

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
- Attachment upload failures: check file type and size limits; verify pending ID validity
- Message send errors: ensure recipient selection and presence of body or attachments
- Read/unread state: verify user permissions and that the message belongs to the current workspace
- Deleted messages: confirm deletion rights based on role and ownership

**Section sources**
- [workflow_message_attachments.py:52-202](file://server/app/services/workflow_message_attachments.py#L52-L202)
- [workflow.py:315-404](file://server/app/api/endpoints/workflow.py#L315-L404)
- [workflowMessaging.ts:8-17](file://frontend/lib/workflowMessaging.ts#L8-L17)

## Conclusion
The Patient Messaging and Communication system provides a secure, role-aware, and workflow-integrated platform for care team collaboration. It supports threaded conversations, rich attachments, and contextual linkage to care workflows while enforcing strict privacy and security boundaries through authenticated access and workspace-scoped records.