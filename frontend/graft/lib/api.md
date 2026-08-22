# lib/api.ts

- ApiError · class · L122-L130 — class ApiError extends Error
- constructor · method · L123-L129 — constructor( public status: number, message: string, )
- ApiRequestInit · type · L132-L132 — type ApiRequestInit = RequestInit & { timeoutMs?: number };
- clampPositiveInt · function · L134-L139 — function clampPositiveInt(value: number, max: number): number
- ApiRequestOptions · type · L141-L141 — type ApiRequestOptions = ApiRequestInit & { suppressUnauthorizedRedirect?: boolean };
- ImpersonationTokenResponse · type · L143-L149 — type ImpersonationTokenResponse = { access_token: string; token_type: string; impersonation?: boolean; actor_admin_id?: number | null; impersonated_user_id?: number | null; };
- UserSearchResult · type · L151-L159 — type UserSearchResult = { id: number; username: string; role: string; is_active: boolean; caregiver_id?: number | null; patient_id?: number | null; display_name: string; };
- WorkflowPerson · type · L161-L169 — type WorkflowPerson = { user_id: number; username: string; role: string; display_name: string; person_type: string; caregiver_id?: number | null; patient_id?: number | null; };
- WorkflowItemDetail · type · L171-L211 — type WorkflowItemDetail = { item_type: "task" | "schedule" | "directive"; item: Record<string, unknown>; patient?: { id: number; first_name: string; last_name: string; nickname?: string; room_id?: number | null; care_level?: string; } | null; assignee_person?: WorkflowPerson | null; creator_person?: WorkflowPerson | null; messages: Array<{ id: number; sender_user_id: number; recipient_role?: string | null; recipient_user_id?: number | null; patient_id?: number | null; workflow_item_type?: string | null; workflow_item_id?: number | null; subject: string; body: string; is_read: boolean; read_at?: string | null; created_at: string; sender_person?: WorkflowPerson | null; recipient_person?: WorkflowPerson | null; }>; audit: Array<{ id: number; actor_user_id?: number | null; patient_id?: number | null; domain: string; action: string; entity_type: string; entity_id?: number | null; details: Record<string, unknown>; created_at: string; }>; };
- request · function · L213-L301 — async function request<T>( endpoint: string, options: ApiRequestOptions = {}, ): Promise<T>
- login · function · L304-L342 — async function login( username: string, password: string, ): Promise<{ access_token: string; token_type: string; session_id?: string | null }>
