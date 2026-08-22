# lib/stores/auth-store.ts

- AuthState · type · L6-L20 — type AuthState = { user: User | null; loading: boolean; error: string | null; impersonation: { active: boolean; actorAdminId: number | null; targetUserId: number | null; }; setUser: (user: User | null) => void; setLoading: (loading: boolean) => void; setError: (error: string | null) => void; setImpersonation: (impersonation: AuthState["impersonation"]) => void; reset: () => void; };
