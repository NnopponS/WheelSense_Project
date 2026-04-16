import type { components, operations } from "@/lib/api/generated/schema";

type JsonResponse<T> = T extends {
  responses: { 200: { content: { "application/json": infer R } } };
}
  ? R
  : never;

type JsonRequest<T> = T extends {
  requestBody: { content: { "application/json": infer R } };
}
  ? R
  : never;

type JsonResponseCreated<T> = T extends {
  responses: { 201: { content: { "application/json": infer R } } };
}
  ? R
  : never;

export type PatientOut = components["schemas"]["PatientOut"];
export type PatientUpdateInput = components["schemas"]["PatientUpdate"];
export type PatientContactOut = components["schemas"]["PatientContactOut"];
export type PatientContactCreateInput = components["schemas"]["PatientContactCreate"];
export type PatientContactUpdateInput = components["schemas"]["PatientContactUpdate"];
export type UserOut = components["schemas"]["UserOut"];
export type UserCreateInput = components["schemas"]["UserCreate"];
export type UserUpdateInput = components["schemas"]["UserUpdate"];
export type AlertOut = components["schemas"]["AlertOut"];
export type VitalReadingOut = components["schemas"]["VitalReadingOut"];
export type CareTaskOut = components["schemas"]["CareTaskOut"];
export type CareTaskUpdateInput = components["schemas"]["CareTaskUpdate"];
export type CareDirectiveOut = components["schemas"]["CareDirectiveOut"];
export type CareDirectiveAcknowledgeInput = components["schemas"]["CareDirectiveAcknowledge"];
export type CareScheduleOut = components["schemas"]["CareScheduleOut"];
export type CareScheduleUpdateInput = components["schemas"]["CareScheduleUpdate"];
export type AuditTrailEventOut = components["schemas"]["AuditTrailEventOut"];
export type PrescriptionOut = components["schemas"]["PrescriptionOut"];
export type PrescriptionCreateInput = components["schemas"]["PrescriptionCreate"];
export type SpecialistOut = components["schemas"]["SpecialistOut"];
export type SpecialistCreateInput = components["schemas"]["SpecialistCreate"];
export type CaregiverOut = components["schemas"]["CareGiverOut"];
export type DeviceAssignmentOut = components["schemas"]["DeviceAssignmentOut"];
export type TimelineEventOut = components["schemas"]["TimelineEventOut"];
export type TimelineEventCreateInput = components["schemas"]["TimelineEventCreate"];
export type AlertSummaryOut = components["schemas"]["AlertSummaryOut"];
export type VitalsAverageOut = components["schemas"]["VitalsAverageOut"];
export type WardSummaryOut = components["schemas"]["WardSummaryOut"];
export type RoleMessageOut = components["schemas"]["RoleMessageOut"];
export type RoleMessageAttachmentOut = components["schemas"]["RoleMessageAttachmentOut"];
export type PendingWorkflowAttachmentUploadOut = components["schemas"]["PendingWorkflowAttachmentUploadOut"];
export type RoleMessageCreateInput = components["schemas"]["RoleMessageCreate"];
export type HandoverNoteOut = components["schemas"]["HandoverNoteOut"];
export type PharmacyOrderOut = components["schemas"]["PharmacyOrderOut"];
export type PharmacyOrderRequestInput = components["schemas"]["PharmacyOrderRequest"];
export type ServiceRequestOut = components["schemas"]["ServiceRequestOut"];
export type ServiceRequestCreateInput = components["schemas"]["ServiceRequestCreateIn"];
export type ServiceRequestPatchInput = components["schemas"]["ServiceRequestPatchIn"];
export type SupportTicketOut = components["schemas"]["SupportTicketOut"];
export type SupportTicketCreateInput = components["schemas"]["SupportTicketCreateIn"];
export type SupportTicketPatchInput = components["schemas"]["SupportTicketPatchIn"];
export type SupportTicketCommentOut = components["schemas"]["SupportTicketCommentOut"];
export type SupportTicketCommentCreateInput = components["schemas"]["SupportTicketCommentCreateIn"];
export type SupportTicketAttachmentOut = components["schemas"]["SupportTicketAttachmentOut"];
export type FloorplanPresenceOut = components["schemas"]["FloorplanPresenceOut"];
export type SmartDeviceResponse = components["schemas"]["SmartDeviceResponse"];
export type HADeviceControlInput = components["schemas"]["HADeviceControl"];
export type HAResponse = components["schemas"]["HAResponse"];
export type AlertCreateInput = components["schemas"]["AlertCreate"];
export type AlertAcknowledgeInput = components["schemas"]["AlertAcknowledge"];
export type CareScheduleCreateInput = components["schemas"]["CareScheduleCreate"];
export type CareTaskCreateInput = components["schemas"]["CareTaskCreate"];
export type CareDirectiveCreateInput = components["schemas"]["CareDirectiveCreate"];

export type GetPatientResponse = JsonResponse<
  operations["get_patient_api_patients__patient_id__get"]
>;
export type ListPatientContactsResponse = JsonResponse<
  operations["list_contacts_api_patients__patient_id__contacts_get"]
>;
export type ListPatientsResponse = JsonResponse<
  operations["list_patients_api_patients_get"]
>;
export type ListUsersResponse = JsonResponse<operations["read_users_api_users_get"]>;
export type ListRoomsResponse = JsonResponse<operations["list_rooms_api_rooms_get"]>;
export type ListAlertsResponse = JsonResponse<operations["list_alerts_api_alerts_get"]>;
export type ListVitalReadingsResponse = JsonResponse<
  operations["list_vital_readings_api_vitals_readings_get"]
>;
export type ListWorkflowTasksResponse = JsonResponse<operations["list_tasks_api_workflow_tasks_get"]>;
export type ListWorkflowDirectivesResponse = JsonResponse<
  operations["list_directives_api_workflow_directives_get"]
>;
export type ListWorkflowSchedulesResponse = JsonResponse<
  operations["list_schedules_api_workflow_schedules_get"]
>;
export type ListWorkflowAuditResponse = JsonResponse<
  operations["query_audit_trail_api_workflow_audit_get"]
>;
export type ListPrescriptionsResponse = JsonResponse<
  operations["list_prescriptions_api_medication_prescriptions_get"]
>;
export type ListSpecialistsResponse = JsonResponse<
  operations["list_specialists_api_care_specialists_get"]
>;
export type ListLocalizationPredictionsResponse = JsonResponse<
  operations["list_predictions_api_localization_predictions_get"]
>;
export type ListCaregiversResponse = JsonResponse<
  operations["list_caregivers_api_caregivers_get"]
>;
export type ListTimelineEventsResponse = JsonResponse<
  operations["list_timeline_events_api_timeline_get"]
>;
export type GetAlertSummaryResponse = JsonResponse<
  operations["get_alert_summary_api_analytics_alerts_summary_get"]
>;
export type GetVitalsAveragesResponse = JsonResponse<
  operations["get_vitals_averages_api_analytics_vitals_averages_get"]
>;
export type GetWardSummaryResponse = JsonResponse<
  operations["get_ward_summary_api_analytics_wards_summary_get"]
>;
export type ListWorkflowMessagesResponse = JsonResponse<
  operations["list_messages_api_workflow_messages_get"]
>;
export type ListSupportTicketsResponse = JsonResponse<
  operations["list_support_tickets_api_support_tickets_get"]
>;
export type ListServiceRequestsResponse = JsonResponse<
  operations["list_service_requests_api_services_requests_get"]
>;
export type ListWorkflowHandoversResponse = JsonResponse<
  operations["list_handover_notes_api_workflow_handovers_get"]
>;
export type ListPatientDeviceAssignmentsResponse = JsonResponse<
  operations["list_device_assignments_api_patients__patient_id__devices_get"]
>;
export type ListSmartDevicesResponse = JsonResponse<
  operations["list_smart_devices_api_ha_devices_get"]
>;
export type GetSmartDeviceStateResponse = JsonResponse<
  operations["get_device_state_api_ha_devices__device_id__state_get"]
>;
export type ListPharmacyOrdersResponse = JsonResponse<
  operations["list_pharmacy_orders_api_medication_pharmacy_orders_get"]
>;
export type GetFloorplanPresenceResponse = JsonResponse<
  operations["get_floorplan_presence_api_floorplans_presence_get"]
>;

export type UpdatePatientRequest = JsonRequest<
  operations["update_patient_api_patients__patient_id__patch"]
>;
export type CreatePatientContactRequest = JsonRequest<
  operations["create_contact_api_patients__patient_id__contacts_post"]
>;
export type UpdatePatientContactRequest = JsonRequest<
  operations["update_contact_api_patients__patient_id__contacts__contact_id__patch"]
>;
export type CreateUserRequest = JsonRequest<operations["create_user_api_users_post"]>;
export type UpdateUserRequest = JsonRequest<operations["update_user_api_users__user_id__put"]>;
export type UpdateWorkflowTaskRequest = JsonRequest<
  operations["update_task_api_workflow_tasks__task_id__patch"]
>;
export type CreateWorkflowTaskRequest = JsonRequest<
  operations["create_task_api_workflow_tasks_post"]
>;
export type UpdateSupportTicketRequest = JsonRequest<
  operations["patch_support_ticket_api_support_tickets__ticket_id__patch"]
>;
export type AddSupportTicketCommentRequest = JsonRequest<
  operations["add_support_ticket_comment_api_support_tickets__ticket_id__comments_post"]
>;
export type CreateServiceRequestRequest = JsonRequest<
  operations["create_service_request_api_services_requests_post"]
>;
export type UpdateServiceRequestRequest = JsonRequest<
  operations["update_service_request_api_services_requests__request_id__patch"]
>;
export type UpdateWorkflowScheduleRequest = JsonRequest<
  operations["update_schedule_api_workflow_schedules__schedule_id__patch"]
>;
export type CreateWorkflowScheduleRequest = JsonRequest<
  operations["create_schedule_api_workflow_schedules_post"]
>;
export type AcknowledgeWorkflowDirectiveRequest = JsonRequest<
  operations["acknowledge_directive_api_workflow_directives__directive_id__acknowledge_post"]
>;
export type CreateWorkflowDirectiveRequest = JsonRequest<
  operations["create_directive_api_workflow_directives_post"]
>;
export type CreatePrescriptionRequest = JsonRequest<
  operations["create_prescription_api_medication_prescriptions_post"]
>;
export type CreateSpecialistRequest = JsonRequest<
  operations["create_specialist_api_care_specialists_post"]
>;
export type SendWorkflowMessageRequest = JsonRequest<
  operations["send_message_api_workflow_messages_post"]
>;
export type CreateWorkflowHandoverRequest = JsonRequest<
  operations["create_handover_note_api_workflow_handovers_post"]
>;
export type CreateTimelineEventRequest = JsonRequest<
  operations["create_timeline_event_api_timeline_post"]
>;
export type CreateAlertRequest = JsonRequest<operations["create_alert_api_alerts_post"]>;
export type AcknowledgeAlertRequest = JsonRequest<
  operations["acknowledge_alert_api_alerts__alert_id__acknowledge_post"]
>;
export type ControlSmartDeviceRequest = JsonRequest<
  operations["control_smart_device_api_ha_devices__device_id__control_post"]
>;
export type RequestPharmacyOrderRequest = JsonRequest<
  operations["request_pharmacy_order_api_medication_pharmacy_orders_request_post"]
>;

export type DeviceActivityEventOut = components["schemas"]["DeviceActivityEventOut"];
export type DevicePatientAssignInput = components["schemas"]["DevicePatientAssign"];
export type RoomUpdateInput = components["schemas"]["RoomUpdate"];

export type ListDeviceActivityResponse = JsonResponse<
  operations["list_device_activity_api_devices_activity_get"]
>;
export type AssignPatientFromDeviceRequest = JsonRequest<
  operations["assign_patient_from_device_api_devices__device_id__patient_post"]
>;
export type CameraCheckResponse = JsonResponse<
  operations["camera_check_api_devices__device_id__camera_check_post"]
>;
export type UpdateRoomRequest = JsonRequest<operations["update_room_api_rooms__room_id__patch"]>;
export type UpdateWorkflowTaskResponse = JsonResponse<
  operations["update_task_api_workflow_tasks__task_id__patch"]
>;
export type CreateWorkflowTaskResponse = JsonResponseCreated<
  operations["create_task_api_workflow_tasks_post"]
>;
export type UpdateSupportTicketResponse = JsonResponse<
  operations["patch_support_ticket_api_support_tickets__ticket_id__patch"]
>;
export type AddSupportTicketCommentResponse = JsonResponseCreated<
  operations["add_support_ticket_comment_api_support_tickets__ticket_id__comments_post"]
>;
export type CreateServiceRequestResponse = JsonResponseCreated<
  operations["create_service_request_api_services_requests_post"]
>;
export type UpdateServiceRequestResponse = JsonResponse<
  operations["update_service_request_api_services_requests__request_id__patch"]
>;
export type UpdateWorkflowScheduleResponse = JsonResponse<
  operations["update_schedule_api_workflow_schedules__schedule_id__patch"]
>;
export type CreateWorkflowScheduleResponse = JsonResponseCreated<
  operations["create_schedule_api_workflow_schedules_post"]
>;
export type AcknowledgeWorkflowDirectiveResponse = JsonResponse<
  operations["acknowledge_directive_api_workflow_directives__directive_id__acknowledge_post"]
>;
export type CreateWorkflowDirectiveResponse = JsonResponseCreated<
  operations["create_directive_api_workflow_directives_post"]
>;
export type CreatePrescriptionResponse = JsonResponseCreated<
  operations["create_prescription_api_medication_prescriptions_post"]
>;
export type CreateSpecialistResponse = JsonResponseCreated<
  operations["create_specialist_api_care_specialists_post"]
>;
export type SendWorkflowMessageResponse = JsonResponseCreated<
  operations["send_message_api_workflow_messages_post"]
>;
export type CreateTimelineEventResponse = JsonResponseCreated<
  operations["create_timeline_event_api_timeline_post"]
>;
export type CreateAlertResponse = JsonResponseCreated<operations["create_alert_api_alerts_post"]>;
export type AcknowledgeAlertResponse = JsonResponse<
  operations["acknowledge_alert_api_alerts__alert_id__acknowledge_post"]
>;
export type ControlSmartDeviceResponse = JsonResponse<
  operations["control_smart_device_api_ha_devices__device_id__control_post"]
>;
export type RequestPharmacyOrderResponse = JsonResponseCreated<
  operations["request_pharmacy_order_api_medication_pharmacy_orders_request_post"]
>;

/** Shift checklist (manual contract — regenerate OpenAPI when backend exports schemas). */
export type ShiftChecklistItemApi = {
  id: string;
  label_key: string;
  checked: boolean;
  category: "shift" | "room" | "patient";
};

export type ShiftChecklistMeResponse = {
  shift_date: string;
  user_id: number;
  items: ShiftChecklistItemApi[];
  updated_at: string | null;
};

export type ShiftChecklistPutRequest = {
  shift_date: string;
  items: ShiftChecklistItemApi[];
};

export type ShiftChecklistWorkspaceRow = {
  user_id: number;
  username: string;
  role: string;
  shift_date: string;
  items: ShiftChecklistItemApi[];
  percent_complete: number;
  updated_at: string | null;
};

export type ShiftChecklistTemplateResponse = {
  user_id: number;
  items: ShiftChecklistItemApi[];
  updated_at: string | null;
};

/** Care workflow jobs — manual contract until OpenAPI regen includes `/workflow/jobs`. */
export type WorkflowPersonOut = {
  user_id: number;
  username: string;
  role: string;
  display_name: string;
  person_type: string;
  caregiver_id?: number | null;
  patient_id?: number | null;
};

export type WorkflowJobStepAttachmentOut = {
  id: string;
  filename: string;
  content_type: string;
  byte_size: number;
};

export type CareWorkflowJobStepOut = {
  id: number;
  job_id: number;
  sort_order: number;
  title: string;
  instructions: string;
  status: string;
  report_text: string;
  attachments: WorkflowJobStepAttachmentOut[];
  assigned_user_id: number | null;
  completed_by_user_id: number | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  assigned_person: WorkflowPersonOut | null;
  completed_by_person: WorkflowPersonOut | null;
};

export type CareWorkflowJobAssigneeOut = {
  user_id: number;
  role_hint: string | null;
  person: WorkflowPersonOut | null;
};

export type CareWorkflowJobOut = {
  id: number;
  workspace_id: number;
  title: string;
  description: string;
  starts_at: string;
  duration_minutes: number | null;
  status: string;
  created_by_user_id: number | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  patient_ids: number[];
  assignees: CareWorkflowJobAssigneeOut[];
  steps: CareWorkflowJobStepOut[];
  created_by_person: WorkflowPersonOut | null;
};

export type CreateCareWorkflowJobInput = {
  title: string;
  description?: string;
  starts_at: string;
  duration_minutes?: number | null;
  patient_ids: number[];
  assignee_user_ids: number[];
  steps: { title: string; instructions?: string; assigned_user_id?: number | null }[];
  status?: string;
};

export type UpdateCareWorkflowJobInput = {
  title?: string;
  description?: string;
  starts_at?: string;
  duration_minutes?: number | null;
  status?: string;
};

export type PatchCareWorkflowJobStepInput = {
  status?: string;
  report_text?: string;
  assigned_user_id?: number | null;
};
