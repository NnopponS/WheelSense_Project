/* ═══════════════════════════════════════════════════════════════════════════
   API Client — fetch wrapper with JWT auth, error handling, typed responses
   ═══════════════════════════════════════════════════════════════════════════ */

import { API_BASE } from "./constants";
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
  CreateFutureSpecialistRequest,
  CreateFutureSpecialistResponse,
  CameraCheckResponse,
  CreateTimelineEventRequest,
  CreateTimelineEventResponse,
  CreateWorkflowHandoverRequest,
  CreateFuturePrescriptionRequest,
  CreateFuturePrescriptionResponse,
  CreatePatientContactRequest,
  CreateUserRequest,
  GetAlertSummaryResponse,
  GetVitalsAveragesResponse,
  GetWardSummaryResponse,
  ListCaregiversResponse,
  ListAlertsResponse,
  ListDeviceActivityResponse,
  ListFuturePrescriptionsResponse,
  ListFutureSpecialistsResponse,
  ListLocalizationPredictionsResponse,
  ListPatientDeviceAssignmentsResponse,
  ListPatientsResponse,
  ListPharmacyOrdersResponse,
  ListSmartDevicesResponse,
  ListTimelineEventsResponse,
  GetPatientResponse,
  ListPatientContactsResponse,
  ListRoomsResponse,
  ListUsersResponse,
  ListVitalReadingsResponse,
  ListWorkflowHandoversResponse,
  ListWorkflowMessagesResponse,
  ListWorkflowAuditResponse,
  ListWorkflowDirectivesResponse,
  ListWorkflowSchedulesResponse,
  ListWorkflowTasksResponse,
  SendWorkflowMessageRequest,
  SendWorkflowMessageResponse,
  UpdateRoomRequest,
  UpdatePatientContactRequest,
  UpdatePatientRequest,
  UpdateWorkflowScheduleRequest,
  UpdateWorkflowScheduleResponse,
  UpdateWorkflowTaskRequest,
  UpdateWorkflowTaskResponse,
  UpdateUserRequest,
} from "./api/task-scope-types";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function readCookieToken(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)ws_token=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("ws_token") ?? readCookieToken();
}

/** Persist JWT for client `fetch` + Edge `middleware` (same-site cookie). */
export function setToken(token: string): void {
  localStorage.setItem("ws_token", token);
  const maxAge = 60 * 60 * 24 * 7;
  document.cookie = `ws_token=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

export function clearToken(): void {
  localStorage.removeItem("ws_token");
  if (typeof document !== "undefined") {
    document.cookie =
      "ws_token=; path=/; max-age=0; SameSite=Lax";
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Don't set Content-Type for FormData (browser sets multipart boundary)
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new ApiError(401, "Unauthorized");
  }

  if (!res.ok) {
    const raw = await res.text();
    let msg = res.statusText || "Error";
    try {
      const j = JSON.parse(raw) as { detail?: unknown };
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
): Promise<{ access_token: string; token_type: string }> {
  const form = new URLSearchParams();
  form.append("username", username);
  form.append("password", password);

  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "Login failed" }));
    throw new ApiError(res.status, body.detail || "Login failed");
  }

  return res.json();
}

// ── Convenience methods ─────────────────────────────────────────────────────

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint),

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

  // Task scope typed helpers (Step 3 Tasks 1-2)
  getPatient: (patientId: number | string) =>
    request<GetPatientResponse>(`/patients/${encodeURIComponent(String(patientId))}`),

  patchPatient: (patientId: number | string, payload: UpdatePatientRequest) =>
    request<GetPatientResponse>(`/patients/${encodeURIComponent(String(patientId))}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

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

  controlSmartDevice: (deviceId: number | string, payload: ControlSmartDeviceRequest) =>
    request<ControlSmartDeviceResponse>(`/ha/devices/${encodeURIComponent(String(deviceId))}/control`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getDeviceDetailRaw: (deviceId: string) =>
    request<unknown>(`/devices/${encodeURIComponent(deviceId)}`),

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

  listWorkflowSchedules: (params?: { status?: string; patient_id?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (typeof params?.patient_id === "number") query.set("patient_id", String(params.patient_id));
    if (typeof params?.limit === "number") query.set("limit", String(params.limit));
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

  listFuturePrescriptions: (params?: { patient_id?: number; status?: string }) => {
    const query = new URLSearchParams();
    if (typeof params?.patient_id === "number") query.set("patient_id", String(params.patient_id));
    if (params?.status) query.set("status", params.status);
    const suffix = query.toString();
    return request<ListFuturePrescriptionsResponse>(
      suffix ? `/future/prescriptions?${suffix}` : "/future/prescriptions",
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
      suffix ? `/future/pharmacy/orders?${suffix}` : "/future/pharmacy/orders",
    );
  },

  createFuturePrescription: (payload: CreateFuturePrescriptionRequest) =>
    request<CreateFuturePrescriptionResponse>("/future/prescriptions", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listFutureSpecialists: (params?: { specialty?: string }) => {
    const query = new URLSearchParams();
    if (params?.specialty) query.set("specialty", params.specialty);
    const suffix = query.toString();
    return request<ListFutureSpecialistsResponse>(
      suffix ? `/future/specialists?${suffix}` : "/future/specialists",
    );
  },

  createFutureSpecialist: (payload: CreateFutureSpecialistRequest) =>
    request<CreateFutureSpecialistResponse>("/future/specialists", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listWorkflowMessages: (params?: { inbox_only?: boolean; limit?: number }) => {
    const query = new URLSearchParams();
    if (typeof params?.inbox_only === "boolean") {
      query.set("inbox_only", params.inbox_only ? "true" : "false");
    }
    if (typeof params?.limit === "number") query.set("limit", String(params.limit));
    const suffix = query.toString();
    return request<ListWorkflowMessagesResponse>(
      suffix ? `/workflow/messages?${suffix}` : "/workflow/messages",
    );
  },

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
};

export { ApiError };
