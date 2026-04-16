/* ═══════════════════════════════════════════════════════════════════════════
   API Client — fetch wrapper with JWT auth, error handling, typed responses
   ═══════════════════════════════════════════════════════════════════════════ */

import { API_BASE } from "./constants";
import type {
  DemoActorMoveRequest,
  Room,
  SmartDevice,
  WorkflowClaimRequest,
  WorkflowHandoffRequest,
} from "./types";
import type {
  AcknowledgeAlertRequest,
  AcknowledgeAlertResponse,
  AcknowledgeWorkflowDirectiveRequest,
  AcknowledgeWorkflowDirectiveResponse,
  AssignPatientFromDeviceRequest,
  ControlSmartDeviceRequest,
  ControlSmartDeviceResponse,
  CreateAlertRequest,
  CreateAlertResponse,
  CreatePrescriptionRequest,
  CreatePrescriptionResponse,
  CreateServiceRequestResponse,
  CreateSpecialistRequest,
  CreateSpecialistResponse,
  CameraCheckResponse,
  CreateTimelineEventRequest,
  CreateTimelineEventResponse,
  CreateWorkflowDirectiveRequest,
  CreateWorkflowDirectiveResponse,
  CreateWorkflowHandoverRequest,
  CreateWorkflowScheduleRequest,
  CreateWorkflowScheduleResponse,
  CareWorkflowJobOut,
  CareWorkflowJobStepOut,
  CreateCareWorkflowJobInput,
  CreateWorkflowTaskRequest,
  CreateWorkflowTaskResponse,
  CreatePatientContactRequest,
  CreateUserRequest,
  GetAlertSummaryResponse,
  GetFloorplanPresenceResponse,
  GetVitalsAveragesResponse,
  GetWardSummaryResponse,
  GetSmartDeviceStateResponse,
  ListCaregiversResponse,
  ListAlertsResponse,
  ListDeviceActivityResponse,
  ListPrescriptionsResponse,
  ListSpecialistsResponse,
  ListServiceRequestsResponse,
  ListLocalizationPredictionsResponse,
  ListPatientDeviceAssignmentsResponse,
  ListPatientsResponse,
  ListPharmacyOrdersResponse,
  ListSupportTicketsResponse,
  ListSmartDevicesResponse,
  ListTimelineEventsResponse,
  GetPatientResponse,
  ListPatientContactsResponse,
  ListRoomsResponse,
  ListUsersResponse,
  ListVitalReadingsResponse,
  ListWorkflowHandoversResponse,
  ListWorkflowMessagesResponse,
  PendingWorkflowAttachmentUploadOut,
  ListWorkflowAuditResponse,
  ListWorkflowDirectivesResponse,
  ListWorkflowSchedulesResponse,
  ListWorkflowTasksResponse,
  RequestPharmacyOrderRequest,
  RequestPharmacyOrderResponse,
  ServiceRequestCreateInput,
  ShiftChecklistMeResponse,
  ShiftChecklistPutRequest,
  ShiftChecklistItemApi,
  ShiftChecklistTemplateResponse,
  ShiftChecklistWorkspaceRow,
  SendWorkflowMessageRequest,
  SendWorkflowMessageResponse,
  SupportTicketCommentCreateInput,
  SupportTicketCommentOut,
  UpdateServiceRequestRequest,
  UpdateServiceRequestResponse,
  UpdateSupportTicketRequest,
  UpdateSupportTicketResponse,
  UpdateRoomRequest,
  UpdatePatientContactRequest,
  UpdatePatientRequest,
  UpdateWorkflowScheduleRequest,
  UpdateWorkflowScheduleResponse,
  PatchCareWorkflowJobStepInput,
  UpdateCareWorkflowJobInput,
  UpdateWorkflowTaskRequest,
  UpdateWorkflowTaskResponse,
  UpdateUserRequest,
} from "./api/task-scope-types";
import type {
  DailyBoardResponse,
  PatientFixRoutineCreate,
  PatientFixRoutineOut,
  PatientFixRoutineUpdate,
  RoutineLogBulkResetRequest,
  RoutineTaskCreate,
  RoutineTaskLogOut,
  RoutineTaskLogUpdate,
  RoutineTaskOut,
  RoutineTaskUpdate,
} from "./api/task-management-types";

/** Default timeout so hung upstream/proxy calls cannot leave auth stuck in `loading` forever */
const DEFAULT_REQUEST_TIMEOUT_MS = 25_000;
const USERS_SEARCH_LIMIT_MAX = 100;
const WORKFLOW_SCHEDULES_LIMIT_MAX = 500;

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ApiRequestInit = RequestInit & { timeoutMs?: number };

function clampPositiveInt(value: number, max: number): number {
  if (!Number.isFinite(value)) return max;
  const normalized = Math.floor(value);
  if (normalized < 1) return 1;
  return Math.min(normalized, max);
}

type ApiRequestOptions = ApiRequestInit & { suppressUnauthorizedRedirect?: boolean };

export type ImpersonationTokenResponse = {
  access_token: string;
  token_type: string;
  impersonation?: boolean;
  actor_admin_id?: number | null;
  impersonated_user_id?: number | null;
};

export type UserSearchResult = {
  id: number;
  username: string;
  role: string;
  is_active: boolean;
  caregiver_id?: number | null;
  patient_id?: number | null;
  display_name: string;
};

export type WorkflowPerson = {
  user_id: number;
  username: string;
  role: string;
  display_name: string;
  person_type: string;
  caregiver_id?: number | null;
  patient_id?: number | null;
};

export type WorkflowItemDetail = {
  item_type: "task" | "schedule" | "directive";
  item: Record<string, unknown>;
  patient?: {
    id: number;
    first_name: string;
    last_name: string;
    nickname?: string;
    room_id?: number | null;
    care_level?: string;
  } | null;
  assignee_person?: WorkflowPerson | null;
  creator_person?: WorkflowPerson | null;
  messages: Array<{
    id: number;
    sender_user_id: number;
    recipient_role?: string | null;
    recipient_user_id?: number | null;
    patient_id?: number | null;
    workflow_item_type?: string | null;
    workflow_item_id?: number | null;
    subject: string;
    body: string;
    is_read: boolean;
    read_at?: string | null;
    created_at: string;
    sender_person?: WorkflowPerson | null;
    recipient_person?: WorkflowPerson | null;
  }>;
  audit: Array<{
    id: number;
    actor_user_id?: number | null;
    patient_id?: number | null;
    domain: string;
    action: string;
    entity_type: string;
    entity_id?: number | null;
    details: Record<string, unknown>;
    created_at: string;
  }>;
};

async function request<T>(
  endpoint: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const {
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    suppressUnauthorizedRedirect = false,
    ...fetchInit
  } = options;
  const headers: Record<string, string> = {
    ...(fetchInit.headers as Record<string, string>),
  };

  // Don't set Content-Type for FormData (browser sets multipart boundary)
  if (!(fetchInit.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${endpoint}`, {
      ...fetchInit,
      signal: controller.signal,
      headers,
      credentials: "same-origin",
    });
  } catch (err) {
    clearTimeout(timer);
    const aborted =
      err instanceof DOMException
        ? err.name === "AbortError"
        : err instanceof Error && err.name === "AbortError";
    if (aborted) {
      throw new ApiError(408, "Request timed out");
    }
    throw err;
  }
  clearTimeout(timer);

  if (res.status === 401) {
    if (!suppressUnauthorizedRedirect && typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new ApiError(401, "Unauthorized");
  }

  if (!res.ok) {
    const raw = await res.text();
    let msg = res.statusText || "Error";
    try {
      const j = JSON.parse(raw) as {
        detail?: unknown;
        error?: { message?: unknown; details?: unknown };
      };
      if (j.detail !== undefined) {
        msg =
          typeof j.detail === "string"
            ? j.detail
            : Array.isArray(j.detail)
              ? j.detail
                  .map((e) =>
                    typeof e === "object" && e && "msg" in e
                      ? String((e as { msg: unknown }).msg)
                      : JSON.stringify(e),
                  )
                  .join("; ")
              : JSON.stringify(j.detail);
      } else if (typeof j.error?.message === "string") {
        msg = j.error.message;
      }
    } catch {
      if (raw.trim()) msg = raw.slice(0, 200);
    }
    throw new ApiError(res.status, msg);
  }

  if (res.status === 204 || res.status === 205) {
    return undefined as T;
  }

  const raw = await res.text();
  if (!raw.trim()) {
    return undefined as T;
  }
  return JSON.parse(raw) as T;
}

/** Login with username/password via OAuth2 form */
export async function login(
  username: string,
  password: string,
): Promise<{ access_token: string; token_type: string; session_id?: string | null }> {
  const form = new URLSearchParams();
  form.append("username", username);
  form.append("password", password);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal: controller.signal,
      credentials: "same-origin",
    });
  } catch (err) {
    clearTimeout(timer);
    const aborted =
      err instanceof DOMException
        ? err.name === "AbortError"
        : err instanceof Error && err.name === "AbortError";
    if (aborted) {
      throw new ApiError(408, "Request timed out");
    }
    throw err;
  }
  clearTimeout(timer);

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "Login failed" }));
    throw new ApiError(res.status, body.detail || "Login failed");
  }

  return res.json();
}

// ── Convenience methods ─────────────────────────────────────────────────────

export const api = {
  get: <T>(endpoint: string, options?: ApiRequestOptions) => request<T>(endpoint, options),

  post: <T>(endpoint: string, data?: unknown) =>
    request<T>(endpoint, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    }),

  put: <T>(endpoint: string, data: unknown) =>
    request<T>(endpoint, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  patch: <T>(endpoint: string, data: unknown) =>
    request<T>(endpoint, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  delete: <T>(endpoint: string) =>
    request<T>(endpoint, { method: "DELETE" }),

  postForm: <T>(endpoint: string, body: FormData) =>
    request<T>(endpoint, {
      method: "POST",
      body,
    }),

  logout: () =>
    request<void>("/auth/logout", {
      method: "POST",
      suppressUnauthorizedRedirect: true,
    }),

  stopImpersonation: () =>
    request<void>("/auth/impersonate/stop", {
      method: "POST",
      suppressUnauthorizedRedirect: true,
    }),

  // Task scope typed helpers (Step 3 Tasks 1-2)
  getPatient: (patientId: number | string) =>
    request<GetPatientResponse>(`/patients/${encodeURIComponent(String(patientId))}`),

  patchPatient: (patientId: number | string, payload: UpdatePatientRequest) =>
    request<GetPatientResponse>(`/patients/${encodeURIComponent(String(patientId))}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deletePatient: (patientId: number | string) =>
    request<void>(`/patients/${encodeURIComponent(String(patientId))}`, { method: "DELETE" }),

  listPatientContacts: (patientId: number | string) =>
    request<ListPatientContactsResponse>(
      `/patients/${encodeURIComponent(String(patientId))}/contacts`,
    ),

  createPatientContact: (patientId: number | string, payload: CreatePatientContactRequest) =>
    request<ListPatientContactsResponse[number]>(
      `/patients/${encodeURIComponent(String(patientId))}/contacts`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  updatePatientContact: (
    patientId: number | string,
    contactId: number | string,
    payload: UpdatePatientContactRequest,
  ) =>
    request<ListPatientContactsResponse[number]>(
      `/patients/${encodeURIComponent(String(patientId))}/contacts/${encodeURIComponent(String(contactId))}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    ),

  deletePatientContact: (patientId: number | string, contactId: number | string) =>
    request<void>(
      `/patients/${encodeURIComponent(String(patientId))}/contacts/${encodeURIComponent(String(contactId))}`,
      { method: "DELETE" },
    ),

  listUsers: () => request<ListUsersResponse>("/users"),

  searchUsers: (params?: { q?: string; roles?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.q) query.set("q", params.q);
    if (params?.roles) query.set("roles", params.roles);
    if (typeof params?.limit === "number") {
      query.set("limit", String(clampPositiveInt(params.limit, USERS_SEARCH_LIMIT_MAX)));
    }
    const suffix = query.toString();
    return request<UserSearchResult[]>(suffix ? `/users/search?${suffix}` : "/users/search");
  },

  startImpersonation: (targetUserId: number | string) => {
    const id = Number(targetUserId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error("Invalid target user ID");
    }
    return request<ImpersonationTokenResponse>("/auth/impersonate/start", {
      method: "POST",
      body: JSON.stringify({ target_user_id: id }),
    });
  },

  listPatients: (params?: { q?: string; limit?: number; is_active?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.q) query.set("q", params.q);
    if (typeof params?.limit === "number") query.set("limit", String(params.limit));
    if (typeof params?.is_active === "boolean") {
      query.set("is_active", params.is_active ? "true" : "false");
    }
    const suffix = query.toString();
    return request<ListPatientsResponse>(suffix ? `/patients?${suffix}` : "/patients");
  },

  listSupportTickets: (params?: { status?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (typeof params?.limit === "number") query.set("limit", String(params.limit));
    const suffix = query.toString();
    return request<ListSupportTicketsResponse>(suffix ? `/support/tickets?${suffix}` : "/support/tickets");
  },

  updateSupportTicket: (ticketId: number | string, payload: UpdateSupportTicketRequest) =>
    request<UpdateSupportTicketResponse>(`/support/tickets/${encodeURIComponent(String(ticketId))}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  addSupportTicketComment: (
    ticketId: number | string,
    payload: SupportTicketCommentCreateInput,
  ) =>
    request<SupportTicketCommentOut>(
      `/support/tickets/${encodeURIComponent(String(ticketId))}/comments`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  listAlerts: (params?: { status?: string; patient_id?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (typeof params?.patient_id === "number") query.set("patient_id", String(params.patient_id));
    if (typeof params?.limit === "number") query.set("limit", String(params.limit));
    const suffix = query.toString();
    return request<ListAlertsResponse>(suffix ? `/alerts?${suffix}` : "/alerts");
  },

  listVitalReadings: (params?: { patient_id?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (typeof params?.patient_id === "number") query.set("patient_id", String(params.patient_id));
    if (typeof params?.limit === "number") query.set("limit", String(params.limit));
    const suffix = query.toString();
    return request<ListVitalReadingsResponse>(suffix ? `/vitals/readings?${suffix}` : "/vitals/readings");
  },

  createUser: (payload: CreateUserRequest) =>
    request<ListUsersResponse[number]>("/users", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateUser: (userId: number | string, payload: UpdateUserRequest) =>
    request<ListUsersResponse[number]>(`/users/${encodeURIComponent(String(userId))}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  listRooms: () => request<ListRoomsResponse>("/rooms"),

  getRoom: (roomId: number | string) =>
    request<Room>(`/rooms/${encodeURIComponent(String(roomId))}`),

  listCaregivers: (params?: { skip?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (typeof params?.skip === "number") query.set("skip", String(params.skip));
    if (typeof params?.limit === "number") query.set("limit", String(params.limit));
    const suffix = query.toString();
    return request<ListCaregiversResponse>(suffix ? `/caregivers?${suffix}` : "/caregivers");
  },

  listTimelineEvents: (params?: { patient_id?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (typeof params?.patient_id === "number") query.set("patient_id", String(params.patient_id));
    if (typeof params?.limit === "number") query.set("limit", String(params.limit));
    const suffix = query.toString();
    return request<ListTimelineEventsResponse>(suffix ? `/timeline?${suffix}` : "/timeline");
  },

  createTimelineEvent: (payload: CreateTimelineEventRequest) =>
    request<CreateTimelineEventResponse>("/timeline", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listPatientDeviceAssignments: (patientId: number | string) =>
    request<ListPatientDeviceAssignmentsResponse>(
      `/patients/${encodeURIComponent(String(patientId))}/devices`,
    ),

  getAlertSummary: () => request<GetAlertSummaryResponse>("/analytics/alerts/summary"),

  getWardSummary: () => request<GetWardSummaryResponse>("/analytics/wards/summary"),

  getVitalsAverages: (hours?: number) => {
    const query = new URLSearchParams();
    if (typeof hours === "number") query.set("hours", String(hours));
    const suffix = query.toString();
    return request<GetVitalsAveragesResponse>(
      suffix ? `/analytics/vitals/averages?${suffix}` : "/analytics/vitals/averages",
    );
  },

  createAlert: (payload: CreateAlertRequest) =>
    request<CreateAlertResponse>("/alerts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  acknowledgeAlert: (alertId: number | string, payload: AcknowledgeAlertRequest) =>
    request<AcknowledgeAlertResponse>(`/alerts/${encodeURIComponent(String(alertId))}/acknowledge`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listDeviceActivity: (limit = 30) =>
    request<ListDeviceActivityResponse>(`/devices/activity?limit=${limit}`),

  listDevicesRaw: (params?: { device_type?: string; hardware_type?: string }) => {
    const query = new URLSearchParams();
    if (params?.device_type) query.set("device_type", params.device_type);
    if (params?.hardware_type) query.set("hardware_type", params.hardware_type);
    const suffix = query.toString();
    return request<unknown>(suffix ? `/devices?${suffix}` : "/devices");
  },

  listSmartDevices: () => request<ListSmartDevicesResponse>("/ha/devices"),

  patchSmartDevice: (
    deviceId: number | string,
    payload: {
      name?: string | null;
      ha_entity_id?: string | null;
      device_type?: string | null;
      room_id?: number | null;
      is_active?: boolean | null;
      config?: Record<string, unknown> | null;
    },
  ) =>
    request<SmartDevice>(`/ha/devices/${encodeURIComponent(String(deviceId))}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  getSmartDeviceState: (deviceId: number | string) =>
    request<GetSmartDeviceStateResponse>(
      `/ha/devices/${encodeURIComponent(String(deviceId))}/state`,
    ),

  controlSmartDevice: (deviceId: number | string, payload: ControlSmartDeviceRequest) =>
    request<ControlSmartDeviceResponse>(`/ha/devices/${encodeURIComponent(String(deviceId))}/control`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getDeviceDetailRaw: (deviceId: string) =>
    request<unknown>(`/devices/${encodeURIComponent(deviceId)}`),

  patchRegistryDevice: (
    deviceId: string,
    payload: { display_name?: string | null; config?: Record<string, unknown> | null },
  ) =>
    request<unknown>(`/devices/${encodeURIComponent(deviceId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteRegistryDevice: (deviceId: string) =>
    request<void>(`/devices/${encodeURIComponent(deviceId)}`, { method: "DELETE" }),

  assignPatientFromDevice: (deviceId: string, payload: AssignPatientFromDeviceRequest) =>
    request<unknown>(`/devices/${encodeURIComponent(deviceId)}/patient`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  cameraCheckSnapshot: (deviceId: string) =>
    request<CameraCheckResponse>(`/devices/${encodeURIComponent(deviceId)}/camera/check`, {
      method: "POST",
    }),

  patchRoom: (roomId: number | string, payload: UpdateRoomRequest) =>
    request<unknown>(`/rooms/${encodeURIComponent(String(roomId))}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  listWorkflowTasks: (params?: { status?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (typeof params?.limit === "number") query.set("limit", String(params.limit));
    const suffix = query.toString();
    return request<ListWorkflowTasksResponse>(suffix ? `/workflow/tasks?${suffix}` : "/workflow/tasks");
  },

  updateWorkflowTask: (taskId: number, payload: UpdateWorkflowTaskRequest) =>
    request<UpdateWorkflowTaskResponse>(`/workflow/tasks/${encodeURIComponent(String(taskId))}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  createWorkflowTask: (payload: CreateWorkflowTaskRequest) =>
    request<CreateWorkflowTaskResponse>("/workflow/tasks", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listWorkflowJobs: (params?: { status?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (typeof params?.limit === "number") query.set("limit", String(params.limit));
    const suffix = query.toString();
    return request<CareWorkflowJobOut[]>(suffix ? `/workflow/jobs?${suffix}` : "/workflow/jobs");
  },

  getWorkflowJob: (jobId: number) =>
    request<CareWorkflowJobOut>(`/workflow/jobs/${encodeURIComponent(String(jobId))}`),

  createWorkflowJob: (payload: CreateCareWorkflowJobInput) =>
    request<CareWorkflowJobOut>("/workflow/jobs", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateWorkflowJob: (jobId: number, payload: UpdateCareWorkflowJobInput) =>
    request<CareWorkflowJobOut>(`/workflow/jobs/${encodeURIComponent(String(jobId))}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  completeWorkflowJob: (jobId: number) =>
    request<CareWorkflowJobOut>(`/workflow/jobs/${encodeURIComponent(String(jobId))}/complete`, {
      method: "POST",
    }),

  patchWorkflowJobStep: (
    jobId: number,
    stepId: number,
    payload: PatchCareWorkflowJobStepInput,
  ) =>
    request<CareWorkflowJobStepOut>(
      `/workflow/jobs/${encodeURIComponent(String(jobId))}/steps/${encodeURIComponent(String(stepId))}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    ),

  finalizeWorkflowJobStepAttachments: (jobId: number, stepId: number, pendingIds: string[]) =>
    request<CareWorkflowJobStepOut>(
      `/workflow/jobs/${encodeURIComponent(String(jobId))}/steps/${encodeURIComponent(String(stepId))}/attachments/finalize`,
      {
        method: "POST",
        body: JSON.stringify({ pending_ids: pendingIds }),
      },
    ),

  claimWorkflowItem: (itemType: "task" | "schedule" | "directive", itemId: number | string, payload: WorkflowClaimRequest) =>
    request<unknown>(
      `/workflow/items/${encodeURIComponent(itemType)}/${encodeURIComponent(String(itemId))}/claim`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  handoffWorkflowItem: (itemType: "task" | "schedule" | "directive", itemId: number | string, payload: WorkflowHandoffRequest) =>
    request<unknown>(
      `/workflow/items/${encodeURIComponent(itemType)}/${encodeURIComponent(String(itemId))}/handoff`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  listWorkflowDirectives: (params?: { status?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (typeof params?.limit === "number") query.set("limit", String(params.limit));
    const suffix = query.toString();
    return request<ListWorkflowDirectivesResponse>(
      suffix ? `/workflow/directives?${suffix}` : "/workflow/directives",
    );
  },

  acknowledgeWorkflowDirective: (
    directiveId: number,
    payload: AcknowledgeWorkflowDirectiveRequest,
  ) =>
    request<AcknowledgeWorkflowDirectiveResponse>(
      `/workflow/directives/${encodeURIComponent(String(directiveId))}/acknowledge`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  createWorkflowDirective: (payload: CreateWorkflowDirectiveRequest) =>
    request<CreateWorkflowDirectiveResponse>("/workflow/directives", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listWorkflowSchedules: (params?: { status?: string; patient_id?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (typeof params?.patient_id === "number") query.set("patient_id", String(params.patient_id));
    if (typeof params?.limit === "number") {
      query.set("limit", String(clampPositiveInt(params.limit, WORKFLOW_SCHEDULES_LIMIT_MAX)));
    }
    const suffix = query.toString();
    return request<ListWorkflowSchedulesResponse>(
      suffix ? `/workflow/schedules?${suffix}` : "/workflow/schedules",
    );
  },

  updateWorkflowSchedule: (scheduleId: number, payload: UpdateWorkflowScheduleRequest) =>
    request<UpdateWorkflowScheduleResponse>(
      `/workflow/schedules/${encodeURIComponent(String(scheduleId))}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    ),

  createWorkflowSchedule: (payload: CreateWorkflowScheduleRequest) =>
    request<CreateWorkflowScheduleResponse>("/workflow/schedules", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listWorkflowAudit: (params?: {
    domain?: string;
    action?: string;
    entity_type?: string;
    patient_id?: number;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.domain) query.set("domain", params.domain);
    if (params?.action) query.set("action", params.action);
    if (params?.entity_type) query.set("entity_type", params.entity_type);
    if (typeof params?.patient_id === "number") query.set("patient_id", String(params.patient_id));
    if (typeof params?.limit === "number") query.set("limit", String(params.limit));
    const suffix = query.toString();
    return request<ListWorkflowAuditResponse>(suffix ? `/workflow/audit?${suffix}` : "/workflow/audit");
  },

  listPrescriptions: (params?: { patient_id?: number; status?: string }) => {
    const query = new URLSearchParams();
    if (typeof params?.patient_id === "number") query.set("patient_id", String(params.patient_id));
    if (params?.status) query.set("status", params.status);
    const suffix = query.toString();
    return request<ListPrescriptionsResponse>(
      suffix ? `/medication/prescriptions?${suffix}` : "/medication/prescriptions",
    );
  },

  listPharmacyOrders: (params?: { patient_id?: number; prescription_id?: number; status?: string }) => {
    const query = new URLSearchParams();
    if (typeof params?.patient_id === "number") query.set("patient_id", String(params.patient_id));
    if (typeof params?.prescription_id === "number") {
      query.set("prescription_id", String(params.prescription_id));
    }
    if (params?.status) query.set("status", params.status);
    const suffix = query.toString();
    return request<ListPharmacyOrdersResponse>(
      suffix ? `/medication/pharmacy/orders?${suffix}` : "/medication/pharmacy/orders",
    );
  },

  listServiceRequests: (params?: { status?: string; service_type?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.service_type) query.set("service_type", params.service_type);
    if (typeof params?.limit === "number") query.set("limit", String(params.limit));
    const suffix = query.toString();
    return request<ListServiceRequestsResponse>(suffix ? `/services/requests?${suffix}` : "/services/requests");
  },

  createServiceRequest: (payload: ServiceRequestCreateInput) =>
    request<CreateServiceRequestResponse>("/services/requests", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateServiceRequest: (requestId: number | string, payload: UpdateServiceRequestRequest) =>
    request<UpdateServiceRequestResponse>(`/services/requests/${encodeURIComponent(String(requestId))}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  requestPharmacyOrder: (payload: RequestPharmacyOrderRequest) =>
    request<RequestPharmacyOrderResponse>("/medication/pharmacy/orders/request", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  createPrescription: (payload: CreatePrescriptionRequest) =>
    request<CreatePrescriptionResponse>("/medication/prescriptions", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listSpecialists: (params?: { specialty?: string }) => {
    const query = new URLSearchParams();
    if (params?.specialty) query.set("specialty", params.specialty);
    const suffix = query.toString();
    return request<ListSpecialistsResponse>(
      suffix ? `/care/specialists?${suffix}` : "/care/specialists",
    );
  },

  createSpecialist: (payload: CreateSpecialistRequest) =>
    request<CreateSpecialistResponse>("/care/specialists", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listWorkflowMessagingRecipients: () =>
    request<
      Array<{
        id: number;
        username: string;
        role: string;
        display_name: string;
        kind: "staff" | "patient" | "unlinked";
        is_active?: boolean;
        linked_name?: string | null;
        employee_code?: string | null;
      }>
    >("/workflow/messaging/recipients"),

  listWorkflowMessages: (params?: {
    inbox_only?: boolean;
    workflow_item_type?: string;
    workflow_item_id?: number;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    if (typeof params?.inbox_only === "boolean") {
      query.set("inbox_only", params.inbox_only ? "true" : "false");
    }
    if (params?.workflow_item_type) query.set("workflow_item_type", params.workflow_item_type);
    if (typeof params?.workflow_item_id === "number") {
      query.set("workflow_item_id", String(params.workflow_item_id));
    }
    if (typeof params?.limit === "number") query.set("limit", String(params.limit));
    const suffix = query.toString();
    return request<ListWorkflowMessagesResponse>(
      suffix ? `/workflow/messages?${suffix}` : "/workflow/messages",
    );
  },

  getWorkflowItemDetail: (itemType: "task" | "schedule" | "directive", itemId: number | string) =>
    request<WorkflowItemDetail>(
      `/workflow/items/${encodeURIComponent(itemType)}/${encodeURIComponent(String(itemId))}`,
    ),

  sendWorkflowMessage: (payload: SendWorkflowMessageRequest) =>
    request<SendWorkflowMessageResponse>("/workflow/messages", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  markWorkflowMessageRead: (messageId: number | string) =>
    request<ListWorkflowMessagesResponse[number]>(
      `/workflow/messages/${encodeURIComponent(String(messageId))}/read`,
      { method: "POST" },
    ),

  uploadWorkflowMessageAttachment: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<PendingWorkflowAttachmentUploadOut>("/workflow/messages/attachments", {
      method: "POST",
      body: fd,
    });
  },

  deleteWorkflowMessage: (messageId: number | string) =>
    request<void>(`/workflow/messages/${encodeURIComponent(String(messageId))}`, { method: "DELETE" }),

  listWorkflowHandovers: (params?: { patient_id?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (typeof params?.patient_id === "number") query.set("patient_id", String(params.patient_id));
    if (typeof params?.limit === "number") query.set("limit", String(params.limit));
    const suffix = query.toString();
    return request<ListWorkflowHandoversResponse>(
      suffix ? `/workflow/handovers?${suffix}` : "/workflow/handovers",
    );
  },

  createWorkflowHandover: (payload: CreateWorkflowHandoverRequest) =>
    request<ListWorkflowHandoversResponse[number]>("/workflow/handovers", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listLocalizationPredictionsRaw: (params?: { device_id?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.device_id) query.set("device_id", params.device_id);
    if (typeof params?.limit === "number") query.set("limit", String(params.limit));
    const suffix = query.toString();
    return request<ListLocalizationPredictionsResponse>(
      suffix ? `/localization/predictions?${suffix}` : "/localization/predictions",
    );
  },

  getFloorplanPresence: (params: { facility_id: number; floor_id: number }) => {
    const query = new URLSearchParams();
    query.set("facility_id", String(params.facility_id));
    query.set("floor_id", String(params.floor_id));
    return request<GetFloorplanPresenceResponse>(`/floorplans/presence?${query.toString()}`);
  },

  moveDemoActor: (actorType: "patient" | "staff", actorId: number | string, payload: DemoActorMoveRequest) =>
    request<unknown>(
      `/demo/actors/${encodeURIComponent(actorType)}/${encodeURIComponent(String(actorId))}/move`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  getShiftChecklistMe: (params?: { shift_date?: string }) => {
    const query = new URLSearchParams();
    if (params?.shift_date) query.set("shift_date", params.shift_date);
    const suffix = query.toString();
    return request<ShiftChecklistMeResponse>(suffix ? `/shift-checklist/me?${suffix}` : "/shift-checklist/me");
  },

  putShiftChecklistMe: (payload: ShiftChecklistPutRequest) =>
    request<ShiftChecklistMeResponse>("/shift-checklist/me", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  listShiftChecklistWorkspace: (params?: { shift_date?: string }) => {
    const query = new URLSearchParams();
    if (params?.shift_date) query.set("shift_date", params.shift_date);
    const suffix = query.toString();
    return request<ShiftChecklistWorkspaceRow[]>(
      suffix ? `/shift-checklist/workspace?${suffix}` : "/shift-checklist/workspace",
    );
  },

  getShiftChecklistUserTemplate: (userId: number) =>
    request<ShiftChecklistTemplateResponse>(`/shift-checklist/users/${encodeURIComponent(String(userId))}/template`),

  putShiftChecklistUserTemplate: (userId: number, payload: { items: ShiftChecklistItemApi[] }) =>
    request<ShiftChecklistTemplateResponse>(
      `/shift-checklist/users/${encodeURIComponent(String(userId))}/template`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      },
    ),

  // ── Task Management ─────────────────────────────────────────────────────────

  // Routine Task Templates
  listRoutineTasks: (includeInactive = false) =>
    request<RoutineTaskOut[]>(`/task-management/routine-tasks${includeInactive ? "?include_inactive=true" : ""}`),

  createRoutineTask: (payload: RoutineTaskCreate) =>
    request<RoutineTaskOut>("/task-management/routine-tasks", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateRoutineTask: (id: number, payload: RoutineTaskUpdate) =>
    request<RoutineTaskOut>(`/task-management/routine-tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteRoutineTask: (id: number) =>
    request<void>(`/task-management/routine-tasks/${id}`, { method: "DELETE" }),

  // Daily Routine Board
  getDailyBoard: (shiftDate?: string) =>
    request<DailyBoardResponse>(
      `/task-management/routine-logs${
        shiftDate ? `?shift_date=${encodeURIComponent(shiftDate)}` : ""
      }`,
    ),

  updateRoutineLog: (logId: number, payload: RoutineTaskLogUpdate) =>
    request<RoutineTaskLogOut>(`/task-management/routine-logs/${logId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  resetRoutineLogs: (payload?: RoutineLogBulkResetRequest) =>
    request<{ reset_date: string; ok: boolean }>("/task-management/routine-logs/reset", {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    }),

  // Patient Fix Routines
  listPatientRoutines: (includeInactive = false) =>
    request<PatientFixRoutineOut[]>(
      `/task-management/patient-routines${includeInactive ? "?include_inactive=true" : ""}`,
    ),

  createPatientRoutine: (payload: PatientFixRoutineCreate) =>
    request<PatientFixRoutineOut>("/task-management/patient-routines", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updatePatientRoutine: (id: number, payload: PatientFixRoutineUpdate) =>
    request<PatientFixRoutineOut>(`/task-management/patient-routines/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deletePatientRoutine: (id: number) =>
    request<void>(`/task-management/patient-routines/${id}`, { method: "DELETE" }),

  // Exports
  getRoutineLogsExportUrl: (shiftDate?: string) =>
    `${API_BASE}/task-management/export/routine-logs${shiftDate ? `?shift_date=${encodeURIComponent(shiftDate)}` : ""}`,

  getPatientRoutinesExportUrl: () =>
    `${API_BASE}/task-management/export/patient-routines`,
};

export { ApiError };
