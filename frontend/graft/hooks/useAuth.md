# hooks/useAuth.tsx

- ImpersonationState · type · L9-L13 — type ImpersonationState = { active: boolean; actorAdminId: number | null; targetUserId: number | null; };
- AuthMeUser · type · L15-L18 — type AuthMeUser = User & { impersonation?: boolean; impersonated_by_user_id?: number | null; };
- AuthContextValue · interface · L20-L30 — interface AuthContextValue
- readImpersonationFromMe · function · L32-L42 — function readImpersonationFromMe(user: AuthMeUser | null): ImpersonationState
- AuthHydrateResponse · type · L44-L47 — type AuthHydrateResponse = { authenticated: boolean; user: AuthMeUser | null; };
- fetchCurrentUser · function · L49-L87 — async function fetchCurrentUser()
- AuthProvider · function · L89-L106 — function AuthProvider({ children }: { children: React.ReactNode })
- useAuth · function · L108-L192 — function useAuth(): AuthContextValue
