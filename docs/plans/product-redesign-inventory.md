# WheelSense source inventory — 2026-10-18

Generated before product edits. Route-level source scan plus component/panel/overlay/state inventory; runtime coverage belongs to the progress ledger.

## All page routes

| Route | Source lines | Existing panels / tabs / aliases |
| --- | ---: | --- |
| `/account` | 1252 | shared/UserAvatar, ui/badge, ui/button, ui/input, ui/textarea |
| `/admin/account-management` | 906 | shared/SearchableListboxPicker, shared/UserAvatar, layout/AppPage, ui/button |
| `/admin/alerts` | 119 | admin/alerts/AdminAlertsTable, layout/AppPage, shared/FilterBar, ui/select |
| `/admin/audit` | 105 | layout/AppPage, layout/DataState, shared/ResponsiveDataView |
| `/admin/audit-log` | 6 | redirect: /admin/audit |
| `/admin/caregivers/[id]` | 109 | admin/caregivers/CaregiverDetailPane, layout/AppPage, layout/DataState |
| `/admin/caregivers` | 956 | supervisor/DataTableCard, supervisor/SummaryStatCard, shared/UserAvatar, ui/badge, ui/button, ui/card, ui/input, ui/label, ui/select, ui/textarea, layout/AppPage, shared/FilterBar |
| `/admin/demo-control` | 472 | admin/demo-control/DemoPanel, ui/badge, ui/button, ui/card, ui/input, ui/label, ui/select, ui/textarea |
| `/admin/device-health` | 5 | redirect: /admin/devices |
| `/admin/devices` | 432 | EmptyState, admin/devices/DeviceDetailDrawer, ui/badge, ui/button, ui/card, ui/input, layout/AppPage, layout/DataState |
| `/admin/facilities` | 6 | redirect: /admin/facility-management |
| `/admin/facility-management` | 710 | layout/AppPage, layout/DataState, admin/FloorplansPanel, ui/card, ui/button, ui/badge, ui/input, ui/tabs, ui/dialog, ui/label, tab: facilities, tab: floors, tab: editor |
| `/admin/floorplans` | 6 | redirect: /admin/facility-management |
| `/admin/messages` | 39 | shared/HubTabBar, messaging/AdminWorkflowMailbox |
| `/admin/ml-calibration` | 5 | Route-owned UI / authentication / redirect wrapper; preserve entry point |
| `/admin/monitoring` | 5 | redirect: /admin/facility-management |
| `/admin` | 466 | ui/button, ui/card, shared/CsvExportButton, dashboard/DashboardMapLauncher, layout/AppPage, shared/MetricCard, shared/PriorityBanner, shared/StatusBadge |
| `/admin/patients/[id]` | 1033 | shared/SearchableListboxPicker, calendar/CalendarView, calendar/AgendaView, calendar/ScheduleForm, calendar/scheduleEventMapper, ui/tabs, ui/dialog, dashboard/DashboardFloorplanPanel, patients/PatientCareCoordinationPanel, patients/PatientHealthAnalysisPanel, shared/PersonSensorStatusPanel, patients/PatientCommandHeader, patients/FeatureNavCards, patients/PatientRightRail, patients/ClinicalRecordsWorkspace, layout/AppPage, layout/DataState, ui/button, tab: profile, tab: care |
| `/admin/patients` | 848 | layout/AppPage, shared/FilterBar, supervisor/DataTableCard, supervisor/SummaryStatCard, shared/UserAvatar, ui/badge, ui/button, ui/card, ui/tabs, ui/dialog, ui/alert, admin/patients/StaffTab, admin/patients/AccountsTab, admin/patients/AddPatientModal, tab: patients, tab: routines, tab: staff, tab: accounts |
| `/admin/profile` | 5 | redirect: /account |
| `/admin/settings` | 18 | Route-owned UI / authentication / redirect wrapper; preserve entry point |
| `/admin/smart-devices` | 6 | redirect: /admin/devices?tab=smart_home |
| `/admin/support` | 646 | ui/badge, ui/button, ui/card, ui/label, ui/select, ui/tabs, layout/AppPage, ui/textarea, tab: tickets, tab: service-requests |
| `/admin/tasks` | 29 | tasks/TasksPageLayout |
| `/admin/users` | 6 | redirect: /admin/account-management |
| `/caregiver/account-management` | 6 | redirect: /caregiver/settings |
| `/caregiver/alerts` | 48 | layout/AppPage, layout/LoadingState, ui/button |
| `/caregiver/caregivers/[id]` | 5 | redirect: /caregiver |
| `/caregiver/caregivers` | 6 | redirect: /caregiver |
| `/caregiver/devices` | 279 | supervisor/DataTableCard, supervisor/SummaryStatCard, ui/badge, layout/AppPage |
| `/caregiver/facility-management` | 6 | redirect: /caregiver/floorplans |
| `/caregiver/floorplans` | 22 | floorplan/FloorplanRoleViewer, layout/AppPage |
| `/caregiver/messages` | 7 | messaging/StaffWorkflowMailbox |
| `/caregiver/ml-calibration` | 6 | redirect: /caregiver/devices |
| `/caregiver/monitoring` | 5 | redirect: /caregiver/floorplans |
| `/caregiver` | 488 | layout/AppPage, dashboard/DashboardMapLauncher, ui/button, ui/card, shift-checklist/ShiftChecklistMePanel, observer/ObserverNextActionHero, shared/CsvExportButton, shared/MetricCard, shared/StatusBadge, EmptyState |
| `/caregiver/patients/[id]` | 10 | Route-owned UI / authentication / redirect wrapper; preserve entry point |
| `/caregiver/patients` | 5 | redirect: /caregiver/personnel |
| `/caregiver/personnel/[id]` | 24 | patients/PatientCareCoordinationPanel |
| `/caregiver/personnel` | 343 | shared/HubTabBar, supervisor/DataTableCard, supervisor/SummaryStatCard, ui/badge, ui/button, shared/FilterBar, layout/AppPage |
| `/caregiver/prescriptions` | 134 | supervisor/DataTableCard, ui/badge, layout/AppPage |
| `/caregiver/settings` | 5 | redirect: /account |
| `/caregiver/support` | 5 | support/ReportIssueForm |
| `/caregiver/tasks` | 28 | layout/AppPage, workflow/ExpandableOperationsConsole, workflow/WorkflowTasksHubContent |
| `/head-caregiver/account-management` | 2 | reuse: @/app/admin/account-management/page |
| `/head-caregiver/alerts` | 389 | supervisor/DataTableCard, layout/AppPage, shared/FilterBar, ui/badge, ui/button, ui/select |
| `/head-caregiver/caregivers/[id]` | 1 | reuse: @/app/admin/caregivers/[id]/page |
| `/head-caregiver/caregivers` | 2 | reuse: @/app/admin/caregivers/page |
| `/head-caregiver/devices` | 2 | reuse: @/app/admin/devices/page |
| `/head-caregiver/emergency` | 506 | supervisor/DataTableCard, supervisor/SummaryStatCard, layout/AppPage, shared/PriorityBanner, ui/badge, ui/button |
| `/head-caregiver/facility-management` | 2 | reuse: @/app/admin/facility-management/page |
| `/head-caregiver/floorplans` | 22 | floorplan/FloorplanRoleViewer, layout/AppPage |
| `/head-caregiver/messages` | 7 | messaging/StaffWorkflowMailbox |
| `/head-caregiver/ml-calibration` | 2 | reuse: @/app/admin/ml-calibration/page |
| `/head-caregiver/monitoring` | 5 | redirect: /head-caregiver/floorplans |
| `/head-caregiver` | 1272 | dashboard/DashboardMapLauncher, head-nurse/HeadNurseSituationBanner, layout/AppPage, ui/badge, ui/button, ui/card, shared/CsvExportButton, shared/MetricCard |
| `/head-caregiver/patients/[id]` | 1 | reuse: @/app/admin/patients/[id]/page |
| `/head-caregiver/patients` | 2 | reuse: @/app/admin/patients/page |
| `/head-caregiver/personnel/[id]` | 615 | supervisor/DataTableCard, supervisor/SummaryStatCard, shared/UserAvatar, ui/badge, ui/button, ui/card, layout/AppPage, layout/DataState, shared/PriorityBanner |
| `/head-caregiver/personnel` | 244 | shared/HubTabBar, supervisor/DataTableCard, shared/UserAvatar, ui/badge, ui/button, shared/FilterBar, layout/AppPage |
| `/head-caregiver/prescriptions` | 358 | supervisor/DataTableCard, ui/button, ui/card, ui/input, ui/label, ui/select, ui/textarea, layout/AppPage |
| `/head-caregiver/reports` | 5 | redirect: /head-caregiver/tasks?wtab=reports |
| `/head-caregiver/settings` | 5 | redirect: /account |
| `/head-caregiver/support` | 5 | support/ReportIssueForm |
| `/head-caregiver/tasks` | 28 | layout/AppPage, workflow/ExpandableOperationsConsole, workflow/WorkflowTasksHubContent |
| `/login` | 274 | LanguageSwitcher, shared/Logo |
| `/logout` | 31 | Route-owned UI / authentication / redirect wrapper; preserve entry point |
| `/mobile-alert` | 39 | Route-owned UI / authentication / redirect wrapper; preserve entry point |
| `/` | 5 | redirect: /login |
| `/patient/messages` | 7 | messaging/PatientWorkflowMailbox |
| `/patient` | 468 | ui/badge, ui/card, patient/PatientMySensors, patient/PatientCareRoadmap, patient/PatientSosHero, patients/PatientHealthAnalysisPanel, shared/UserAvatar, shared/CsvExportButton, shared/HubTabBar, support/ReportIssueForm |
| `/patient/pharmacy` | 447 | supervisor/DataTableCard, ui/badge, ui/button, ui/card, ui/input, ui/label, ui/select, ui/textarea, layout/AppPage |
| `/patient/room-controls` | 633 | ui/badge, ui/card, ui/button, ui/input, layout/AppPage |
| `/patient/schedule` | 261 | shared/HubTabBar, ui/button, ui/card, ui/select, layout/AppPage, calendar/AgendaView, calendar/CalendarView, calendar/scheduleEventMapper |
| `/patient/services` | 266 | ui/card, ui/badge, ui/button, ui/input, ui/label, ui/textarea, layout/AppPage |
| `/patient/settings` | 6 | redirect: /account |
| `/patient/support` | 5 | redirect: /patient?tab=support |

## Component ownership and state inventory

All component TSX source files scanned for shared primitives, dialogs/sheets, query/mutation calls, forms and state branches. Named overlays are not the full modal inventory: inline Dialog/Sheet instances are included below.

| Component | UI states / overlays / API calls |
| --- | --- |
| `components/admin/alerts/AdminAlertsTable.tsx` | isLoading: 4; empty: 2 |
| `components/admin/caregivers/AddCaregiverModal.tsx` | disabled: 2; aria-: 6; API: delete, post |
| `components/admin/caregivers/CaregiverCardGrid.tsx` | aria-: 1 |
| `components/admin/caregivers/CaregiverDetailPane.tsx` | Dialog: 60; Tabs: 16; useQuery: 9; isLoading: 5; disabled: 22; aria-: 16; empty: 4; stale: 8; API: delete, get, listWorkflowSchedules, listWorkflowTasks, patch, post, postForm, put |
| `components/admin/caregivers/EditCaregiverModal.tsx` | disabled: 2; aria-: 6; empty: 3; API: patch |
| `components/admin/caregivers/StaffRoutineAndCalendarPanel.tsx` | useQuery: 3; isError: 1; aria-: 2; API: listPatients, listWorkflowSchedules |
| `components/admin/demo-control/DemoPanel.tsx` |  |
| `components/admin/devices/DeviceDetailDrawer.tsx` | Dialog: 25; Sheet: 15; Tabs: 16; useQuery: 9; useMutation: 10; useForm: 4; isLoading: 10; disabled: 21; empty: 1; offline: 2; stale: 3; API: assignCaregiverFromDevice, assignPatientFromDevice, cameraCheckSnapshot, deleteRegistryDevice, getDeviceDetailRaw, getDeviceHistoryRaw, listCaregivers, listDeviceActivity, listPatients, listRooms, patchRegistryDevice, patchRoom |
| `components/admin/devices/PatientLinkSection.tsx` | useQuery: 2; isLoading: 1; disabled: 5; empty: 8; stale: 1; API: get, post |
| `components/admin/FacilitiesPanel.tsx` | useQuery: 2; isLoading: 2; disabled: 2; aria-: 2; empty: 1; stale: 1; API: delete, get, patch, post |
| `components/admin/FloorplansPanel.tsx` | useQuery: 10; isLoading: 4; disabled: 38; aria-: 5; empty: 9; stale: 7; API: cameraCheckSnapshot, delete, get, listSmartDevices, patch, patchPatient, patchSmartDevice, post, put |
| `components/admin/monitoring/FacilityFloorToolbar.tsx` | disabled: 2 |
| `components/admin/monitoring/FloorMapWorkspace.tsx` | Tabs: 1; useQuery: 8; isLoading: 2; disabled: 6; aria-: 2; empty: 6; stale: 5; API: get, patch, patchPatient, post, put |
| `components/admin/monitoring/RoomDetailDrawer.tsx` | aria-: 3 |
| `components/admin/monitoring/RoomSmartDevicesPanel.tsx` | useQuery: 2; isLoading: 2; empty: 1; stale: 1; API: delete, get, patch, post |
| `components/admin/patients/AccountsTab.tsx` | useQuery: 4; isLoading: 1; empty: 1; API: listCaregivers, listPatients, listUsers |
| `components/admin/patients/AddPatientModal.tsx` | Dialog: 18; useForm: 3; disabled: 32; aria-: 1; empty: 2; API: delete, post |
| `components/admin/patients/AdminPatientsQuickFind.tsx` | useQuery: 2; isLoading: 5; disabled: 3; aria-: 1; empty: 7; stale: 1; API: get |
| `components/admin/patients/PatientEditorModal.tsx` | Dialog: 18; useQuery: 7; useMutation: 4; useForm: 3; isLoading: 6; disabled: 30; empty: 1; stale: 2; API: createPatientContact, createUser, deletePatientContact, getPatient, listPatientContacts, listRooms, listUsers, patchPatient, updatePatientContact, updateUser |
| `components/admin/patients/PatientsDataTable.tsx` | isLoading: 3; disabled: 2 |
| `components/admin/patients/StaffTab.tsx` | Dialog: 25; useQuery: 5; isLoading: 1; disabled: 1; empty: 1; API: listCaregivers, listUsers, post |
| `components/admin/RoomFormModal.tsx` | useQuery: 4; isLoading: 3; disabled: 9; aria-: 3; empty: 7; stale: 3; API: get, patch, post |
| `components/admin/settings/AiSettingsPanel.tsx` | Dialog: 16; useQuery: 5; disabled: 17; aria-: 1; empty: 3; stale: 5; API: delete, get, post, put |
| `components/admin/settings/ServerSettingsPanel.tsx` | useQuery: 5; disabled: 4; stale: 4; API: get, post |
| `components/admin/SupportTicketList.tsx` | disabled: 2 |
| `components/ai/ActionPlanPreview.tsx` | disabled: 2; API: getPatient, getRoom, listCaregivers |
| `components/ai/AIChatPopup.tsx` | useQuery: 2; disabled: 8; aria-: 28; empty: 1 |
| `components/ai/AITraceChips.tsx` |  |
| `components/ai/EaseAIFab.tsx` | aria-: 1 |
| `components/ai/EaseAIResponseCard.tsx` |  |
| `components/ai/EaseAIResponseCards.tsx` | disabled: 6; offline: 1 |
| `components/ai/ExecutionStepList.tsx` |  |
| `components/calendar/AgendaView.tsx` | empty: 3 |
| `components/calendar/CalendarView.tsx` | aria-: 2 |
| `components/calendar/PatientWorkflowSchedulePanel.tsx` | useQuery: 2; API: listWorkflowSchedules |
| `components/calendar/ScheduleForm.tsx` | Dialog: 18; useQuery: 4; useForm: 2; disabled: 16; empty: 1; stale: 3; API: createWorkflowSchedule, get, updateWorkflowSchedule |
| `components/dashboard/DashboardFloorplanPanel.tsx` |  |
| `components/dashboard/DashboardMapLauncher.tsx` | Dialog: 25; aria-: 2 |
| `components/dashboard/FeatureDetailActions.tsx` | aria-: 3 |
| `components/dashboard/KPIStatCard.tsx` |  |
| `components/dashboard/RoleQuickActions.tsx` | aria-: 3 |
| `components/dashboard/RoomDetailPopup.tsx` | Dialog: 15; offline: 7 |
| `components/dashboard/RoomSubCard.tsx` |  |
| `components/dashboard/TaskChecklistCard.tsx` | empty: 1 |
| `components/dashboard/WardOverviewGrid.tsx` | Tabs: 19 |
| `components/EmptyState.tsx` | empty: 1 |
| `components/floorplan/FloorplanCanvas.tsx` | aria-: 3; empty: 1 |
| `components/floorplan/FloorplanRoleViewer.tsx` | Sheet: 4; useQuery: 7; isLoading: 4; disabled: 5; aria-: 5; empty: 7; offline: 3; stale: 18; API: get, post |
| `components/head-nurse/HeadNurseSituationBanner.tsx` | aria-: 1 |
| `components/head-nurse/HeadNurseStaffMemberSheet.tsx` | Sheet: 16; useQuery: 5; useMutation: 2; isLoading: 5; disabled: 3; aria-: 1; API: getShiftChecklistUserTemplate, listShiftChecklistWorkspace, putShiftChecklistUserTemplate |
| `components/head-nurse/tasks/CreateTaskDialog.tsx` | Dialog: 4 |
| `components/head-nurse/tasks/TaskDetailModal.tsx` | Dialog: 45; AlertDialog: 24; Tabs: 20; useQuery: 2; useForm: 2; isLoading: 3; disabled: 11; stale: 1; API: get |
| `components/head-nurse/tasks/UnifiedTaskCalendar.tsx` | isLoading: 3 |
| `components/head-nurse/tasks/UnifiedTaskCommandBar.tsx` | isLoading: 3 |
| `components/head-nurse/tasks/UnifiedTaskKanbanBoard.tsx` | isLoading: 3; aria-: 7; empty: 2 |
| `components/head-nurse/tasks/UnifiedTaskStats.tsx` | isLoading: 3 |
| `components/LanguageSwitcher.tsx` | aria-: 4 |
| `components/layout/AppPage.tsx` | aria-: 3 |
| `components/layout/DataState.tsx` | isLoading: 3; isError: 5; aria-: 4; empty: 4; offline: 3; stale: 2 |
| `components/layout/DesktopPageLayout.tsx` |  |
| `components/layout/ErrorState.tsx` |  |
| `components/layout/LoadingState.tsx` |  |
| `components/layout/MobilePageLayout.tsx` |  |
| `components/messaging/AdminWorkflowMailbox.tsx` | Sheet: 15; useQuery: 5; useMutation: 4; isLoading: 3; isError: 1; disabled: 5; aria-: 2; empty: 1; stale: 1; API: deleteWorkflowMessage, listWorkflowMessages, listWorkflowMessagingRecipients, markWorkflowMessageRead, sendWorkflowMessage, uploadWorkflowMessageAttachment |
| `components/messaging/MessagingRecipientPicker.tsx` | disabled: 4; aria-: 3; empty: 4 |
| `components/messaging/PatientWorkflowMailbox.tsx` | Sheet: 15; useQuery: 5; useMutation: 4; isLoading: 3; isError: 1; disabled: 4; aria-: 4; empty: 2; stale: 1; API: deleteWorkflowMessage, listWorkflowMessages, listWorkflowMessagingRecipients, markWorkflowMessageRead, sendWorkflowMessage, uploadWorkflowMessageAttachment |
| `components/messaging/StaffWorkflowMailbox.tsx` | Sheet: 15; useQuery: 6; useMutation: 4; useForm: 2; isLoading: 4; disabled: 4; aria-: 2; empty: 4; stale: 1; API: deleteWorkflowMessage, listPatients, listWorkflowMessages, listWorkflowMessagingRecipients, markWorkflowMessageRead, sendWorkflowMessage, uploadWorkflowMessageAttachment |
| `components/messaging/WorkflowMessageAttachmentViews.tsx` | disabled: 7; aria-: 5 |
| `components/messaging/WorkflowMessageDetailDialog.tsx` | Dialog: 18; aria-: 1 |
| `components/NavigationSearch.tsx` | Dialog: 3; aria-: 3 |
| `components/NotificationBell.tsx` | aria-: 1 |
| `components/NotificationDrawer.tsx` | Sheet: 13; empty: 2 |
| `components/notifications/AlertToastCard.tsx` | useQuery: 2; disabled: 1; aria-: 1; API: acknowledgeAlert |
| `components/observer/ObserverNextActionHero.tsx` | disabled: 1; aria-: 3 |
| `components/patient/PatientCareRoadmap.tsx` | useQuery: 4; isLoading: 3; aria-: 6; empty: 3; API: listRooms, listWorkflowSchedules, listWorkflowTasks |
| `components/patient/PatientMySensors.tsx` |  |
| `components/patient/PatientSosHero.tsx` | disabled: 2; aria-: 10 |
| `components/patients/AdlAnalysisCard.tsx` | useQuery: 2; isLoading: 1; isError: 3; empty: 1; API: get |
| `components/patients/ClinicalRecordsWorkspace.tsx` | Tabs: 28; disabled: 3 |
| `components/patients/FeatureNavCards.tsx` | aria-: 3 |
| `components/patients/healthAnalysisParts.tsx` | disabled: 2; aria-: 13 |
| `components/patients/PatientCareCoordinationPanel.tsx` | Dialog: 3; useQuery: 10; useMutation: 6; isLoading: 20; disabled: 4; aria-: 2; empty: 6; API: acknowledgeAlert, createTimelineEvent, createWorkflowHandover, getPatient, listAlerts, listTimelineEvents, listVitalReadings, listWorkflowHandovers, listWorkflowMessages, listWorkflowTasks, markWorkflowMessageRead, resolveAlert, updateWorkflowTask |
| `components/patients/PatientCommandHeader.tsx` | disabled: 5; aria-: 3 |
| `components/patients/PatientHealthAnalysisPanel.tsx` | useQuery: 7; isLoading: 1; stale: 5; API: get, getPatientHealthAnalysis, listPatientDeviceAssignments, listVitalReadings |
| `components/patients/PatientRightRail.tsx` | disabled: 5; aria-: 1; empty: 3 |
| `components/providers/AppProviders.tsx` | stale: 1 |
| `components/reports/ReportPreviewTable.tsx` | empty: 3 |
| `components/RoleShell.tsx` | Sheet: 1; aria-: 5 |
| `components/RoleSidebar.tsx` | Sheet: 17; aria-: 7 |
| `components/RoleSwitcher.tsx` | disabled: 2 |
| `components/shared/AlertPanel.tsx` | isLoading: 3; aria-: 5; empty: 1 |
| `components/shared/ConfirmAction.tsx` | Dialog: 27; AlertDialog: 27; aria-: 1 |
| `components/shared/CsvExportButton.tsx` | disabled: 4; aria-: 1 |
| `components/shared/DetailSheet.tsx` | Sheet: 18 |
| `components/shared/EntityHeader.tsx` |  |
| `components/shared/FilterBar.tsx` | disabled: 1; aria-: 4 |
| `components/shared/HubTabBar.tsx` | aria-: 5 |
| `components/shared/Logo.tsx` |  |
| `components/shared/MetricCard.tsx` | aria-: 3 |
| `components/shared/PatientList.tsx` | isLoading: 3; aria-: 3; empty: 5 |
| `components/shared/PersonSensorStatusPanel.tsx` | useQuery: 2; isLoading: 2; isError: 2; empty: 1; offline: 1; stale: 2; API: get, getDeviceDetailRaw |
| `components/shared/PriorityBanner.tsx` | aria-: 2 |
| `components/shared/ProfileImageEditorModal.tsx` | disabled: 8; aria-: 3; API: patch, postForm |
| `components/shared/ResponsiveDataView.tsx` | aria-: 2 |
| `components/shared/SearchableListboxPicker.tsx` | disabled: 9; aria-: 13; empty: 9 |
| `components/shared/StatusBadge.tsx` | aria-: 1 |
| `components/shared/UserAvatar.tsx` | aria-: 1 |
| `components/shift-checklist/ShiftChecklistMePanel.tsx` | useQuery: 5; useMutation: 2; isLoading: 1; disabled: 4; API: getShiftChecklistMe, putShiftChecklistMe |
| `components/shift-checklist/ShiftChecklistWorkspaceClient.tsx` | Sheet: 11; useQuery: 2; isLoading: 1; isError: 1; API: listShiftChecklistWorkspace |
| `components/SonnerToaster.tsx` |  |
| `components/staff/StaffTimelinePanel.tsx` | empty: 1 |
| `components/StatCard.tsx` |  |
| `components/supervisor/DataTableCard.tsx` | isLoading: 4; disabled: 3; aria-: 1; empty: 11 |
| `components/supervisor/SummaryStatCard.tsx` |  |
| `components/supervisor/SupervisorHealthQueue.tsx` | disabled: 2; aria-: 3; empty: 1 |
| `components/supervisor/SupervisorQueue.tsx` | useQuery: 2; useMutation: 5; disabled: 7; empty: 1; API: acknowledgeAlert, acknowledgeWorkflowDirective, updateWorkflowTask |
| `components/support/ReportIssueForm.tsx` | useForm: 2; disabled: 5; API: post |
| `components/tasks/CreateTaskDialog.tsx` | Dialog: 21; useForm: 2; disabled: 1; aria-: 2 |
| `components/tasks/ReportAttachmentPreviewDialog.tsx` | Dialog: 15 |
| `components/tasks/ReportSubmitDialog.tsx` | Dialog: 21; useForm: 2; disabled: 1 |
| `components/tasks/RichReportEditor.tsx` | disabled: 6 |
| `components/tasks/RoutineDayOverviewSheet.tsx` | Sheet: 33; useQuery: 4; isLoading: 1; isError: 1; aria-: 1; API: listShiftChecklistWorkspace, listWorkflowSchedules, listWorkflowTasks |
| `components/tasks/TaskReportAttachmentsBar.tsx` | Dialog: 3; disabled: 5; aria-: 2; API: uploadWorkflowMessageAttachment |
| `components/tasks/TasksPageLayout.tsx` | Dialog: 10; Sheet: 8; Tabs: 13; isLoading: 13; aria-: 9 |
| `components/theme/ThemeToggle.tsx` | aria-: 2 |
| `components/timeline/MovementTimelineCard.tsx` | aria-: 2 |
| `components/timeline/WardTimelineEmbed.tsx` | useQuery: 3; empty: 1; API: listPatients, listTimelineEvents |
| `components/TopBar.tsx` | useQuery: 2; aria-: 5; stale: 1; API: get |
| `components/ui/alert-dialog.tsx` | Dialog: 63; AlertDialog: 63 |
| `components/ui/alert.tsx` |  |
| `components/ui/badge.tsx` |  |
| `components/ui/button.tsx` | disabled: 7 |
| `components/ui/calendar.tsx` | disabled: 4; aria-: 3 |
| `components/ui/card.tsx` |  |
| `components/ui/checkbox.tsx` | disabled: 2 |
| `components/ui/command.tsx` | Dialog: 18; disabled: 4 |
| `components/ui/dialog.tsx` | Dialog: 49; aria-: 2 |
| `components/ui/dropdown-menu.tsx` | disabled: 6 |
| `components/ui/ErrorBoundary.tsx` |  |
| `components/ui/input.tsx` | disabled: 2 |
| `components/ui/label.tsx` | disabled: 2 |
| `components/ui/popover.tsx` |  |
| `components/ui/progress.tsx` |  |
| `components/ui/searchable-select.tsx` | disabled: 4; aria-: 1; empty: 3 |
| `components/ui/select.tsx` | disabled: 4 |
| `components/ui/separator.tsx` |  |
| `components/ui/sheet.tsx` | Dialog: 24; Sheet: 25 |
| `components/ui/switch.tsx` | disabled: 2 |
| `components/ui/table.tsx` |  |
| `components/ui/tabs.tsx` | Tabs: 25; disabled: 2 |
| `components/ui/textarea.tsx` | disabled: 2 |
| `components/workflow/ExpandableOperationsConsole.tsx` | aria-: 4 |
| `components/workflow/ObserverTaskListPanel.tsx` | disabled: 1 |
| `components/workflow/OperationsConsole.tsx` | Dialog: 48; useQuery: 17; useMutation: 9; isLoading: 20; isError: 1; disabled: 8; empty: 8; API: createWorkflowDirective, createWorkflowHandover, createWorkflowSchedule, createWorkflowTask, getAlertSummary, getVitalsAverages, getWardSummary, getWorkflowItemDetail, listAlerts, listPatients, listVitalReadings, listWorkflowAudit, listWorkflowDirectives, listWorkflowHandovers, listWorkflowMessages, listWorkflowSchedules, listWorkflowTasks, post, searchUsers, sendWorkflowMessage |
| `components/workflow/WorkflowJobCreateDialog.tsx` | Dialog: 19; disabled: 2; aria-: 3 |
| `components/workflow/WorkflowJobsPanel.tsx` | Dialog: 3; Sheet: 15; useQuery: 7; useMutation: 5; isLoading: 1; disabled: 7; aria-: 3; empty: 1; API: completeWorkflowJob, createWorkflowJob, finalizeWorkflowJobStepAttachments, listPatients, listUsers, listWorkflowJobs, patchWorkflowJobStep, uploadWorkflowMessageAttachment |
| `components/workflow/WorkflowTasksHubContent.tsx` | useQuery: 5; useMutation: 2; isLoading: 4; disabled: 3; empty: 1; API: listPatients, listWorkflowTasks, updateWorkflowTask |
| `components/workflow/WorkflowTasksKanban.tsx` | disabled: 12; aria-: 5; empty: 1 |

## Navigation destinations

The six-domain redesign maps these routes in place; existing aliases remain.

- Overview: `/admin`, `/head-caregiver`, `/caregiver`; patient `/patient` remains personal.
- People: role patients/personnel/caregivers routes and `[id]` details; prescriptions and resident clinical history.
- Facilities: facility-management/floorplans/monitoring aliases, buildings/floors/editor tabs, saved geometry, occupancy/presence and inspectors.
- Monitoring: devices, smart-devices/device-health aliases, resident analytics, person sensor status and diagnostic drawers.
- Care Operations: alerts/emergency, tasks and query panels, messages, support and service requests.
- Administration: account-management/users, settings and query panels, calibration, audit/audit-log, profile/account, demo-control.
- Public/session: `/`, `/login`, `/logout`, `/mobile-alert`.

## Data and interaction dependencies

- Reads: existing `lib/api.ts` same-origin proxy and TanStack Query keys/polling; no replacement data models.
- Writes: preserve current handlers, form validation, pending guards, error recovery and query invalidation.
- Source of chart values: vitals, IMU assignments/telemetry and backend health analysis. Missing measurements must stay null.
- Source of geometry: saved floorplan data; no diagram invented from the screenshot.
- Persistent state: cookie session, workspace, locale, theme, font scale, sound and existing settings APIs.
- Existing tables/overlays use Radix/TanStack rather than a new interaction framework.
