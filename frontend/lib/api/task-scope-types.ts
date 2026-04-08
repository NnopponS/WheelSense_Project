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
export type RoleMessageCreateInput = components["schemas"]["RoleMessageCreate"];
export type HandoverNoteOut = components["schemas"]["HandoverNoteOut"];
export type PharmacyOrderOut = components["schemas"]["PharmacyOrderOut"];
export type PharmacyOrderRequestInput = components["schemas"]["PharmacyOrderRequest"];
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
export type ListFuturePrescriptionsResponse = JsonResponse<
  operations["list_prescriptions_api_future_prescriptions_get"]
>;
export type ListFutureSpecialistsResponse = JsonResponse<
  operations["list_specialists_api_future_specialists_get"]
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
export type ListWorkflowHandoversResponse = JsonResponse<
  operations["list_handover_notes_api_workflow_handovers_get"]
>;
export type ListPatientDeviceAssignmentsResponse = JsonResponse<
  operations["list_device_assignments_api_patients__patient_id__devices_get"]
>;
export type ListSmartDevicesResponse = JsonResponse<
  operations["list_smart_devices_api_ha_devices_get"]
>;
export type ListPharmacyOrdersResponse = JsonResponse<
  operations["list_pharmacy_orders_api_future_pharmacy_orders_get"]
>;
export type GetFloorplanPresenceResponse = JsonResponse<
  operations["get_floorplan_presence_api_future_floorplans_presence_get"]
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
export type CreateFuturePrescriptionRequest = JsonRequest<
  operations["create_prescription_api_future_prescriptions_post"]
>;
export type CreateFutureSpecialistRequest = JsonRequest<
  operations["create_specialist_api_future_specialists_post"]
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
  operations["request_pharmacy_order_api_future_pharmacy_orders_request_post"]
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
export type CreateFuturePrescriptionResponse = JsonResponseCreated<
  operations["create_prescription_api_future_prescriptions_post"]
>;
export type CreateFutureSpecialistResponse = JsonResponseCreated<
  operations["create_specialist_api_future_specialists_post"]
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
  operations["request_pharmacy_order_api_future_pharmacy_orders_request_post"]
>;
