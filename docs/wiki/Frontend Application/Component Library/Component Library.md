# Component Library

<cite>
**Referenced Files in This Document**
- [button.tsx](frontend/components/ui/button.tsx)
- [dialog.tsx](frontend/components/ui/dialog.tsx)
- [table.tsx](frontend/components/ui/table.tsx)
- [alert-dialog.tsx](frontend/components/ui/alert-dialog.tsx)
- [badge.tsx](frontend/components/ui/badge.tsx)
- [card.tsx](frontend/components/ui/card.tsx)
- [checkbox.tsx](frontend/components/ui/checkbox.tsx)
- [input.tsx](frontend/components/ui/input.tsx)
- [label.tsx](frontend/components/ui/label.tsx)
- [select.tsx](frontend/components/ui/select.tsx)
- [textarea.tsx](frontend/components/ui/textarea.tsx)
- [switch.tsx](frontend/components/ui/switch.tsx)
- [tabs.tsx](frontend/components/ui/tabs.tsx)
- [dropdown-menu.tsx](frontend/components/ui/dropdown-menu.tsx)
- [progress.tsx](frontend/components/ui/progress.tsx)
- [AlertPanel.tsx](frontend/components/shared/AlertPanel.tsx)
- [ThemeToggle.tsx](frontend/components/theme/ThemeToggle.tsx)
- [globals.css](frontend/app/globals.css)
- [AppProviders.tsx](frontend/components/providers/AppProviders.tsx)
- [RoleShell.tsx](frontend/components/RoleShell.tsx)
- [TopBar.tsx](frontend/components/TopBar.tsx)
- [RoleSidebar.tsx](frontend/components/RoleSidebar.tsx)
- [SonnerToaster.tsx](frontend/components/SonnerToaster.tsx)
- [NotificationBell.tsx](frontend/components/NotificationBell.tsx)
- [NotificationDrawer.tsx](frontend/components/NotificationDrawer.tsx)
- [EmptyState.tsx](frontend/components/EmptyState.tsx)
- [PatientList.tsx](frontend/components/shared/PatientList.tsx)
- [SearchableListboxPicker.tsx](frontend/components/shared/SearchableListboxPicker.tsx)
- [UserAvatar.tsx](frontend/components/shared/UserAvatar.tsx)
- [AdminAlertsTable.tsx](frontend/components/admin/alerts/AdminAlertsTable.tsx)
- [PatientsDataTable.tsx](frontend/components/admin/patients/PatientsDataTable.tsx)
- [AlertToastCard.tsx](frontend/components/notifications/AlertToastCard.tsx)
- [WorkflowMessageDetailDialog.tsx](frontend/components/messaging/WorkflowMessageDetailDialog.tsx)
- [AIChatPopup.tsx](frontend/components/ai/AIChatPopup.tsx)
- [ActionPlanPreview.tsx](frontend/components/ai/ActionPlanPreview.tsx)
- [ExecutionStepList.tsx](frontend/components/ai/ExecutionStepList.tsx)
- [DashboardFloorplanPanel.tsx](frontend/components/dashboard/DashboardFloorplanPanel.tsx)
- [WardTimelineEmbed.tsx](frontend/components/timeline/WardTimelineEmbed.tsx)
- [ShiftChecklistWorkspaceClient.tsx](frontend/components/shift-checklist/ShiftChecklistWorkspaceClient.tsx)
- [ReportPreviewTable.tsx](frontend/components/reports/ReportPreviewTable.tsx)
- [ReportIssueForm.tsx](frontend/components/support/ReportIssueForm.tsx)
- [WorkflowJobsPanel.tsx](frontend/components/workflow/WorkflowJobsPanel.tsx)
- [WorkflowTasksKanban.tsx](frontend/components/workflow/WorkflowTasksKanban.tsx)
- [WorkflowTasksHubContent.tsx](frontend/components/workflow/WorkflowTasksHubContent.tsx)
- [WorkflowJobCreateDialog.tsx](frontend/components/workflow/WorkflowJobCreateDialog.tsx)
- [ObserverTaskListPanel.tsx](frontend/components/workflow/ObserverTaskListPanel.tsx)
- [OperationsConsole.tsx](frontend/components/workflow/OperationsConsole.tsx)
- [FloorplanCanvas.tsx](frontend/components/floorplan/FloorplanCanvas.tsx)
- [FloorplanRoleViewer.tsx](frontend/components/floorplan/FloorplanRoleViewer.tsx)
- [DeviceDetailDrawer.tsx](frontend/components/admin/devices/DeviceDetailDrawer.tsx)
- [RoomDetailDrawer.tsx](frontend/components/admin/monitoring/RoomDetailDrawer.tsx)
- [FloorMapWorkspace.tsx](frontend/components/admin/monitoring/FloorMapWorkspace.tsx)
- [FacilityFloorToolbar.tsx](frontend/components/admin/monitoring/FacilityFloorToolbar.tsx)
- [AddCaregiverModal.tsx](frontend/components/admin/caregivers/AddCaregiverModal.tsx)
- [EditCaregiverModal.tsx](frontend/components/admin/caregivers/EditCaregiverModal.tsx)
- [CaregiverDetailPane.tsx](frontend/components/admin/caregivers/CaregiverDetailPane.tsx)
- [CaregiverCardGrid.tsx](frontend/components/admin/caregivers/CaregiverCardGrid.tsx)
- [StaffRoutineAndCalendarPanel.tsx](frontend/components/admin/caregivers/StaffRoutineAndCalendarPanel.tsx)
- [AddPatientModal.tsx](frontend/components/admin/patients/AddPatientModal.tsx)
- [PatientEditorModal.tsx](frontend/components/admin/patients/PatientEditorModal.tsx)
- [AdminPatientsQuickFind.tsx](frontend/components/admin/patients/AdminPatientsQuickFind.tsx)
- [RoomFormModal.tsx](frontend/components/admin/RoomFormModal.tsx)
- [SupportTicketList.tsx](frontend/components/admin/SupportTicketList.tsx)
- [AiSettingsPanel.tsx](frontend/components/admin/settings/AiSettingsPanel.tsx)
- [ServerSettingsPanel.tsx](frontend/components/admin/settings/ServerSettingsPanel.tsx)
- [DemoPanel.tsx](frontend/components/admin/demo-control/DemoPanel.tsx)
- [FacilitiesPanel.tsx](frontend/components/admin/FacilitiesPanel.tsx)
- [FloorplansPanel.tsx](frontend/components/admin/FloorplansPanel.tsx)
- [HeadNurseStaffMemberSheet.tsx](frontend/components/head-nurse/HeadNurseStaffMemberSheet.tsx)
- [PatientRoutineManager.tsx](frontend/components/head-nurse/tasks/PatientRoutineManager.tsx)
- [RoleTasksPage.tsx](frontend/components/head-nurse/tasks/RoleTasksPage.tsx)
- [RoutineTaskManager.tsx](frontend/components/head-nurse/tasks/RoutineTaskManager.tsx)
- [TaskCommandBar.tsx](frontend/components/head-nurse/tasks/TaskCommandBar.tsx)
- [TaskKanbanBoard.tsx](frontend/components/head-nurse/tasks/TaskKanbanBoard.tsx)
- [ObserverAlertsQueue.tsx](frontend/app/observer/alerts/ObserverAlertsQueue.tsx)
- [AdminWorkflowMailbox.tsx](frontend/components/messaging/AdminWorkflowMailbox.tsx)
- [PatientWorkflowMailbox.tsx](frontend/components/messaging/PatientWorkflowMailbox.tsx)
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
This document describes the WheelSense Platform’s shared UI component library. It focuses on components built with Radix UI primitives, styled via a consistent design system, and composed to support cross-role experiences. The library covers foundational elements (buttons, inputs, forms), overlays (dialogs, alerts), data display (tables, cards), navigation (tabs, dropdowns), and shared utilities (alerts, modals, notifications). It also documents theming, dark mode, responsive patterns, accessibility, performance, and integration guidelines.

## Project Structure
The component library is primarily located under frontend/components/ui and frontend/components/shared, with role-specific components organized under dedicated namespaces. Styling is centralized in the global stylesheet and utility helpers.

```mermaid
graph TB
subgraph "UI Primitives"
btn["Button"]
inp["Input"]
txt["Textarea"]
sel["Select"]
chk["Checkbox"]
sw["Switch"]
lbl["Label"]
tab["Tabs"]
ddl["DropdownMenu"]
dlg["Dialog"]
adlg["AlertDialog"]
tbl["Table"]
bdg["Badge"]
crd["Card"]
prg["Progress"]
end
subgraph "Shared Utilities"
ap["AlertPanel"]
av["UserAvatar"]
pl["PatientList"]
slp["SearchableListboxPicker"]
end
subgraph "Theming"
css["globals.css"]
theme["ThemeToggle"]
prov["AppProviders"]
end
subgraph "Role Pages"
admin["Admin"]
hn["Head Nurse"]
obs["Observer"]
pat["Patient"]
sup["Supervisor"]
end
btn --> css
inp --> css
txt --> css
sel --> css
chk --> css
sw --> css
lbl --> css
tab --> css
ddl --> css
dlg --> css
adlg --> css
tbl --> css
bdg --> css
crd --> css
prg --> css
ap --> css
av --> css
pl --> css
slp --> css
theme --> prov
prov --> admin
prov --> hn
prov --> obs
prov --> pat
prov --> sup
```

**Diagram sources**
- [button.tsx:1-56](frontend/components/ui/button.tsx#L1-L56)
- [input.tsx:1-22](frontend/components/ui/input.tsx#L1-L22)
- [textarea.tsx:1-21](frontend/components/ui/textarea.tsx#L1-L21)
- [select.tsx:1-147](frontend/components/ui/select.tsx#L1-L147)
- [checkbox.tsx:1-30](frontend/components/ui/checkbox.tsx#L1-L30)
- [switch.tsx:1-30](frontend/components/ui/switch.tsx#L1-L30)
- [label.tsx:1-18](frontend/components/ui/label.tsx#L1-L18)
- [tabs.tsx:1-55](frontend/components/ui/tabs.tsx#L1-L55)
- [dropdown-menu.tsx:1-201](frontend/components/ui/dropdown-menu.tsx#L1-L201)
- [dialog.tsx:1-110](frontend/components/ui/dialog.tsx#L1-L110)
- [alert-dialog.tsx:1-142](frontend/components/ui/alert-dialog.tsx#L1-L142)
- [table.tsx:1-90](frontend/components/ui/table.tsx#L1-L90)
- [badge.tsx:1-31](frontend/components/ui/badge.tsx#L1-L31)
- [card.tsx:1-53](frontend/components/ui/card.tsx#L1-L53)
- [progress.tsx:1-35](frontend/components/ui/progress.tsx#L1-L35)
- [AlertPanel.tsx](frontend/components/shared/AlertPanel.tsx)
- [UserAvatar.tsx](frontend/components/shared/UserAvatar.tsx)
- [PatientList.tsx](frontend/components/shared/PatientList.tsx)
- [SearchableListboxPicker.tsx](frontend/components/shared/SearchableListboxPicker.tsx)
- [globals.css](frontend/app/globals.css)
- [ThemeToggle.tsx](frontend/components/theme/ThemeToggle.tsx)
- [AppProviders.tsx](frontend/components/providers/AppProviders.tsx)

**Section sources**
- [button.tsx:1-56](frontend/components/ui/button.tsx#L1-L56)
- [dialog.tsx:1-110](frontend/components/ui/dialog.tsx#L1-L110)
- [table.tsx:1-90](frontend/components/ui/table.tsx#L1-L90)
- [alert-dialog.tsx:1-142](frontend/components/ui/alert-dialog.tsx#L1-L142)
- [badge.tsx:1-31](frontend/components/ui/badge.tsx#L1-L31)
- [card.tsx:1-53](frontend/components/ui/card.tsx#L1-L53)
- [checkbox.tsx:1-30](frontend/components/ui/checkbox.tsx#L1-L30)
- [input.tsx:1-22](frontend/components/ui/input.tsx#L1-L22)
- [label.tsx:1-18](frontend/components/ui/label.tsx#L1-L18)
- [select.tsx:1-147](frontend/components/ui/select.tsx#L1-L147)
- [textarea.tsx:1-21](frontend/components/ui/textarea.tsx#L1-L21)
- [switch.tsx:1-30](frontend/components/ui/switch.tsx#L1-L30)
- [tabs.tsx:1-55](frontend/components/ui/tabs.tsx#L1-L55)
- [dropdown-menu.tsx:1-201](frontend/components/ui/dropdown-menu.tsx#L1-L201)
- [progress.tsx:1-35](frontend/components/ui/progress.tsx#L1-L35)
- [AlertPanel.tsx](frontend/components/shared/AlertPanel.tsx)
- [ThemeToggle.tsx](frontend/components/theme/ThemeToggle.tsx)
- [globals.css](frontend/app/globals.css)
- [AppProviders.tsx](frontend/components/providers/AppProviders.tsx)

## Core Components
This section summarizes the foundational UI primitives and shared utilities that form the backbone of the design system.

- Buttons
  - Variants: default, secondary, outline, ghost, destructive
  - Sizes: default, sm, lg, icon
  - Composition: supports asChild for semantic composition; integrates with icons
  - Accessibility: inherits native button semantics; focus-visible ring; disabled state
  - Styling: consistent typography, spacing, shadows, and color tokens

- Inputs and Forms
  - Input: base input with focus ring, placeholder, disabled state
  - Textarea: min-height constrained, focus ring, disabled state
  - Select: trigger, content, viewport, item, label, separator; scroll buttons; popper positioning
  - Checkbox: indicator with check mark; controlled via radix state
  - Switch: thumb animation; primary color on checked
  - Label: associated with form controls; disabled state handled via peer
  - Validation patterns: integrate with form libraries; disabled pointer-events on invalid states

- Overlays and Modals
  - Dialog: overlay, content, header/footer, title, description, close button; portal-based; animations
  - AlertDialog: action/cancel using button variants; centered modal; overlay fade
  - Sheet: Radix Sheet primitives (not shown here) used in drawers and panels

- Data Display
  - Table: wrapper with horizontal scrolling; header/body/footer/row/cell/caption; hover/selected states
  - Badge: colored variants for status; outline and secondary variants
  - Card: container with header/title/description/content/footer slots
  - Progress: percentage-based bar with smooth transitions

- Navigation
  - Tabs: list, trigger, content; active state styling; focus-visible rings
  - DropdownMenu: root, trigger, group, portal, sub (trigger/content), items (check/radio/label), separators, shortcuts

- Shared Utilities
  - AlertPanel: role-aware alert presentation
  - UserAvatar: avatar with initials fallback
  - PatientList: list rendering with selection and actions
  - SearchableListboxPicker: searchable selection component

**Section sources**
- [button.tsx:6-33](frontend/components/ui/button.tsx#L6-L33)
- [input.tsx:4-18](frontend/components/ui/input.tsx#L4-L18)
- [textarea.tsx:4-16](frontend/components/ui/textarea.tsx#L4-L16)
- [select.tsx:11-88](frontend/components/ui/select.tsx#L11-L88)
- [checkbox.tsx:8-26](frontend/components/ui/checkbox.tsx#L8-L26)
- [switch.tsx:8-26](frontend/components/ui/switch.tsx#L8-L26)
- [label.tsx:5-14](frontend/components/ui/label.tsx#L5-L14)
- [dialog.tsx:13-51](frontend/components/ui/dialog.tsx#L13-L51)
- [alert-dialog.tsx:15-46](frontend/components/ui/alert-dialog.tsx#L15-L46)
- [table.tsx:4-78](frontend/components/ui/table.tsx#L4-L78)
- [badge.tsx:5-22](frontend/components/ui/badge.tsx#L5-L22)
- [card.tsx:4-50](frontend/components/ui/card.tsx#L4-L50)
- [progress.tsx:11-31](frontend/components/ui/progress.tsx#L11-L31)
- [tabs.tsx:9-52](frontend/components/ui/tabs.tsx#L9-L52)
- [dropdown-menu.tsx:59-75](frontend/components/ui/dropdown-menu.tsx#L59-L75)
- [AlertPanel.tsx](frontend/components/shared/AlertPanel.tsx)
- [UserAvatar.tsx](frontend/components/shared/UserAvatar.tsx)
- [PatientList.tsx](frontend/components/shared/PatientList.tsx)
- [SearchableListboxPicker.tsx](frontend/components/shared/SearchableListboxPicker.tsx)

## Architecture Overview
The component library leverages Radix UI for accessibility and composability, class-variance-authority for variant-driven styling, and a global design system for consistent tokens. Providers manage theme state and global styles.

```mermaid
graph TB
prov["AppProviders<br/>theme, toast, i18n"] --> theme["ThemeToggle"]
prov --> css["globals.css<br/>design tokens, base styles"]
theme --> ui["UI Primitives<br/>button, input, select, dialog, table, etc."]
ui --> shared["Shared Components<br/>AlertPanel, UserAvatar, PatientList"]
shared --> pages["Role Pages<br/>Admin, Head Nurse, Observer, Patient, Supervisor"]
pages --> workflows["Workflows & Features<br/>Messaging, Reports, Devices, Monitoring"]
```

**Diagram sources**
- [AppProviders.tsx](frontend/components/providers/AppProviders.tsx)
- [ThemeToggle.tsx](frontend/components/theme/ThemeToggle.tsx)
- [globals.css](frontend/app/globals.css)
- [button.tsx:1-56](frontend/components/ui/button.tsx#L1-L56)
- [dialog.tsx:1-110](frontend/components/ui/dialog.tsx#L1-L110)
- [table.tsx:1-90](frontend/components/ui/table.tsx#L1-L90)
- [AlertPanel.tsx](frontend/components/shared/AlertPanel.tsx)
- [RoleShell.tsx](frontend/components/RoleShell.tsx)
- [TopBar.tsx](frontend/components/TopBar.tsx)
- [RoleSidebar.tsx](frontend/components/RoleSidebar.tsx)

## Detailed Component Analysis

### Buttons
- Purpose: Primary action affordances with consistent styling and behavior.
- Props and Variants:
  - variant: default, secondary, outline, ghost, destructive
  - size: default, sm, lg, icon
  - asChild: render as child element for semantic composition
  - Inherits native button attributes
- Styling Patterns:
  - Rounded corners, transitions, focus-visible ring
  - Color tokens from theme (primary, secondary, destructive)
  - Disabled state via pointer-events and opacity
- Accessibility:
  - Native button semantics preserved
  - Focus management via radix slot pattern
- Composition Guidelines:
  - Use icon size variants for compact actions
  - Combine with Badge for counts or status indicators

```mermaid
classDiagram
class Button {
+variant : "default"|"secondary"|"outline"|"ghost"|"destructive"
+size : "default"|"sm"|"lg"|"icon"
+asChild : boolean
+className : string
}
class buttonVariants {
+apply(variant,size,className) string
}
Button --> buttonVariants : "uses"
```

**Diagram sources**
- [button.tsx:6-33](frontend/components/ui/button.tsx#L6-L33)

**Section sources**
- [button.tsx:35-53](frontend/components/ui/button.tsx#L35-L53)

### Dialogs and Alerts
- Dialog:
  - Overlay with backdrop blur and fade
  - Content with fixed centering, max width, scrollable body
  - Header/Footer slots; Close button with screen-reader label
  - Portal-based rendering; animations for open/close
- AlertDialog:
  - Centered modal using alert primitive
  - Action and Cancel buttons inherit button variants
  - Overlay fade-in/out animations

```mermaid
sequenceDiagram
participant U as "User"
participant D as "Dialog"
participant O as "Overlay"
participant C as "Content"
participant B as "Close Button"
U->>D : Open Trigger
D->>O : Render overlay
D->>C : Render content
U->>B : Click close
B-->>D : Close event
D-->>O : Unmount overlay
D-->>C : Unmount content
```

**Diagram sources**
- [dialog.tsx:13-51](frontend/components/ui/dialog.tsx#L13-L51)

```mermaid
sequenceDiagram
participant U as "User"
participant AD as "AlertDialog"
participant AO as "AlertOverlay"
participant AC as "AlertContent"
participant AA as "AlertDialogAction"
participant CA as "AlertDialogCancel"
U->>AD : Trigger
AD->>AO : Fade overlay
AD->>AC : Center content
U->>AA : Confirm
AA-->>AD : Action callback
U->>CA : Cancel
CA-->>AD : Dismiss
```

**Diagram sources**
- [alert-dialog.tsx:15-127](frontend/components/ui/alert-dialog.tsx#L15-L127)

**Section sources**
- [dialog.tsx:1-110](frontend/components/ui/dialog.tsx#L1-L110)
- [alert-dialog.tsx:1-142](frontend/components/ui/alert-dialog.tsx#L1-L142)

### Tables and Data Displays
- Table:
  - Scrollable container for large datasets
  - Hover and selected row states
  - Header/Footer/body with consistent borders and typography
- Badge:
  - Status-based variants (success, warning, destructive)
  - Secondary and outline variants for neutral/outline usage
- Card:
  - Flexible layout with header/title/description/content/footer
  - Consistent border and background tokens
- Progress:
  - Percentage calculation with clamping
  - Smooth width transition

```mermaid
flowchart TD
Start(["Render Table"]) --> Wrap["Wrap in scroll container"]
Wrap --> Rows["Render rows with hover/selected states"]
Rows --> Cells["Render cells with alignment"]
Cells --> Footer["Optional footer with totals"]
Footer --> End(["Done"])
```

**Diagram sources**
- [table.tsx:4-78](frontend/components/ui/table.tsx#L4-L78)

**Section sources**
- [table.tsx:1-90](frontend/components/ui/table.tsx#L1-L90)
- [badge.tsx:1-31](frontend/components/ui/badge.tsx#L1-L31)
- [card.tsx:1-53](frontend/components/ui/card.tsx#L1-L53)
- [progress.tsx:1-35](frontend/components/ui/progress.tsx#L1-L35)

### Forms and Controls
- Input and Textarea:
  - Consistent border, padding, focus ring, placeholder, disabled state
- Select:
  - Trigger with chevron icon; content with viewport and scroll buttons
  - Item with check indicator; label and separator
- Checkbox and Switch:
  - Indicator and thumb with transitions
- Label:
  - Peer-based disabled state handling

```mermaid
classDiagram
class Input {
+type : string
+className : string
}
class Textarea {
+className : string
}
class Select {
+Root
+Trigger
+Content
+Viewport
+Item
+Label
+Separator
}
class Checkbox {
+checked : boolean
+disabled : boolean
}
class Switch {
+checked : boolean
+disabled : boolean
}
class Label {
+className : string
}
```

**Diagram sources**
- [input.tsx:4-18](frontend/components/ui/input.tsx#L4-L18)
- [textarea.tsx:4-16](frontend/components/ui/textarea.tsx#L4-L16)
- [select.tsx:8-146](frontend/components/ui/select.tsx#L8-L146)
- [checkbox.tsx:8-26](frontend/components/ui/checkbox.tsx#L8-L26)
- [switch.tsx:8-26](frontend/components/ui/switch.tsx#L8-L26)
- [label.tsx:5-14](frontend/components/ui/label.tsx#L5-L14)

**Section sources**
- [input.tsx:1-22](frontend/components/ui/input.tsx#L1-L22)
- [textarea.tsx:1-21](frontend/components/ui/textarea.tsx#L1-L21)
- [select.tsx:1-147](frontend/components/ui/select.tsx#L1-L147)
- [checkbox.tsx:1-30](frontend/components/ui/checkbox.tsx#L1-L30)
- [switch.tsx:1-30](frontend/components/ui/switch.tsx#L1-L30)
- [label.tsx:1-18](frontend/components/ui/label.tsx#L1-L18)

### Navigation Elements
- Tabs:
  - List with background; triggers with active state and focus rings
- DropdownMenu:
  - Root, trigger, content, items (with inset), submenus, separators, shortcuts

```mermaid
classDiagram
class Tabs {
+Root
+List
+Trigger
+Content
}
class DropdownMenu {
+Root
+Trigger
+Content
+Item
+CheckboxItem
+RadioItem
+Label
+Separator
+Shortcut
+Group
+Portal
+Sub
+SubContent
+SubTrigger
+RadioGroup
}
```

**Diagram sources**
- [tabs.tsx:7-52](frontend/components/ui/tabs.tsx#L7-L52)
- [dropdown-menu.tsx:9-200](frontend/components/ui/dropdown-menu.tsx#L9-L200)

**Section sources**
- [tabs.tsx:1-55](frontend/components/ui/tabs.tsx#L1-L55)
- [dropdown-menu.tsx:1-201](frontend/components/ui/dropdown-menu.tsx#L1-L201)

### Shared Components Used Across Roles
- AlertPanel: role-aware alert presentation
- UserAvatar: avatar with initials fallback
- PatientList: list rendering with selection and actions
- SearchableListboxPicker: searchable selection component

**Section sources**
- [AlertPanel.tsx](frontend/components/shared/AlertPanel.tsx)
- [UserAvatar.tsx](frontend/components/shared/UserAvatar.tsx)
- [PatientList.tsx](frontend/components/shared/PatientList.tsx)
- [SearchableListboxPicker.tsx](frontend/components/shared/SearchableListboxPicker.tsx)

### Theming, Dark Mode, and Responsive Patterns
- Design Tokens and Base Styles:
  - Centralized in the global stylesheet for consistent spacing, typography, and color tokens
- Theme Toggle:
  - Component toggles theme preference; integrated via providers
- Provider Composition:
  - AppProviders wraps the app to supply theme, toasts, and i18n
- Responsive Patterns:
  - Relative units and clamp-like utilities in base styles
  - Max widths and scroll containers for tables and dialogs
  - Breakpoint-free responsive adjustments via padding and spacing tokens

```mermaid
sequenceDiagram
participant U as "User"
participant TT as "ThemeToggle"
participant AP as "AppProviders"
participant CSS as "globals.css"
U->>TT : Toggle theme
TT-->>AP : Update theme preference
AP-->>CSS : Apply theme variables
CSS-->>U : Re-render with new tokens
```

**Diagram sources**
- [ThemeToggle.tsx](frontend/components/theme/ThemeToggle.tsx)
- [AppProviders.tsx](frontend/components/providers/AppProviders.tsx)
- [globals.css](frontend/app/globals.css)

**Section sources**
- [ThemeToggle.tsx](frontend/components/theme/ThemeToggle.tsx)
- [AppProviders.tsx](frontend/components/providers/AppProviders.tsx)
- [globals.css](frontend/app/globals.css)

## Dependency Analysis
The UI primitives depend on Radix UI and shared utilities. Shared components depend on base styles and tokens. Role pages consume shared components and primitives.

```mermaid
graph LR
RZ["Radix UI Primitives"] --> BTN["Button"]
RZ --> DLG["Dialog"]
RZ --> ADLG["AlertDialog"]
RZ --> TAB["Tabs"]
RZ --> DDL["DropdownMenu"]
RZ --> SEL["Select"]
RZ --> CHK["Checkbox"]
RZ --> SW["Switch"]
CV["class-variance-authority"] --> BTN
UTIL["cn (utils)"] --> BTN
UTIL --> DLG
UTIL --> ADLG
UTIL --> TAB
UTIL --> DDL
UTIL --> SEL
UTIL --> CHK
UTIL --> SW
CSS["globals.css"] --> BTN
CSS --> DLG
CSS --> ADLG
CSS --> TAB
CSS --> DDL
CSS --> SEL
CSS --> CHK
CSS --> SW
SH["Shared Components"] --> CSS
PAGES["Role Pages"] --> SH
PAGES --> BTN
PAGES --> DLG
PAGES --> TAB
PAGES --> DDL
```

**Diagram sources**
- [button.tsx:1-5](frontend/components/ui/button.tsx#L1-L5)
- [dialog.tsx:1-6](frontend/components/ui/dialog.tsx#L1-L6)
- [alert-dialog.tsx:1-7](frontend/components/ui/alert-dialog.tsx#L1-L7)
- [tabs.tsx:1-5](frontend/components/ui/tabs.tsx#L1-L5)
- [dropdown-menu.tsx:1-7](frontend/components/ui/dropdown-menu.tsx#L1-L7)
- [select.tsx:1-6](frontend/components/ui/select.tsx#L1-L6)
- [checkbox.tsx:1-6](frontend/components/ui/checkbox.tsx#L1-L6)
- [switch.tsx:1-6](frontend/components/ui/switch.tsx#L1-L6)
- [globals.css](frontend/app/globals.css)

**Section sources**
- [button.tsx:1-56](frontend/components/ui/button.tsx#L1-L56)
- [dialog.tsx:1-110](frontend/components/ui/dialog.tsx#L1-L110)
- [alert-dialog.tsx:1-142](frontend/components/ui/alert-dialog.tsx#L1-L142)
- [tabs.tsx:1-55](frontend/components/ui/tabs.tsx#L1-L55)
- [dropdown-menu.tsx:1-201](frontend/components/ui/dropdown-menu.tsx#L1-L201)
- [select.tsx:1-147](frontend/components/ui/select.tsx#L1-L147)
- [checkbox.tsx:1-30](frontend/components/ui/checkbox.tsx#L1-L30)
- [switch.tsx:1-30](frontend/components/ui/switch.tsx#L1-L30)
- [globals.css](frontend/app/globals.css)

## Performance Considerations
- Minimize re-renders by composing small, focused primitives and avoiding unnecessary prop drilling.
- Prefer lazy loading for heavy role pages and modals; use portals to avoid deep DOM nesting.
- Keep dialog and dropdown content lightweight; defer heavy computations to background threads or server.
- Use CSS transitions judiciously; leverage hardware acceleration via transform and opacity where possible.
- Optimize tables by virtualizing rows for large datasets and deferring image rendering until visible.

## Troubleshooting Guide
- Dialogs not closing:
  - Ensure Close button is present and accessible; verify portal rendering and overlay click handlers.
- Focus issues in forms:
  - Verify Label association via htmlFor or radix label component; ensure focus-visible rings appear.
- Select menu misalignment:
  - Confirm trigger height/width CSS variables are applied; adjust position prop if needed.
- Theme inconsistencies:
  - Check provider wrapping order and theme variable application in the global stylesheet.
- Accessibility warnings:
  - Confirm ARIA attributes (description, label) are set; ensure keyboard navigation works for menus and tabs.

**Section sources**
- [dialog.tsx:13-51](frontend/components/ui/dialog.tsx#L13-L51)
- [alert-dialog.tsx:15-46](frontend/components/ui/alert-dialog.tsx#L15-L46)
- [select.tsx:62-88](frontend/components/ui/select.tsx#L62-L88)
- [tabs.tsx:24-52](frontend/components/ui/tabs.tsx#L24-L52)
- [dropdown-menu.tsx:59-75](frontend/components/ui/dropdown-menu.tsx#L59-L75)
- [globals.css](frontend/app/globals.css)

## Conclusion
WheelSense Platform’s component library combines Radix UI primitives with a cohesive design system to deliver accessible, themeable, and performant UI across roles. The primitives, shared utilities, and role-specific components are structured for reuse, composition, and scalability. By adhering to the documented patterns—variants, composition, accessibility, and theming—you can confidently extend and integrate components across the platform.

## Appendices

### Component Categories and Usage Patterns
- Buttons
  - Use default for primary actions; secondary for secondary actions; destructive for dangerous actions; ghost for subtle actions; outline for low-emphasis actions.
  - Icon buttons for compact actions; ensure adequate touch targets.
- Forms
  - Group related fields with labels; apply validation states; use Select for choices; Checkbox/Switch for toggles.
- Dialogs and Alerts
  - Use Dialog for non-blocking overlays; AlertDialog for critical confirmations.
  - Provide clear action labels and cancel options.
- Tables
  - Use sticky headers and hover states; paginate or virtualize large lists.
  - Include sorting affordances and filters where appropriate.
- Navigation
  - Tabs for content sections; DropdownMenu for contextual actions and settings.
- Shared Utilities
  - AlertPanel for role-specific notifications; UserAvatar for identity; PatientList for selection; SearchableListboxPicker for searchable selections.

### Integration Patterns
- RoleShell and TopBar/RoleSidebar:
  - Compose role-aware layouts with shared navigation and alerts.
- AppProviders:
  - Wrap the application to enable theme switching, toast notifications, and internationalization.
- Notifications:
  - Use SonnerToaster for global toasts; NotificationBell and NotificationDrawer for in-app notification hubs.
- Workflows:
  - Integrate dialogs for creation/editing; tables for listings; cards for summaries.

**Section sources**
- [RoleShell.tsx](frontend/components/RoleShell.tsx)
- [TopBar.tsx](frontend/components/TopBar.tsx)
- [RoleSidebar.tsx](frontend/components/RoleSidebar.tsx)
- [AppProviders.tsx](frontend/components/providers/AppProviders.tsx)
- [SonnerToaster.tsx](frontend/components/SonnerToaster.tsx)
- [NotificationBell.tsx](frontend/components/NotificationBell.tsx)
- [NotificationDrawer.tsx](frontend/components/NotificationDrawer.tsx)